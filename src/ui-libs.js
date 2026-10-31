/* ============================================================
 * ui-libs.js — 原料价格库 / 包材库 / 配方库
 * 原料：主数据 + 多供应商价格 + 历史曲线 + 预警 + 三种录入方式
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc, num = C.num;
  var state = S.state;

  var SOURCE_LABEL = { manual: '手动录入', upload: '报价单上传', api: '行业参考', paste: '粘贴解析', temp: '临时价' };

  /* ================= 原料价格库 ================= */
  function renderMatGrid() {
    var grid = $('matGrid');
    var kw = ($('matSearch').value || '').trim().toLowerCase();
    var fCat = $('matFilterCat').value;
    var fGrade = $('matFilterGrade').value;
    var fWarn = $('matFilterWarn').value;
    var fTag = $('matFilterTag') ? $('matFilterTag').value : '';
    var list = state.data.materials.filter(function (m) {
      if (fCat && m.category !== fCat) return false;
      if (fGrade && m.grade !== fGrade) return false;
      if (fTag && (m.tags || []).indexOf(fTag) < 0) return false;
      if (fWarn === 'alert') {
        var hasAlert = m.suppliers.some(function (s) { return C.priceStatus(s) !== 'ok'; });
        var over = (m.warnHigh !== undefined && m.warnHigh !== null && m.suppliers.some(function (s) { return num(s.price) > m.warnHigh; }));
        var under = (m.warnLow !== undefined && m.warnLow !== null && m.suppliers.some(function (s) { return num(s.price) < m.warnLow; }));
        if (!hasAlert && !over && !under) return false;
      }
      if (kw) {
        var hay = (m.name + ' ' + (m.inciName || '') + ' ' + (m.casNo || '') + ' ' + (m.category || '') + ' ' + (m.suppliers || []).map(function (s) { return s.supplierName; }).join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">' + U.ic('chart', 24) + '</div>' +
        '<p>没有匹配的原料。点击右上角 <b>「＋ 新增原料」</b> 开始建立价格库，<br>或使用 <b>「批量导入(CSV)」</b> / <b>「解析粘贴报价单」</b> 快速录入。</p></div>';
      return;
    }
    var html = '';
    list.forEach(function (m) { html += matCardHtml(m); });
    grid.innerHTML = html;
    bindMatCardEvents();
  }
  function matCardHtml(m) {
    var prices = m.suppliers || [];
    var priceHtml = '';
    prices.forEach(function (s) {
      var st = C.priceStatus(s);
      var cls = st === 'expired' ? ' expired' : '';
      var tag = st === 'expired' ? '<span class="tag tag-danger">已过期</span>' : (st === 'expiring' ? '<span class="tag tag-warn">7天内到期</span>' : '');
      var over = m.warnHigh !== undefined && m.warnHigh !== null && num(s.price) > num(m.warnHigh);
      var under = m.warnLow !== undefined && m.warnLow !== null && num(s.price) < num(m.warnLow);
      var wtag = over ? '<span class="tag tag-danger">超上限</span>' : (under ? '<span class="tag tag-warn">低于下限</span>' : '');
      priceHtml += '<div class="price-row' + cls + '">' +
        '<div><b>' + esc(s.supplierName) + '</b>' + (s.contact ? ' <span class="pr-src">' + esc(s.contact) + '</span>' : '') + '<br>' +
        '<span class="pr-src">' + esc(SOURCE_LABEL[s.source] || s.source || '') + ' · ' + esc(s.quoteDate || '—') + (s.validUntil ? ' 至 ' + esc(s.validUntil) : '') + (s.taxIncluded ? ' · 含税' : '') + (s.shippingIncluded ? ' · 含运' : '') + (s.moq ? ' · MOQ' + esc(s.moq) + (m.defaultUnit || 'kg') : '') + (s.leadTime ? ' · ' + esc(s.leadTime) : '') + '</span></div>' +
        '<div class="pr-price">' + C.fmt(s.price, 2, 4) + ' <span class="cur">' + esc(s.currency || 'CNY') + '/' + esc(m.defaultUnit || 'kg') + '</span><br>' + tag + wtag + '</div>' +
        '<div style="display:flex;gap:4px"><button class="icon-btn" data-edit-sup="' + esc(s.id) + '" title="编辑价格">' + U.ic('edit', 13) + '</button>' +
        (s.isDefault ? '<span class="tag tag-ok">默认</span>' : '<button class="icon-btn" data-setdefault-sup="' + esc(s.id) + '" title="设为默认">' + U.ic('star', 13) + '</button>') +
        '<button class="icon-btn" data-del-sup="' + esc(s.id) + '" title="删除该价格" style="color:var(--danger)">' + U.ic('close', 13) + '</button></div>' +
        '</div>';
    });
    if (!prices.length) priceHtml = '<div class="empty-state" style="padding:14px"><p>暂无供应商价格，<b>请添加价格</b>（核算必须绑定供应商采购价）</p></div>';
    var hist = sparklineHtml(m.priceHistory, m);
    return '<div class="mat-card" data-id="' + esc(m.id) + '">' +
      '<div class="mc-head">' +
        '<div><div class="mc-name">' + esc(m.name) + tagChipsHtml(m.tags) + '</div>' +
        '<div class="mc-meta">' +
          (m.inciName ? '<span>INCI: ' + esc(m.inciName) + '</span>' : '') +
          (m.casNo ? '<span>CAS: ' + esc(m.casNo) + '</span>' : '') +
          '<span>' + esc(m.grade || '') + '</span>' +
          '<span>' + esc(m.category || '') + '</span>' +
          (m.moq ? '<span>起订 ' + esc(m.moq) + esc(m.defaultUnit || 'kg') + '</span>' : '') +
        '</div></div>' +
        '<div style="display:flex;gap:4px;flex:none">' +
          '<button class="icon-btn" data-add-sup title="添加供应商价格">' + U.ic('plus', 13) + '</button>' +
          '<button class="icon-btn" data-edit-mat title="编辑原料">' + U.ic('edit', 13) + '</button>' +
          '<button class="icon-btn" data-del-mat title="删除" style="color:var(--danger)">' + U.ic('close', 13) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="mc-body">' + priceHtml +
        '<div class="threshold-line">预警阈值：<span>低</span><input type="number" step="0.0001" data-warn-low value="' + (m.warnLow === undefined || m.warnLow === null ? '' : m.warnLow) + '"><span>高</span><input type="number" step="0.0001" data-warn-high value="' + (m.warnHigh === undefined || m.warnHigh === null ? '' : m.warnHigh) + '">' +
        '<button class="btn btn-sm" data-save-threshold>保存</button></div>' +
      '</div>' +
      '<div class="mc-body" style="padding-top:0"><b style="font-size:12px;color:var(--text3)">价格历史</b>' + hist + '</div>' +
      '<div class="mc-foot"><span>更新时间：' + esc((m.updatedAt || '').slice(0, 10)) + '</span>' +
        '<div class="mc-acts"><button class="btn btn-sm" data-use-mat>' + U.ic('zap', 14) + '加入核算</button></div></div>' +
    '</div>';
  }
  /* SVG 价格曲线 */
  function sparklineHtml(history, m) {
    if (!history || history.length < 2) {
      return '<div class="muted" style="font-size:11.5px">暂无足够历史数据（≥2条）</div>';
    }
    var W = 320, H = 54, pad = 4;
    var pts = history.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var min = Infinity, max = -Infinity;
    pts.forEach(function (p) { var v = num(p.price); if (v < min) min = v; if (v > max) max = v; });
    var span = (max - min) || 1;
    min -= span * 0.15; max += span * 0.15;
    function x(i) { return pad + i * (W - pad * 2) / Math.max(1, pts.length - 1); }
    function y(v) { return H - pad - (num(v) - min) / (max - min) * (H - pad * 2); }
    var path = '';
    pts.forEach(function (p, i) { path += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.price).toFixed(1); });
    var dots = '';
    var labels = '';
    pts.forEach(function (p, i) {
      dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.price).toFixed(1) + '" r="2.6" fill="#1677ff"/>';
      labels += '<text x="' + x(i).toFixed(1) + '" y="' + (H + 9) + '" font-size="9" fill="#86909c" text-anchor="middle">' + esc(String(p.date).slice(5)) + '</text>';
    });
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + (H + 12) + '" preserveAspectRatio="xMidYMid meet">' +
      '<path d="' + path + '" fill="none" stroke="#1677ff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="' + path + ' L' + x(pts.length - 1).toFixed(1) + ',' + (H - pad) + ' L' + x(0).toFixed(1) + ',' + (H - pad) + ' Z" fill="#1677ff" opacity="0.08"/>' +
      dots + labels + '</svg>';
  }
  function bindMatCardEvents() {
    $$('#matGrid .mat-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      card.querySelector('[data-add-sup]').addEventListener('click', function () { openSupplierForm(id, null); });
      card.querySelector('[data-edit-mat]').addEventListener('click', function () { openMaterialForm(id); });
      card.querySelector('[data-del-mat]').addEventListener('click', function () {
        U.confirmDlg('确定删除原料「' + esc(S.materialById(id).name) + '」及其全部价格？', function () {
          state.data.materials = state.data.materials.filter(function (m) { return m.id !== id; });
          S.persist(); renderMatGrid();
          U.toast('已删除', 'ok');
        }, '删除');
      });
      card.querySelector('[data-use-mat]').addEventListener('click', function () {
        addMatToCalc(id);
      });
      var warnLow = card.querySelector('[data-warn-low]');
      var warnHigh = card.querySelector('[data-warn-high]');
      card.querySelector('[data-save-threshold]').addEventListener('click', function () {
        var m = S.materialById(id);
        m.warnLow = warnLow.value === '' ? null : num(warnLow.value);
        m.warnHigh = warnHigh.value === '' ? null : num(warnHigh.value);
        m.updatedAt = new Date().toISOString();
        S.persist(); renderMatGrid();
        U.toast('预警阈值已保存', 'ok');
      });
      /* 供应商价格操作 */
      $$('[data-edit-sup]', card).forEach(function (btn) {
        btn.addEventListener('click', function () { openSupplierForm(id, btn.getAttribute('data-edit-sup')); });
      });
      $$('[data-setdefault-sup]', card).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var m = S.materialById(id);
          var sid = btn.getAttribute('data-setdefault-sup');
          m.suppliers.forEach(function (s) { s.isDefault = s.id === sid; });
          m.updatedAt = new Date().toISOString();
          S.persist(); renderMatGrid();
          U.toast('已设为默认供应商', 'ok');
        });
      });
      $$('[data-del-sup]', card).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var m = S.materialById(id);
          var sid = btn.getAttribute('data-del-sup');
          U.confirmDlg('确定删除该供应商价格？', function () {
            m.suppliers = m.suppliers.filter(function (s) { return s.id !== sid; });
            m.updatedAt = new Date().toISOString();
            S.persist(); renderMatGrid();
            U.toast('已删除价格', 'ok');
          });
        });
      });
    });
  }
  function addMatToCalc(matId) {
    var mat = S.materialById(matId);
    if (!mat) return;
    var existing = state.calc.mats.filter(function (m) { return m.materialId === matId; });
    if (existing.length) { U.toast('该原料已在清单中', 'warn'); return; }
    var sup = S.defaultSupplierPrice(mat);
    state.calc.mats.push({
      id: S.genId('ml'), materialId: matId, name: mat.name, ratio: 5,
      supplierId: sup ? sup.id : '', supplierName: sup ? sup.supplierName : '',
      price: sup ? num(sup.price) : 0, currency: sup ? sup.currency : 'CNY',
      quoteDate: sup ? sup.quoteDate : '', validUntil: sup ? sup.validUntil : '',
      source: sup ? sup.source : '', isTemp: false
    });
    global.WB.calcView.renderMatLines();
    global.WB.calcView.autoCalc();
    global.WB.app.switchView('calc');
    U.toast('已加入核算台原料清单', 'ok');
  }

  /* ---- 原料主数据表单 ---- */
  function openMaterialForm(id) {
    var m = id ? S.materialById(id) : null;
    var title = m ? '编辑原料' : '新增原料';
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">原料名称 <i class="req">*</i></span><input id="mf-name" type="text" value="' + esc(m ? m.name : '') + '" placeholder="如：维生素C（包膜）"></label>' +
      '<label class="field"><span class="f-label">分类</span><select id="mf-cat">' + catOptions(m ? m.category : '其他') + '</select><div id="mf-catHint" class="mt4" style="font-size:12px;min-height:16px"></div></label>' +
      '<label class="field"><span class="f-label">INCI名 / 拉丁名</span><input id="mf-inci" type="text" value="' + esc(m ? m.inciName || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">CAS号</span><input id="mf-cas" type="text" value="' + esc(m ? m.casNo || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">规格级别</span><select id="mf-grade">' +
      ['食品级', '医药级', 'USP', 'EP'].map(function (g) { return '<option' + (m && m.grade === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="f-label">默认单位</span><select id="mf-unit">' +
      ['kg', 'g', 'L'].map(function (u) { return '<option' + (m && m.defaultUnit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="f-label">最小起订量</span><input id="mf-moq" type="number" min="0" value="' + (m ? m.moq : '') + '"></label>' +
      '<label class="field span2"><span class="f-label">标签（逗号分隔，用于筛选与全局搜索）</span><input id="mf-tags" type="text" value="' + esc((m && m.tags || []).join(', ')) + '" placeholder="如：主料, 包膜, 进口"></label>' +
      '</div>';
    var modal = U.openModal(html, {
      title: title,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            var name = $('mf-name').value.trim();
            if (!name) { U.toast('请填写原料名称', 'warn'); return false; }
            var tags = parseTags($('mf-tags').value);
            if (m) {
              m.name = name; m.category = $('mf-cat').value; m.inciName = $('mf-inci').value.trim();
              m.casNo = $('mf-cas').value.trim(); m.grade = $('mf-grade').value;
              m.defaultUnit = $('mf-unit').value; m.moq = num($('mf-moq').value);
              m.tags = tags; m.updatedAt = new Date().toISOString();
            } else {
              state.data.materials.push({
                id: S.genId('mat'), name: name, category: $('mf-cat').value,
                inciName: $('mf-inci').value.trim(), casNo: $('mf-cas').value.trim(),
                grade: $('mf-grade').value, defaultUnit: $('mf-unit').value, moq: num($('mf-moq').value),
                suppliers: [], priceHistory: [], warnLow: null, warnHigh: null, tags: tags,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
              });
            }
            S.persist(); renderMatGrid(); refreshTagOptions();
            U.toast('已保存', 'ok');
          }
        }
      ]
    });
    /* V12：原料名自动分类建议 —— 新建自动回填；编辑显示「采用」不强制；手改后不再覆盖 */
    var catTouched = !!m;
    var nameInp = modal.el.querySelector('#mf-name');
    var catSel = modal.el.querySelector('#mf-cat');
    var hint = modal.el.querySelector('#mf-catHint');
    function applySuggest(auto) {
      if (!nameInp || !catSel || !hint) return;
      var name = nameInp.value.trim();
      var cat = classifySuggest(name);
      if (!cat) { hint.innerHTML = ''; return; }
      if (catSel.value === cat) { hint.innerHTML = ''; return; }
      if (auto && !catTouched && !m) {
        catSel.value = cat;
        hint.innerHTML = '<span style="color:var(--ok)">自动识别：' + esc(cat) + '</span>';
      } else {
        hint.innerHTML = '<span style="color:var(--text2)">自动识别：' + esc(cat) + '</span> <button type="button" class="btn btn-sm" id="mf-catUse">采用</button>';
        var use = hint.querySelector('#mf-catUse');
        if (use) use.addEventListener('click', function () {
          catSel.value = cat;
          hint.innerHTML = '<span style="color:var(--ok)">已采用自动分类：' + esc(cat) + '</span>';
        });
      }
    }
    nameInp.addEventListener('input', function () { applySuggest(true); });
    catSel.addEventListener('change', function () { catTouched = true; hint.innerHTML = ''; });
    if (!m && nameInp.value.trim()) applySuggest(true);
  }
  /* 标签解析：逗号/顿号/空格分隔，去重去空 */
  function parseTags(v) {
    var out = [];
    String(v || '').split(/[,，、\s]+/).forEach(function (t) {
      t = t.trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  /* 汇总全部标签（含识别草稿标签） */
  function allTags() {
    var set = {};
    (state.data.materials || []).forEach(function (m) { (m.tags || []).forEach(function (t) { set[t] = 1; }); });
    (state.data.formulas || []).forEach(function (f) { (f.tags || []).forEach(function (t) { set[t] = 1; }); });
    (state.data.quotes || []).forEach(function (q) { (q.tags || []).forEach(function (t) { set[t] = 1; }); });
    return Object.keys(set).sort();
  }
  function refreshTagOptions() {
    var tags = allTags();
    ['matFilterTag', 'formFilterTag', 'qFilterTag'].forEach(function (selId) {
      var sel = $(selId);
      if (!sel) return;
      var cur = sel.value;
      var opts = tags.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
      sel.innerHTML = '<option value="">全部标签</option>' + opts;
      if (cur && tags.indexOf(cur) >= 0) sel.value = cur;
    });
  }
  function tagChipsHtml(tags) {
    if (!tags || !tags.length) return '';
    return '<span class="mat-tags">' + tags.map(function (t) { return '<span class="tag tag-flat">#' + esc(t) + '</span>'; }).join('') + '</span>';
  }
  function catOptions(sel) {
    var cats = ['维生素', '矿物质', '氨基酸', '草本提取物', '益生菌', '油脂', '糖类', '其他'];
    /* V12：合并规则库中的自定义分类 */
    var sm = global.WB.smart;
    if (sm) {
      var rules = sm.getRules();
      rules.forEach(function (r) { if (r.cat && cats.indexOf(r.cat) < 0) cats.push(r.cat); });
    }
    var html = '';
    cats.forEach(function (c) { html += '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + c + '</option>'; });
    return html;
  }
  /* V12：原料名 → 自动分类建议（classifyName 包装，未命中返回 null） */
  function classifySuggest(name) {
    var sm = global.WB.smart;
    if (!sm || !name) return null;
    try {
      var r = sm.classifyName(String(name));
      return (r && r.cat) ? r.cat : null;
    } catch (e) { return null; }
  }

  /* ---- 供应商价格表单 ---- */
  function openSupplierForm(matId, supId) {
    var m = S.materialById(matId);
    var s = null;
    if (supId) m.suppliers.forEach(function (x) { if (x.id === supId) s = x; });
    var title = s ? '编辑供应商价格' : '添加供应商价格';
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">原料</span><input type="text" disabled value="' + esc(m.name) + '"></label>' +
      '<label class="field"><span class="f-label">供应商名称 <i class="req">*</i></span><input id="sp-name" type="text" value="' + esc(s ? s.supplierName : '') + '"></label>' +
      '<label class="field"><span class="f-label">联系人</span><input id="sp-contact" type="text" value="' + esc(s ? s.contact || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">单价 <i class="req">*</i></span><input id="sp-price" type="number" step="0.0001" min="0" value="' + (s ? s.price : '') + '"></label>' +
      '<label class="field"><span class="f-label">币种</span><select id="sp-currency">' +
      Object.keys(C.FX_DEFAULTS).map(function (c2) { return '<option' + (s && s.currency === c2 ? ' selected' : c2 === 'CNY' ? ' selected' : '') + '>' + c2 + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="f-label">报价日期</span><input id="sp-date" type="date" value="' + (s ? s.quoteDate : new Date().toISOString().slice(0, 10)) + '"></label>' +
      '<label class="field"><span class="f-label">有效期截止 <i class="req">*</i></span><input id="sp-valid" type="date" value="' + (s ? s.validUntil || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">MOQ（' + esc(m.defaultUnit || 'kg') + '）</span><input id="sp-moq" type="number" min="0" value="' + (s ? s.moq : '') + '"></label>' +
      '<label class="field"><span class="f-label">交货周期</span><input id="sp-lead" type="text" value="' + esc(s ? s.leadTime || '' : '') + '" placeholder="如：15天"></label>' +
      '<label class="field"><span class="f-label">含税</span><select id="sp-tax"><option value="1"' + (s && s.taxIncluded === false ? '' : ' selected') + '>含税</option><option value="0"' + (s && s.taxIncluded === false ? ' selected' : '') + '>不含税</option></select></label>' +
      '<label class="field"><span class="f-label">含运费</span><select id="sp-ship"><option value="1"' + (s && s.shippingIncluded === false ? '' : ' selected') + '>含运</option><option value="0"' + (s && s.shippingIncluded === false ? ' selected' : '') + '>不含运</option></select></label>' +
      '<label class="field"><span class="f-label">价格来源</span><select id="sp-source">' +
      Object.keys(SOURCE_LABEL).map(function (k) { return '<option value="' + k + '"' + (s && s.source === k ? ' selected' : '') + '>' + SOURCE_LABEL[k] + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<p class="muted mt8" style="font-size:12px">价格来源：手动录入 / 报价单上传 / 行业参考。过期价格将自动标红且不可参与核算。</p>';
    U.openModal(html, {
      title: title,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            var name = $('sp-name').value.trim();
            var price = num($('sp-price').value);
            var valid = $('sp-valid').value;
            if (!name) { U.toast('请填写供应商名称', 'warn'); return false; }
            if (!(price > 0)) { U.toast('请填写有效单价', 'warn'); return false; }
            if (!valid) { U.toast('请填写有效期截止（过期自动锁定）', 'warn'); return false; }
            var obj = {
              id: s ? s.id : S.genId('sup'),
              supplierName: name, contact: $('sp-contact').value.trim(),
              price: price, currency: $('sp-currency').value,
              quoteDate: $('sp-date').value || new Date().toISOString().slice(0, 10),
              validUntil: valid, moq: num($('sp-moq').value),
              leadTime: $('sp-lead').value.trim(),
              taxIncluded: $('sp-tax').value === '1', shippingIncluded: $('sp-ship').value === '1',
              source: $('sp-source').value, isDefault: s ? s.isDefault : (m.suppliers.length === 0)
            };
            if (s) {
              for (var k in obj) s[k] = obj[k];
            } else {
              m.suppliers.push(obj);
              m.priceHistory.push({ date: obj.quoteDate, price: price, supplier: name });
            }
            m.updatedAt = new Date().toISOString();
            S.persist(); renderMatGrid();
            U.toast('供应商价格已保存', 'ok');
          }
        }
      ]
    });
  }

  /* ---- CSV 批量导入 ---- */
  function openBatchImport() {
    var html =
      '<p style="font-size:13px;color:var(--text2)">粘贴 CSV / TSV 数据（表头识别，可含：<b>原料名称, 供应商, 单价, 币种, 报价日期, 有效期截止, MOQ, 交货周期, 含税, 含运, 来源, 分类, 级别, INCI, CAS</b>）。</p>' +
      '<textarea id="impCsv" rows="10" style="width:100%;border:1px solid var(--border2);border-radius:6px;padding:10px;font-size:12.5px;font-family:var(--mono)" placeholder="原料名称,供应商,单价,有效期截止,MOQ&#10;维生素C（包膜）,石药维生,85.5,2026-12-31,5000&#10;牛磺酸,永安药业,96,2027-03-01,2000"></textarea>' +
      '<p class="muted mt8" style="font-size:12px">支持逗号/分号/Tab 分隔；无表头时按「原料名称,供应商,单价,有效期截止」顺序解析。已有原料将追加供应商价格，新原料自动创建。</p>';
    U.openModal(html, {
      title: '批量导入原料价格（CSV/Excel粘贴）', wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '导入', cls: 'btn-primary', onClick: function () {
            var text = $('impCsv').value.trim();
            if (!text) { U.toast('请粘贴数据', 'warn'); return false; }
            var res = parseCsv(text);
            if (!res.count) { U.toast('未解析到有效行，请检查格式', 'err'); return false; }
            S.persist(); renderMatGrid();
            U.toast('导入成功：' + res.count + ' 条价格（新增原料 ' + res.newMats + ' 个）', 'ok');
          }
        }
      ]
    });
  }
  function parseCsv(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var headers = null;
    var sep = ',';
    if (lines[0] && lines[0].indexOf('\t') >= 0) sep = '\t';
    if (lines[0] && lines[0].toLowerCase().indexOf('原料') >= 0) {
      headers = splitLine(lines.shift(), sep);
    }
    var count = 0, newMats = 0;
    lines.forEach(function (line) {
      var cells = splitLine(line, sep);
      if (!cells.length) return;
      var name, supplier, price, valid, currency, moq, lead, taxInc, shipInc, source, cat, grade, inci, cas;
      if (headers) {
        function get(k) {
          var idx = headers.findIndex(function (h) { return h && h.indexOf(k) >= 0; });
          return idx >= 0 ? cells[idx] : '';
        }
        name = get('原料名称') || get('原料'); supplier = get('供应商');
        price = get('单价') || get('价格'); valid = get('有效期截止') || get('有效期') || get('有效至');
        currency = get('币种'); moq = get('MOQ'); lead = get('交货周期') || get('交期');
        taxInc = get('含税'); shipInc = get('含运'); source = get('来源') || get('价格来源');
        cat = get('分类'); grade = get('级别'); inci = get('INCI'); cas = get('CAS');
      } else {
        name = cells[0] || ''; supplier = cells[1] || ''; price = cells[2] || ''; valid = cells[3] || '';
      }
      if (!name || !price) return;
      var mat = S.materialByName(name.trim());
      if (!mat) {
        mat = {
          id: S.genId('mat'), name: name.trim(), category: cat || classifySuggest(name.trim()) || '其他', inciName: inci || '',
          casNo: cas || '', grade: grade || '食品级', defaultUnit: 'kg',
          moq: num(moq) || 1, suppliers: [], priceHistory: [],
          warnLow: null, warnHigh: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        state.data.materials.push(mat);
        newMats++;
      }
      var p = num(price);
      var today = new Date().toISOString().slice(0, 10);
      mat.suppliers.push({
        id: S.genId('sup'), supplierName: (supplier || '批量导入').trim(), contact: '',
        price: p, currency: (currency || 'CNY').toUpperCase(),
        quoteDate: today, validUntil: valid || '',
        moq: num(moq), leadTime: lead || '',
        taxIncluded: taxInc !== '否' && taxInc !== '0' && taxInc !== 'false', shippingIncluded: shipInc !== '否' && shipInc !== '0' && shipInc !== 'false',
        source: source === 'api' ? 'api' : source === 'upload' ? 'upload' : 'manual', isDefault: mat.suppliers.length === 0
      });
      mat.priceHistory.push({ date: today, price: p, supplier: (supplier || '批量导入').trim() });
      mat.updatedAt = new Date().toISOString();
      count++;
    });
    return { count: count, newMats: newMats };
  }
  function splitLine(line, sep) {
    if (sep === '\t') return line.split('\t').map(function (c) { return c.trim(); });
    /* 简单 CSV 解析（支持引号） */
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === sep || ch === ';') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  /* ---- 粘贴报价单解析（V12：AI 优先 + 本地鲁棒回退 + 勾选确认批量入库） ---- */
  function openPasteParse() {
    /* V14：弹窗顶部「✨AI 识别」快捷入口（与识别弹窗共用同一偏好） */
    var rec = global.WB.recognize || {};
    var html = (rec.aiToggleHtml ? rec.aiToggleHtml() : '') +
      '<p style="font-size:13px;color:var(--text2)">粘贴供应商报价单文本（邮件 / PDF / Excel 表格复制出的文字），自动提取 <b>原料名称 + 单价</b>。兼容表格粘贴、价格在前、竖排、元/克·元/吨、外币（带汇率提示）、千分位、范围价，自动剥离 MOQ/交期/税点/日期等噪声。示例：</p>' +
      '<pre style="background:#fafbfc;border:1px solid var(--border2);border-radius:6px;padding:10px;font-size:12px;font-family:var(--mono)">维生素C（包膜） 85.5 元/kg\n牛磺酸 96.0 元/kg MOQ 2000kg\n鱼油 DHA30 6.5 USD/kg 45天交货\n1,250.00 烟酰胺 元/kg 含税13%</pre>' +
      '<textarea id="parseTxt" rows="9" style="width:100%;border:1px solid var(--border2);border-radius:6px;padding:10px;font-size:12.5px;font-family:var(--mono)" placeholder="粘贴报价单文本…支持多行、表格（Tab/多空格分隔）"></textarea>' +
      '<div id="parseResult" class="mt8"></div>';
    var curItems = null;
    var m = U.openModal(html, {
      title: '解析供应商报价单', wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        { text: '解析并预览', cls: '', onClick: doParse },
        { text: '确认写入', cls: 'btn-primary', onClick: doWrite }
      ]
    });
    if (rec.bindAiToggle) rec.bindAiToggle(m.el);
    /* V14：AI 开关关闭 / 未配置 → 走本地解析（回退链路不变） */
    function aiPrefOn() { return rec.aiPrefOn ? rec.aiPrefOn() : true; }
    function smart() { return global.WB.smart || null; }
    function doParse() {
      var text = $('parseTxt').value.trim();
      if (!text) { U.toast('请粘贴报价单文本', 'warn'); return false; }
      var box = $('parseResult');
      var sm = smart();
      box.innerHTML = '<div class="muted" style="font-size:12px">解析中…</div>';
      function finish(items, via) {
        items = (items || []).filter(function (it) { return it.name && it.price > 0; });
        if (!items.length) {
          box.innerHTML = '<div class="rc-err">未识别到有效行（原料名 + 价格），请检查文本格式</div>';
          curItems = null;
          return;
        }
        curItems = items;
        renderPreview(items, via);
      }
      if (sm && sm.aiConfig() && aiPrefOn()) {
        sm.aiStructure(text, 'quote').then(function (ai) {
          if (ai && ai.length) {
            var items = ai.map(function (r) {
              var price = Number(r.price) || 0;
              var cur = String(r.currency || 'CNY').toUpperCase();
              var notes = [];
              if (r.note) notes.push(r.note);
              var fx = sm.fxHintFor(price, cur);
              if (fx) notes.push(fx);
              if (r.confidence != null) notes.push('AI 置信度 ' + Math.round(Number(r.confidence) * 100) + '%');
              return { name: String(r.name || '').trim(), price: price, currency: cur, moq: r.moq || '', leadTime: r.leadTime || '', note: notes.join('；') };
            }).filter(function (it) { return it.name && it.price > 0; });
            finish(items, 'AI 结构化（未配置/失败时自动回退本地）');
          } else {
            finish(sm.parseQuoteLines(text), '本地解析（AI 未返回有效结果，已回退）');
          }
        });
      } else {
        finish(sm ? sm.parseQuoteLines(text) : parseQuoteText(text), '本地解析（未配置或未启用 AI 增强）');
      }
      return false;
    }
    function renderPreview(items, via) {
      var box = $('parseResult');
      var grid = 'display:grid;grid-template-columns:24px 1.4fr 0.8fr 0.6fr 0.7fr 1.3fr;gap:6px;align-items:center';
      var html2 = '<div class="rc-warn" style="max-height:320px;overflow:auto"><b>解析到 ' + items.length + ' 行</b>（' + esc(via) + '），勾选确认后写入原料价格库：' +
        '<div style="' + grid + ';font-size:11px;color:var(--text2);margin-top:6px">' +
        '<span></span><span>原料名称</span><span>单价(元/kg)</span><span>币种</span><span>MOQ</span><span>备注</span></div>';
      items.forEach(function (it, i) {
        html2 += '<div class="pp-row" data-i="' + i + '" style="' + grid + ';padding:2px 0">' +
          '<input type="checkbox" class="pp-ck" checked>' +
          '<input class="pp-name" type="text" value="' + esc(it.name) + '" style="border:1px solid var(--border2);border-radius:4px;padding:3px 6px;font-size:12px">' +
          '<input class="pp-price" type="number" step="0.0001" min="0" value="' + it.price + '" style="border:1px solid var(--border2);border-radius:4px;padding:3px 6px;font-size:12px;text-align:right">' +
          '<input class="pp-cur" type="text" value="' + esc(it.currency || 'CNY') + '" style="border:1px solid var(--border2);border-radius:4px;padding:3px 6px;font-size:12px">' +
          '<input class="pp-moq" type="text" value="' + esc(it.moq || '') + '" style="border:1px solid var(--border2);border-radius:4px;padding:3px 6px;font-size:12px">' +
          '<span style="font-size:11px;color:var(--text2)">' + esc(it.note || '') + (it.leadTime ? ' · 交期' + esc(it.leadTime) : '') + '</span></div>';
      });
      html2 += '</div><p class="muted mt8" style="font-size:12px">外币行仅作汇率提示，入库按原币价；分类按规则库自动识别（识别不到默认「其他」）。价格来源记为「报价单解析」，有效期默认 90 天。</p>';
      box.innerHTML = html2;
    }
    function doWrite() {
      if (!curItems) { U.toast('请先点击「解析并预览」', 'warn'); return false; }
      var rows = $$('#parseResult .pp-row');
      var count = 0, newMats = 0;
      rows.forEach(function (row) {
        if (!row.querySelector('.pp-ck').checked) return;
        var src = curItems[parseInt(row.getAttribute('data-i'), 10)] || {};
        var name = row.querySelector('.pp-name').value.trim();
        var price = num(row.querySelector('.pp-price').value);
        var currency = (row.querySelector('.pp-cur').value.trim() || 'CNY').toUpperCase();
        var moq = row.querySelector('.pp-moq').value.trim();
        if (!name || !(price > 0)) return;
        var mat = S.materialByName(name);
        if (!mat) {
          mat = {
            id: S.genId('mat'), name: name, category: classifySuggest(name) || '其他', inciName: '', casNo: '',
            grade: '食品级', defaultUnit: 'kg', moq: num(moq) || 1,
            suppliers: [], priceHistory: [], warnLow: null, warnHigh: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
          };
          state.data.materials.push(mat);
          newMats++;
        }
        var valid = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
        mat.suppliers.push({
          id: S.genId('sup'), supplierName: '报价单解析', contact: '',
          price: price, currency: currency,
          quoteDate: new Date().toISOString().slice(0, 10), validUntil: valid,
          moq: num(moq), leadTime: src.leadTime || '', taxIncluded: true, shippingIncluded: false,
          source: 'paste', isDefault: mat.suppliers.length === 0
        });
        mat.priceHistory.push({ date: new Date().toISOString().slice(0, 10), price: price, supplier: '报价单解析' });
        mat.updatedAt = new Date().toISOString();
        count++;
      });
      if (!count) { U.toast('没有勾选任何有效行', 'warn'); return false; }
      S.persist(); renderMatGrid(); refreshTagOptions();
      U.toast('已写入 ' + count + ' 条价格（新增原料 ' + newMats + ' 个，分类已自动识别）', 'ok');
      m.close();
    }
  }
  function parseQuoteText(text) {
    var items = [];
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    lines.forEach(function (line) {
      /* 匹配：名称(任意非数字起头) + 价格 + 可选币种 + 可选MOQ */
      var m2 = line.match(/^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·（）()\-/ ]{1,40}?)\s+(\d+(?:\.\d+)?)\s*(USD|EUR|HKD|JPY|CNY|RMB|美元|欧元|港币|日元)?\s*(?:元)?\/?(kg|g|L|KG)?(?:.*MOQ\s*(\d+))?/i);
      if (!m2) {
        /* 宽松：名称,价格 */
        m2 = line.match(/^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·（）()\-/ ]{1,40}?)[,\t，]\s*(\d+(?:\.\d+)?)/);
      }
      if (m2) {
        var cur = m2[3] || '';
        if (cur === 'RMB' || cur === '元') cur = 'CNY';
        items.push({
          name: m2[1].trim().replace(/\s{2,}/g, ' '),
          price: m2[2],
          currency: cur || 'CNY',
          moq: m2[5] || ''
        });
      }
    });
    return items;
  }

  /* ================= 包材库 ================= */
  function renderPackGrid() {
    var grid = $('packGrid');
    var kw = ($('packSearch').value || '').trim().toLowerCase();
    var list = state.data.packaging.filter(function (p) {
      if (!kw) return true;
      return (p.name + ' ' + p.type + ' ' + p.supplier + ' ' + p.spec).toLowerCase().indexOf(kw) >= 0;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">' + U.ic('package', 24) + '</div><p>没有匹配的包材。点击 <b>「＋ 新增包材」</b> 开始建立包材库。</p></div>';
      return;
    }
    var html = '';
    list.forEach(function (p) {
      html += '<div class="pack-card" data-id="' + esc(p.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div><div class="pc-name">' + esc(p.name) + '</div>' +
        '<div class="pc-meta"><span>' + esc(p.type || '') + '</span><span>' + esc(p.spec || '') + '</span><span>供应商：' + esc(p.supplier || '—') + '</span></div></div>' +
        '<div style="display:flex;gap:4px;flex:none">' +
        '<button class="icon-btn" data-edit>' + U.ic('edit', 13) + '</button><button class="icon-btn" data-del style="color:var(--danger)">' + U.ic('close', 13) + '</button></div></div>' +
        '<div class="pc-meta" style="margin-top:8px">' +
        '<span>单价 <b class="mono">¥' + C.fmt(p.price, 3, 4) + '</b>/个</span>' +
        '<span>MOQ ' + C.fmt(p.moq, 0, 0) + '</span>' +
        '<span>损耗 ' + C.fmt(p.lossRate, 1, 2) + '%</span>' +
        (p.printFee ? '<span>印刷费 ¥' + C.fmt(p.printFee, 3, 4) + '</span>' : '') +
        (p.moldFee ? '<span>开模费 ¥' + C.fmt(p.moldFee, 2, 2) + '</span>' : '') +
        '</div></div>';
    });
    grid.innerHTML = html;
    $$('#packGrid .pack-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      card.querySelector('[data-edit]').addEventListener('click', function () { openPackForm(id); });
      card.querySelector('[data-del]').addEventListener('click', function () {
        U.confirmDlg('确定删除包材「' + esc(S.packagingById(id).name) + '」？', function () {
          state.data.packaging = state.data.packaging.filter(function (p) { return p.id !== id; });
          S.persist(); renderPackGrid();
        });
      });
    });
  }
  function openPackForm(id) {
    var p = id ? S.packagingById(id) : null;
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">包材名称 <i class="req">*</i></span><input id="pf-name" type="text" value="' + esc(p ? p.name : '') + '"></label>' +
      '<label class="field"><span class="f-label">类型</span><select id="pf-type">' +
      ['瓶身', '瓶盖', '彩盒', '标签', '其他'].map(function (t) { return '<option' + (p && p.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="f-label">型号规格</span><input id="pf-spec" type="text" value="' + esc(p ? p.spec || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">单价（元/个） <i class="req">*</i></span><input id="pf-price" type="number" step="0.0001" min="0" value="' + (p ? p.price : '') + '"></label>' +
      '<label class="field"><span class="f-label">MOQ（个）</span><input id="pf-moq" type="number" min="0" value="' + (p ? p.moq : '') + '"></label>' +
      '<label class="field"><span class="f-label">供应商 <i class="req">*</i></span><input id="pf-supplier" type="text" value="' + esc(p ? p.supplier || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">印刷费（元/个）</span><input id="pf-print" type="number" step="0.0001" min="0" value="' + (p ? p.printFee : '') + '"></label>' +
      '<label class="field"><span class="f-label">开模费（元/一次性）</span><input id="pf-mold" type="number" min="0" value="' + (p ? p.moldFee : '') + '"></label>' +
      '<label class="field"><span class="f-label">损耗率（%）</span><input id="pf-loss" type="number" step="0.1" min="0" value="' + (p ? p.lossRate : 1) + '"></label>' +
      '</div>';
    U.openModal(html, {
      title: p ? '编辑包材' : '新增包材',
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            var name = $('pf-name').value.trim();
            var price = num($('pf-price').value);
            var supplier = $('pf-supplier').value.trim();
            if (!name || !(price >= 0) || !supplier) { U.toast('请填写名称/单价/供应商', 'warn'); return false; }
            var obj = {
              name: name, type: $('pf-type').value, spec: $('pf-spec').value.trim(),
              price: price, moq: num($('pf-moq').value), supplier: supplier,
              printFee: num($('pf-print').value), moldFee: num($('pf-mold').value),
              lossRate: num($('pf-loss').value, 1), updatedAt: new Date().toISOString()
            };
            if (p) { for (var k in obj) p[k] = obj[k]; }
            else { obj.id = S.genId('pk'); obj.createdAt = new Date().toISOString(); state.data.packaging.push(obj); }
            S.persist(); renderPackGrid();
            U.toast('包材已保存', 'ok');
          }
        }
      ]
    });
  }

  /* ================= 配方库 ================= */
  function renderFormGrid() {
    var grid = $('formGrid');
    var kw = ($('formSearch').value || '').trim().toLowerCase();
    var fDosage = $('formFilterDosage').value;
    var fTag = $('formFilterTag') ? $('formFilterTag').value : '';
    var list = state.data.formulas.filter(function (f) {
      if (fDosage && f.dosageName !== fDosage && f.dosageFormId !== fDosage) return false;
      if (fTag && (f.tags || []).indexOf(fTag) < 0) return false;
      if (!kw) return true;
      var hay = (f.name + ' ' + f.dosageName + ' ' + f.type + ' ' + (f.mats || []).map(function (m) { return m.name; }).join(' ')).toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">' + U.ic('dna', 24) + '</div><p>没有匹配的配方。点击 <b>「＋ 新建配方」</b> 创建可复用的配方资产。</p></div>';
      return;
    }
    var html = '';
    list.forEach(function (f) {
      var df = S.dosageById(f.dosageFormId);
      var dname = df ? df.name : f.dosageName;
      html += '<div class="form-card" data-id="' + esc(f.id) + '">' +
        '<div class="fc-name">' + esc(f.name) + tagChipsHtml(f.tags) + '<span class="tag tag-info">v' + (f.version || 1) + '</span>' +
        (f.type === '定制' ? '<span class="tag tag-warn">定制</span>' : '') + '</div>' +
        '<div class="fc-meta">' +
        '<span>' + esc(dname || '') + '</span><span>' + C.fmt(f.weight, 2, 3) + 'g × ' + C.fmt(f.count, 0, 0) + '粒/瓶</span>' +
        '<span>' + esc(f.net || '') + '</span><span>更新 ' + esc((f.updatedAt || '').slice(0, 10)) + '</span></div>' +
        '<div class="fc-mats">原料：' + (f.mats || []).map(function (m) { return esc(m.name) + ' ' + C.fmt(m.ratio, 1, 2) + '%'; }).join(' · ') + '</div>' +
        '<div class="fc-acts">' +
        '<button class="btn btn-sm btn-primary" data-use>' + U.ic('zap', 14) + '用于核算</button>' +
        '<button class="btn btn-sm" data-saveas>' + U.ic('copy', 14) + '另存为</button>' +
        '<button class="btn btn-sm" data-versions>' + U.ic('clock', 14) + '版本</button>' +
        '<button class="btn btn-sm" data-edit>' + U.ic('edit', 14) + '</button>' +
        '<button class="btn btn-sm" data-del style="color:var(--danger)">' + U.ic('close', 14) + '</button>' +
        '</div></div>';
    });
    grid.innerHTML = html;
    $$('#formGrid .form-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      card.querySelector('[data-use]').addEventListener('click', function () {
        global.WB.calcView.applyFormula(id);
        global.WB.app.switchView('calc');
        U.toast('配方已带入核算台', 'ok');
      });
      card.querySelector('[data-saveas]').addEventListener('click', function () { openFormulaForm(id, true); });
      card.querySelector('[data-versions]').addEventListener('click', function () { showFormulaVersions(id); });
      card.querySelector('[data-edit]').addEventListener('click', function () { openFormulaForm(id, false); });
      card.querySelector('[data-del]').addEventListener('click', function () {
        U.confirmDlg('确定删除配方「' + esc(S.formulaById(id).name) + '」？', function () {
          state.data.formulas = state.data.formulas.filter(function (f) { return f.id !== id; });
          S.persist(); renderFormGrid();
        });
      });
    });
  }
  function showFormulaVersions(id) {
    var f = S.formulaById(id);
    if (!f) return;
    var html = '<table class="ladder-table"><tr><th>版本</th><th>备注</th><th>更新时间</th><th>操作</th></tr>';
    (f.versions || []).slice().reverse().forEach(function (v) {
      html += '<tr><td>v' + v.version + (String(f.version) === String(v.version) ? ' ' + U.ic('star', 12) + '当前' : '') + '</td><td>' + esc(v.note || '—') + '</td><td>' + esc((v.updatedAt || '').slice(0, 10)) + '</td>' +
        '<td>' + (String(f.version) === String(v.version) ? '' : '<button class="btn btn-sm" data-restore="' + v.version + '">恢复</button>') + '</td></tr>';
    });
    html += '</table>';
    var m = U.openModal(html, {
      title: '配方版本历史：' + esc(f.name), wide: true,
      footBtns: [{ text: '关闭', cls: '' }]
    });
    m.el.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = parseInt(btn.getAttribute('data-restore'), 10);
        var snap = (f.versions || []).filter(function (x) { return x.version === v; })[0];
        if (!snap) return;
        f.weight = snap.weight; f.count = snap.count; f.mats = snap.mats; f.packs = snap.packs;
        f.craftNote = snap.craftNote; f.testNote = snap.testNote; f.craftPremium = snap.craftPremium;
        f.version = v; f.updatedAt = new Date().toISOString();
        S.persist(); renderFormGrid();
        U.toast('已恢复到 v' + v, 'ok');
      });
    });
  }
  function openFormulaForm(id, saveAs) {
    var f = id ? S.formulaById(id) : null;
    var title = saveAs ? '配方另存为（复制）' : (f ? '编辑配方' : '新建配方');
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">配方名称 <i class="req">*</i></span><input id="ff-name" type="text" value="' + esc(f ? (saveAs ? f.name + '（副本）' : f.name) : '') + '"></label>' +
      '<label class="field"><span class="f-label">剂型 <i class="req">*</i></span><select id="ff-dosage">' +
      state.data.dosageForms.filter(function (d) { return d.enabled; }).map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (f && (f.dosageFormId === d.id || f.dosageName === d.name) ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field"><span class="f-label">配方类型</span><select id="ff-type"><option value="常规"' + (f && f.type === '常规' ? ' selected' : '') + '>常规</option><option value="定制"' + (f && f.type === '定制' ? ' selected' : '') + '>定制</option></select></label>' +
      '<label class="field"><span class="f-label">单位克重(g) <i class="req">*</i></span><input id="ff-weight" type="number" step="0.01" min="0" value="' + (f ? f.weight : '') + '"></label>' +
      '<label class="field"><span class="f-label">每瓶数量 <i class="req">*</i></span><input id="ff-count" type="number" min="1" value="' + (f ? f.count : '') + '"></label>' +
      '<label class="field"><span class="f-label">净含量</span><input id="ff-net" type="text" value="' + esc(f ? f.net || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">整箱规格</span><input id="ff-box" type="text" value="' + esc(f ? f.box || '' : '') + '"></label>' +
      '<label class="field"><span class="f-label">定制工艺溢价(%)</span><input id="ff-premium" type="number" step="0.1" min="0" value="' + (f ? f.craftPremium || 0 : '') + '"></label>' +
      '<label class="field span2"><span class="f-label">标签（逗号分隔）</span><input id="ff-tags" type="text" value="' + esc((f && f.tags || []).join(', ')) + '" placeholder="如：爆品, 果味, 便携装"></label>' +
      '</div>' +
      '<div class="mt12"><b style="font-size:13px">原料含量</b> <button class="btn btn-sm" id="ff-addmat" style="margin-left:8px">＋ 添加原料</button></div>' +
      '<div id="ff-mats" class="mat-list" style="margin-top:8px"></div>' +
      '<div class="mt12"><b style="font-size:13px">包材（每瓶用量）</b> <button class="btn btn-sm" id="ff-addpack" style="margin-left:8px">＋ 添加包材</button></div>' +
      '<div id="ff-packs" class="mat-list" style="margin-top:8px"></div>' +
      '<div class="form-grid mt12">' +
      '<label class="field"><span class="f-label">工艺备注</span><textarea id="ff-craft" rows="2" placeholder="如：果胶软糖，草莓味">' + esc(f ? f.craftNote || '' : '') + '</textarea></label>' +
      '<label class="field"><span class="f-label">检测要求备注</span><textarea id="ff-test" rows="2" placeholder="如：SGS全检 / DGDA注册">' + esc(f ? f.testNote || '' : '') + '</textarea></label>' +
      '</div>' +
      '<label class="field mt12"><span class="f-label">版本备注（保存时自动生成新版本）</span><input id="ff-vernote" type="text" value="' + (saveAs ? '复制自 v' + (f ? f.version : 1) : '') + '" placeholder="如：调整含量、换供应商"></label>';
    var m = U.openModal(html, {
      title: title, wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            var name = $('ff-name').value.trim();
            var dfId = $('ff-dosage').value;
            var weight = num($('ff-weight').value);
            var count = num($('ff-count').value);
            if (!name) { U.toast('请填写配方名称', 'warn'); return false; }
            if (!dfId) { U.toast('请选择剂型', 'warn'); return false; }
            if (!(weight > 0) || !(count > 0)) { U.toast('克重与每瓶数量必须大于0', 'warn'); return false; }
            var mats = readFormulaMats(m.el);
            if (!mats.length) { U.toast('请至少添加一款原料', 'warn'); return false; }
            var df = S.dosageById(dfId);
            var packs = readFormulaPacks(m.el);
            var vernote = $('ff-vernote').value.trim();
            if (f && !saveAs) {
              /* 版本管理：变更即生成新版本 */
              f.version = (f.version || 1) + 1;
              f.versions = f.versions || [];
              f.versions.push({
                version: f.version, note: vernote || '编辑更新',
                weight: weight, count: count, mats: mats.map(function (x) { return Object.assign({}, x); }),
                packs: packs.map(function (x) { return Object.assign({}, x); }),
                craftNote: $('ff-craft').value.trim(), testNote: $('ff-test').value.trim(),
                craftPremium: num($('ff-premium').value), updatedAt: new Date().toISOString()
              });
            }
            var base = {
              name: name, dosageFormId: dfId, dosageName: df ? df.name : '',
              type: $('ff-type').value, weight: weight, count: count,
              net: $('ff-net').value.trim(), box: $('ff-box').value.trim(),
              mats: mats, packs: packs, tags: parseTags($('ff-tags').value),
              craftNote: $('ff-craft').value.trim(), testNote: $('ff-test').value.trim(),
              craftPremium: num($('ff-premium').value),
              updatedAt: new Date().toISOString()
            };
            if (f && !saveAs) {
              for (var k in base) f[k] = base[k];
            } else {
              base.id = S.genId('form');
              base.version = 1;
              base.versions = [{
                version: 1, note: vernote || '初始版本', weight: weight, count: count,
                mats: mats.map(function (x) { return Object.assign({}, x); }),
                packs: packs.map(function (x) { return Object.assign({}, x); }),
                craftNote: base.craftNote, testNote: base.testNote,
                craftPremium: base.craftPremium, updatedAt: new Date().toISOString()
              }];
              base.createdAt = new Date().toISOString();
              state.data.formulas.push(base);
            }
            S.persist(); renderFormGrid();
            U.toast('配方已保存' + (!saveAs && f ? '（新版本 v' + f.version + '）' : ''), 'ok');
          }
        }
      ]
    });
    /* 原料含量行编辑 */
    var curMats = f ? f.mats.map(function (x) { return Object.assign({}, x); }) : [];
    var curPacks = f ? f.packs.map(function (x) { return Object.assign({}, x); }) : [];
    function renderFfMats() {
      var box = m.el.querySelector('#ff-mats');
      if (!curMats.length) { box.innerHTML = '<div class="empty-state" style="padding:12px">暂无原料，点击「添加原料」</div>'; return; }
      var opts = state.data.materials.map(function (mt) {
        return '<option value="' + esc(mt.id) + '"' + (curMats.some(function (cm) { return cm.materialId === mt.id; }) ? ' disabled' : '') + '>' + esc(mt.name) + '</option>';
      }).join('');
      box.innerHTML = curMats.map(function (cm, i) {
        return '<div class="line" style="grid-template-columns:2fr 1fr auto">' +
          '<div class="l-cell"><label>原料名称</label><select class="ff-mid">' +
          '<option value="">— 选择 —</option>' + state.data.materials.map(function (mt) {
            return '<option value="' + esc(mt.id) + '"' + (cm.materialId === mt.id ? ' selected' : '') + '>' + esc(mt.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="l-cell"><label>含量 %</label><input type="number" class="ff-ratio" min="0" step="0.01" value="' + esc(global.WB.smart ? global.WB.smart.fmtRatio(cm.ratio) : cm.ratio) + '"></div>' +
          '<button class="l-del" data-i="' + i + '">' + U.ic('close', 12) + '</button></div>';
      }).join('');
      box.querySelectorAll('.l-del').forEach(function (b) {
        b.addEventListener('click', function () { curMats.splice(parseInt(b.getAttribute('data-i'), 10), 1); renderFfMats(); });
      });
    }
    function readFormulaMats(scope) {
      var out = [];
      $$('#ff-mats .line', scope).forEach(function (row) {
        var mid = row.querySelector('.ff-mid').value;
        var ratio = num(row.querySelector('.ff-ratio').value);
        if (!mid) return;
        var mt = S.materialById(mid);
        out.push({ materialId: mid, name: mt ? mt.name : '', ratio: ratio });
      });
      return out;
    }
    function renderFfPacks() {
      var box = m.el.querySelector('#ff-packs');
      if (!curPacks.length) { box.innerHTML = '<div class="empty-state" style="padding:12px">暂无包材，点击「添加包材」</div>'; return; }
      box.innerHTML = curPacks.map(function (cp, i) {
        return '<div class="line" style="grid-template-columns:2fr 1fr auto">' +
          '<div class="l-cell"><label>包材</label><select class="fp-id">' +
          '<option value="">— 选择 —</option>' + state.data.packaging.map(function (pk) {
            return '<option value="' + esc(pk.id) + '"' + (cp.packagingId === pk.id || cp.name === pk.name ? ' selected' : '') + '>' + esc(pk.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="l-cell"><label>每瓶用量</label><input type="number" class="fp-num" min="0" step="0.01" value="' + esc(cp.num) + '"></div>' +
          '<button class="l-del" data-i="' + i + '">' + U.ic('close', 12) + '</button></div>';
      }).join('');
      box.querySelectorAll('.l-del').forEach(function (b) {
        b.addEventListener('click', function () { curPacks.splice(parseInt(b.getAttribute('data-i'), 10), 1); renderFfPacks(); });
      });
    }
    function readFormulaPacks(scope) {
      var out = [];
      $$('#ff-packs .line', scope).forEach(function (row) {
        var pid = row.querySelector('.fp-id').value;
        var n = num(row.querySelector('.fp-num').value, 1);
        if (!pid) return;
        var pk = S.packagingById(pid);
        out.push({ packagingId: pid, name: pk ? pk.name : '', num: n || 1 });
      });
      return out;
    }
    renderFfMats();
    renderFfPacks();
    m.el.querySelector('#ff-addmat').addEventListener('click', function () {
      curMats.push({ materialId: '', name: '', ratio: 5 });
      renderFfMats();
    });
    m.el.querySelector('#ff-addpack').addEventListener('click', function () {
      curPacks.push({ packagingId: '', name: '', num: 1 });
      renderFfPacks();
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    /* 分类筛选填充 */
    var cats = {};
    state.data.materials.forEach(function (m) { cats[m.category || '其他'] = true; });
    var catHtml = '<option value="">全部分类</option>';
    Object.keys(cats).sort().forEach(function (c) { catHtml += '<option>' + esc(c) + '</option>'; });
    $('matFilterCat').innerHTML = catHtml;
    /* 剂型筛选 */
    var fHtml = '<option value="">全部剂型</option>';
    state.data.dosageForms.forEach(function (d) { fHtml += '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; });
    $('formFilterDosage').innerHTML = fHtml;
    /* 搜索事件 */
    ['matSearch', 'packSearch', 'formSearch'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', U.debounce(function () { refreshView('mats'); refreshView('packs'); refreshView('forms'); }, 250));
    });
    $('matFilterCat').addEventListener('change', function () { renderMatGrid(); });
    $('matFilterGrade').addEventListener('change', function () { renderMatGrid(); });
    $('matFilterWarn').addEventListener('change', function () { renderMatGrid(); });
    $('formFilterDosage').addEventListener('change', function () { renderFormGrid(); });
    /* v3：标签筛选 */
    refreshTagOptions();
    if ($('matFilterTag')) $('matFilterTag').addEventListener('change', function () { renderMatGrid(); });
    if ($('formFilterTag')) $('formFilterTag').addEventListener('change', function () { renderFormGrid(); });
    /* 按钮 */
    $('matAdd').addEventListener('click', function () { openMaterialForm(null); });
    $('matBatchImport').addEventListener('click', openBatchImport);
    $('matPasteParse').addEventListener('click', openPasteParse);
    $('packAdd').addEventListener('click', function () { openPackForm(null); });
    $('formAdd').addEventListener('click', function () { openFormulaForm(null, false); });
    renderMatGrid();
    renderPackGrid();
    renderFormGrid();
  }
  function refreshView(name) {
    if (name === 'mats') renderMatGrid();
    else if (name === 'packs') renderPackGrid();
    else if (name === 'forms') renderFormGrid();
  }

  global.WB = global.WB || {};
  global.WB.libsView = {
    init: init, renderMatGrid: renderMatGrid, renderPackGrid: renderPackGrid,
    renderFormGrid: renderFormGrid, refreshView: refreshView,
    addMatToCalc: addMatToCalc,
    parseTags: parseTags, refreshTagOptions: refreshTagOptions, tagChipsHtml: tagChipsHtml,
    openPasteParse: openPasteParse   /* V14：报价单解析面板（含 AI 开关）单测入口 */
  };
})(typeof window !== 'undefined' ? window : globalThis);
