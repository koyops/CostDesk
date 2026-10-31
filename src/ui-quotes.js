/* ============================================================
 * ui-quotes.js — 报价存档（状态流转/跟进/转化率）、预警看板、
 *                设置（剂型管理/费率/公式树/备份恢复）
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc, num = C.num;
  var state = S.state;

  var STATUS_STYLE = {
    '草稿': 'st-draft', '已报价': 'st-quoted', '客户确认': 'st-confirmed',
    '已下单': 'st-ordered', '已流失': 'st-lost'
  };

  /* ================= 报价存档 ================= */
  function renderQuoteList() {
    var kw = ($('qSearch').value || '').trim().toLowerCase();
    var fSt = $('qFilterStatus').value;
    var fTag = $('qFilterTag') ? $('qFilterTag').value : '';
    var list = state.data.quotes.filter(function (q) {
      if (fSt && q.status !== fSt) return false;
      if (fTag && (q.tags || []).indexOf(fTag) < 0) return false;
      if (!kw) return true;
      return (q.quoteNo + ' ' + q.projectName + ' ' + (q.customer || '')).toLowerCase().indexOf(kw) >= 0;
    });
    var wrap = $('quoteList');
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('sheet', 24) + '</div><p>暂无报价记录。在核算台完成核算后点击 <b>「存档生成报价」</b>。</p></div>';
      return;
    }
    var html = '';
    list.forEach(function (q) {
      var amt = q.biz && q.biz.taxInc === 'intax' ? q.result && q.result.totalInTax : (q.result && q.result.totalUpTax);
      html += '<div class="quote-row" data-id="' + esc(q.id) + '">' +
        '<div><div class="qr-no">' + esc(q.quoteNo) + '</div><div class="qr-sub">' + esc((q.createdAt || '').slice(0, 10)) + '</div></div>' +
        '<div><div class="qr-name">' + esc(q.projectName) + '</div><div class="qr-sub">' + esc(q.dosageName || '') + (q.customer ? ' · ' + esc(q.customer) : '') + '</div>' +
        global.WB.libsView.tagChipsHtml(q.tags) + '</div>' +
        '<div class="qr-sub">MOQ ' + C.fmt(q.biz && q.biz.moq || 0, 0, 0) + '瓶<br>含' + (q.biz && q.biz.taxInc === 'intax' ? '税' : '税') + '价 ' + C.money(amt, 2, 2) + '</div>' +
        '<div><span class="status-pill ' + (STATUS_STYLE[q.status] || 'st-draft') + '">' + esc(q.status) + '</span></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-sm" data-view-q>查看</button>' +
        '<button class="btn btn-sm" data-follow>跟进</button>' +
        '<button class="btn btn-sm" data-tag title="打标签，按标签筛选">' + U.ic('tag', 13) + '</button>' +
        '<button class="btn btn-sm" data-reuse>复用新建</button>' +
        '<button class="btn btn-sm" data-del style="color:var(--danger)">' + U.ic('close', 13) + '</button>' +
        '</div></div>';
    });
    wrap.innerHTML = html;
    $$('#quoteList .quote-row').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('[data-view-q]').addEventListener('click', function () { showQuoteDetail(id); });
      row.querySelector('[data-follow]').addEventListener('click', function () { openFollowUp(id); });
      row.querySelector('[data-tag]').addEventListener('click', function () { editQuoteTags(id); });
      row.querySelector('[data-reuse]').addEventListener('click', function () { reuseQuote(id); });
      row.querySelector('[data-del]').addEventListener('click', function () {
        U.confirmDlg('确定删除报价 ' + esc(S.quoteById(id).quoteNo) + '？该操作不可恢复。', function () {
          state.data.quotes = state.data.quotes.filter(function (q) { return q.id !== id; });
          S.persist(); renderQuoteList(); renderConvBoard(); global.WB.libsView.refreshTagOptions();
        }, '删除');
      });
    });
  }
  /* 报价打标签（逗号分隔，随存档列表与全局搜索联动） */
  function editQuoteTags(id) {
    var q = S.quoteById(id);
    if (!q) return;
    var html =
      '<p style="font-size:13px;color:var(--text2)">为报价 <b>' + esc(q.quoteNo) + '</b> 打标签，便于按标签筛选与全局搜索（Ctrl+K）。</p>' +
      '<label class="field mt8"><span class="f-label">标签（逗号/空格分隔）</span><input id="qt-tags" type="text" value="' + esc((q.tags || []).join(', ')) + '" placeholder="如：重点客户, 急单, 2026Q4"></label>';
    U.openModal(html, {
      title: '报价标签',
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            q.tags = global.WB.libsView.parseTags($('qt-tags').value);
            q.updatedAt = new Date().toISOString();
            S.persist(); renderQuoteList(); global.WB.libsView.refreshTagOptions();
            U.toast('标签已保存', 'ok');
          }
        }
      ]
    });
  }
  function renderConvBoard() {
    var board = $('convBoard');
    var quotes = state.data.quotes;
    var total = quotes.length;
    var ordered = quotes.filter(function (q) { return q.status === '已下单'; }).length;
    var confirmed = quotes.filter(function (q) { return q.status === '客户确认'; }).length;
    var win = ordered + confirmed;
    var rate = total ? (win / total * 100) : 0;
    var amounts = quotes.filter(function (q) { return q.status === '已下单'; }).map(function (q) {
      return q.biz && q.biz.taxInc === 'intax' ? (q.result && q.result.totalInTax || 0) : (q.result && q.result.totalUpTax || 0);
    });
    var avgWin = amounts.length ? amounts.reduce(function (a, b) { return a + b; }, 0) / amounts.length : 0;
    /* 本月 */
    var now = new Date(), y = now.getFullYear(), mo = now.getMonth();
    var monthQuotes = quotes.filter(function (q) {
      var d = new Date(q.createdAt);
      return d.getFullYear() === y && d.getMonth() === mo;
    });
    var monthWin = monthQuotes.filter(function (q) { return q.status === '已下单' || q.status === '客户确认'; }).length;
    var html =
      '<div class="conv-cell"><div class="cc-l">报价总数</div><div class="cc-v">' + total + '</div><div class="cc-s">本月 ' + monthQuotes.length + ' 单</div></div>' +
      '<div class="conv-cell"><div class="cc-l">成交（已下单+客户确认）</div><div class="cc-v" style="color:var(--ok)">' + win + '</div><div class="cc-s">本月 ' + monthWin + ' 单</div></div>' +
      '<div class="conv-cell"><div class="cc-l">转化率</div><div class="cc-v">' + C.fmt(rate, 1, 1) + '%</div><div class="cc-s">成交 / 报价总数</div></div>' +
      '<div class="conv-cell"><div class="cc-l">平均成交金额（整单）</div><div class="cc-v">' + C.money(avgWin, 0, 0) + '</div><div class="cc-s">' + amounts.length + ' 单已下单</div></div>';
    /* V3：按月趋势（近6个月柱状图） */
    html += '<div class="conv-sub"><div class="cs-title">' + U.ic('calendar', 14) + ' 按月趋势（近6个月）</div>' + monthBarHtml(quotes) + '</div>';
    /* V3：按剂型转化 */
    html += '<div class="conv-sub"><div class="cs-title">' + U.ic('pills', 14) + ' 按剂型转化</div>' + groupStatsHtml(groupBy(quotes, 'dosageName'), '剂型') + '</div>';
    /* V3：按客户转化 */
    html += '<div class="conv-sub"><div class="cs-title">' + U.ic('users', 14) + ' 按客户转化</div>' + groupStatsHtml(groupBy(quotes, 'customer'), '客户') + '</div>';
    board.innerHTML = html;
  }
  /* 按维度分组统计（取前5） */
  function groupBy(quotes, key) {
    var map = {};
    quotes.forEach(function (q) {
      var k = key === 'customer' ? (q.customer || '（未填写）') : (q.dosageName || '（未指定）');
      if (!map[k]) map[k] = { total: 0, win: 0 };
      map[k].total++;
      if (q.status === '已下单' || q.status === '客户确认') map[k].win++;
    });
    return Object.keys(map).map(function (k) { return { k: k, total: map[k].total, win: map[k].win }; })
      .sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
  }
  function groupStatsHtml(groups, label) {
    if (!groups.length) return '<div class="muted" style="font-size:11.5px">暂无数据</div>';
    var maxW = Math.max.apply(null, groups.map(function (g) { return g.total; })) || 1;
    return '<div class="conv-groups">' + groups.map(function (g) {
      var pct = g.total ? (g.win / g.total * 100) : 0;
      return '<div class="cg-row"><span class="cg-name" title="' + esc(g.k) + '">' + esc(g.k) + '</span>' +
        '<span class="cg-bar"><i style="width:' + (g.total / maxW * 100) + '%"></i></span>' +
        '<span class="cg-num">' + g.total + '单 / 成交' + g.win + '</span>' +
        '<span class="cg-rate">' + C.fmt(pct, 0, 0) + '%</span></div>';
    }).join('') + '</div>';
  }
  /* 近6个月报价/成交双柱 SVG */
  function monthBarHtml(quotes) {
    var months = [];
    var d = new Date();
    d.setDate(1);
    for (var i = 5; i >= 0; i--) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({ y: m.getFullYear(), m: m.getMonth(), label: (m.getMonth() + 1) + '月', total: 0, win: 0 });
    }
    quotes.forEach(function (q) {
      var qd = new Date(q.createdAt);
      for (var j = 0; j < months.length; j++) {
        if (months[j].y === qd.getFullYear() && months[j].m === qd.getMonth()) {
          months[j].total++;
          if (q.status === '已下单' || q.status === '客户确认') months[j].win++;
          break;
        }
      }
    });
    var W = 560, H = 92, bw = 26, gap = 34, baseY = H - 20;
    var maxN = Math.max.apply(null, months.map(function (m) { return m.total; }).concat([1]));
    var x0 = 30;
    var bars = '', labels = '', nums = '';
    months.forEach(function (m, i) {
      var cx = x0 + i * gap + bw / 2;
      var hT = (m.total / maxN) * (H - 40), hW = (m.win / maxN) * (H - 40);
      bars += '<rect x="' + (cx - bw) + '" y="' + (baseY - hT) + '" width="' + (bw - 5) + '" height="' + hT + '" rx="2" fill="#1677ff" opacity="0.85"><title>' + m.label + ' 报价 ' + m.total + ' 单</title></rect>' +
        '<rect x="' + (cx - 2) + '" y="' + (baseY - hW) + '" width="' + (bw - 5) + '" height="' + hW + '" rx="2" fill="#2fb96b" opacity="0.9"><title>' + m.label + ' 成交 ' + m.win + ' 单</title></rect>';
      labels += '<text x="' + cx + '" y="' + (H - 4) + '" font-size="9.5" fill="#86909c" text-anchor="middle">' + m.label + '</text>';
      nums += '<text x="' + cx + '" y="' + (baseY - hT - 4) + '" font-size="9" fill="#1677ff" text-anchor="middle">' + m.total + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="conv-chart" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="20" y1="' + baseY + '" x2="' + W + '" y2="' + baseY + '" stroke="#e5e6eb" stroke-width="1"/>' +
      bars + labels + nums +
      '<text x="' + (W - 6) + '" y="14" font-size="9" fill="#2fb96b" text-anchor="end">■ 成交</text>' +
      '<text x="' + (W - 60) + '" y="14" font-size="9" fill="#1677ff" text-anchor="end">■ 报价</text></svg>';
  }
  function showQuoteDetail(id) {
    var q = S.quoteById(id);
    if (!q) return;
    var html = '';
    html += '<div class="pd-meta" style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">' +
      '<span><b>报价编号：</b>' + esc(q.quoteNo) + '</span>' +
      '<span><b>方案：</b>' + esc(q.projectName) + '</span>' +
      (q.customer ? '<span><b>客户：</b>' + esc(q.customer) + '</span>' : '') +
      '<span><b>剂型：</b>' + esc(q.dosageName || '') + '</span>' +
      '<span><b>状态：</b>' + esc(q.status) + '</span></div>';
    if (q.biz) {
      html += '<div class="pd-meta" style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">' +
        '<span>MOQ ' + C.fmt(q.biz.moq, 0, 0) + '瓶</span>' +
        '<span>克重 ' + C.fmt(q.biz.weight, 2, 3) + 'g × ' + C.fmt(q.biz.count, 0, 0) + '粒</span>' +
        '<span>损耗 ' + C.fmt(q.biz.lossRates && q.biz.lossRates.material, 1, 2) + '%</span>' +
        '<span>目标利润率 ' + C.fmt(q.biz.profitRate, 1, 2) + '%</span>' +
        '<span>税率 ' + C.fmt(q.biz.taxRate, 1, 1) + '%</span></div>';
    }
    if (q.result) {
      html += '<div class="r-big" style="margin-top:10px">' +
        '<div class="cell"><div class="n">' + C.money(q.result.unitCost, 3, 4) + '</div><div class="l">单份成本</div></div>' +
        '<div class="cell alt"><div class="n">' + C.money(q.result.upTax, 3, 4) + '</div><div class="l">不含税出厂价</div></div>' +
        '<div class="cell"><div class="n">' + C.money(q.result.inTax, 3, 4) + '</div><div class="l">含税出厂价</div></div>' +
        '<div class="cell alt"><div class="n">' + C.fmt(q.result.profitRate, 1, 2) + '%</div><div class="l">实际利润率</div></div></div>';
    }
    /* 原料溯源 */
    html += '<h4 style="margin:12px 0 6px;font-size:13.5px">原料溯源（存档固化，不可修改）</h4>';
    html += '<table class="ladder-table"><tr><th>原料</th><th>含量%</th><th>供应商</th><th>采购价</th><th>报价日期</th><th>有效期</th></tr>';
    (q.materials || []).forEach(function (m) {
      html += '<tr><td>' + esc(m.name) + '</td><td>' + (global.WB.smart ? global.WB.smart.fmtRatio(m.ratio) : C.fmt(m.ratio, 1, 2)) + '</td><td>' + esc(m.supplierName || '—') + '</td>' +
        '<td>' + esc(m.currency || 'CNY') + ' ' + C.fmt(m.price, 2, 4) + '</td><td>' + esc(m.quoteDate || '—') + '</td><td>' + esc(m.validUntil || '—') + '</td></tr>';
    });
    html += '</table>';
    /* 跟进记录 */
    html += '<h4 style="margin:12px 0 6px;font-size:13.5px">跟进记录</h4>';
    if (!q.followUps || !q.followUps.length) html += '<p class="muted">暂无跟进记录</p>';
    else {
      html += '<div style="font-size:12.5px">';
      q.followUps.forEach(function (fu) {
        html += '<div style="border-left:2px solid var(--primary);padding:4px 10px;margin:6px 0">' +
          '<div class="muted">' + esc((fu.date || '').slice(0, 16).replace('T', ' ')) + (fu.nextDate ? ' · 下次跟进：' + esc(fu.nextDate.slice(0, 10)) : '') + '</div>' +
          '<div>' + esc(fu.note) + '</div></div>';
      });
      html += '</div>';
    }
    U.openModal(html, {
      title: '报价详情', wide: true,
      footBtns: [
        { text: '跟进', cls: 'btn', onClick: function () { openFollowUp(id); } },
        { text: '复用新建', cls: 'btn', onClick: function () { reuseQuote(id); } },
        { text: '关闭', cls: '' }
      ]
    });
  }
  function openFollowUp(id) {
    var q = S.quoteById(id);
    if (!q) return;
    var statusOpts = ['草稿', '已报价', '客户确认', '已下单', '已流失'].map(function (s) {
      return '<option value="' + s + '"' + (q.status === s ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">状态流转</span><select id="fu-status">' + statusOpts + '</select></label>' +
      '<label class="field"><span class="f-label">下次跟进时间</span><input id="fu-next" type="date"></label>' +
      '</div>' +
      '<label class="field mt8"><span class="f-label">跟进备注</span><textarea id="fu-note" rows="3" placeholder="记录客户反馈、比价情况、下单意向等…"></textarea></label>' +
      '<div id="fu-history" class="mt8" style="font-size:12.5px"></div>';
    var m = U.openModal(html, {
      title: '跟进记录：' + esc(q.quoteNo),
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存跟进', cls: 'btn-primary', onClick: function () {
            var note = $('fu-note').value.trim();
            var status = $('fu-status').value;
            var next = $('fu-next').value;
            if (!note) { U.toast('请填写跟进备注', 'warn'); return false; }
            q.followUps = q.followUps || [];
            q.followUps.push({ id: S.genId('fu'), date: new Date().toISOString(), note: note, nextDate: next });
            q.status = status;
            q.updatedAt = new Date().toISOString();
            S.persist();
            renderQuoteList(); renderConvBoard();
            U.toast('跟进已保存，状态：' + status, 'ok');
          }
        }
      ]
    });
    /* 历史 */
    var hist = '';
    (q.followUps || []).slice().reverse().forEach(function (fu) {
      hist += '<div style="border-left:2px solid var(--border2);padding:3px 10px;margin:4px 0"><span class="muted">' + esc((fu.date || '').slice(0, 10)) + '</span> ' + esc(fu.note) + '</div>';
    });
    m.el.querySelector('#fu-history').innerHTML = hist || '<span class="muted">暂无跟进历史</span>';
  }
  function reuseQuote(id) {
    var q = S.quoteById(id);
    if (!q) return;
    var c = S.defaultCalc();
    c.name = q.projectName + '·复用';
    c.customer = q.customer || '';
    c.dosageFormId = q.dosageFormId || '';
    c.formulaId = q.formulaId || '';
    c.formulaVersion = q.formulaVersion || '';
    if (q.biz) {
      c.moq = q.biz.moq; c.taxInc = q.biz.taxInc; c.tax = q.biz.taxRate;
      c.profit = q.biz.profitRate; c.admin = q.biz.adminRate || 0;
      c.lossRates = Object.assign({ material: 5, packaging: 1, production: 2 }, q.biz.lossRates || {});
      c.processFee = (typeof q.biz.processFee === 'number' && isFinite(q.biz.processFee)) ? q.biz.processFee : 0; /* V13：旧档档位文本按 0 处理 */
      c.premium = q.biz.premium || 0;
      c.testFee = q.biz.testFee || 0; c.freight = q.biz.freight || 0;   /* 旧档杂费字段忽略（按 0 处理） */
      c.fx = q.biz.fx || 1;
      c.weight = q.biz.weight; c.count = q.biz.count; c.net = q.biz.net; c.box = q.biz.box;
    }
    c.params = Object.assign({}, q.params || {});
    c.mats = (q.materials || []).map(function (m) {
      return { id: S.genId('ml'), materialId: m.materialId || '', name: m.name, ratio: m.ratio, supplierId: m.supplierId, supplierName: m.supplierName, price: m.price, currency: m.currency || 'CNY', quoteDate: m.quoteDate, validUntil: m.validUntil, source: m.source || '', isTemp: m.isTemp || false };
    });
    c.packs = (q.packaging || []).map(function (p) {
      return { id: S.genId('pl'), packagingId: p.packagingId, name: p.name, num: p.num };
    });
    state.calc = c;
    global.WB.calcView.fillCalc();
    global.WB.calcView.renderMatLines();
    global.WB.calcView.renderPackLines();
    global.WB.app.switchView('calc');
    U.toast('已复用报价参数，可调整后重新核算', 'ok');
  }

  /* ================= 预警看板 ================= */
  function renderWatch() {
    var board = $('watchBoard');
    var html = '';
    var count = 0;
    /* 1. 价格超限 */
    html += '<div class="watch-group"><div class="wg-title">' + U.ic('arrowup', 14) + ' 价格超限</div>';
    var overCount = 0;
    state.data.materials.forEach(function (m) {
      (m.suppliers || []).forEach(function (s) {
        if (C.priceStatus(s) === 'expired') return;
        if (m.warnHigh !== undefined && m.warnHigh !== null && num(s.price) > num(m.warnHigh)) {
          overCount++;
          html += watchItem('urgent', '原料「' + esc(m.name) + '」报价 ¥' + C.fmt(s.price, 2, 4) + '（' + esc(s.supplierName) + '）', '高于上限 ¥' + C.fmt(m.warnHigh, 2, 4), m.id);
        }
        if (m.warnLow !== undefined && m.warnLow !== null && num(s.price) < num(m.warnLow)) {
          overCount++;
          html += watchItem('', '原料「' + esc(m.name) + '」报价 ¥' + C.fmt(s.price, 2, 4) + '（' + esc(s.supplierName) + '）', '低于下限 ¥' + C.fmt(m.warnLow, 2, 4) + '，可关注采购机会', m.id);
        }
      });
    });
    if (!overCount) html += '<div class="rc-warn" style="border-color:var(--border2);background:#fafbfc;color:var(--text3)">暂无价格超限</div>';
    html += '</div>';
    count += overCount;
    /* 2. 过期 / 临期 */
    html += '<div class="watch-group"><div class="wg-title">⏰ 采购价过期 / 临期</div>';
    var expCount = 0;
    state.data.materials.forEach(function (m) {
      (m.suppliers || []).forEach(function (s) {
        var st = C.priceStatus(s);
        if (st === 'expired') {
          expCount++;
          html += watchItem('urgent', '原料「' + esc(m.name) + '」采购价已过期（' + esc(s.supplierName) + ' ¥' + C.fmt(s.price, 2, 4) + '）', '有效期至 ' + esc(s.validUntil) + '，过期价格已锁定不可参与核算，请更新', m.id);
        } else if (st === 'expiring') {
          expCount++;
          html += watchItem('', '原料「' + esc(m.name) + '」采购价 ' + C.fmt(s.price, 2, 4) + ' 将于 ' + esc(s.validUntil) + ' 到期', '7天内到期，请确认是否续期或换供应商', m.id);
        }
      });
    });
    if (!expCount) html += '<div class="rc-warn" style="border-color:var(--border2);background:#fafbfc;color:var(--text3)">暂无过期/临期价格</div>';
    html += '</div>';
    count += expCount;
    /* 3. 行情异动（同原料最近两条价格涨跌≥5%） */
    html += '<div class="watch-group"><div class="wg-title">' + U.ic('trend', 14) + ' 行情异动（最近两条价格对比）</div>';
    var moveCount = 0;
    state.data.materials.forEach(function (m) {
      var sorted = (m.priceHistory || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      if (sorted.length >= 2) {
        var cur = num(sorted[0].price), prev = num(sorted[1].price);
        if (prev > 0) {
          var chg = (cur - prev) / prev * 100;
          if (Math.abs(chg) >= 5) {
            moveCount++;
            var dir = chg > 0 ? '↑ 上涨' : '↓ 下跌';
            html += watchItem(chg > 0 ? 'urgent' : '', '原料「' + esc(m.name) + '」' + dir + ' ' + C.fmt(Math.abs(chg), 1, 1) + '%', C.fmt(prev, 2, 4) + ' → ' + C.fmt(cur, 2, 4) + '（' + esc(sorted[0].date) + ' 对比 ' + esc(sorted[1].date) + '）', m.id);
          }
        }
      }
    });
    if (!moveCount) html += '<div class="rc-warn" style="border-color:var(--border2);background:#fafbfc;color:var(--text3)">近两期价格无 ≥5% 异动</div>';
    html += '</div>';
    count += moveCount;
    board.innerHTML = html + '<div class="mt8 muted" style="font-size:12px">共 ' + count + ' 条预警</div>';
    $$('#watchBoard .watch-item').forEach(function (item) {
      var matId = item.getAttribute('data-mat');
      item.querySelector('[data-goto]').addEventListener('click', function () {
        global.WB.app.switchView('mats');
        var kw = $('matSearch');
        if (kw) kw.value = S.materialById(matId).name;
        global.WB.libsView.renderMatGrid();
      });
    });
  }
  function watchItem(cls, main, sub, matId) {
    return '<div class="watch-item ' + cls + '" data-mat="' + esc(matId) + '">' +
      '<div><div class="wi-main">' + main + '</div><div class="wi-sub">' + sub + '</div></div>' +
      '<div class="wi-acts"><button class="btn btn-sm" data-goto>去处理 →</button></div></div>';
  }

  /* ================= 设置 ================= */
  function fillSettings() {
    var s = state.settings;
    $('s-tax').value = s.taxRate;
    $('s-profit').value = s.profitRate;
    $('s-lowProfit').value = s.lowProfitLine;
    $('s-admin').value = s.adminRate;
    $('s-noPrefix').value = s.quoteNoPrefix;
    $('s-noDateFmt').value = s.quoteNoDateFmt;
    $('s-ladder').value = s.defaultLadder;
    $('s-autoSave').value = s.autoSaveSec;
    /* V12：AI 识别增强 */
    $('s-aiEnabled').value = s.aiEnabled ? '1' : '0';
    $('s-aiEndpoint').value = s.aiEndpoint || '';
    $('s-aiKey').value = s.aiKey || '';
    $('s-aiModel').value = s.aiModel || '';
    $('s-aiVisionModel').value = s.aiVisionModel || '';
    renderCatRules();
    fillPetGrowState();
  }
  /* V14：设置页展示桌宠当前养成状态（体型 / 经验 / 昵称） */
  function fillPetGrowState() {
    var el = $('petGrowState');
    if (!el) return;
    var P = global.WB.pet;
    if (!P || !P.getLevel) { el.textContent = '—'; return; }
    var lv = P.getLevel();
    var names = { 1: '幼猫', 2: '成猫', 3: '大橘' };
    el.textContent = (names[lv] || '幼猫') + '（Lv' + lv + ' · 经验 ' + P.getCount() + ' · 昵称：' + (P.getName() || '未命名') + '）';
  }
  /* V12：原料自动分类规则库管理 */
  function smart() { return global.WB.smart || null; }
  function catRulesWorking() {
    /* 工作副本：已保存规则 || 内置默认；从未保存时展示内置默认便于改编 */
    var sm = smart(); if (!sm) return [];
    var s = state.settings;
    return (s.catRules && s.catRules.length ? s.catRules : sm.defaultRules()).map(function (r) { return { kw: r.kw, cat: r.cat, custom: !!r.custom }; });
  }
  var catRuleDraft = null;
  function renderCatRules() {
    var sm = smart(), wrap = $('catRuleList');
    if (!sm || !wrap) return;
    if (!catRuleDraft) catRuleDraft = catRulesWorking();
    var cats = sm.baseCats().slice();
    catRuleDraft.forEach(function (r) { if (r.custom && r.cat && cats.indexOf(r.cat) < 0) cats.push(r.cat); });
    var dl = $('catRuleCats');
    if (dl) dl.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('');
    wrap.innerHTML = catRuleDraft.map(function (r, i) {
      return '<div class="rule-row" data-i="' + i + '">' +
        '<input class="rule-kw" type="text" value="' + esc(r.kw) + '" placeholder="关键词，如：维C" style="border:1px solid var(--border2);border-radius:5px;padding:5px 8px">' +
        '<input class="rule-cat" type="text" list="catRuleCats" value="' + esc(r.cat) + '" placeholder="分类，如：维生素" style="border:1px solid var(--border2);border-radius:5px;padding:5px 8px">' +
        '<button class="btn btn-sm rule-del" data-i="' + i + '" style="color:var(--danger)">' + U.ic('close', 13) + '</button></div>';
    }).join('') || '<div class="empty-state" style="padding:10px;font-size:12px">暂无规则，点击「新增规则」添加关键词 → 分类映射。</div>';
    wrap.querySelectorAll('.rule-del').forEach(function (b) {
      b.addEventListener('click', function () {
        catRuleDraft.splice(parseInt(b.getAttribute('data-i'), 10), 1);
        catRuleDraftDirty = true;
        renderCatRules();
      });
    });
    wrap.querySelectorAll('.rule-row').forEach(function (row) {
      row.querySelector('.rule-kw').addEventListener('input', function () { catRuleDraftDirty = true; });
      row.querySelector('.rule-cat').addEventListener('input', function () { catRuleDraftDirty = true; });
    });
  }
  var catRuleDraftDirty = false;
  function bindCatRules() {
    var add = $('catRuleAdd'), reset = $('catRuleReset'), save = $('catRuleSave');
    if (!add) return;
    add.addEventListener('click', function () {
      catRuleDraft.push({ kw: '', cat: '', custom: true });
      catRuleDraftDirty = true;
      renderCatRules();
      var rows = $$('#catRuleList .rule-row');
      if (rows.length) rows[rows.length - 1].querySelector('.rule-kw').focus();
    });
    reset.addEventListener('click', function () {
      var sm = smart(); if (!sm) return;
      catRuleDraft = sm.defaultRules().map(function (r) { return { kw: r.kw, cat: r.cat, custom: !!r.custom }; });
      catRuleDraftDirty = true;
      renderCatRules();
      U.toast('已恢复内置默认规则（需点击保存生效）', 'ok');
    });
    save.addEventListener('click', function () {
      var sm = smart(); if (!sm) return;
      /* 从 DOM 读取最新值（保留编辑中的内容） */
      var rows = $$('#catRuleList .rule-row');
      if (rows.length === catRuleDraft.length) {
        rows.forEach(function (row, i) {
          catRuleDraft[i].kw = row.querySelector('.rule-kw').value.trim();
          catRuleDraft[i].cat = row.querySelector('.rule-cat').value.trim();
        });
      }
      var rules = catRuleDraft.filter(function (r) { return r.kw && r.cat; }).map(function (r) {
        return { kw: r.kw, cat: r.cat, custom: sm.baseCats().indexOf(r.cat) < 0 };
      });
      state.settings.catRules = rules;
      catRuleDraft = null; catRuleDraftDirty = false;
      S.persist();
      renderCatRules();
      U.toast('分类规则已保存（' + rules.length + ' 条），自动分类即时生效', 'ok');
    });
  }
  function renderDosageList() {
    var wrap = $('dosageList');
    var list = state.data.dosageForms;
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">' + U.ic('pills', 24) + '</div><p>暂无剂型，点击「新增剂型」创建第一个剂型。</p></div>';
      return;
    }
    var html = '';
    list.forEach(function (d) {
      var df = S.dosageById(d.id);
      html += '<div class="dosage-item' + (d.enabled ? '' : ' disabled') + '" data-id="' + esc(d.id) + '">' +
        '<div><div class="di-name">' + esc(d.name) + '</div><div class="di-fields">' + (d.customFields || []).length + ' 个专属字段 · 人工档：' + (d.processLevels || []).map(function (l) { return esc(U.procLabel(l.level)); }).join('/') + '</div></div>' +
        '<div class="di-fields">损耗 原料' + C.fmt(d.defaultLossRate.material, 1, 2) + '% · 包材' + C.fmt(d.defaultLossRate.packaging, 1, 2) + '% · 生产' + C.fmt(d.defaultLossRate.production, 1, 2) + '%</div>' +
        '<div class="di-nums">加工费 ¥' + C.fmt(d.processLevels && d.processLevels[0] ? d.processLevels[0].fee : 0, 3, 4) + '/份起</div>' +
        '<div class="di-acts">' +
        '<button class="switch' + (d.enabled ? ' on' : '') + '" data-toggle title="启用/禁用"></button>' +
        '<button class="btn btn-sm" data-copy>⧉</button>' +
        '<button class="btn btn-sm" data-edit>' + U.ic('edit', 13) + '</button>' +
        '<button class="btn btn-sm" data-del style="color:var(--danger)">' + U.ic('close', 13) + '</button>' +
        '</div></div>';
    });
    wrap.innerHTML = html;
    $$('#dosageList .dosage-item').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('[data-toggle]').addEventListener('click', function () {
        var d = S.dosageById(id);
        d.enabled = !d.enabled;
        d.updatedAt = new Date().toISOString();
        S.persist(); renderDosageList();
        U.toast('剂型「' + d.name + '」已' + (d.enabled ? '启用' : '禁用'), 'ok');
      });
      row.querySelector('[data-edit]').addEventListener('click', function () { openDosageForm(id, false); });
      row.querySelector('[data-copy]').addEventListener('click', function () { openDosageForm(id, true); });
      row.querySelector('[data-del]').addEventListener('click', function () {
        U.confirmDlg('确定删除剂型「' + esc(S.dosageById(id).name) + '」？已有报价不受影响。', function () {
          state.data.dosageForms = state.data.dosageForms.filter(function (d) { return d.id !== id; });
          S.persist(); renderDosageList();
        }, '删除');
      });
    });
  }
  /* 剂型表单：新建 / 编辑 / 复制模板 */
  function openDosageForm(id, copy) {
    var d = id ? S.dosageById(id) : null;
    var title = copy ? '复制剂型模板' : (d ? '编辑剂型' : '新增剂型');
    var html =
      '<div class="form-grid">' +
      '<label class="field"><span class="f-label">剂型名称 <i class="req">*</i></span><input id="df-name" type="text" value="' + esc(d ? (copy ? d.name + '（复制）' : d.name) : '') + '" placeholder="如：口服液"></label>' +
      '<label class="field"><span class="f-label">原料损耗率（%） <i class="req">*</i></span><input id="df-loss-m" type="number" step="0.1" min="0" value="' + (d ? d.defaultLossRate.material : 5) + '"></label>' +
      '<label class="field"><span class="f-label">包材损耗率（%）</span><input id="df-loss-p" type="number" step="0.1" min="0" value="' + (d ? d.defaultLossRate.packaging : 1) + '"></label>' +
      '<label class="field"><span class="f-label">生产损耗率（%）</span><input id="df-loss-prod" type="number" step="0.1" min="0" value="' + (d ? d.defaultLossRate.production : 2) + '"></label>' +
      '</div>' +
      '<div class="mt12"><b style="font-size:13px">人工档位 → 加工费（元/份）</b> <button class="btn btn-sm" id="df-addlevel" style="margin-left:8px">＋ 添加工艺档</button></div>' +
      '<div id="df-levels" class="mt8" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<div class="mt12"><b style="font-size:13px">专属参数字段模板（选中剂型后在报价页动态渲染）</b> <button class="btn btn-sm" id="df-addfield" style="margin-left:8px">＋ 添加字段</button></div>' +
      '<div id="df-fields" class="mt8" style="display:flex;flex-direction:column;gap:6px"></div>';
    var m = U.openModal(html, {
      title: title, wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '保存', cls: 'btn-primary', onClick: function () {
            var name = $('df-name').value.trim();
            if (!name) { U.toast('请填写剂型名称', 'warn'); return false; }
            if (name === '软胶囊' && (!d || copy)) { /* 允许重名复制 */ }
            var levels = [];
            $$('#df-levels .df-lvl', m.el).forEach(function (row) {
              var lv = row.querySelector('.df-lv').value.trim();
              var fee = num(row.querySelector('.df-lf').value);
              if (lv) levels.push({ level: lv, fee: fee });
            });
            if (!levels.length) { U.toast('请至少配置一个工艺档', 'warn'); return false; }
            var fields = [];
            $$('#df-fields .df-fld', m.el).forEach(function (row) {
              var key = row.querySelector('.df-fk').value.trim();
              var label = row.querySelector('.df-fl').value.trim();
              var type = row.querySelector('.df-ft').value;
              var required = row.querySelector('.df-fr').checked;
              var opts = row.querySelector('.df-fo').value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
              if (key && label) fields.push({ key: key, label: label, type: type, options: type === 'select' ? opts : [], required: required, placeholder: '' });
            });
            var obj = {
              name: name, enabled: true,
              defaultLossRate: {
                material: num($('df-loss-m').value, 5),
                packaging: num($('df-loss-p').value, 1),
                production: num($('df-loss-prod').value, 2)
              },
              processLevels: levels, customFields: fields,
              updatedAt: new Date().toISOString()
            };
            if (d && !copy) {
              for (var k in obj) d[k] = obj[k];
            } else {
              obj.id = S.genId('df'); obj.createdAt = new Date().toISOString();
              state.data.dosageForms.push(obj);
            }
            S.persist(); renderDosageList();
            U.toast('剂型已保存', 'ok');
          }
        }
      ]
    });
    /* 工艺档行 */
    var levels = d ? d.processLevels.slice() : [{ level: '人工', fee: 0.05 }];
    function renderLevels() {
      var box = m.el.querySelector('#df-levels');
      box.innerHTML = levels.map(function (l, i) {
        return '<div class="df-lvl" style="display:flex;gap:8px;align-items:center">' +
          '<input class="df-lv" type="text" style="flex:1;border:1px solid var(--border2);border-radius:5px;padding:6px 8px" value="' + esc(l.level) + '" placeholder="如：人工">' +
          '<input class="df-lf" type="number" step="0.001" min="0" style="flex:1;border:1px solid var(--border2);border-radius:5px;padding:6px 8px;text-align:right" value="' + esc(l.fee) + '" placeholder="加工费 元/份">' +
          '<button class="l-del" data-i="' + i + '">' + U.ic('close', 12) + '</button></div>';
      }).join('');
      box.querySelectorAll('.l-del').forEach(function (b) {
        b.addEventListener('click', function () { levels.splice(parseInt(b.getAttribute('data-i'), 10), 1); renderLevels(); });
      });
    }
    /* 字段行 */
    var fields = d ? d.customFields.map(function (f) { return Object.assign({}, f); }) : [];
    function renderFields() {
      var box = m.el.querySelector('#df-fields');
      if (!fields.length) {
        box.innerHTML = '<div class="empty-state" style="padding:10px;font-size:12px">暂无专属字段。例如「软胶囊 → 囊壳材质」「口服液 → 瓶型」「粉剂 → 冲调方式」。</div>';
        return;
      }
      box.innerHTML = fields.map(function (f, i) {
        return '<div class="df-fld" style="display:grid;grid-template-columns:0.8fr 1fr 0.9fr 0.9fr 1.2fr auto;gap:8px;align-items:center;border:1px solid var(--border);border-radius:6px;padding:8px">' +
          '<input class="df-fk" type="text" placeholder="key(英文)" value="' + esc(f.key) + '" style="border:1px solid var(--border2);border-radius:5px;padding:6px 8px">' +
          '<input class="df-fl" type="text" placeholder="字段名，如：囊壳材质" value="' + esc(f.label) + '" style="border:1px solid var(--border2);border-radius:5px;padding:6px 8px">' +
          '<select class="df-ft" style="border:1px solid var(--border2);border-radius:5px;padding:6px 8px">' +
          ['text', 'number', 'select', 'textarea'].map(function (t) { return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
          '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="df-fr"' + (f.required ? ' checked' : '') + '> 必填</label>' +
          '<input class="df-fo" type="text" placeholder="选项(逗号分隔，select用)" value="' + esc((f.options || []).join(',')) + '" style="border:1px solid var(--border2);border-radius:5px;padding:6px 8px">' +
          '<button class="l-del" data-i="' + i + '">' + U.ic('close', 12) + '</button></div>';
      }).join('');
      box.querySelectorAll('.l-del').forEach(function (b) {
        b.addEventListener('click', function () { fields.splice(parseInt(b.getAttribute('data-i'), 10), 1); renderFields(); });
      });
    }
    renderLevels();
    renderFields();
    m.el.querySelector('#df-addlevel').addEventListener('click', function () {
      levels.push({ level: '工艺' + (levels.length + 1), fee: 0.05 });
      renderLevels();
    });
    m.el.querySelector('#df-addfield').addEventListener('click', function () {
      fields.push({ key: 'f' + (fields.length + 1), label: '新字段', type: 'text', options: [], required: false, placeholder: '' });
      renderFields();
    });
  }

  /* 公式树（可审计） */
  function renderFormulaTree() {
    var wrap = $('formulaTree');
    var html =
      '<div class="ft-node"><div class="expr">单款原料成本(元/份) = 含量% × 单份克重g × 采购单价(元/kg) ÷ 1000</div><div class="desc">单份克重 = 单粒克重 × 每瓶数量；采购单价按所选供应商，外币×汇率换算CNY</div></div>' +
      '<div class="ft-node"><div class="expr">原料成本小计 = Σ原料成本 × (1 + 原料损耗率%)</div><div class="desc">原料损耗率按剂型配置（胶囊4% / 软糖5% / 片剂3% / 粉剂6% / 固体饮料8%…）</div></div>' +
      '<div class="ft-node"><div class="expr">包材单项成本 = (单价 × (1+包材损耗率%) + 印刷费 + 开模费÷订单MOQ) × 每瓶用量 × (1+生产损耗率%)</div><div class="desc">开模费按档位MOQ重新分摊，阶梯报价自动重算</div></div>' +
      '<div class="ft-node"><div class="expr">加工费 = 手填人工费（元/份），默认 0</div><div class="desc">核算页「人工费」直接填写每份加工费，实时计入成本</div></div>' +
      '<div class="ft-node"><div class="expr">管理费 = (原料小计 + 包材小计 + 加工费) × 管理费率%</div><div class="desc">全局费率，可在本页配置</div></div>' +
      '<div class="ft-node"><div class="expr">定制工艺溢价 = (原料小计 + 包材小计 + 加工费) × 溢价率%</div><div class="desc">仅配方类型=定制时计取</div></div>' +
      '<div class="ft-node"><div class="expr">单份成本 = 原料小计 + 包材小计 + 加工费 + 管理费 + 溢价 + 检测费 + 运费分摊</div></div>' +
      '<div class="ft-node"><div class="expr">不含税出厂价 = 单份成本 × (1 + 目标利润率%)</div><div class="desc">实际利润率 = (不含税价 - 成本) ÷ 不含税价，低于预警线提示</div></div>' +
      '<div class="ft-node"><div class="expr">含税出厂价 = 不含税价 × (1 + 增值税率%)</div><div class="desc">税率默认13%，可配置；计价口径可选含税/不含税</div></div>' +
      '<div class="ft-node"><div class="expr">整单金额 = 单价 × 订单MOQ</div><div class="desc">MOQ阶梯：每档位独立重算（开模费按档位分摊）</div></div>';
    wrap.innerHTML = html;
  }

  function bindSettings() {
    $('btnSaveSettings').addEventListener('click', function () {
      var s = state.settings;
      s.taxRate = num($('s-tax').value, 13);
      s.profitRate = num($('s-profit').value, 30);
      s.lowProfitLine = num($('s-lowProfit').value, 15);
      s.adminRate = num($('s-admin').value, 0);
      s.quoteNoPrefix = $('s-noPrefix').value.trim() || 'BK';
      s.quoteNoDateFmt = $('s-noDateFmt').value;
      s.defaultLadder = $('s-ladder').value.trim() || '1000,3000,5000,10000';
      s.autoSaveSec = Math.max(5, num($('s-autoSave').value, 30));
      /* V12：AI 识别增强设置 */
      s.aiEnabled = $('s-aiEnabled').value === '1';
      s.aiEndpoint = $('s-aiEndpoint').value.trim();
      s.aiKey = $('s-aiKey').value.trim();
      s.aiModel = $('s-aiModel').value.trim();
      s.aiVisionModel = $('s-aiVisionModel').value.trim();
      S.persist();
      U.toast('设置已保存', 'ok');
    });
    bindCatRules();
    /* V14：重置宠物养成（确认弹窗 → 经验/体型/昵称归零回幼体） */
    var btnResetPet = $('btnResetPetGrowth');
    if (btnResetPet) btnResetPet.addEventListener('click', function () {
      var P = global.WB.pet;
      if (!P || !P.resetGrowth) { U.toast('桌宠模块未加载', 'warn'); return; }
      U.confirmDlg('确定重置宠物养成？<br>经验 / 体型 / 昵称将归零回到<b>幼体</b>；<br>不影响桌宠位置记忆与已选动物，也不影响任何报价数据。', function () {
        P.resetGrowth();
        fillPetGrowState();
        U.toast('宠物养成已重置：已回到幼体', 'ok');
      }, '确认重置');
    });
    $('btnExportJson').addEventListener('click', function () {
      U.download('OEM报价工作台备份_' + new Date().toISOString().slice(0, 10) + '.json', S.exportJson(), 'application/json');
      U.toast('JSON 备份已导出', 'ok');
    });
    $('btnImportJson').addEventListener('click', function () { $('importJsonFile').click(); });
    $('importJsonFile').addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          S.importJson(reader.result);
          U.toast('备份恢复成功', 'ok');
          global.WB.app.reloadAll();
        } catch (e) {
          U.toast('导入失败：' + e.message, 'err');
        }
      };
      reader.readAsText(file);
      this.value = '';
    });
    $('btnResetData').addEventListener('click', function () {
      U.confirmDlg('确定清空当前数据并恢复示例数据？当前数据将丢失，请先导出备份。', function () {
        S.resetAll();
        global.WB.app.reloadAll();
        U.toast('已恢复示例数据', 'ok');
      });
    });
    $('dosageAdd').addEventListener('click', function () { openDosageForm(null, false); });
    $('dosageCopyFrom').addEventListener('click', function () {
      var list = state.data.dosageForms;
      if (!list.length) { U.toast('暂无剂型可复制', 'warn'); return; }
      var opts = list.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('');
      U.openModal('<label class="field"><span class="f-label">选择要复制模板的剂型</span><select id="copyFrom">' + opts + '</select></label>', {
        title: '从现有剂型复制模板',
        footBtns: [
          { text: '取消', cls: '' },
          {
            text: '复制', cls: 'btn-primary', onClick: function () {
              var src = S.dosageById($('copyFrom').value);
              if (src) openDosageForm(src.id, true);
            }
          }
        ]
      });
    });
  }

  /* ================= PDF 模板（V3：LOGO/抬头/备注条款） ================= */
  function fillPdfTemplateForm() {
    var tpl = state.settings.pdfTemplate || {};
    ['pt-logo', 'pt-company', 'pt-contact', 'pt-phone', 'pt-address', 'pt-notes', 'pt-footer'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var key = id.slice(3);
      el.value = tpl[key] || '';
    });
  }
  function bindPdfTemplate() {
    var tpl = state.settings;
    $('btnSavePdfTemplate').addEventListener('click', function () {
      tpl.pdfTemplate = {
        logo: $('pt-logo').value.trim(),
        company: $('pt-company').value.trim(),
        contact: $('pt-contact').value.trim(),
        phone: $('pt-phone').value.trim(),
        address: $('pt-address').value.trim(),
        notes: $('pt-notes').value.trim(),
        footer: $('pt-footer').value.trim()
      };
      S.persist();
      U.toast('PDF 模板已保存，存档导出自动套用', 'ok');
    });
    $('btnPdfLogoUpload').addEventListener('click', function () { $('pdfLogoFile').click(); });
    $('pdfLogoFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { U.toast('LOGO 图片请控制在 2MB 以内', 'warn'); this.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () {
        /* 压缩到 220px 宽以内再写入（避免 localStorage 过大） */
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, 220 / (img.width || 220));
          var cvs = document.createElement('canvas');
          cvs.width = Math.max(1, Math.round(img.width * scale));
          cvs.height = Math.max(1, Math.round(img.height * scale));
          cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
          var dataUrl = cvs.toDataURL('image/png');
          $('pt-logo').value = dataUrl;
          U.toast('LOGO 已就绪，点「保存模板」生效', 'ok');
        };
        img.onerror = function () { U.toast('LOGO 图片读取失败', 'err'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    fillSettings();
    renderDosageList();
    renderFormulaTree();
    renderQuoteList();
    renderConvBoard();
    renderWatch();
    bindSettings();
    /* V3：PDF 模板表单 */
    fillPdfTemplateForm();
    bindPdfTemplate();
    /* 存档页事件 */
    $('qSearch').addEventListener('input', U.debounce(function () { renderQuoteList(); }, 250));
    $('qFilterStatus').addEventListener('change', function () { renderQuoteList(); });
    if ($('qFilterTag')) $('qFilterTag').addEventListener('change', function () { renderQuoteList(); });
  }
  function refresh() {
    renderQuoteList();
    renderConvBoard();
    renderWatch();
    renderDosageList();
    fillSettings();
  }

  global.WB = global.WB || {};
  global.WB.quotesView = {
    init: init, refresh: refresh, renderQuoteList: renderQuoteList,
    openQuoteDetail: showQuoteDetail, reuseQuote: reuseQuote
  };
})(typeof window !== 'undefined' ? window : globalThis);
