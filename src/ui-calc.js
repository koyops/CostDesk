/* ============================================================
 * ui-calc.js — 核算台：参数表单 / 动态剂型字段 / 原料清单 /
 *               一键报价 / 实时核算结果 / 阶梯报价 / 对比 / 存档 / 导出
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc, num = C.num;

  var state = S.state;

  /* ================= 剂型选择 ================= */
  function enabledDosages() {
    return state.data.dosageForms.filter(function (d) { return d.enabled; });
  }
  function renderDosageSelect() {
    var list = enabledDosages();
    var sel = $('f-dosage');
    var cur = state.calc.dosageFormId;
    var html = '<option value="">— 选择剂型 —</option>';
    list.forEach(function (d) {
      html += '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    });
    sel.innerHTML = html;
    var search = $('f-dosageSearch');
    search.placeholder = cur && dosageName(cur) ? '当前：' + dosageName(cur) : '搜索剂型…';
    search.value = '';
  }
  function dosageName(id) {
    var d = S.dosageById(id);
    return d ? d.name : '';
  }

  /* 剂型动态参数字段模板渲染 */
  function renderDosageFields() {
    var wrap = $('dosageFields');
    var d = S.dosageById(state.calc.dosageFormId);
    if (!d || !d.customFields || !d.customFields.length) {
      wrap.innerHTML = '';
      return;
    }
    var html = '';
    d.customFields.forEach(function (f) {
      var val = state.calc.params[f.key] || '';
      html += '<label class="field" data-cf="' + esc(f.key) + '">';
      html += '<span class="f-label">' + esc(f.label) + (f.required ? ' <i class="req">*</i>' : '') + '</span>';
      if (f.type === 'select') {
        html += '<select><option value="">' + esc(f.placeholder || '请选择') + '</option>';
        (f.options || []).forEach(function (o) {
          html += '<option value="' + esc(o) + '"' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>';
        });
        html += '</select>';
      } else if (f.type === 'textarea') {
        html += '<textarea rows="2" placeholder="' + esc(f.placeholder || (f.required ? '请填写' : '选填，可为空')) + '">' + esc(val) + '</textarea>';
      } else {
        html += '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' + esc(val) + '" placeholder="' + esc(f.placeholder || (f.type === 'number' ? '输入数值' : (f.required ? '请填写' : '选填，可为空'))) + '"' + (f.unit ? ' data-unit="' + esc(f.unit) + '"' : '') + '>';
      }
      html += '<span class="err-msg">该项为必填</span></label>';
    });
    wrap.innerHTML = html;
    /* 变更监听 */
    $$('input,select,textarea', wrap).forEach(function (el) {
      el.addEventListener('input', function () {
        var key = el.closest('[data-cf]').getAttribute('data-cf');
        state.calc.params[key] = el.value;
        scheduleAuto();
      });
    });
  }

  /* ================= 商务参数联动 ================= */
  /* V13：「人工」字段已改为手动填写「人工费（元/份）」数值输入框（#f-processFee），
   * 删除工艺档位下拉与剂型管理费率的依赖。引擎 calc.js 收 processFee 数值，零改动。
   * processFeeOf 保留兼容签名：旧调用点统一改读 calc.processFee；旧存档的
   * processLevel 档位文本由 store.load/restoreDraft 归一化为 processFee=0，不报错。 */
  function syncLossRatesFromDosage() {
    var d = S.dosageById(state.calc.dosageFormId);
    if (!d) return;
    state.calc.lossRates = {
      material: d.defaultLossRate.material,
      packaging: d.defaultLossRate.packaging,
      production: d.defaultLossRate.production
    };
  }
  /* 人工费取值：始终为手动填写的数值（缺省/非法按 0） */
  function processFeeOf() {
    return num(state.calc.processFee) || 0;
  }

  /* ================= 表单读写 ================= */
  function readCalc() {
    var c = state.calc;
    c.name = $('f-name').value.trim();
    c.customer = $('f-customer').value.trim();
    c.date = $('f-date').value;
    c.formulaId = $('f-formula').value;
    c.formulaVersion = $('f-formulaVer').value;
    c.dosageFormId = $('f-dosage').value;
    /* 动态字段 */
    var d = S.dosageById(c.dosageFormId);
    if (d) {
      (d.customFields || []).forEach(function (f) {
        var el = document.querySelector('#dosageFields [data-cf="' + f.key + '"] input, #dosageFields [data-cf="' + f.key + '"] select, #dosageFields [data-cf="' + f.key + '"] textarea');
        if (el) c.params[f.key] = el.value;
      });
    }
    c.moq = num($('f-moq').value);
    c.factoryMoq = num($('f-factoryMoq').value);
    c.ladder = $('f-ladder').value.trim();
    c.taxInc = $$('#f-taxInc button').filter(function (b) { return b.classList.contains('on'); })[0].getAttribute('data-v');
    c.tax = num($('f-tax').value);
    c.profit = num($('f-profit').value);
    c.admin = num($('f-admin').value);
    c.processFee = num($('f-processFee').value) || 0; /* V13：人工费手填（元/份） */
    c.premium = num($('f-premium').value);
    c.testFee = num($('f-testFee').value);
    c.freight = num($('f-freight').value);
    c.fx = num($('f-fx').value, 1) || 1;
    /* v3：克重/每瓶数量/净含量/装箱（手动录入与配方带入均可） */
    c.weight = num($('f-weight').value);
    c.count = num($('f-count').value);
    c.net = $('f-net').value.trim();
    c.box = $('f-box').value.trim();
    /* 清单行 */
    c.mats = readLines('matList', c.mats, readMatLine);
    c.packs = readLines('packList', c.packs, readPackLine);
    return c;
  }
  function readLines(containerId, current, reader) {
    var rows = $$('#' + containerId + ' .line');
    var out = [];
    rows.forEach(function (row) {
      var item = reader(row);
      if (item) out.push(item);
    });
    return out;
  }
  function readMatLine(row) {
    var id = row.getAttribute('data-id');
    var materialId = row.getAttribute('data-matid');
    var ratio = num(row.querySelector('input.l-ratio').value);
    var supSel = row.querySelector('select.l-sup');
    var supplierId = supSel ? supSel.value : '';
    var isTemp = row.querySelector('.l-temp input[type=checkbox]').checked;
    var tempPrice = num(row.querySelector('.l-temp input[type=number]').value);
    var mat = S.materialById(materialId);
    var sup = null;
    if (mat) { mat.suppliers.forEach(function (s) { if (s.id === supplierId) sup = s; }); }
    if (!mat) return null; // 已失效行
    var price = isTemp ? tempPrice : (sup ? num(sup.price) : 0);
    var currency = isTemp ? (sup ? sup.currency : 'CNY') : (sup ? sup.currency : 'CNY');
    return {
      id: id, materialId: materialId, name: mat.name, ratio: ratio,
      supplierId: supplierId, supplierName: sup ? sup.supplierName : '',
      price: price, currency: currency,
      quoteDate: sup ? sup.quoteDate : '', validUntil: sup ? sup.validUntil : '',
      source: isTemp ? 'temp' : (sup ? sup.source : ''),
      isTemp: isTemp
    };
  }
  function readPackLine(row) {
    var id = row.getAttribute('data-id');
    var pkId = row.getAttribute('data-pkid');
    var num_ = num(row.querySelector('input.l-num').value);
    var pk = S.packagingById(pkId);
    if (!pk) return null;
    return { id: id, packagingId: pkId, name: pk.name, num: num_ };
  }

  function fillCalc() {
    var c = state.calc;
    $('f-name').value = c.name; $('f-customer').value = c.customer;
    $('f-date').value = c.date || new Date().toISOString().slice(0, 10);
    $('f-moq').value = c.moq || '';
    $('f-factoryMoq').value = c.factoryMoq || '';
    $('f-ladder').value = c.ladder || S.state.settings.defaultLadder;
    $$('#f-taxInc button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === (c.taxInc || 'extax'));
    });
    $('f-tax').value = c.tax; $('f-profit').value = c.profit;
    $('f-admin').value = c.admin; $('f-premium').value = c.premium;
    $('f-testFee').value = c.testFee; $('f-freight').value = c.freight;
    $('f-fx').value = c.fx || 1;
    /* V13：人工费手填（旧档 processLevel 文本已在 load/restoreDraft 归一化为 processFee=0） */
    $('f-processFee').value = (c.processFee === undefined || c.processFee === null || isNaN(num(c.processFee))) ? 0 : num(c.processFee);
    /* v3：克重/每瓶数量/净含量/装箱 */
    $('f-weight').value = c.weight || '';
    $('f-count').value = c.count || '';
    $('f-net').value = c.net || '';
    $('f-box').value = c.box || '';
    renderDosageSelect();
    renderDosageFields();
    renderFormulaSelect();
    renderFormulaVersions();
    toggleEmptyState();
  }

  /* ================= 空状态四入口（无任何数据时展示） ================= */
  function toggleEmptyState() {
    var el = $('calcEmpty');
    if (!el) return;
    var c = state.calc;
    var empty = !c.name && !c.mats.length && !c.packs.length;
    el.style.display = empty ? 'grid' : 'none';
  }

  /* ================= 配方选择 ================= */
  function renderFormulaSelect() {
    var sel = $('f-formula');
    var html = '<option value="">— 手动录入（不套用配方）—</option>';
    state.data.formulas.forEach(function (f) {
      html += '<option value="' + esc(f.id) + '"' + (state.calc.formulaId === f.id ? ' selected' : '') + '>' +
        esc(f.name) + '（' + esc(f.dosageName || '') + '·' + esc(f.type) + '）</option>';
    });
    sel.innerHTML = html;
  }
  function renderFormulaVersions() {
    var sel = $('f-formulaVer');
    var f = S.formulaById(state.calc.formulaId);
    if (!f) { sel.innerHTML = '<option value="">无配方</option>'; return; }
    var html = '';
    (f.versions || []).slice().reverse().forEach(function (v) {
      html += '<option value="' + v.version + '"' + (String(state.calc.formulaVersion || f.version) === String(v.version) ? ' selected' : '') + '>v' + v.version + (v.note ? ' · ' + esc(v.note) : '') + '</option>';
    });
    sel.innerHTML = html;
  }
  function applyFormula(fid, version) {
    var f = S.formulaById(fid);
    if (!f) return;
    var c = state.calc;
    c.formulaId = fid;
    c.formulaVersion = version || f.version;
    var df = S.dosageById(f.dosageFormId) || S.dosageByName(f.dosageName);
    if (df) {
      c.dosageFormId = df.id;
      syncDosageDefaults();
    }
    c.weight = f.weight; c.count = f.count;
    c.net = f.net || ''; c.box = f.box || '';
    c.premium = f.craftPremium || 0;
    /* 原料行：从配方含量带入 */
    c.mats = (f.mats || []).map(function (m) {
      var mat = S.materialByName(m.name);
      var sup = mat ? S.defaultSupplierPrice(mat) : null;
      return {
        id: S.genId('ml'), materialId: mat ? mat.id : '', name: m.name, ratio: m.ratio,
        supplierId: sup ? sup.id : '', supplierName: sup ? sup.supplierName : '',
        price: sup ? num(sup.price) : 0, currency: sup ? sup.currency : 'CNY',
        quoteDate: sup ? sup.quoteDate : '', validUntil: sup ? sup.validUntil : '',
        source: sup ? sup.source : '', isTemp: false
      };
    });
    /* 包材行 */
    c.packs = (f.packs || []).map(function (p) {
      var pk = S.packagingByName ? S.packagingByName(p.name) : null;
      return { id: S.genId('pl'), packagingId: pk ? pk.id : '', name: p.name, num: p.num };
    });
    fillCalc();
    renderMatLines(); renderPackLines();
    if (!c.name || c.name.indexOf('·内部核价') < 0) {
      c.name = f.name + '·内部核价';
      $('f-name').value = c.name;
    }
    S.pushRecent('formulas', fid);
    if (c.dosageFormId) S.pushRecent('dosages', c.dosageFormId);
    scheduleAuto();
  }

  /* ================= 含量合计警告条（轻量同步，不打断输入焦点） ================= */
  function ratioWarnHtml(total) {
    return '<div class="rc-ratio" id="ratioWarn">含量合计 <b>' + (global.WB.smart ? global.WB.smart.fmtRatio(total) : C.fmt(total, 2, 2)) + '%</b>（不等于 100%）' +
      '<button type="button" class="btn btn-sm" id="btnNormalize" style="margin-left:8px">一键归一化</button></div>';
  }
  function syncRatioWarn(c) {
    var wrap = $('matList');
    if (!wrap) return;
    var list = (c && c.mats) || state.calc.mats;
    if (!list.length) return;
    var total = 0;
    list.forEach(function (m) { total += num(m.ratio); });
    var warn = document.getElementById('ratioWarn');
    if (Math.abs(total - 100) <= 0.5) {
      if (warn) warn.remove();
      return;
    }
    if (!warn) {
      warn = document.createElement('div');
      warn.id = 'ratioWarn';
      wrap.insertBefore(warn, wrap.firstChild);
    }
    warn.innerHTML = ratioWarnHtml(total);
    var btn = warn.querySelector('#btnNormalize');
    if (btn) btn.addEventListener('click', normalizeRatios);
  }

  /* ================= 原料清单（V5：单行紧凑表格，行高 ≤52px） ================= */
  function renderMatLines() {
    var wrap = $('matList');
    var list = state.calc.mats;
    $('matCount').textContent = list.length;
    toggleEmptyState();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('flask', 24) + '</div>' +
        '<p>还没有原料。点击右上角 <b>「＋ 添加原料」</b>，或使用顶部 <b>图片识别 / 文字识别 / 文本配方</b> 快速导入。</p></div>';
      return;
    }
    var totalRatio = 0;
    list.forEach(function (m) { totalRatio += num(m.ratio); });
    var ratioWarn = '';
    if (list.length && Math.abs(totalRatio - 100) > 0.5) {
      ratioWarn = ratioWarnHtml(totalRatio);
    }
    var html = ratioWarn + '<table class="mt-table"><thead><tr>' +
      '<th style="width:30%">原料名称</th>' +
      '<th class="num" style="width:8%">含量 %</th>' +
      '<th style="width:25%">供应商（价格）</th>' +
      '<th class="num" style="width:11%">单价</th>' +
      '<th style="width:14%">临时价覆盖</th>' +
      '<th class="ctr" style="width:12%">操作</th>' +
      '</tr></thead><tbody>';
    list.forEach(function (m) {
      html += matLineHtml(m);
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    bindMatLineEvents();
    var btnNorm = $('btnNormalize');
    if (btnNorm) btnNorm.addEventListener('click', normalizeRatios);
  }
  function matLineHtml(m) {
    var mat = S.materialById(m.materialId);
    var opts = '<option value="">— 未绑定 —</option>';
    var curSup = null;
    if (mat && mat.suppliers) {
      mat.suppliers.forEach(function (s) {
        var st = C.priceStatus(s);
        var mark = st === 'expired' ? '（已过期）' : (st === 'expiring' ? '（临期）' : '');
        if (s.id === m.supplierId) curSup = s;
        opts += '<option value="' + esc(s.id) + '"' + (s.id === m.supplierId ? ' selected' : '') + '>' +
          esc(s.supplierName) + ' ¥' + C.fmt(s.price, 2, 4) + mark + '</option>';
      });
    }
    var statusTag = '';
    if (m.isTemp) {
      statusTag = '<span class="tag tag-warn">临时价</span>';
    } else if (m.validUntil) {
      var st = C.priceStatus({ validUntil: m.validUntil });
      statusTag = st === 'expired'
        ? '<span class="tag tag-danger">报价已过期</span>'
        : (st === 'expiring' ? '<span class="tag tag-warn">7天内到期</span>' : '<span class="tag tag-gray">' + esc((m.source === 'manual' ? '手动录入' : m.source === 'upload' ? '报价单上传' : m.source === 'api' ? '行业参考' : m.source === 'paste' ? '粘贴解析' : m.source === 'temp' ? '临时价' : m.source || '')) + '</span>');
    }
    var expired = m.validUntil && C.priceStatus({ validUntil: m.validUntil }) === 'expired';
    var price = m.isTemp ? num(m.price) : (curSup ? num(curSup.price) : 0);
    var currency = m.isTemp ? (m.currency || 'CNY') : (curSup ? curSup.currency : 'CNY');
    var priceCls = expired ? ' expired' : '';
    return '<tr class="line' + (expired ? ' expired' : '') + '" data-id="' + esc(m.id) + '" data-matid="' + esc(m.materialId) + '">' +
      '<td class="mt-name"><span class="l-name">' + esc(m.name) + statusTag + '</span>' +
        '<span class="l-sub">报价：' + (m.quoteDate ? esc(m.quoteDate) : '—') + (m.validUntil ? ' 至 ' + esc(m.validUntil) : '') + (currency && currency !== 'CNY' ? ' · ' + esc(currency) : '') + (altHint(m) ? ' · ' + altHint(m) : '') + '</span></td>' +
      '<td class="num"><input type="number" class="l-ratio" min="0" step="0.01" value="' + (m.ratio === undefined ? '' : esc(global.WB.smart ? global.WB.smart.fmtRatio(m.ratio) : m.ratio)) + '" title="含量 %"></td>' +
      '<td><select class="l-sup" title="切换供应商价格">' + opts + '</select></td>' +
      '<td class="num"><span class="mt-price' + priceCls + '">' + C.money(price, 2, 4) + '</span>' + (currency && currency !== 'CNY' ? ' <span class="mt-price cur">' + esc(currency) + '</span>' : '') + '</td>' +
      '<td><span class="l-temp"><label><input type="checkbox"' + (m.isTemp ? ' checked' : '') + '> 临时价</label>' +
        '<input type="number" min="0" step="0.0001" value="' + esc(m.isTemp ? m.price : '') + '" placeholder="¥/kg" title="临时价覆盖" ' + (m.isTemp ? '' : 'disabled') + '></span></td>' +
      '<td class="mt-ops">' +
        '<button type="button" class="icon-btn" data-act="alt" title="同类原料替代建议（同功效一键切换+报价对比）">' + U.ic('swap', 14) + '</button>' +
        '<button type="button" class="icon-btn" data-act="up" title="上移">' + U.ic('arrowup', 14) + '</button>' +
        '<button type="button" class="icon-btn" data-act="down" title="下移">' + U.ic('arrowdown', 14) + '</button>' +
        '<button type="button" class="icon-btn del" data-act="del" title="删除该行">' + U.ic('close', 14) + '</button>' +
      '</td>' +
    '</tr>';
  }
  /* 原料替代建议提示行 */
  function altHint(m) {
    var mat = S.materialById(m.materialId);
    if (!mat || !mat.category) return '';
    var alts = state.data.materials.filter(function (x) {
      return x.id !== m.materialId && x.category === mat.category && (!x.tags || x.tags.indexOf('识别草稿') < 0);
    });
    if (!alts.length) return '';
    return '<span class="trend-red">⇄ ' + alts.length + ' 款同类可替代</span>';
  }
  function bindMatLineEvents() {
    $$('#matList tr.line').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('input.l-ratio').addEventListener('input', function () { scheduleAuto(); });
      row.querySelector('select.l-sup').addEventListener('change', function () {
        applyMatSupplier(id, this.value);
      });
      var chk = row.querySelector('.l-temp input[type=checkbox]');
      var inp = row.querySelector('.l-temp input[type=number]');
      chk.addEventListener('change', function () {
        inp.disabled = !chk.checked;
        if (chk.checked) { readCalc(); scheduleAuto(); }
      });
      inp.addEventListener('input', function () { if (chk.checked) scheduleAuto(); });
      var altBtn = row.querySelector('[data-act=alt]');
      if (altBtn) altBtn.addEventListener('click', function () { openAltSuggest(id); });
      var upBtn = row.querySelector('[data-act=up]');
      if (upBtn) upBtn.addEventListener('click', function () { moveMatLine(id, -1); });
      var dnBtn = row.querySelector('[data-act=down]');
      if (dnBtn) dnBtn.addEventListener('click', function () { moveMatLine(id, 1); });
      var delBtn = row.querySelector('[data-act=del]');
      if (delBtn) delBtn.addEventListener('click', function () {
        state.calc.mats = state.calc.mats.filter(function (m) { return m.id !== id; });
        renderMatLines();
        scheduleAuto();
      });
    });
  }
  /* 上移/下移原料行（V5 新增） */
  function moveMatLine(id, dir) {
    var list = state.calc.mats;
    var i = -1;
    for (var k = 0; k < list.length; k++) { if (list[k].id === id) { i = k; break; } }
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    renderMatLines();
    scheduleAuto();
  }

  /* ================= 原料替代建议（同类原料一键切换 + 报价对比） ================= */
  function openAltSuggest(lineId) {
    var line = null;
    state.calc.mats.forEach(function (m) { if (m.id === lineId) line = m; });
    if (!line) return;
    var cur = S.materialById(line.materialId);
    if (!cur) { U.toast('当前原料未入库，无法推荐替代', 'warn'); return; }
    var alts = state.data.materials.filter(function (x) {
      return x.id !== cur.id && x.category === cur.category && (!x.tags || x.tags.indexOf('识别草稿') < 0);
    });
    if (!alts.length) { U.toast('原料库暂无同分类可替代原料', 'warn'); return; }
    var html = '<p class="muted" style="font-size:12px;margin-bottom:8px">当前：<b>' + esc(cur.name) + '</b>（' + esc(cur.category) + '）· 报价 ' + C.money(line.price, 3, 4) + (line.currency && line.currency !== 'CNY' ? ' ' + esc(line.currency) : '') + '/kg</p>' +
      '<div class="mat-list" style="gap:8px">';
    alts.forEach(function (a) {
      var sup = S.defaultSupplierPrice(a);
      var price = sup ? num(sup.price) : 0;
      var currency = sup ? sup.currency : 'CNY';
      var diff = line.price > 0 ? (price - line.price) / line.price * 100 : 0;
      var diffTag = diff > 0 ? '<span class="tag tag-warn">贵 ' + C.fmt(diff, 1, 1) + '%</span>'
        : diff < 0 ? '<span class="tag tag-ok">省 ' + C.fmt(-diff, 1, 1) + '%</span>' : '';
      html += '<div class="line" data-alt="' + esc(a.id) + '">' +
        '<div class="l-cell" style="min-width:170px"><span class="l-name">' + esc(a.name) + '</span>' +
        '<span class="l-sub">' + esc(a.grade || '') + ' · ' + esc(a.inciName || '') + '</span></div>' +
        '<div class="l-cell"><label>当前价</label><span class="mono" style="font-size:13px">' + C.money(price, 3, 4) + ' ' + esc(currency) + '/kg</span></div>' +
        '<div class="l-cell"><label>价差</label><span>' + diffTag + '</span></div>' +
        '<div class="l-cell"><label>供应商</label><span class="muted" style="font-size:12px">' + esc(sup ? sup.supplierName : '未绑定') + '</span></div>' +
        '</div>';
    });
    html += '</div><p class="muted mt8" style="font-size:11px">点击替代行：将当前原料行切换为该原料，并保留原含量（可再调整）。</p>';
    var m = U.openModal(html, {
      title: '⇄ 原料替代建议（' + esc(cur.name) + '）', wide: true,
      footBtns: [{ text: '关闭', cls: '' }]
    });
    $$('[data-alt]', m.el).forEach(function (row) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        var aId = this.getAttribute('data-alt');
        var a = S.materialById(aId);
        if (!a) return;
        var sup = S.defaultSupplierPrice(a);
        line.materialId = a.id;
        line.name = a.name;
        line.supplierId = sup ? sup.id : '';
        line.supplierName = sup ? sup.supplierName : '';
        line.price = sup ? num(sup.price) : 0;
        line.currency = sup ? sup.currency : 'CNY';
        line.quoteDate = sup ? sup.quoteDate : '';
        line.validUntil = sup ? sup.validUntil : '';
        line.source = sup ? sup.source : '';
        line.isTemp = false;
        renderMatLines();
        scheduleAuto();
        U.toast('已切换为：' + a.name, 'ok');
      });
    });
  }
  /* 切换供应商 → 更新该行价格信息 */
  function applyMatSupplier(lineId, supplierId) {
    var line = null;
    state.calc.mats.forEach(function (m) { if (m.id === lineId) line = m; });
    if (!line) return;
    var mat = S.materialById(line.materialId);
    var sup = null;
    if (mat) mat.suppliers.forEach(function (s) { if (s.id === supplierId) sup = s; });
    if (sup) {
      line.supplierId = sup.id; line.supplierName = sup.supplierName;
      line.price = num(sup.price); line.currency = sup.currency;
      line.quoteDate = sup.quoteDate; line.validUntil = sup.validUntil;
      line.source = sup.source; line.isTemp = false;
    } else {
      line.supplierId = ''; line.supplierName = '';
      line.price = 0; line.validUntil = '';
    }
    renderMatLines();
    scheduleAuto();
  }
  /* 一键最优价：所有原料选最低报价（未过期）供应商 */
  function applyBestPrices() {
    state.calc.mats.forEach(function (m) {
      var mat = S.materialById(m.materialId);
      if (!mat || !mat.suppliers || !mat.suppliers.length) return;
      var best = null, bestCny = Infinity;
      mat.suppliers.forEach(function (s) {
        if (C.priceStatus(s) === 'expired') return;
        var rate = (state.settings.fx && state.settings.fx[s.currency]) || 1;
        var cny = num(s.price) * rate;
        if (cny < bestCny) { bestCny = cny; best = s; }
      });
      if (best) {
        m.supplierId = best.id; m.supplierName = best.supplierName;
        m.price = num(best.price); m.currency = best.currency;
        m.quoteDate = best.quoteDate; m.validUntil = best.validUntil;
        m.source = best.source; m.isTemp = false;
      }
    });
    renderMatLines();
    scheduleAuto();
    U.toast('已为全部原料选择当前最低报价供应商', 'ok');
  }

  /* ================= 批量粘贴原料（Excel/文本多行解析） ================= */
  function parsePasteMats(text) {
    if (!text) return;
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return;
    var added = 0, updated = 0;
    lines.forEach(function (line) {
      /* 按制表符、逗号、多个空格拆分 */
      var cols = line.split(/[\t,]+/).map(function (c) { return c.trim(); }).filter(function (c) { return c; });
      if (!cols.length) return;
      var name = cols[0];
      var ratio = parseFloat(cols[1]) || 0;
      var price = parseFloat(cols[2]) || 0;
      /* 查找或创建原料 */
      var mat = S.materialByName(name);
      if (!mat) {
        /* 自动创建入库 */
        mat = {
          id: S.genId('mat'), name: name, inciName: '', casNo: '', grade: '食品级',
          defaultUnit: 'kg', moq: 1, category: '其他', suppliers: [], priceHistory: [],
          tags: ['识别草稿'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        if (price > 0) {
          var sup = {
            id: S.genId('sup'), supplierName: '临时供应商', contact: '', price: price, currency: 'CNY',
            quoteDate: new Date().toISOString().slice(0, 10), validUntil: '', moq: 1, leadTime: '',
            taxIncluded: true, shippingIncluded: false, source: 'paste', isDefault: true
          };
          mat.suppliers.push(sup);
          mat.priceHistory.push({ date: sup.quoteDate, price: price, supplier: sup.supplierName });
        }
        state.data.materials.push(mat);
        added++;
      } else if (price > 0) {
        /* 已有原料：若价格不同则更新默认供应商价格 */
        var def = mat.suppliers.filter(function (s) { return s.isDefault; })[0];
        if (def && Math.abs(def.price - price) > 0.001) {
          def.price = price; def.quoteDate = new Date().toISOString().slice(0, 10);
          def.source = 'paste'; updated++;
          mat.priceHistory.push({ date: def.quoteDate, price: price, supplier: def.supplierName });
        }
      }
      var sup = S.defaultSupplierPrice(mat) || (mat.suppliers && mat.suppliers[0]) || null;
      var line = {
        id: S.genId('ml'), materialId: mat.id, name: mat.name, ratio: ratio || 5,
        supplierId: sup ? sup.id : '', supplierName: sup ? sup.supplierName : '',
        price: sup ? num(sup.price) : (price || 0), currency: sup ? sup.currency : 'CNY',
        quoteDate: sup ? sup.quoteDate : '', validUntil: sup ? sup.validUntil : '',
        source: sup ? sup.source : '', isTemp: false
      };
      state.calc.mats.push(line);
    });
    renderMatLines();
    scheduleAuto();
    var msgs = [];
    if (added) msgs.push('新增 ' + added + ' 条原料入库');
    if (updated) msgs.push('更新 ' + updated + ' 条原料价格');
    U.toast('已粘贴 ' + lines.length + ' 行原料' + (msgs.length ? '（' + msgs.join('，') + '）' : ''), 'ok');
  }

  /* ================= 含量归一化 ================= */
  function normalizeRatios() {
    var list = state.calc.mats;
    if (!list.length) return;
    var total = 0;
    list.forEach(function (m) { total += num(m.ratio); });
    if (total <= 0) { U.toast('含量总和为 0，无法归一化', 'warn'); return; }
    list.forEach(function (m) { m.ratio = num(m.ratio) / total * 100; });
    renderMatLines();
    scheduleAuto();
    U.toast('含量已归一化为 100%', 'ok');
  }

  /* ================= 剂型默认参数联动（扩展） ================= */
  function syncDosageDefaults() {
    var d = S.dosageById(state.calc.dosageFormId);
    if (!d) return;
    /* 损耗率 */
    state.calc.lossRates = {
      material: d.defaultLossRate.material,
      packaging: d.defaultLossRate.packaging,
      production: d.defaultLossRate.production
    };
    /* 默认重量/数量/净含量/装箱（若 dosageForm 有默认值且当前为空） */
    var defs = d.defaults || {};
    if (defs.weight && !state.calc.weight) state.calc.weight = defs.weight;
    if (defs.count && !state.calc.count) state.calc.count = defs.count;
    if (defs.net && !state.calc.net) state.calc.net = defs.net;
    if (defs.box && !state.calc.box) state.calc.box = defs.box;
    /* V13：人工费为手填数值，与剂型工艺档脱钩 —— 换剂型不覆盖已填人工费 */
  }

  /* ================= 清除配方（一键清空，二次确认） ================= */
  function clearMats() {
    var n = state.calc.mats.length, p = state.calc.packs.length;
    if (!n && !p) { U.toast('当前配方已是空的', 'warn'); return; }
    var html = '<p style="font-size:14px;line-height:1.7">确定清空当前配方？此操作不可恢复。' +
      (n ? '<br>将移除原料清单 <b>' + n + '</b> 行（含用量与供应商选择）。' : '<br>原料清单为空，无需清空。') +
      '<br>仅清空当前报价草稿，<b>不影响</b>原料价格库、包材价格库、配方模板与历史报价记录。</p>' +
      '<label class="clr-packs-chk" style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:13px;cursor:pointer">' +
      '<input type="checkbox" id="clearPacksChk" style="width:15px;height:15px;accent-color:var(--danger)"> ' +
      '同时清空包材清单' + (p ? '（当前 ' + p + ' 项）' : '') + '与产品参数（方案名/客户/克重/每瓶数量等）</label>';
    var m = U.openModal(html, {
      title: '清除配方',
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '清空配方', cls: 'btn-danger', onClick: function () {
            var chk = m.el.querySelector('#clearPacksChk');
            var withAll = !!(chk && chk.checked);
            state.calc.mats = [];
            if (withAll) {
              state.calc.packs = [];
              /* 重置产品参数（保留商务参数：MOQ/税率/利润率等） */
              state.calc.name = ''; state.calc.customer = ''; state.calc.net = '';
              state.calc.box = ''; state.calc.weight = ''; state.calc.count = '';
              state.calc.formulaId = ''; state.calc.formulaVersion = '';
              state.calc.dosageFormId = ''; state.calc.params = {};
            }
            S.persist();
            S.saveDraft();
            fillCalc();
            renderMatLines();
            renderPackLines();
            resetResult();
            U.toast('配方已清空', 'ok');
          }
        }
      ]
    });
  }
  /* 重置核算结果区为初始空状态（成本明细清空、总成本归零） */
  function resetResult() {
    var body = $('resultBody');
    if (body) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('calc', 36) + '</div>' +
        '<p>填写左侧参数后点击 <b>「一键报价」</b><br>或直接修改任意参数，结果将实时刷新</p></div>';
    }
    var st = $('resultState');
    if (st) { st.textContent = '待核算'; st.className = 'result-state'; }
    resultState.last = null;
    resultState.numMap = null; /* V7：清空高亮基线，下次核算全量点亮 */
  }

  /* ================= V11：四个基础板块独立重置 + 一键全重置 =================
   * 作用域严格限定「当前录入态」：产品参数/商务参数输入项、原料清单/包材清单行；
   * 原料价格库/包材库/配方库/报价存档/设置模板/宠物经验等共享持久数据一律不动。
   * 全部入口先弹确认（可取消），确认后核算面板回到待核算态并实时联动刷新。 */
  function sectionLabel(kind) {
    return { prod: '产品参数', biz: '商务参数', mats: '原料清单', packs: '包材清单' }[kind] || '当前板块';
  }
  function confirmReset(kind) {
    var all = kind === 'all';
    var scope = all ? '四个基础板块（产品参数 / 商务参数 / 原料清单 / 包材清单）' : '「' + sectionLabel(kind) + '」板块';
    var detail = all
      ? '将清空四个板块的全部录入，核算面板回到待核算态，是否继续？'
      : kind === 'prod' ? '将清空方案名称 / 客户 / 日期 / 配方 / 剂型 / 克重 / 每瓶数量 / 净含量 / 装箱等录入，是否继续？'
      : kind === 'biz' ? '将清空 MOQ / 计价口径 / 税率 / 利润率 / 管理费 / 人工 / 检测附加费 / 运费分摊 / 汇率等录入并恢复默认，是否继续？'
      : kind === 'mats' ? '将清空原料清单中的全部行（含量 / 供应商 / 价格选择），是否继续？'
      : '将清空包材清单中的全部行（每瓶用量设置），是否继续？';
    U.openModal(
      '<p style="font-size:14px;line-height:1.75;margin:2px 0">确定重置' + scope + '？' + detail +
      '<br><span style="color:var(--text3);font-size:12.5px">仅清空当前录入态，<b>不影响</b>原料价格库 / 包材库 / 配方库 / 报价存档 / 设置 / 宠物数据。</span></p>',
      {
        title: all ? '一键全重置' : '重置确认',
        footBtns: [
          { text: '取消', cls: '' },
          { text: all ? '确认全重置' : '确认重置', cls: 'btn-danger', onClick: function () { resetBoard(kind); } }
        ]
      });
  }
  function resetBoard(kind) {
    var c = state.calc;
    var dc = S.defaultCalc();
    if (kind === 'all' || kind === 'prod') {
      c.name = ''; c.customer = ''; c.date = dc.date;
      c.formulaId = ''; c.formulaVersion = '';
      c.dosageFormId = ''; c.params = {};
      c.weight = ''; c.count = ''; c.net = ''; c.box = '';
      c.project = ''; c.ftype = dc.ftype; c.reg = dc.reg; c.note = '';
      var ds = $('f-dosageSearch'); if (ds) ds.value = '';
    }
    if (kind === 'all' || kind === 'biz') {
      c.moq = dc.moq; c.factoryMoq = dc.factoryMoq; c.ladder = '';
      c.taxInc = dc.taxInc; c.tax = dc.tax; c.profit = dc.profit;
      c.admin = dc.admin; c.processFee = dc.processFee; c.premium = dc.premium;
      c.testFee = dc.testFee; c.freight = dc.freight; c.fx = dc.fx;
      c.lossRates = Object.assign({ material: 5, packaging: 1, production: 2 }, dc.lossRates || {});
    }
    if (kind === 'all' || kind === 'mats') c.mats = [];
    if (kind === 'all' || kind === 'packs') c.packs = [];
    S.persist();
    S.saveDraft();
    fillCalc();
    renderMatLines();
    renderPackLines();
    if (kind === 'all') {
      resetResult();
      U.toast('四个板块已全部重置，开始新一轮报价吧', 'ok');
      return;
    }
    if (!c.mats.length && !c.packs.length) {
      resetResult();
    } else {
      scheduleAuto();
    }
    U.toast('「' + sectionLabel(kind) + '」已重置', 'ok');
  }

  /* ================= 包材清单 ================= */
  function renderPackLines() {
    var wrap = $('packList');
    var list = state.calc.packs;
    $('packCount').textContent = list.length;
    toggleEmptyState();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('package', 24) + '</div>' +
        '<p>还没有包材。点击右上角 <b>「＋ 添加包材」</b>，从包材库搜索多选添加。</p></div>';
      return;
    }
    var html = '<table class="pt-table"><thead><tr>' +
      '<th style="width:30%">包材名称</th>' +
      '<th style="width:20%">供应商</th>' +
      '<th class="num" style="width:13%">单价</th>' +
      '<th class="num" style="width:10%">损耗 %</th>' +
      '<th class="num" style="width:15%">每瓶用量</th>' +
      '<th class="ctr" style="width:12%">操作</th>' +
      '</tr></thead><tbody>';
    list.forEach(function (p) {
      var pk = S.packagingById(p.packagingId);
      if (!pk) return;
      html += '<tr class="line" data-id="' + esc(p.id) + '" data-pkid="' + esc(p.packagingId) + '">' +
        '<td class="pt-name"><span class="l-name">' + esc(pk.name) + '</span>' +
          '<span class="l-sub">' + esc(pk.type || '') + (pk.spec ? ' · ' + esc(pk.spec) : '') + '</span></td>' +
        '<td class="pt-supplier">' + esc(pk.supplier || '—') + '</td>' +
        '<td class="num"><span class="pt-price">' + C.money(pk.price, 3, 4) + '</span>/个</td>' +
        '<td class="num">' + C.fmt(pk.lossRate, 1, 2) + '%</td>' +
        '<td class="num"><input type="number" class="l-num" min="0" step="0.01" value="' + esc(p.num) + '" title="每瓶用量"></td>' +
        '<td class="pt-ops">' +
          '<button type="button" class="icon-btn" data-act="up" title="上移">' + U.ic('arrowup', 14) + '</button>' +
          '<button type="button" class="icon-btn" data-act="down" title="下移">' + U.ic('arrowdown', 14) + '</button>' +
          '<button type="button" class="icon-btn del" data-act="del" title="删除该行">' + U.ic('close', 14) + '</button>' +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    $$('#packList tr.line').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('input').addEventListener('input', function () { scheduleAuto(); });
      var upBtn = row.querySelector('[data-act=up]');
      if (upBtn) upBtn.addEventListener('click', function () { movePackLine(id, -1); });
      var dnBtn = row.querySelector('[data-act=down]');
      if (dnBtn) dnBtn.addEventListener('click', function () { movePackLine(id, 1); });
      var delBtn = row.querySelector('[data-act=del]');
      if (delBtn) delBtn.addEventListener('click', function () {
        state.calc.packs = state.calc.packs.filter(function (p) { return p.id !== id; });
        renderPackLines();
        scheduleAuto();
      });
    });
  }
  /* 上移/下移包材行（V5 新增） */
  function movePackLine(id, dir) {
    var list = state.calc.packs;
    var i = -1;
    for (var k = 0; k < list.length; k++) { if (list[k].id === id) { i = k; break; } }
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    renderPackLines();
    scheduleAuto();
  }

  /* ================= 校验 ================= */
  function validateCalc(c) {
    var errs = [];
    if (!c.name) errs.push('请填写方案名称');
    if (!c.dosageFormId) errs.push('请选择剂型');
    var d = S.dosageById(c.dosageFormId);
    if (d) {
      (d.customFields || []).forEach(function (f) {
        if (f.required && !(c.params[f.key] || '').toString().trim()) {
          errs.push('剂型字段「' + f.label + '」为必填');
        }
      });
    }
    if (!(c.weight > 0)) errs.push('单粒克重必须大于 0');
    if (!(c.count > 0)) errs.push('每瓶数量必须大于 0');
    if (!(c.moq > 0)) errs.push('订单 MOQ 必须大于 0');
    if (!c.mats.length) errs.push('原料清单为空，请至少添加一款原料');
    c.mats.forEach(function (m) {
      if (!m.materialId) errs.push('存在未识别的原料行');
      if (m.supplierId === '' && !m.isTemp) errs.push('原料「' + m.name + '」未绑定供应商采购价');
      if (m.validUntil && C.priceStatus({ validUntil: m.validUntil }) === 'expired' && !m.isTemp) {
        errs.push('原料「' + m.name + '」绑定的是已过期报价，请切换供应商或更新价格');
      }
      if (m.ratio <= 0) errs.push('原料「' + m.name + '」含量必须大于 0');
    });
    return errs;
  }

  /* ================= V14：校验错误 → 缺失字段定位 =================
   * 目的：让"还差什么"一眼可见、一击可达：
   *   ① 缺失字段红框 + 红点高亮；② 顶部 toast 汇总「还差：剂型 / 软糖类型」；
   *   ③ toast 与右侧错误列表均可点击 → 滚动定位并聚焦到该字段。 */
  var ERR_FIELD_MAP = [
    { k: '请填写方案名称', label: '方案名称', sel: '#f-name' },
    { k: '请选择剂型', label: '剂型', sel: '#f-dosage' },
    { k: '单粒克重', label: '单位克重', sel: '#f-weight' },
    { k: '每瓶数量', label: '每瓶数量', sel: '#f-count' },
    { k: '订单 MOQ', label: '订单MOQ', sel: '#f-moq' },
    { k: '原料清单为空', label: '原料清单', sel: '#matList' },
    { k: '未识别的原料行', label: '原料清单', sel: '#matList' },
    { k: '未绑定供应商', label: '原料供应商', sel: '#matList' },
    { k: '已过期报价', label: '原料价格有效期', sel: '#matList' },
    { k: '含量必须大于 0', label: '原料含量', sel: '#matList' }
  ];
  /* 单条错误 → 缺失字段（标签 + 定位元素） */
  function resolveErrTarget(err) {
    var m = /剂型字段「(.+?)」为必填/.exec(err);
    if (m) {
      var key = null;
      var d = S.dosageById(state.calc.dosageFormId);
      ((d && d.customFields) || []).forEach(function (f) { if (f.label === m[1]) key = f.key; });
      var box = key ? document.querySelector('#dosageFields [data-cf="' + key + '"]') : null;
      return { label: m[1], el: box || $('dosageFields') || $('f-dosage') };
    }
    for (var i = 0; i < ERR_FIELD_MAP.length; i++) {
      if (err.indexOf(ERR_FIELD_MAP[i].k) >= 0) {
        return { label: ERR_FIELD_MAP[i].label, el: document.querySelector(ERR_FIELD_MAP[i].sel) };
      }
    }
    return null;
  }
  /* 红点标记（红框之外的二级提示，缺失字段右上角脉冲圆点） */
  function markReqDot(box) {
    if (!box || !box.appendChild) return;
    if (box.querySelector('.req-dot')) return;
    var dot = document.createElement('i');
    dot.className = 'req-dot';
    box.classList.add('has-req-dot');
    box.appendChild(dot);
  }
  /* 滚动定位 + 聚焦到缺失字段（toast / 错误列表点击共用） */
  function focusErrTarget(t) {
    if (!t || !t.el) return;
    var el = t.el;
    var field = (el.closest && el.closest('.field')) || el;
    try { field.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    var input = (el.matches && el.matches('input,select,textarea')) ? el
      : (el.querySelector ? el.querySelector('input,select,textarea') : null);
    if (input && input.focus) {
      setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e2) { input.focus(); } }, 140);
    }
  }

  /* ================= 计算 & 结果渲染 ================= */
  function buildCalcInput(c, moq) {
    var d = S.dosageById(c.dosageFormId);
    return {
      materials: c.mats.map(function (m) {
        var rate = (state.settings.fx && state.settings.fx[m.currency]) || 1;
        if (m.currency && m.currency !== 'CNY') rate = rate * c.fx / (state.settings.fx.USD || 1) * (state.settings.fx.USD || 1); // 以手动汇率系数覆盖基准
        /* 简化：外币原料价格换算 CNY = price × 手动汇率系数 f-fx（默认=库中基准汇率） */
        var cny = m.currency && m.currency !== 'CNY' ? num(m.price) * c.fx : num(m.price);
        return { name: m.name, ratio: m.ratio, price: cny };
      }),
      packaging: c.packs.map(function (p) {
        var pk = S.packagingById(p.packagingId);
        if (!pk) return null;
        return {
          name: pk.name, num: p.num, unitPrice: pk.price, lossRate: pk.lossRate,
          printFee: pk.printFee, moldFee: pk.moldFee
        };
      }).filter(Boolean),
      grams: num(c.weight) * num(c.count),
      lossRates: c.lossRates || { material: 5, packaging: 1, production: 2 },
      processFee: num(c.processFee) || 0, /* V13：人工费手填直读 */
      adminRate: c.admin,
      premiumRate: c.premium,
      testFee: c.testFee, freight: c.freight,
      profitRate: c.profit, taxRate: c.tax, taxInc: c.taxInc,
      moq: moq || c.moq, lowProfitLine: state.settings.lowProfitLine
    };
  }

  var resultState = { last: null, ticking: false };

  /* 一键报价（主 CTA） */
  function runQuote() {
    var c = readCalc();
    var errs = validateCalc(c);
    if (errs.length) {
      /* V14：先定位缺失字段（红框 + 红点），再渲染可点击的错误列表，
       * 最后用顶部 toast 汇总「还差：…」，点击即可跳转并聚焦。 */
      var miss = highlightErrors(errs);
      renderErrors(errs, miss.targets);
      var msg = miss.labels.length ? ('还差：' + miss.labels.join(' / ')) : ('核算未通过：' + errs[0]);
      U.toast(msg, 'err', 6500, function () { focusErrTarget(miss.first); });
      return false;
    }
    var d = S.dosageById(c.dosageFormId);
    c.dosageName = d ? d.name : '';
    var r = C.computeQuote(buildCalcInput(c));
    var tiers = parseTiers(c.ladder, c.moq);
    var tierResults = C.computeTiers(buildCalcInput(c), tiers);
    var iss = collectIssues(c);
    resultState.last = { c: c, r: r, tiers: tierResults };
    renderResult(r, c, tierResults, iss.issues, iss.ratioSum, iss.noPrice);
    flashChanged(null);              /* V7 一键报价成功：关键数字整体点亮一次 */
    markNoPriceRows();               /* V7 无价原料行标红（提示但不阻断） */
    $('resultState').textContent = '✓ 已核算';
    $('resultState').className = 'result-state live';
    /* v3：每次一键报价自动记录参数快照（可回滚对比） */
    S.pushSnapshot({
      id: S.genId('snap'),
      t: new Date().toISOString(),
      name: c.name || '未命名方案',
      customer: c.customer || '',
      summary: { unitCost: r.unitCost, upTax: r.upTax, inTax: r.inTax, profitRate: r.profitRate, moq: c.moq },
      calc: JSON.parse(JSON.stringify(c))
    });
    S.persist();
    /* v3：同客户历史报价对比提示 */
    var hist = C.customerHistory(state.data.quotes, c.customer);
    if (hist && hist.count > 0) {
      U.toast('该客户历史 ' + hist.count + ' 单 · 平均 ' + C.money(hist.avgInTax, 2, 2) + '（含税），本次 ' + C.money(r.inTax, 2, 2) + (r.inTax > hist.avgInTax ? ' · 偏高 ' + C.fmt((r.inTax - hist.avgInTax) / hist.avgInTax * 100, 1, 1) + '%' : '') , r.inTax > hist.avgInTax ? 'warn' : 'ok', 4200);
    }
    /* 自动滚动到结果栏（桌面端） */
    var right = document.querySelector('.calc-right');
    if (right && window.innerWidth >= 1280 && right.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: document.querySelector('.calc-layout').offsetTop + 8, behavior: 'smooth' });
    }
    /* V5：报价小宠——每次「一键报价」成功累计 1 次并做开心动效 */
    if (global.WB.pet && global.WB.pet.onQuote) global.WB.pet.onQuote();
    return true;
  }

  /* ================= 校验失败：字段级高亮 + 汇总缺失项（V14） =================
   * 返回 { labels: ['剂型','软糖类型'], targets: [每错一条对应的定位对象|null], first } */
  function highlightErrors(errs) {
    /* 先清掉上一轮的标记，避免残留 */
    $$('#card-product .field, #card-biz .field, #dosageFields .field, .has-req-dot').forEach(function (f) {
      f.classList.remove('invalid');
      f.classList.remove('has-req-dot');
      var dot = f.querySelector ? f.querySelector('.req-dot') : null;
      if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
    });
    var labels = [], seen = {}, first = null, targets = [];
    errs.forEach(function (e) {
      var t = resolveErrTarget(e);
      targets.push(t);
      if (!t) return;
      var field = (t.el && t.el.closest) ? t.el.closest('.field') : null;
      var box = field || t.el;
      if (box) {
        box.classList.add('invalid');
        markReqDot(box);
      }
      if (!first) first = t;
      if (t.label && !seen[t.label]) { seen[t.label] = 1; labels.push(t.label); }
    });
    return { labels: labels, targets: targets, first: first };
  }

  /* ================= 真·实时联动（V7） =================
   * 单一入口 recalcAndRender：任何输入变化（原料/包材/产品参数/商务成本/识别带入）
   * → scheduleAuto（debounce 300ms）→ 本函数统一「重算 + 渲染核算面板」。
   * 特性：不因单项未填/未绑定中断计算；含量合计≠100% 黄条；无价原料标红不中断；
   *       关键数字仅对「发生变化项」做 500ms 高亮闪烁（flashChanged）。
   */
  var scheduleAuto = U.debounce(function () { recalcAndRender(); }, 300);
  /* 温和问题检测：只提示、不阻断 */
  function collectIssues(c) {
    var ratioSum = 0, noPrice = 0;
    (c.mats || []).forEach(function (m) {
      ratioSum += num(m.ratio);
      if (!(num(m.price) > 0) && !m.isTemp) noPrice += 1;
    });
    var issues = [];
    if (c.mats && c.mats.length && Math.abs(ratioSum - 100) > 0.5) issues.push('ratio');
    if (noPrice > 0) issues.push('noprice');
    return { issues: issues, ratioSum: ratioSum, noPrice: noPrice };
  }
  function parseNumText(t) {
    if (t === null || t === undefined) return null;
    var s = String(t).replace(/[¥,%\s]/g, '');
    if (!s || s === '-' || s === '—') return null;
    var n = Number(s);
    return isNaN(n) ? null : n;
  }
  /* 数字高亮：仅对数值发生变化的关键位加 flash（500ms 淡出） */
  function flashChanged(prevNum) {
    var body = $('resultBody');
    if (!body) return;
    var map = {};
    body.querySelectorAll('[data-k]').forEach(function (el) {
      var k = el.getAttribute('data-k');
      var v = parseNumText(el.textContent);
      map[k] = v;
      if (!prevNum) { el.classList.add('flash'); return; }        /* 首次渲染：全部高亮 */
      var pv = prevNum[k];
      if (pv === null || pv === undefined || v === null || Math.abs(pv - v) > 1e-9) {
        el.classList.add('flash');
      }
    });
    resultState.numMap = map;
  }
  /* 原料行无价标红（视觉提示，不中断其余计算；不清空价格文本） */
  function markNoPriceRows() {
    var rows = $$('#matList tr.line');
    if (!rows.length) return;
    rows.forEach(function (row) {
      var id = row.getAttribute('data-id');
      var hit = null;
      for (var i = 0; i < state.calc.mats.length; i++) {
        if (state.calc.mats[i].id === id) { hit = state.calc.mats[i]; break; }
      }
      var np = !!(hit && !(num(hit.price) > 0) && !hit.isTemp);
      row.classList.toggle('np', np);
      if (np) {
        var pr = row.querySelector('.mt-price');
        if (pr && !pr.querySelector('.np-flag')) {
          var f = document.createElement('i');
          f.className = 'np-flag';
          f.textContent = '无价';
          f.title = '该原料暂无有效采购价，已按 ¥0 参与估算';
          pr.appendChild(f);
        }
      } else {
        var old = row.querySelector('.np-flag');
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }
    });
  }
  function recalcAndRender() {
    var c = readCalc();
    var d = S.dosageById(c.dosageFormId);
    c.dosageName = d ? d.name : '';
    var st = $('resultState');
    if (!c.mats.length && !c.packs.length) {
      /* 无清单：保留空状态文案（避免刷出满屏 ¥0） */
      var body = $('resultBody');
      if (body && !resultState.last && !body.querySelector('.empty-state')) {
        body.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('calc', 36) + '</div>' +
          '<p>填写左侧参数后点击 <b>「一键报价」</b><br>或直接修改任意参数，结果将实时刷新</p></div>';
      }
      if (st) { st.textContent = '待核算：先添加原料或包材'; st.className = 'result-state'; }
      return;
    }
    var iss = collectIssues(c);
    var prevNum = resultState.numMap || null;
    var r = C.computeQuote(buildCalcInput(c));
    var tiers = parseTiers(c.ladder, c.moq);
    var tierResults = C.computeTiers(buildCalcInput(c), tiers);
    resultState.last = { c: c, r: r, tiers: tierResults };
    renderResult(r, c, tierResults, iss.issues, iss.ratioSum, iss.noPrice);
    flashChanged(prevNum);
    markNoPriceRows();
    syncRatioWarn(c);                            /* 含量≠100% 警告即时更新（不重绘表格） */
    /* V13：核算异常（问题/无价格/含量偏离100%）→ 桌宠小抱怨（pet 内部 45s 节流，不打扰） */
    if (global.WB.pet && typeof global.WB.pet.onQuoteIssue === 'function') {
      global.WB.pet.onQuoteIssue(
        (c.mats.length || c.packs.length) > 0 &&
        (iss.issues.length > 0 || iss.noPrice > 0 || iss.ratioSum < 98 || iss.ratioSum > 102)
      );
    }
    if (st) { st.textContent = '✓ 实时核算'; st.className = 'result-state live'; }
  }
  /* 兼容旧调用（识别导入 / 价格库联动 / 快照回滚等仍走 calcView.autoCalc） */
  var autoCalc = recalcAndRender;

  function parseTiers(ladderStr, moq) {
    var list = [];
    String(ladderStr || '').split(/[,，;；\s]+/).forEach(function (t) {
      var n = parseInt(t, 10);
      if (!isNaN(n) && n > 0) list.push(n);
    });
    if (!list.length) list.push(Math.max(1, num(moq, 1)));
    return list;
  }

  /* 校验未通过：右侧面板错误清单（V14：每条可点击 → 跳转并聚焦缺失字段） */
  function renderErrors(errs, targets) {
    var body = $('resultBody');
    var html = '<div class="rc-err"><b>⚠ 无法核算 · 还差 ' + errs.length + ' 项</b><ul class="calc-warn-list">';
    errs.forEach(function (e, i) {
      var t = targets && targets[i];
      html += '<li>' + (t
        ? '<button type="button" class="err-jump" data-err-i="' + i + '" title="点击定位到「' + esc(t.label) + '」">' +
            esc(e) + '<span class="ej-go">定位 ›</span></button>'
        : esc(e)) + '</li>';
    });
    html += '</ul><p class="err-hint">点击任意一条可跳转并聚焦到缺失字段</p></div>';
    body.innerHTML = html;
    $('resultState').textContent = '核算未通过';
    $('resultState').className = 'result-state';
    $$('.err-jump', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        focusErrTarget(targets && targets[Number(this.getAttribute('data-err-i'))]);
      });
    });
  }

  /* 骨架屏 */
  function skeleton() {
    $('resultBody').innerHTML =
      '<div class="skeleton">' +
      '<div class="sk-line w80"></div><div class="sk-line w60"></div>' +
      '<div class="sk-line w90"></div><div class="sk-line w40"></div>' +
      '<div class="sk-line w70"></div><div class="sk-line w50"></div>' +
      '</div>';
  }

  function renderResult(r, c, tierResults, issues, ratioSum, noPrice) {
    var body = $('resultBody');
    var html = '';
    /* ---------- ① 风险提示独立横幅（完整换行展示，可展开明细；不与数据混排） ---------- */
    var banners = [];
    if (r.blocked.length) banners.push({ type: 'err', head: '⚠ 计算阻塞：本次核算未完成', lines: r.blocked.slice() });
    if (r.warns.length) banners.push({ type: 'warn', head: '核算提示（不影响本次结果）', lines: r.warns.slice() });
    if (issues && issues.indexOf('ratio') >= 0) {
      banners.push({ type: 'warn', head: '⚠ 含量合计 ' + (global.WB.smart ? global.WB.smart.fmtRatio(ratioSum) : C.fmt(ratioSum, 1, 2)) + '% ≠ 100%（不中断核算）', lines: ['当前按实际含量直接折算成本，请核对配方含量后再报价。'] });
    }
    if (issues && issues.indexOf('noprice') >= 0) {
      var npNames = (c.mats || []).filter(function (m) { return !(num(m.price) > 0) && !m.isTemp; }).map(function (m) { return m.name; });
      banners.push({ type: 'err', head: '⚠ ' + noPrice + ' 项原料红（无价/量纲不符），不中断核算', lines: npNames.length ? npNames.map(function (n) { return '无价原料：' + n + ' — 已按 ¥0 参与估算，对应原料行已标红'; }) : ['对应原料行已标红，已按 ¥0 参与估算。'] });
    }
    banners.forEach(function (bn, i) {
      var expandable = bn.lines && bn.lines.length > 1;
      html += '<div class="bn bn-' + bn.type + '" data-bn="' + i + '">' +
        '<button type="button" class="bn-head" title="' + (expandable ? '点击展开/收起明细' : '') + '">' +
        '<span class="bn-ic">' + U.ic(bn.type === 'err' ? 'ban' : 'warn', 14) + '</span>' +
        '<span class="bn-txt">' + esc(bn.head) + '</span>' +
        (expandable ? '<span class="bn-arrow">▾</span>' : '') +
        '</button>' +
        (expandable ? '<div class="bn-detail" style="display:none">' + bn.lines.map(function (l) { return '<div class="bn-line">· ' + esc(l) + '</div>'; }).join('') + '</div>' : '') +
        '</div>';
    });
    /* ---------- ② 顶部核心指标 2×2 ---------- */
    html += '<div class="r-big">' +
      '<div class="cell"><div class="n" data-k="unitCost">' + C.money(r.unitCost, 3, 4) + '</div><div class="l">单份成本（元/份）</div></div>' +
      '<div class="cell alt"><div class="n" data-k="upTax">' + C.money(r.upTax, 3, 4) + '</div><div class="l">不含税出厂价</div></div>' +
      '<div class="cell"><div class="n" data-k="inTax">' + C.money(r.inTax, 3, 4) + '</div><div class="l">含税出厂价（' + C.fmt(c.tax, 1, 1) + '%税）</div></div>' +
      '<div class="cell alt"><div class="n" data-k="profitRate">' + C.fmt(r.profitRate, 1, 2) + '%</div><div class="l">实际利润率</div></div>' +
      '</div>';
    /* ---------- ③ 成本构成（饼图 + 占比） ---------- */
    html += pieSectionHtml(r, c);
    /* ---------- ④ 成本构成明细（逐项；原料/包材展开） ---------- */
    html += '<div class="r-section"><div class="r-section-title">成本构成明细 <button type="button" class="detail-toggle" data-tt="cost">原料/包材逐项 ▾</button></div>';
    html += '<div class="r-row"><span class="k">原料成本（含' + C.fmt(c.lossRates.material, 1, 2) + '%损耗）</span><span class="v" data-k="d-mat">' + C.money(r.matTotal, 3, 4) + '</span></div>' +
      '<div class="r-row"><span class="k">包材成本</span><span class="v" data-k="d-pack">' + C.money(r.packTotal, 3, 4) + '</span></div>' +
      '<div class="r-row"><span class="k">加工费（人工）</span><span class="v" data-k="d-proc">' + C.money(num(c.processFee) || 0, 3, 4) + '</span></div>';
    if (r.adminFee > 0) html += '<div class="r-row"><span class="k">管理费（' + C.fmt(c.admin, 1, 2) + '%）</span><span class="v" data-k="d-admin">' + C.money(r.adminFee, 3, 4) + '</span></div>';
    if (r.premium > 0) html += '<div class="r-row"><span class="k">定制工艺溢价</span><span class="v" data-k="d-prem">' + C.money(r.premium, 3, 4) + '</span></div>';
    if (c.testFee > 0) html += '<div class="r-row"><span class="k">检测附加费</span><span class="v" data-k="d-test">' + C.money(c.testFee, 3, 4) + '</span></div>';
    if (c.freight > 0) html += '<div class="r-row"><span class="k">运费分摊</span><span class="v" data-k="d-freight">' + C.money(c.freight, 3, 4) + '</span></div>';
    html += '<div id="costDetail" style="display:none">' + costDetailHtml(r, c) + '</div>';
    html += '</div>';
    /* ---------- ⑤ 整单成本（独立高亮，品牌蓝） ---------- */
    html += '<div class="total-bar">' +
      '<div class="tb-txt"><div class="tb-k">整单成本</div><div class="tb-sub">MOQ ' + C.fmt(c.moq, 0, 0) + ' 瓶 × 单份（元）</div></div>' +
      '<b class="tb-v" data-k="d-total">' + C.money(r.totalCost, 2, 2) + '</b>' +
      '</div>';
    /* ---------- ⑥ MOQ 阶梯（横向可滚动不挤压） ---------- */
    html += '<div class="r-section"><div class="r-section-title">MOQ 阶梯报价</div><div class="ladder-scroll">' + tierTableHtml(tierResults, c) + '</div></div>';
    /* ---------- ⑦ 底部操作（文字完整） ---------- */
    html += '<div class="r-section result-ops">' +
      '<button type="button" class="btn btn-sm" data-act="quick-export-pdf">' + U.ic('printer', 14) + '导出报价单</button>' +
      '<button type="button" class="btn btn-sm" data-act="quick-export-excel">' + U.ic('chart', 14) + '导出 Excel</button>' +
      '<button type="button" class="btn btn-sm" data-act="quick-save">' + U.ic('save', 14) + '存档</button>' +
      '</div>';
    body.innerHTML = html;
    /* 绑定：成本明细展开 */
    var tt = body.querySelector('[data-tt=cost]');
    if (tt) tt.addEventListener('click', function () {
      var el = $('costDetail');
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
      tt.textContent = el.style.display === 'none' ? '原料/包材逐项 ▾' : '原料/包材逐项 ▴';
    });
    /* 绑定：横幅展开/收起 */
    $$('.bn', body).forEach(function (bnEl) {
      var head = bnEl.querySelector('.bn-head');
      if (!head) return;
      head.addEventListener('click', function () {
        var det = bnEl.querySelector('.bn-detail');
        if (!det) return;
        var open = det.style.display !== 'none';
        det.style.display = open ? 'none' : 'block';
        bnEl.classList.toggle('open', !open);
        var ar = bnEl.querySelector('.bn-arrow');
        if (ar) ar.textContent = open ? '▾' : '▴';
      });
    });
    var qse = body.querySelector('[data-act=quick-export-pdf]');
    if (qse) qse.addEventListener('click', function () { exportPdf(); });
    var qee = body.querySelector('[data-act=quick-export-excel]');
    if (qee) qee.addEventListener('click', function () { exportExcel(); });
    var qs = body.querySelector('[data-act=quick-save]');
    if (qs) qs.addEventListener('click', function () { saveQuote(); });
  }
  /* 成本构成迷你饼图（纯 SVG，零依赖；悬浮显示数值） */
  var PIE_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#6B7280'];
  function pieSectionHtml(r, c) {
    var items = [
      { k: '原料成本（含' + C.fmt(c.lossRates.material, 1, 2) + '%损耗）', v: r.matTotal },
      { k: '包材成本', v: r.packTotal },
      { k: '加工费（人工）', v: num(c.processFee) || 0 }
    ];
    if (r.adminFee > 0) items.push({ k: '管理费', v: r.adminFee });
    if (r.premium > 0) items.push({ k: '工艺溢价', v: r.premium });
    if (c.testFee > 0) items.push({ k: '检测费', v: c.testFee });
    if (c.freight > 0) items.push({ k: '运费', v: c.freight });
    var total = items.reduce(function (a, x) { return a + x.v; }, 0);
    if (!(total > 0)) return '';
    /* 环形扇区：从12点方向顺时针 */
    var R = 44, Cx = 52, Cy = 52, W = 104, H = 104;
    var paths = '', acc = -Math.PI / 2, labelIdx = 0;
    items.forEach(function (it, i) {
      var frac = it.v / total;
      var a2 = acc + frac * Math.PI * 2;
      var large = (a2 - acc) > Math.PI ? 1 : 0;
      var x1 = Cx + R * Math.cos(acc), y1 = Cy + R * Math.sin(acc);
      var x2 = Cx + R * Math.cos(a2), y2 = Cy + R * Math.sin(a2);
      var inner = R * 0.62;
      var ix1 = Cx + inner * Math.cos(acc), iy1 = Cy + inner * Math.sin(acc);
      var ix2 = Cx + inner * Math.cos(a2), iy2 = Cy + inner * Math.sin(a2);
      paths += '<path class="pie-seg" d="M' + x1.toFixed(2) + ',' + y1.toFixed(2) +
        ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) +
        ' L' + ix2.toFixed(2) + ',' + iy2.toFixed(2) +
        ' A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + ix1.toFixed(2) + ',' + iy1.toFixed(2) + ' Z" ' +
        'fill="' + PIE_COLORS[i % PIE_COLORS.length] + '" data-i="' + i + '">' +
        '<title>' + esc(it.k) + '：' + C.money(it.v, 2, 2) + '（' + C.fmt(frac * 100, 1, 1) + '%）</title></path>';
      acc = a2;
    });
    var legend = items.map(function (it, i) {
      var frac = it.v / total;
      return '<div class="pl-row"><span class="pl-dot" style="background:' + PIE_COLORS[i % PIE_COLORS.length] + '"></span>' +
        '<span class="pl-k">' + esc(it.k) + '</span><span class="pl-v" data-k="d-pl' + i + '">' + C.money(it.v, 2, 2) + '</span>' +
        '<span class="muted" style="width:44px;text-align:right;font-size:11px">' + C.fmt(frac * 100, 1, 1) + '%</span></div>';
    }).join('');
    return '<div class="r-section"><div class="r-section-title">成本构成占比 <span class="tt-sub">（饼图悬浮看金额）</span></div>' +
      '<div class="pie-wrap">' +
      '<svg class="pie-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + paths +
      '<text data-k="d-pie" x="' + Cx + '" y="' + (Cy - 1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + (window.__isDark ? '#fff' : '#1f2329') + '">' + esc(pieCenterMoney(total)) + '</text>' +
      '<text x="' + Cx + '" y="' + (Cy + 12) + '" text-anchor="middle" font-size="9" fill="#86909c">总成本</text>' +
      '</svg>' +
      '<div class="pie-legend">' + legend + '</div></div></div>';
  }
  function pieCenterMoney(total) {
    /* 饼图中心显示整单总成本（金额过长时省略小数位） */
    var s = C.money(total, 2, 2);
    return s.length > 9 ? C.money(total, 0, 0) : s;
  }

  function costDetailHtml(r, c) {
    var html = '<div class="mt8" style="font-size:12px">';
    html += '<b>原料明细（' + C.fmt(r.matRaw, 3, 4) + ' → 含损耗 ' + C.money(r.matTotal, 3, 4) + '，损耗 ' + C.money(r.matTotal - r.matRaw, 3, 4) + '）</b>';
    r.mats.forEach(function (m) {
      html += '<div class="r-row"><span class="k">· ' + esc(m.name) + '（' + C.fmt(m.ratio, 1, 2) + '% × ' + C.fmt(num(c.weight) * num(c.count), 1, 3) + 'g）</span><span class="v">' + (m.cost === null ? '<span style="color:var(--danger)">' + esc(m.blocked || '未核算') + '</span>' : C.money(m.cost, 4, 5)) + '</span></div>';
    });
    html += '<b class="mt8" style="display:block">包材明细（含包材损耗' + C.fmt(c.lossRates.packaging, 1, 2) + '% + 生产损耗' + C.fmt(c.lossRates.production, 1, 2) + '%）</b>';
    r.packs.forEach(function (p) {
      html += '<div class="r-row"><span class="k">· ' + esc(p.name) + ' × ' + C.fmt(p.num, 1, 2) + '</span><span class="v">' + (p.cost === null ? esc(p.blocked || '未核算') : C.money(p.cost, 4, 5)) + '</span></div>';
    });
    html += '</div>';
    return html;
  }
  function tierTableHtml(tierResults, c) {
    var html = '<table class="ladder-table"><tr><th>MOQ</th><th>单份成本</th><th>不含税</th><th>含税</th><th>利润率</th><th>整单金额</th></tr>';
    tierResults.forEach(function (t, ti) {
      var r = t.r;
      html += '<tr' + (t.current ? ' class="moq-cur"' : '') + '><td>' + C.fmt(t.moq, 0, 0) + ' 瓶' + (t.current ? ' ' + U.ic('star', 12) : '') + '</td>' +
        '<td data-k="t' + ti + 'c1">' + C.money(r.unitCost, 3, 4) + '</td>' +
        '<td data-k="t' + ti + 'c2">' + C.money(r.upTax, 3, 4) + '</td>' +
        '<td data-k="t' + ti + 'c3">' + C.money(r.inTax, 3, 4) + '</td>' +
        '<td data-k="t' + ti + 'c4">' + C.fmt(r.profitRate, 1, 2) + '%</td>' +
        '<td data-k="t' + ti + 'c5">' + C.money(c.taxInc === 'intax' ? r.totalInTax : r.totalUpTax, 2, 2) + '</td></tr>';
    });
    html += '</table>';
    return html;
  }

  /* ================= 存档生成报价 ================= */
  function saveQuote() {
    var ok = runQuote();
    if (!ok || !resultState.last) return;
    var snap = resultState.last;
    var c = snap.c;
    var d = S.dosageById(c.dosageFormId);
    var quote = {
      id: S.genId('q'),
      quoteNo: S.nextQuoteNo(state.settings),
      status: 'draft',
      projectName: c.name, customer: c.customer || '',
      dosageFormId: c.dosageFormId, dosageName: d ? d.name : '',
      params: Object.assign({}, c.params),
      formulaId: c.formulaId, formulaVersion: c.formulaVersion,
      materials: c.mats.map(function (m) {
        return Object.assign({}, m, { cnyPrice: m.currency && m.currency !== 'CNY' ? num(m.price) * c.fx : num(m.price) });
      }),
      packaging: c.packs.map(function (p) {
        var pk = S.packagingById(p.packagingId);
        return { packagingId: p.packagingId, name: pk ? pk.name : p.name, num: p.num, price: pk ? pk.price : 0, printFee: pk ? pk.printFee : 0, moldFee: pk ? pk.moldFee : 0, lossRate: pk ? pk.lossRate : 1, supplier: pk ? pk.supplier : '' };
      }),
      moqTiers: parseTiers(c.ladder, c.moq),
      biz: {
        moq: c.moq, taxInc: c.taxInc, taxRate: c.tax, profitRate: c.profit, adminRate: c.admin,
        lossRates: Object.assign({}, c.lossRates),
        processFee: num(c.processFee) || 0, premium: c.premium,
        testFee: c.testFee, freight: c.freight, fx: c.fx,
        weight: c.weight, count: c.count, net: c.net, box: c.box
      },
      result: {
        unitCost: snap.r.unitCost, upTax: snap.r.upTax, inTax: snap.r.inTax,
        profitRate: snap.r.profitRate, totalCost: snap.r.totalCost,
        totalUpTax: snap.r.totalUpTax, totalInTax: snap.r.totalInTax,
        matRaw: snap.r.matRaw, matTotal: snap.r.matTotal, packTotal: snap.r.packTotal,
        tiers: snap.tiers.map(function (t) {
          return { moq: t.moq, unitCost: t.r.unitCost, upTax: t.r.upTax, inTax: t.r.inTax, profitRate: t.r.profitRate };
        })
      },
      followUps: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    state.data.quotes.unshift(quote);
    S.pushRecent('quotes', quote.id);
    S.persist();
    /* V14：存档后立刻刷新并展开「最近使用」，让该报价马上可见、可点击载入复用 */
    refreshRecentOpen();
    U.toast('已存档：' + quote.quoteNo + '（状态：草稿）', 'ok');
    /* 清空草稿，避免重复存档 */
    try { localStorage.removeItem(S.LS_DRAFT); } catch (e) {}
    global.WB.app.switchView('quotes');
  }

  /* ================= 导出 PDF（打印视图，套用模板） / Excel ================= */
  function exportPdf() {
    if (!resultState.last) { U.toast('请先完成一键报价', 'warn'); return; }
    var snap = resultState.last, c = snap.c, r = snap.r;
    var d = S.dosageById(c.dosageFormId);
    var tpl = state.settings.pdfTemplate || {};
    var html = '<div class="print-doc">';
    /* V3：模板抬头（LOGO / 公司名 / 联系方式） */
    html += '<div class="pd-company">' +
      (tpl.logo ? '<img class="pd-logo" src="' + esc(tpl.logo) + '" alt="logo">' : '') +
      '<div>' +
      '<div class="pd-cname">' + esc(tpl.company || '保健品 OEM 报价单') + '</div>' +
      '<div class="pd-cmeta">' + [tpl.contact ? '联系人：' + esc(tpl.contact) : '', tpl.phone ? '电话：' + esc(tpl.phone) : '', tpl.address ? esc(tpl.address) : ''].filter(Boolean).join('　') + '</div>' +
      '</div></div>';
    if (!tpl.company) html += '<div class="pd-sub">内部核算报价 · 仅供业务参考</div>';
    html += '<div class="pd-meta">' +
      '<span>方案名称：' + esc(c.name) + '</span>' +
      (c.customer ? '<span>客户：' + esc(c.customer) + '</span>' : '') +
      '<span>剂型：' + esc(d ? d.name : '') + '</span>' +
      '<span>克重：' + C.fmt(c.weight, 2, 3) + 'g × ' + C.fmt(c.count, 0, 0) + '粒/瓶</span>' +
      '<span>订单MOQ：' + C.fmt(c.moq, 0, 0) + '瓶</span>' +
      '<span>报价日期：' + esc(c.date) + '</span>' +
      '</div>';
    html += '<h2>一、原料成本明细</h2>';
    html += '<table><tr><th>原料名称</th><th>含量%</th><th>供应商</th><th>采购价</th><th>报价日期</th><th>有效期</th><th>单份成本</th></tr>';
    r.mats.forEach(function (m) {
      var line = c.mats.filter(function (x) { return x.name === m.name; })[0] || {};
      html += '<tr><td>' + esc(m.name) + '</td><td>' + (global.WB.smart ? global.WB.smart.fmtRatio(m.ratio) : C.fmt(m.ratio, 1, 2)) + '</td><td>' + esc(line.supplierName || '—') + '</td>' +
        '<td>' + (line.currency || 'CNY') + ' ' + (m.price !== null ? C.fmt(m.price, 2, 4) : '—') + '</td>' +
        '<td>' + esc(line.quoteDate || '—') + '</td><td>' + esc(line.validUntil || '—') + '</td>' +
        '<td>' + (m.cost === null ? '—' : C.money(m.cost, 4, 5)) + '</td></tr>';
    });
    html += '<tr><td colspan="6" style="text-align:right"><b>原料成本小计（含' + C.fmt(c.lossRates.material, 1, 2) + '%损耗）</b></td><td><b>' + C.money(r.matTotal, 3, 4) + '</b></td></tr></table>';
    html += '<h2>二、包材成本明细</h2>';
    html += '<table><tr><th>包材名称</th><th>每瓶用量</th><th>供应商</th><th>单价</th><th>单份成本</th></tr>';
    r.packs.forEach(function (p) {
      var line = c.packs.filter(function (x) { return x.name === p.name; })[0] || {};
      var pk = S.packagingById(line.packagingId);
      html += '<tr><td>' + esc(p.name) + '</td><td>' + C.fmt(p.num, 1, 2) + '</td><td>' + esc(pk ? pk.supplier : '—') + '</td>' +
        '<td>' + (pk ? C.money(pk.price, 3, 4) : '—') + '</td><td>' + (p.cost === null ? '—' : C.money(p.cost, 4, 5)) + '</td></tr>';
    });
    html += '<tr><td colspan="4" style="text-align:right"><b>包材成本小计（含损耗）</b></td><td><b>' + C.money(r.packTotal, 3, 4) + '</b></td></tr></table>';
    html += '<h2>三、费用与报价汇总</h2>';
    html += '<table><tr><th>项目</th><th>金额（元/份）</th></tr>' +
      '<tr><td>加工费（人工）</td><td>' + C.money(num(c.processFee) || 0, 3, 4) + '</td></tr>' +
      (r.adminFee > 0 ? '<tr><td>管理费（' + C.fmt(c.admin, 1, 2) + '%）</td><td>' + C.money(r.adminFee, 3, 4) + '</td></tr>' : '') +
      (r.premium > 0 ? '<tr><td>定制工艺溢价</td><td>' + C.money(r.premium, 3, 4) + '</td></tr>' : '') +
      (c.testFee > 0 ? '<tr><td>检测附加费</td><td>' + C.money(c.testFee, 3, 4) + '</td></tr>' : '') +
      (c.freight > 0 ? '<tr><td>运费分摊</td><td>' + C.money(c.freight, 3, 4) + '</td></tr>' : '') +
      '<tr><td><b>单份成本</b></td><td><b>' + C.money(r.unitCost, 3, 4) + '</b></td></tr>' +
      '<tr><td>不含税出厂价（目标利润率' + C.fmt(c.profit, 1, 2) + '%）</td><td>' + C.money(r.upTax, 3, 4) + '</td></tr>' +
      '<tr><td>含税出厂价（' + C.fmt(c.tax, 1, 1) + '%）</td><td>' + C.money(r.inTax, 3, 4) + '</td></tr>' +
      '<tr><td>整单金额（' + C.fmt(c.moq, 0, 0) + '瓶，' + (c.taxInc === 'intax' ? '含税' : '不含税') + '）</td><td>' + C.money(c.taxInc === 'intax' ? r.totalInTax : r.totalUpTax, 2, 2) + '</td></tr>' +
      '</table>';
    html += '<h2>四、MOQ 阶梯报价</h2>';
    html += '<table><tr><th>MOQ</th><th>单份成本</th><th>不含税</th><th>含税</th><th>整单金额</th></tr>';
    snap.tiers.forEach(function (t) {
      html += '<tr><td>' + C.fmt(t.moq, 0, 0) + '瓶</td><td>' + C.money(t.r.unitCost, 3, 4) + '</td><td>' + C.money(t.r.upTax, 3, 4) + '</td><td>' + C.money(t.r.inTax, 3, 4) + '</td><td>' + C.money(c.taxInc === 'intax' ? t.r.totalInTax : t.r.totalUpTax, 2, 2) + '</td></tr>';
    });
    html += '</table>';
    html += '<div class="pd-foot">' + esc(tpl.footer || '内部核算参考件 · 仅供业务使用') +
      '　生成时间：' + new Date().toLocaleString('zh-CN') + ' · OEM报价工作台 V3</div>';
    /* V3：备注条款 */
    if (tpl.notes && tpl.notes.trim()) html += '<div class="pd-notes">' + esc(tpl.notes) + '</div>';
    html += '</div>';
    var pr = $('printRoot');
    pr.innerHTML = html;
    window.print();
  }

  function exportExcel() {
    if (!resultState.last) { U.toast('请先完成一键报价', 'warn'); return; }
    var snap = resultState.last, c = snap.c, r = snap.r;
    var rows = [['保健品OEM报价核算明细'], [], ['方案名称', c.name], ['客户', c.customer || ''],
      ['剂型', c.dosageName || ''], ['克重', c.weight + 'g × ' + c.count + '粒/瓶'], ['订单MOQ', c.moq + '瓶'],
      ['报价日期', c.date], ['计价口径', c.taxInc === 'intax' ? '含税' : '不含税'], ['增值税率', c.tax + '%']];
    rows.push([]); rows.push(['原料名称', '含量%', '供应商', '币种', '采购价', '报价日期', '有效期', '价格来源', '单份成本']);
    r.mats.forEach(function (m) {
      var line = c.mats.filter(function (x) { return x.name === m.name; })[0] || {};
      rows.push([m.name, global.WB.smart ? global.WB.smart.fmtRatio(m.ratio) : m.ratio, line.supplierName || '', line.currency || 'CNY', m.price === null ? '' : m.price, line.quoteDate || '', line.validUntil || '', line.source || '', m.cost === null ? '' : m.cost]);
    });
    rows.push(['原料成本小计（含' + c.lossRates.material + '%损耗）', '', '', '', '', '', '', '', r.matTotal]);
    rows.push([]); rows.push(['包材名称', '每瓶用量', '供应商', '单价', '单份成本']);
    r.packs.forEach(function (p) {
      var line = c.packs.filter(function (x) { return x.name === p.name; })[0] || {};
      var pk = S.packagingById(line.packagingId);
      rows.push([p.name, p.num, pk ? pk.supplier : '', pk ? pk.price : '', p.cost === null ? '' : p.cost]);
    });
    rows.push(['包材成本小计', '', '', '', r.packTotal]);
    rows.push([]); rows.push(['费用项目', '金额(元/份)']);
    rows.push(['加工费(人工)', num(c.processFee) || 0]);
    if (r.adminFee) rows.push(['管理费', r.adminFee]);
    if (r.premium) rows.push(['定制工艺溢价', r.premium]);
    if (c.testFee) rows.push(['检测附加费', c.testFee]);
    if (c.freight) rows.push(['运费分摊', c.freight]);
    rows.push(['单份成本', r.unitCost]);
    rows.push(['不含税出厂价', r.upTax]);
    rows.push(['含税出厂价', r.inTax]);
    rows.push(['实际利润率', r.profitRate + '%']);
    rows.push(['整单金额(不含税)', r.totalUpTax]);
    rows.push(['整单金额(含税)', r.totalInTax]);
    rows.push([]); rows.push(['MOQ', '单份成本', '不含税', '含税', '整单金额']);
    snap.tiers.forEach(function (t) {
      rows.push([t.moq + '瓶', t.r.unitCost, t.r.upTax, t.r.inTax, c.taxInc === 'intax' ? t.r.totalInTax : t.r.totalUpTax]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        if (cell === null || cell === undefined) return '';
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    U.download('报价核算_' + (c.name || '未命名') + '_' + c.date + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
    U.toast('Excel 已导出（CSV格式，Excel可直接打开）', 'ok');
  }

  /* ================= 方案对比 ================= */
  function addCompare() {
    if (!resultState.last) { U.toast('请先完成一键报价', 'warn'); return; }
    var snap = resultState.last, c = snap.c, r = snap.r;
    if (state.compare.length >= 4) { U.toast('对比最多 4 个方案', 'warn'); return; }
    var item = {
      id: S.genId('cmp'), name: c.name, dosageName: c.dosageName || '',
      customer: c.customer || '', moq: c.moq, taxInc: c.taxInc, tax: c.tax,
      unitCost: r.unitCost, upTax: r.upTax, inTax: r.inTax, profitRate: r.profitRate,
      matTotal: r.matTotal, packTotal: r.packTotal,
      materials: c.mats.map(function (m) { return m.name + (m.ratio ? ' ' + C.fmt(m.ratio, 1, 2) + '%' : ''); }),
      tiers: snap.tiers.map(function (t) { return { moq: t.moq, inTax: t.r.inTax, upTax: t.r.upTax }; })
    };
    state.compare.push(item);
    S.persist();
    U.toast('已加入对比（' + state.compare.length + '/4）', 'ok');
    renderCompareBadge();
  }
  function renderCompareBadge() {
    var btn = $('btnCompare');
    if (btn) btn.textContent = '⇄ 加入对比（' + state.compare.length + '/4）';
  }
  function showCompare() {
    var list = state.compare;
    if (!list.length) { U.toast('对比列表为空，请先加入方案', 'warn'); return; }
    var html = '<div style="overflow-x:auto"><table class="ladder-table" style="min-width:560px"><tr>' +
      '<th style="text-align:left;min-width:110px">方案</th>';
    list.forEach(function (c) { html += '<th>' + esc(c.name) + (c.dosageName ? '<br><span class="muted" style="font-weight:400">' + esc(c.dosageName) + '</span>' : '') + '</th>'; });
    html += '</tr>';
    var rows = [
      ['客户', function (c) { return esc(c.customer || '—'); }],
      ['订单MOQ', function (c) { return C.fmt(c.moq, 0, 0) + '瓶'; }],
      ['单份成本', function (c) { return C.money(c.unitCost, 3, 4); }],
      ['不含税价', function (c) { return C.money(c.upTax, 3, 4); }],
      ['含税价', function (c) { return C.money(c.inTax, 3, 4); }],
      ['利润率', function (c) { return C.fmt(c.profitRate, 1, 2) + '%'; }],
      ['原料成本', function (c) { return C.money(c.matTotal, 3, 4); }],
      ['包材成本', function (c) { return C.money(c.packTotal, 3, 4); }],
      ['原料构成', function (c) { return esc(c.materials.join('、') || '—'); }],
      ['MOQ阶梯(含税)', function (c) { return c.tiers.map(function (t) { return C.fmt(t.moq, 0, 0) + '瓶:' + C.money(t.inTax, 3, 4); }).join('<br>'); }]
    ];
    rows.forEach(function (row) {
      html += '<tr><td style="text-align:left;font-weight:600">' + row[0] + '</td>';
      list.forEach(function (c) { html += '<td>' + row[1](c) + '</td>'; });
      html += '</tr>';
    });
    html += '</table></div>';
    var m = U.openModal(html, {
      title: '方案对比（' + list.length + '/4）', wide: true,
      footBtns: [
        { text: '清空对比', cls: 'btn-danger', onClick: function () { state.compare = []; S.persist(); renderCompareBadge(); U.toast('对比已清空', 'ok'); } },
        { text: '关闭', cls: '' }
      ]
    });
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    /* V7：统一事件委托 —— HTML 静态控件已打标 data-trigger="calc"（含此前漏绑的
     * f-weight/f-count/f-net/f-box 及全部商务参数）。任何 input/change 变化都经
     * scheduleAuto（debounce 300ms）触发 recalcAndRender，杜绝「改了不刷新」。
     * 用 document 级委托 + 一次性守卫，避免重复 init 造成重复监听。 */
    if (!document._cdCalcTrigger) {
      document._cdCalcTrigger = true;
      document.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-trigger') === 'calc') scheduleAuto();
      });
      document.addEventListener('change', function (e) {
        var t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-trigger') === 'calc') scheduleAuto();
      });
    }
    $('f-formula').addEventListener('change', function () {
      applyFormula(this.value);
    });
    $('f-formulaVer').addEventListener('change', function () {
      state.calc.formulaVersion = this.value;
    });
    $('f-dosage').addEventListener('change', function () {
      state.calc.dosageFormId = this.value;
      syncDosageDefaults();
      state.calc.params = {};
      fillCalc();
      scheduleAuto();
      var d = S.dosageById(state.calc.dosageFormId);
      if (d) S.pushRecent('dosages', d.id);
    });
    /* 搜索过滤剂型 */
    var search = $('f-dosageSearch');
    search.addEventListener('input', function () {
      var kw = this.value.trim();
      var sel = $('f-dosage');
      var list = enabledDosages().filter(function (d) { return !kw || d.name.indexOf(kw) >= 0; });
      var html = '<option value="">— 选择剂型 —</option>';
      list.forEach(function (d) {
        html += '<option value="' + esc(d.id) + '"' + (d.id === state.calc.dosageFormId ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      });
      sel.innerHTML = html;
      if (list.length === 1) { sel.value = list[0].id; sel.dispatchEvent(new Event('change')); }
    });
    search.addEventListener('focus', function () { this.select(); });
    $$('#f-taxInc button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#f-taxInc button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        scheduleAuto();
      });
    });
    /* 输入联动实时核算（V13：人工费 f-processFee 带 data-trigger="calc"，走委托联动） */
    ['f-name', 'f-customer', 'f-date', 'f-moq', 'f-factoryMoq', 'f-ladder', 'f-tax', 'f-profit', 'f-admin', 'f-premium', 'f-testFee', 'f-freight', 'f-fx'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', scheduleAuto);
    });
    /* CTA */
    $('btnQuote').addEventListener('click', function () {
      skeleton();
      $('resultState').textContent = '核算中…';
      $('resultState').className = 'result-state calc';
      setTimeout(function () { runQuote(); }, 60);
    });
    $('btnSaveQuote').addEventListener('click', saveQuote);
    $('btnExportPdf').addEventListener('click', exportPdf);
    $('btnExportExcel').addEventListener('click', exportExcel);
    $('btnCompare').addEventListener('click', function () { addCompare(); });
    $('btnAddMat').addEventListener('click', addMaterialLine);
    $('btnAddPack').addEventListener('click', addPackLine);
    $('btnBestPrice').addEventListener('click', applyBestPrices);
    var bcMats = $('btnClearMats');
    if (bcMats) bcMats.addEventListener('click', clearMats);
    /* V11：四板块独立重置 + 一键全重置（先确认、可取消；stopPropagation 防止触发卡片折叠） */
    [['btnResetProd', 'prod'], ['btnResetBiz', 'biz'], ['btnResetMats', 'mats'], ['btnResetPacks', 'packs'], ['btnResetAll', 'all']].forEach(function (pair) {
      var bEl = $(pair[0]);
      if (bEl) bEl.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
        confirmReset(pair[1]);
      });
    });
    /* ===== V5 新交互 ===== */
    /* 原料/包材清单折叠 */
    var mtT = $('matsToggle');
    if (mtT) mtT.addEventListener('click', toggleMatFold);
    var pkT = $('packsToggle');
    if (pkT) pkT.addEventListener('click', togglePackFold);
    /* ===== V3 新交互 ===== */
    /* 商务参数折叠 */
    var bizToggle = $('bizToggle');
    if (bizToggle) bizToggle.addEventListener('click', toggleBiz);
    /* 最近使用折叠 + 统一点击委托（V14：绑定一次，章节内所有条目生效） */
    var rt = $('recentToggle');
    if (rt) rt.addEventListener('click', toggleRecent);
    var rb = $('recentBody');
    if (rb) rb.addEventListener('click', onRecentClick);
    /* 原料清单批量粘贴 */
    var matListEl = $('matList');
    if (matListEl) {
      matListEl.addEventListener('paste', function (e) {
        e.preventDefault();
        var text = e.clipboardData.getData('text');
        parsePasteMats(text);
      });
    }
    var bs = $('btnSnapshots');
    if (bs) bs.addEventListener('click', showSnapshots);
    var bb = $('btnBackCalc'); if (bb) bb.addEventListener('click', openBackCalc);
    var bb2 = $('btnBackCalc2'); if (bb2) bb2.addEventListener('click', openBackCalc);
    var bq = $('btnBatchQuote'); if (bq) bq.addEventListener('click', openBatchQuote);
    var bsh = $('btnShareQuote'); if (bsh) bsh.addEventListener('click', shareQuote);
    bindPackDrawer();
  }

  /* ================= 原料/包材清单折叠（V5：收起时只占一行摘要） ================= */
  function toggleMatFold() {
    var card = $('card-mats');
    if (!card) return;
    var c = card.classList.toggle('collapsed');
    if (state.meta.ui) state.meta.ui.matsCollapsed = c;
    var ar = $('matsArrow');
    if (ar) ar.textContent = c ? '▸' : '▾';
    S.persist();
  }
  function togglePackFold() {
    var card = $('card-packs');
    if (!card) return;
    var c = card.classList.toggle('collapsed');
    if (state.meta.ui) state.meta.ui.packsCollapsed = c;
    var ar = $('packsArrow');
    if (ar) ar.textContent = c ? '▸' : '▾';
    S.persist();
  }
  function applyFolds() {
    var m = $('card-mats'), p = $('card-packs');
    if (m && state.meta.ui && state.meta.ui.matsCollapsed) {
      m.classList.add('collapsed');
      var am = $('matsArrow'); if (am) am.textContent = '▸';
    }
    if (p && state.meta.ui && state.meta.ui.packsCollapsed) {
      p.classList.add('collapsed');
      var ap = $('packsArrow'); if (ap) ap.textContent = '▸';
    }
  }

  /* ================= 商务参数折叠（默认一行摘要） ================= */
  function toggleBiz() {
    var card = $('card-biz');
    var collapsed = card.classList.toggle('collapsed');
    state.meta.ui.bizCollapsed = collapsed;
    var ar = $('bizArrow');
    if (ar) ar.textContent = collapsed ? '▸' : '▾';
    S.persist();
  }
  function applyBizCollapsed() {
    var card = $('card-biz');
    if (!card) return;
    var collapsed = state.meta.ui.bizCollapsed !== false;
    card.classList.toggle('collapsed', collapsed);
    var ar = $('bizArrow');
    if (ar) ar.textContent = collapsed ? '▸' : '▾';
    /* V14：标题旁不再重复「MOQ · 含税口径 · 税率 · 利润率」——这些数字右侧核算面板已完整、实时呈现，
     * 重复展示只增噪点。标题 + 折叠箭头 + 重置按钮已足够表达，故整行摘要移除（保持清爽）。 */
    var hint = $('bizHint');
    if (hint) hint.textContent = '';
  }

  /* ================= 最近使用（报价 / 配方 / 剂型） =================
   * V14 根因修复：旧版只在初始化时渲染一次、且面板默认折叠，存档后既不刷新也不展开，
   * 叠加老档 recent.quotes 为空（store.backfillRecent 已回填）→ 用户看到「暂无最近使用记录」。
   * 现在：存档/复用后立即刷新并展开；报价条目展示「名称 + 时间 + 单份成本」，点击直接载入复用；
   * 点击委托在 #recentBody 上绑定一次，不再全文档扫描 + setTimeout。 */
  function recentOf() {
    if (!state.meta.recent) state.meta.recent = { quotes: [], formulas: [], dosages: [] };
    return state.meta.recent;
  }
  function fmtRecentTime(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(iso));
    return m ? (m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5]) : String(iso).slice(0, 10);
  }
  function recentHasData() {
    var rec = recentOf();
    return !!(rec.quotes.length || rec.formulas.length || rec.dosages.length);
  }
  /* 展开/收起 + 记忆用户选择 */
  function applyRecentState(open, silent) {
    var body = $('recentBody');
    if (!body) return;
    body.style.display = open ? 'block' : 'none';
    var ar = $('recentArrow');
    if (ar) ar.textContent = open ? '▾' : '▸';
    if (state.meta.ui) state.meta.ui.recentOpen = !!open;
    if (!silent) S.persist();
  }
  function toggleRecent() {
    var body = $('recentBody');
    if (!body) return;
    var next = body.style.display === 'none';
    applyRecentState(next);
    if (next) renderRecent();
  }
  /* 初始化：还原展开态；从未设置过且有记录 → 默认展开（让入口“看得见”） */
  function applyRecent() {
    var remembered = state.meta.ui ? state.meta.ui.recentOpen : undefined;
    applyRecentState(remembered === undefined ? recentHasData() : !!remembered, true);
    renderRecent();
  }
  /* 存档/复用后调用：刷新内容 + 立即展开，保证「立刻出现」 */
  function refreshRecentOpen() {
    renderRecent();
    if (recentHasData()) applyRecentState(true);
  }
  function renderRecent() {
    var body = $('recentBody');
    if (!body) return;
    var rec = recentOf();
    var html = '';
    html += recentQuoteGroup(rec.quotes);
    html += recentChipGroup('配方', 'formulas', rec.formulas, function (id) {
      var f = S.formulaById(id);
      return f ? esc(f.name) : '';
    });
    html += recentChipGroup('剂型', 'dosages', rec.dosages, function (id) {
      var d = S.dosageById(id);
      return d ? esc(d.name) : '';
    });
    body.innerHTML = html || '<p class="muted" style="font-size:12px">暂无最近使用记录</p>';
  }
  /* 报价组：名称 + 时间 + 单份成本，整行可点 → 载入复用 */
  function recentQuoteGroup(ids) {
    if (!ids || !ids.length) return '';
    var rows = '';
    ids.forEach(function (id) {
      var q = S.quoteById(id);
      if (!q) return;
      var cost = (q.result && isFinite(q.result.unitCost)) ? C.money(q.result.unitCost, 3, 4) : '—';
      var time = fmtRecentTime(q.updatedAt || q.createdAt);
      rows += '<button type="button" class="rg-item" data-recent="' + esc(id) + '" data-kind="quotes" title="点击载入该报价参数，回到核算台复用">' +
        '<span class="rgi-main">' +
          '<span class="rgi-name">' + esc(q.projectName || q.quoteNo || '未命名方案') + '</span>' +
          '<span class="rgi-meta">' + esc(q.quoteNo || '') + (time ? ' · ' + esc(time) : '') + '</span>' +
        '</span>' +
        '<span class="rgi-cost"><b>' + cost + '</b><i>单份成本</i></span>' +
        '<span class="rgi-go">载入</span>' +
        '</button>';
    });
    if (!rows) return '';
    return '<div class="recent-group"><div class="rg-title">报价</div><div class="rg-list">' + rows + '</div></div>';
  }
  /* 配方 / 剂型组：胶囊 chip（点击复用） */
  function recentChipGroup(title, kind, ids, nameOf) {
    if (!ids || !ids.length) return '';
    var chips = '';
    ids.forEach(function (id) {
      var name = nameOf(id);
      if (!name) return;
      chips += '<span class="chip" data-recent="' + esc(id) + '" data-kind="' + kind + '" title="点击复用">' + name + '</span>';
    });
    if (!chips) return '';
    return '<div class="recent-group"><div class="rg-title">' + title + '</div><div class="rg-chips">' + chips + '</div></div>';
  }
  /* 统一事件委托（init 时绑定一次；替代原先的全文档扫描 + setTimeout 时序脆弱写法） */
  function onRecentClick(e) {
    var el = (e.target && e.target.closest) ? e.target.closest('[data-recent]') : null;
    if (!el) return;
    var id = el.getAttribute('data-recent');
    var kind = el.getAttribute('data-kind');
    if (kind === 'quotes') {
      if (!S.quoteById(id)) { U.toast('该报价已删除', 'warn'); renderRecent(); return; }
      S.pushRecent('quotes', id);
      if (global.WB.quotesView && global.WB.quotesView.reuseQuote) global.WB.quotesView.reuseQuote(id);
      refreshRecentOpen();
      return;
    }
    if (kind === 'formulas') {
      if (!S.formulaById(id)) { U.toast('该配方已删除', 'warn'); renderRecent(); return; }
      applyFormula(id);
      S.pushRecent('formulas', id);
      U.toast('已带入配方', 'ok');
      refreshRecentOpen();
      return;
    }
    if (kind === 'dosages') {
      var d = S.dosageById(id);
      if (!d) { U.toast('该剂型已删除', 'warn'); renderRecent(); return; }
      state.calc.dosageFormId = d.id;
      syncDosageDefaults();
      fillCalc();
      scheduleAuto();
      S.pushRecent('dosages', id);
      U.toast('已选择剂型：' + d.name, 'ok');
      refreshRecentOpen();
    }
  }

  /* ================= 版本快照（回滚对比） ================= */
  function showSnapshots() {
    var list = state.meta.snapshots || [];
    if (!list.length) { U.toast('暂无快照，每次「一键报价」自动记录', 'warn'); return; }
    var html = '<p class="muted" style="font-size:12px;margin-bottom:8px">每次一键报价自动记录参数快照（最多 20 条），可回滚到任意版本重新核算。</p>' +
      '<div class="mat-list" style="gap:8px;max-height:52vh;overflow:auto">';
    list.forEach(function (s, idx) {
      var diff = '';
      if (idx === 0) diff = '<span class="tag tag-ok">最新</span>';
      html += '<div class="line" style="grid-template-columns:minmax(0,1.4fr) auto auto auto auto">' +
        '<div class="l-cell"><span class="l-name">' + esc(s.name) + '</span>' +
        '<span class="l-sub">' + esc(s.t ? s.t.slice(0, 16).replace('T', ' ') : '') + (s.customer ? ' · ' + esc(s.customer) : '') + '</span></div>' +
        '<div class="l-cell"><label>单份成本</label><span class="mono">' + C.money(s.summary.unitCost, 3, 4) + '</span></div>' +
        '<div class="l-cell"><label>含税价</label><span class="mono">' + C.money(s.summary.inTax, 3, 4) + '</span></div>' +
        '<div class="l-cell"><label>MOQ</label><span class="mono">' + C.fmt(s.summary.moq, 0, 0) + '</span></div>' +
        '<div style="display:flex;gap:6px;align-items:center">' + diff +
        '<button type="button" class="btn btn-xs" data-i="' + idx + '" data-act="rollback">回滚</button>' +
        '<button type="button" class="btn btn-xs" data-i="' + idx + '" data-act="use">核算</button></div>' +
        '</div>';
    });
    html += '</div>';
    var m = U.openModal(html, {
      title: '版本快照（' + list.length + '）', wide: true,
      footBtns: [{ text: '关闭', cls: '' }]
    });
    $$('button[data-act=rollback]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = list[Number(this.getAttribute('data-i'))];
        if (!s || !s.calc) return;
        state.calc = JSON.parse(JSON.stringify(s.calc));
        fillCalc(); renderMatLines(); renderPackLines();
        autoCalc();
        U.toast('已回滚到快照：' + s.name, 'ok');
      });
    });
    $$('button[data-act=use]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = list[Number(this.getAttribute('data-i'))];
        if (!s || !s.calc) return;
        state.calc = JSON.parse(JSON.stringify(s.calc));
        fillCalc(); renderMatLines(); renderPackLines();
        runQuote();
        U.toast('已加载快照并核算', 'ok');
      });
    });
  }

  /* ================= 用量反推计算器 ================= */
  function openBackCalc() {
    if (!state.calc.mats.length) { U.toast('请先添加原料清单，再反推投料量', 'warn'); return; }
    var c = state.calc;
    var html = '<p class="muted" style="font-size:12px;margin-bottom:8px">按 规格×生产量 反推各原料投料量（考虑损耗），用于采购备料。</p>' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr">' +
      '<label class="field"><span class="f-label">单位克重 g</span><input type="number" id="bc-weight" step="0.01" min="0" value="' + esc(c.weight || '') + '"></label>' +
      '<label class="field"><span class="f-label">每瓶数量</span><input type="number" id="bc-count" min="1" value="' + esc(c.count || '') + '"></label>' +
      '<label class="field"><span class="f-label">生产量（瓶）</span><input type="number" id="bc-bottles" min="1" value="5000"></label>' +
      '<label class="field"><span class="f-label">损耗率 %</span><input type="number" id="bc-loss" min="0" step="0.5" value="' + esc(c.lossRates && c.lossRates.material ? c.lossRates.material : 5) + '"></label>' +
      '</div>' +
      '<div id="bcResult" class="mt8"></div>';
    var m = U.openModal(html, {
      title: '用量反推（配方含量 → 投料量）', wide: true,
      footBtns: [
        { text: '关闭', cls: '' },
        {
          text: '计算', cls: 'btn-primary', onClick: function () {
            var w = num(m.el.querySelector('#bc-weight').value);
            var ct = num(m.el.querySelector('#bc-count').value);
            var bo = num(m.el.querySelector('#bc-bottles').value);
            var lo = num(m.el.querySelector('#bc-loss').value, 5);
            if (!(w > 0) || !(ct > 0) || !(bo > 0)) { U.toast('请填写克重/数量/生产量', 'warn'); return false; }
            var res = C.backCalc(state.calc.mats, w, ct, bo, lo);
            var h = '<div class="rc-warn" style="border-color:#91caff;background:#e6f4ff;color:#0958d9">每瓶 ' + C.fmt(res.grams, 2, 3) + 'g × ' + C.fmt(bo, 0, 0) + '瓶 = ' + C.fmt(res.totalGrams / 1000, 2, 3) + 'kg（含损耗 ' + C.fmt(lo, 1, 1) + '%）</div>' +
              '<table class="batch-table"><tr><th>原料</th><th>含量%</th><th>每瓶(g)</th><th>投料量(g)</th><th>投料量(kg)</th></tr>';
            res.rows.forEach(function (r) {
              h += '<tr><td>' + esc(r.name) + '</td><td>' + (global.WB.smart ? global.WB.smart.fmtRatio(r.ratio) : C.fmt(r.ratio, 2, 3)) + '</td><td>' + C.fmt(r.gramsPerUnit, 3, 4) + '</td><td>' + C.fmt(r.inputGrams, 1, 2) + '</td><td><b>' + C.fmt(r.inputKg, 3, 4) + '</b></td></tr>';
            });
            h += '<tr><td colspan="4" style="text-align:right"><b>合计投料</b></td><td><b>' + C.fmt(res.totalKg, 3, 4) + ' kg</b></td></tr></table>';
            m.el.querySelector('#bcResult').innerHTML = h;
            return false;
          }
        }
      ]
    });
  }

  /* ================= ⇄ 批量报价（多规格多方案对比） ================= */
  function openBatchQuote() {
    var c = state.calc;
    if (!c.mats.length) { U.toast('请先准备好原料清单，再批量报价', 'warn'); return; }
    var html = '<p class="muted" style="font-size:12px;margin-bottom:8px">为同一配方生成多个 规格×MOQ 组合并对比（基于当前原料清单与商务参数）。</p>' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<label class="field"><span class="f-label">克重列表（g，逗号分隔）</span><input id="bq-weights" type="text" value="' + esc(c.weight || '3') + '" placeholder="如 2,3,5"></label>' +
      '<label class="field"><span class="f-label">每瓶数量列表（逗号分隔）</span><input id="bq-counts" type="text" value="' + esc(c.count || '60') + '" placeholder="如 30,60"></label>' +
      '<label class="field"><span class="f-label">MOQ 列表（瓶，逗号分隔）</span><input id="bq-moqs" type="text" value="' + esc(c.moq || '5000') + '" placeholder="如 3000,5000,10000"></label>' +
      '<label class="field"><span class="f-label">方案名前缀</span><input id="bq-name" type="text" value="' + esc(c.name || '批量方案') + '"></label>' +
      '</div>' +
      '<div id="bqResult" class="mt8"></div>';
    var m = U.openModal(html, {
      title: '⇄ 批量报价（多规格多方案对比）', wide: true,
      footBtns: [
        { text: '关闭', cls: '' },
        {
          text: '批量核算', cls: 'btn-primary', onClick: function () {
            var weights = String(m.el.querySelector('#bq-weights').value || '').split(/[,，]/).map(function (x) { return num(x); }).filter(function (x) { return x > 0; });
            var counts = String(m.el.querySelector('#bq-counts').value || '').split(/[,，]/).map(function (x) { return num(x); }).filter(function (x) { return x > 0; });
            var moqs = String(m.el.querySelector('#bq-moqs').value || '').split(/[,，]/).map(function (x) { return num(x); }).filter(function (x) { return x > 0; });
            if (!weights.length || !counts.length || !moqs.length) { U.toast('请填写有效的规格/MOQ 列表', 'warn'); return false; }
            var name = m.el.querySelector('#bq-name').value.trim() || '批量方案';
            var rows = [];
            weights.forEach(function (w) {
              counts.forEach(function (ct) {
                moqs.forEach(function (moq) {
                  var snapC = JSON.parse(JSON.stringify(state.calc));
                  snapC.weight = w; snapC.count = ct; snapC.moq = moq; snapC.name = name + '·' + C.fmt(w, 1, 2) + 'g×' + C.fmt(ct, 0, 0) + '·MOQ' + C.fmt(moq, 0, 0);
                  var r = C.computeQuote(buildCalcInput(snapC, moq));
                  rows.push({ label: C.fmt(w, 1, 2) + 'g×' + C.fmt(ct, 0, 0) + '粒', moq: moq, r: r, c: snapC });
                });
              });
            });
            /* 排序：含税价升序，标记最优 */
            rows.sort(function (a, b) { return a.r.inTax - b.r.inTax; });
            var bestInTax = rows[0].r.inTax;
            var h = '<table class="batch-table"><tr><th>方案</th><th>MOQ</th><th>单份成本</th><th>不含税</th><th>含税</th><th>利润率</th><th>整单金额</th></tr>';
            rows.forEach(function (x) {
              h += '<tr' + (x.r.inTax === bestInTax ? ' class="b-best"' : '') + '><td>' + esc(x.label) + '</td><td>' + C.fmt(x.moq, 0, 0) + '</td><td>' + C.money(x.r.unitCost, 3, 4) + '</td><td>' + C.money(x.r.upTax, 3, 4) + '</td><td><b>' + C.money(x.r.inTax, 3, 4) + '</b></td><td>' + C.fmt(x.r.profitRate, 1, 2) + '%</td><td>' + C.money(x.c.taxInc === 'intax' ? x.r.totalInTax : x.r.totalUpTax, 2, 2) + '</td></tr>';
            });
            h += '</table><p class="muted mt8" style="font-size:11px">绿色行 = 含税价最低方案；点击「采用」可将某方案带入核算台。</p>';
            h += '<div class="mt8" style="display:flex;gap:6px">' + rows.map(function (x, i) { return '<button type="button" class="btn btn-xs" data-i="' + i + '">采用 ' + esc(x.label) + '</button>'; }).join('') + '</div>';
            m.el.querySelector('#bqResult').innerHTML = h;
            $$('button[data-i]', m.el.querySelector('#bqResult')).forEach(function (b) {
              b.addEventListener('click', function () {
                var x = rows[Number(this.getAttribute('data-i'))];
                state.calc.weight = x.c.weight; state.calc.count = x.c.count; state.calc.moq = x.c.moq; state.calc.name = x.c.name;
                fillCalc(); renderMatLines(); renderPackLines();
                runQuote();
                U.toast('已采用：' + x.label, 'ok');
              });
            });
            return false;
          }
        }
      ]
    });
  }

  /* ================= 快捷报价单分享 ================= */
  function shareQuote() {
    if (!resultState.last) { U.toast('请先完成一键报价', 'warn'); return; }
    var snap = resultState.last, c = snap.c, r = snap.r;
    var text = '【' + (c.name || 'OEM报价') + '】' + (c.customer ? '客户 ' + c.customer + ' · ' : '') +
      (c.dosageName || '') + ' · MOQ ' + C.fmt(c.moq, 0, 0) + '瓶\n' +
      '单份成本 ' + C.money(r.unitCost, 3, 4) + ' 元\n' +
      '不含税 ' + C.money(r.upTax, 3, 4) + ' 元 · 含税 ' + C.money(r.inTax, 3, 4) + ' 元\n' +
      '整单金额（' + (c.taxInc === 'intax' ? '含税' : '不含税') + '）' + C.money(c.taxInc === 'intax' ? r.totalInTax : r.totalUpTax, 2, 2) + ' 元\n' +
      '原料：' + c.mats.map(function (m) { return m.name + ' ' + C.fmt(m.ratio, 1, 1) + '%'; }).join('、') + '\n' +
      '由 OEM 报价工作台生成';
    var html = '<p class="muted" style="font-size:12px;margin-bottom:8px">复制报价摘要分享给同事/客户，或导出完整 PDF 报价单。</p>' +
      '<textarea class="recognize-ta" rows="8" readonly>' + esc(text) + '</textarea>';
    var m = U.openModal(html, {
      title: '分享报价单',
      footBtns: [
        { text: '关闭', cls: '' },
        {
          text: '复制文本', cls: 'btn-primary', onClick: function () {
            var ta = m.el.querySelector('textarea');
            ta.select();
            try { document.execCommand('copy'); U.toast('已复制分享文本', 'ok'); }
            catch (e) { U.toast('复制失败，请手动选择复制', 'warn'); }
            return false;
          }
        },
        { text: '导出PDF', cls: '', onClick: function () { exportPdf(); } }
      ]
    });
  }
  function addMaterialLine() {
    var list = state.data.materials;
    if (!list.length) {
      U.toast('原料价格库为空，请先到「原料价格库」录入原料', 'warn');
      return;
    }
    var opts = '<option value="">— 选择原料 —</option>';
    list.forEach(function (m) {
      var sup = S.defaultSupplierPrice(m);
      opts += '<option value="' + esc(m.id) + '"' + (sup ? ' data-sup="' + esc(sup.id) + '" data-price="' + esc(sup.price) + '" data-cur="' + esc(sup.currency) + '" data-date="' + esc(sup.quoteDate) + '" data-valid="' + esc(sup.validUntil) + '" data-src="' + esc(sup.source) + '"' : '') + '>' + esc(m.name) + '</option>';
    });
    var m = U.openModal(
      '<label class="field"><span class="f-label">选择原料（来自原料价格库）</span><select id="pickMat">' + opts + '</select></label>' +
      '<p class="muted mt8" style="font-size:12px">选中后自动绑定该原料的默认供应商采购价；可在清单中切换供应商或使用「一键最优价」。</p>',
      {
        title: '添加原料',
        footBtns: [
          { text: '取消', cls: '' },
          {
            text: '添加', cls: 'btn-primary', onClick: function () {
              var sel = m.el.querySelector('#pickMat');
              var matId = sel.value;
              if (!matId) { U.toast('请先选择原料', 'warn'); return false; }
              var opt = sel.selectedOptions[0];
              var mat = S.materialById(matId);
              var line = {
                id: S.genId('ml'), materialId: matId, name: mat.name, ratio: 5,
                supplierId: opt.getAttribute('data-sup') || '', supplierName: '',
                price: num(opt.getAttribute('data-price')), currency: opt.getAttribute('data-cur') || 'CNY',
                quoteDate: opt.getAttribute('data-date') || '', validUntil: opt.getAttribute('data-valid') || '',
                source: opt.getAttribute('data-src') || '', isTemp: false
              };
              if (line.supplierId) {
                mat.suppliers.forEach(function (s) { if (s.id === line.supplierId) line.supplierName = s.supplierName; });
              }
              state.calc.mats.push(line);
              renderMatLines();
              scheduleAuto();
            }
          }
        ]
      }
    );
  }
  function addPackLine() {
    openPackDrawer();
  }

  /* ================= 包材侧滑抽屉（搜索 + 多选，不跳页） ================= */
  var drawerSel = {};
  function openPackDrawer() {
    var list = state.data.packaging;
    if (!list.length) { U.toast('包材库为空，请先到「包材库」录入', 'warn'); return; }
    drawerSel = {};
    renderPackDrawerList('');
    $('packDrawer').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var s = $('packDrawerSearch');
    s.value = '';
    setTimeout(function () { s.focus(); }, 60);
  }
  function renderPackDrawerList(kw) {
    var list = state.data.packaging.filter(function (p) {
      if (!kw) return true;
      return (p.name || '').indexOf(kw) >= 0 || (p.type || '').indexOf(kw) >= 0 || (p.supplier || '').indexOf(kw) >= 0;
    });
    var wrap = $('packDrawerList');
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('package', 24) + '</div><p>没有匹配的包材</p></div>';
      updatePackDrawerFoot();
      return;
    }
    var html = '';
    list.forEach(function (p) {
      var checked = drawerSel[p.id] ? ' checked' : '';
      html += '<label class="dp-item' + (checked ? ' sel' : '') + '" data-id="' + esc(p.id) + '">' +
        '<input type="checkbox"' + checked + '>' +
        '<span class="dp-main"><span class="dp-name">' + esc(p.name) + '</span>' +
        '<span class="dp-sub">' + esc(p.type || '') + ' · ' + esc(p.supplier || '') + ' · 损耗' + C.fmt(p.lossRate, 1, 2) + '% · MOQ ' + C.fmt(p.moq, 0, 0) + '</span></span>' +
        '<span class="dp-price">¥' + C.fmt(p.price, 3, 4) + '</span></label>';
    });
    wrap.innerHTML = html;
    $$('.dp-item', wrap).forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.tagName === 'INPUT') return;
        var chk = item.querySelector('input');
        chk.checked = !chk.checked;
        item.classList.toggle('sel', chk.checked);
        drawerSel[item.getAttribute('data-id')] = chk.checked;
        updatePackDrawerFoot();
      });
      item.querySelector('input').addEventListener('change', function () {
        item.classList.toggle('sel', this.checked);
        drawerSel[item.getAttribute('data-id')] = this.checked;
        updatePackDrawerFoot();
      });
    });
    updatePackDrawerFoot();
  }
  function updatePackDrawerFoot() {
    var n = Object.keys(drawerSel).filter(function (k) { return drawerSel[k]; }).length;
    var selEl = $('packDrawerSel');
    var addBtn = $('packDrawerAdd');
    if (selEl) selEl.textContent = '已选 ' + n + ' 项';
    if (addBtn) addBtn.textContent = '添加所选（' + n + '）';
  }
  function closePackDrawer() {
    $('packDrawer').style.display = 'none';
    document.body.style.overflow = '';
  }
  function bindPackDrawer() {
    var d = $('packDrawer');
    if (!d) return;
    $('packDrawerClose').addEventListener('click', closePackDrawer);
    $('packDrawerCancel').addEventListener('click', closePackDrawer);
    d.addEventListener('click', function (e) { if (e.target === d) closePackDrawer(); });
    $('packDrawerSearch').addEventListener('input', function () { renderPackDrawerList(this.value.trim()); });
    $('packDrawerAdd').addEventListener('click', function () {
      var ids = Object.keys(drawerSel).filter(function (k) { return drawerSel[k]; });
      if (!ids.length) { U.toast('请先勾选包材', 'warn'); return; }
      ids.forEach(function (pkId) {
        var pk = S.packagingById(pkId);
        if (!pk) return;
        /* 已存在则累加数量 */
        var exist = state.calc.packs.filter(function (p) { return p.packagingId === pkId; })[0];
        if (exist) { exist.num = num(exist.num, 1) + 1; }
        else state.calc.packs.push({ id: S.genId('pl'), packagingId: pkId, name: pk.name, num: 1 });
      });
      closePackDrawer();
      renderPackLines();
      scheduleAuto();
      U.toast('已添加 ' + ids.length + ' 项包材', 'ok');
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    fillCalc();
    renderMatLines();
    renderPackLines();
    renderCompareBadge();
    applyBizCollapsed();
    applyFolds();
    bindEvents();
    if (state.calc.mats.length || state.calc.packs.length || state.calc.name) {
      autoCalc();
    }
  }

  global.WB = global.WB || {};
  global.WB.calcView = {
    init: init, runQuote: runQuote, autoCalc: autoCalc, saveQuote: saveQuote,
    exportPdf: exportPdf, exportExcel: exportExcel, showCompare: showCompare,
    renderMatLines: renderMatLines, renderPackLines: renderPackLines,
    applyFormula: applyFormula, fillCalc: fillCalc, readCalc: readCalc,
    addMaterialLine: addMaterialLine, addPackLine: addPackLine,
    applyBestPrices: applyBestPrices, openPackDrawer: openPackDrawer,
    closePackDrawer: closePackDrawer,
    clearMats: clearMats, resetResult: resetResult,
    resetBoard: resetBoard, confirmReset: confirmReset, sectionLabel: sectionLabel,
    openBackCalc: openBackCalc, openBatchQuote: openBatchQuote, shareQuote: shareQuote,
    showSnapshots: showSnapshots,
    renderRecent: renderRecent, toggleEmptyState: toggleEmptyState,
    applyRecent: applyRecent, refreshRecentOpen: refreshRecentOpen,
    moveMatLine: moveMatLine, movePackLine: movePackLine,
    toggleMatFold: toggleMatFold, togglePackFold: togglePackFold,
    /* V13：只读概算摘要（桌宠对话 Agent「当前配方报价多少」用；不渲染 UI、不写存档） */
    getQuoteSummary: function () {
      try {
        var c = state.calc;
        if (!c.mats.length && !c.packs.length) return null;
        var input = buildCalcInput(c, c.moq);
        var r = C.computeQuote(input);
        return {
          name: c.name || '未命名方案',
          moq: c.moq,
          unitCost: r.unitCost, upTax: r.upTax, inTax: r.inTax,
          mats: c.mats.length, packs: c.packs.length
        };
      } catch (e) { return null; }
    },
    skeleton: skeleton
  };
})(typeof window !== 'undefined' ? window : globalThis);
