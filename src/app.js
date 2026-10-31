/* ============================================================
 * app.js — 入口：视图切换 / 快捷键 / 离线状态指示 / 草稿自动保存 / 启动
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc;

  /* 视图名 → 面包屑文案 */
  var CRUMB = {
    calc: '核算台', mats: '原料价格库', packs: '包材库',
    forms: '配方库', quotes: '报价存档', watch: '预警看板', settings: '设置'
  };
  /* 面包屑联动：顶部常驻操作栏 + 导航切换时更新（V7：保留 CostDesk 品牌前缀） */
  var BRAND_CRUMB = '<b class="cd">CostDesk</b> · ';
  function updateCrumb(sub) {
    var el = $('crumb');
    if (!el) return;
    var base = CRUMB[S.state.view] || '核算台';
    el.innerHTML = BRAND_CRUMB + esc(base) + (sub ? ' > ' + esc(sub) : '');
    /* 核算台回初始文案：CostDesk · 核算台 > 报价详情 */
    if (S.state.view === 'calc' && !sub) el.innerHTML = BRAND_CRUMB + '核算台 > 报价详情';
  }

  /* ================= 视图切换 ================= */
  function switchView(name) {
    S.state.view = name;
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    $$('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    var target = $('view-' + name);
    if (target) target.classList.add('active');
    /* 视图懒刷新 */
    if (name === 'mats') global.WB.libsView.renderMatGrid();
    if (name === 'packs') global.WB.libsView.renderPackGrid();
    if (name === 'forms') global.WB.libsView.renderFormGrid();
    if (name === 'quotes') global.WB.quotesView.refresh();
    if (name === 'watch') global.WB.quotesView.refresh();
    if (name === 'settings') global.WB.quotesView.refresh();
    updateCrumb();
    window.scrollTo({ top: 0 });
  }

  /* ================= 快捷键 ================= */
  function bindShortcuts() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var inField = tag === 'input' || tag === 'textarea' || tag === 'select';
      /* Ctrl+S 存档 */
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (S.state.view === 'calc') global.WB.calcView.saveQuote();
        return;
      }
      /* Ctrl+Q 一键报价 */
      if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        if (S.state.view !== 'calc') switchView('calc');
        global.WB.calcView.runQuote();
        return;
      }
      /* Ctrl+E 导出 Excel */
      if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (S.state.view === 'calc') global.WB.calcView.exportExcel();
        return;
      }
      /* Ctrl+B 导出 JSON 备份 */
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        U.download('OEM报价工作台备份_' + new Date().toISOString().slice(0, 10) + '.json', S.exportJson(), 'application/json');
        U.toast('JSON 备份已导出', 'ok');
        return;
      }
      /* Ctrl+K 全局搜索 */
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openGlobalSearch();
        return;
      }
      /* Alt+F 回到核算台 */
      if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        switchView('calc');
      }
    });
  }

  /* ================= 全局搜索（Ctrl+K） ================= */
  var searchOverlay = null;
  function openGlobalSearch() {
    if (searchOverlay) { searchOverlay.style.display = 'flex'; var i0 = searchOverlay.querySelector('input'); if (i0) i0.focus(); return; }
    var ov = document.createElement('div');
    ov.className = 'gs-overlay';
    ov.innerHTML =
      '<div class="gs-box">' +
      '<div class="gs-head">' +
      '<input id="gsInput" type="text" class="gs-input" placeholder="搜索原料 / 包材 / 配方 / 报价 / 识别历史…（↑↓ 选择，Enter 打开，Esc 关闭）" autocomplete="off">' +
      '<button type="button" class="gs-close">×</button></div>' +
      '<div id="gsResults" class="gs-results"></div>' +
      '<div class="gs-foot">在 原料/包材/配方/报价/识别历史 中检索 · 最近 50 条</div>' +
      '</div>';
    document.body.appendChild(ov);
    searchOverlay = ov;
    var input = ov.querySelector('#gsInput');
    var results = ov.querySelector('#gsResults');
    var close = ov.querySelector('.gs-close');
    var items = [];
    function run() {
      items = searchAll(input.value.trim());
      renderResults();
    }
    function renderResults() {
      if (!items.length) {
        results.innerHTML = '<div class="gs-empty">无匹配结果' + (input.value.trim() ? '，换个关键词试试' : '，输入关键词开始检索') + '</div>';
        return;
      }
      var html = '';
      var lastGroup = '';
      items.forEach(function (it, i) {
        if (it.group !== lastGroup) {
          html += '<div class="gs-group">' + esc(it.group) + '</div>';
          lastGroup = it.group;
        }
        html += '<div class="gs-item' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '">' +
          '<span class="gs-ic">' + U.ic(it.icon, 15) + '</span>' +
          '<span class="gs-t">' + esc(it.title) + '</span>' +
          (it.sub ? '<span class="gs-s">' + esc(it.sub) + '</span>' : '') +
          '<span class="gs-go">↵</span></div>';
      });
      results.innerHTML = html;
      $$('.gs-item', results).forEach(function (el) {
        el.addEventListener('click', function () { goto(items[parseInt(el.getAttribute('data-i'), 10)]); });
        el.addEventListener('mouseenter', function () { selectIdx(parseInt(el.getAttribute('data-i'), 10)); });
      });
    }
    function selectIdx(idx) {
      $$('.gs-item', results).forEach(function (el, i) { el.classList.toggle('sel', i === idx); });
    }
    function goto(it) {
      closeSearch();
      it.goto();
    }
    input.addEventListener('input', U.debounce(run, 180));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectIdx(Math.min(items.length - 1, (currentSel() + 1))); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectIdx(Math.max(0, currentSel() - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); var sel = $$('.gs-item', results); var cur = sel.filter(function (el) { return el.classList.contains('sel'); }); if (cur.length) cur[0].click(); }
    });
    function currentSel() {
      var els = $$('.gs-item', results);
      for (var i = 0; i < els.length; i++) if (els[i].classList.contains('sel')) return i;
      return 0;
    }
    close.addEventListener('click', closeSearch);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeSearch(); });
    setTimeout(function () { input.focus(); }, 30);
    run();
  }
  function closeSearch() {
    if (searchOverlay) { searchOverlay.style.display = 'none'; searchOverlay.innerHTML = ''; }
  }
  /* 检索：原料 / 包材 / 配方 / 报价 / 识别历史 */
  function searchAll(kw) {
    var out = [];
    kw = kw.toLowerCase();
    var has = function (s) { return s && s.toLowerCase().indexOf(kw) >= 0; };
    var tagHit = function (tags) { return (tags || []).some(function (t) { return has(t); }); };
    /* 原料 */
    S.state.data.materials.forEach(function (m) {
      if (!kw) return;
      var hay = [m.name, m.inciName || '', m.casNo || '', m.category || '', m.grade || ''].concat((m.suppliers || []).map(function (s) { return s.supplierName; })).join(' ').toLowerCase();
      if (hay.indexOf(kw) >= 0 || tagHit(m.tags)) {
        var sup = (m.suppliers || []).filter(function (s) { return s.isDefault; })[0] || (m.suppliers || [])[0];
        out.push({
          group: '原料价格库', icon: 'flask', title: m.name,
          sub: (sup ? sup.supplierName + ' ¥' + C.fmt(sup.price, 2, 4) + '/' + (m.defaultUnit || 'kg') : '暂无价格') + ((m.tags || []).length ? ' · #' + m.tags.join(' #') : ''),
          goto: function () { switchView('mats'); var kwEl = $('matSearch'); if (kwEl) kwEl.value = m.name; global.WB.libsView.renderMatGrid(); }
        });
      }
    });
    /* 包材 */
    S.state.data.packaging.forEach(function (p) {
      if (!kw) return;
      var hay = (p.name + ' ' + (p.type || '') + ' ' + (p.spec || '') + ' ' + (p.supplier || '')).toLowerCase();
      if (hay.indexOf(kw) >= 0) {
        out.push({
          group: '包材库', icon: 'package', title: p.name,
          sub: (p.type || '') + ' ' + (p.spec || '') + ' · ¥' + C.fmt(p.price, 3, 4) + '/个',
          goto: function () { switchView('packs'); var kwEl = $('packSearch'); if (kwEl) kwEl.value = p.name; global.WB.libsView.renderPackGrid(); }
        });
      }
    });
    /* 配方 */
    S.state.data.formulas.forEach(function (f) {
      if (!kw) return;
      var hay = (f.name + ' ' + (f.dosageName || '') + ' ' + (f.ftype || '') + ' ' + (f.mats || []).map(function (m) { return m.name; }).join(' ')).toLowerCase();
      if (hay.indexOf(kw) >= 0 || tagHit(f.tags)) {
        out.push({
          group: '配方库', icon: 'layers', title: f.name,
          sub: (f.dosageName || '') + ((f.tags || []).length ? ' · #' + f.tags.join(' #') : ''),
          goto: function () { switchView('forms'); var kwEl = $('formSearch'); if (kwEl) kwEl.value = f.name; global.WB.libsView.renderFormGrid(); }
        });
      }
    });
    /* 报价 */
    S.state.data.quotes.forEach(function (q) {
      if (!kw) return;
      var hay = (q.quoteNo + ' ' + q.projectName + ' ' + (q.customer || '') + ' ' + (q.dosageName || '') + ' ' + q.status).toLowerCase();
      if (hay.indexOf(kw) >= 0 || tagHit(q.tags)) {
        out.push({
          group: '报价存档', icon: 'sheet', title: q.quoteNo + ' ' + q.projectName,
          sub: (q.customer || '') + ' · ' + q.status + ((q.tags || []).length ? ' · #' + q.tags.join(' #') : ''),
          goto: function () { switchView('quotes'); global.WB.quotesView.openQuoteDetail(q.id); }
        });
      }
    });
    /* 识别历史 */
    (S.state.meta.recognizeHistory || []).slice(0, 20).forEach(function (rec, i) {
      if (!kw) return;
      var raw = (rec.rawText || '').slice(0, 120);
      if (raw.toLowerCase().indexOf(kw) >= 0) {
        out.push({
          group: '识别历史', icon: 'search', title: (rec.rawText || '').split(/\r?\n/)[0] || '识别记录',
          sub: rec.sourceType + ' · ' + (rec.createdAt || '').slice(0, 10),
          goto: function () { switchView('calc'); global.WB.recognize.openRecognizeHistory(); }
        });
      }
    });
    return out.slice(0, 50);
  }
  function bindGlobalSearch() {
    var b = $('btnGlobalSearch');
    if (b) b.addEventListener('click', openGlobalSearch);
  }

  /* ================= 离线状态指示（替代常驻横幅） ================= */
  function updateOnline() {
    var ind = $('syncInd');
    var txt = $('syncText');
    if (navigator.onLine) {
      ind.classList.remove('warn');
      ind.classList.add('online');
      ind.title = '已连接：数据保存于本机并自动备份';
      txt.textContent = '在线';
    } else {
      ind.classList.remove('online');
      ind.classList.add('warn');
      ind.title = '离线模式：数据暂存本机，恢复网络后自动同步';
      txt.textContent = '离线';
    }
  }
  function bindOnline() {
    var first = true;
    window.addEventListener('online', function () {
      updateOnline();
      U.toast('网络已恢复，数据同步云端完成', 'ok');
    });
    window.addEventListener('offline', function () {
      updateOnline();
      U.toast('网络已断开：数据暂存本机，恢复后自动同步', 'warn');
    });
    if (!navigator.onLine) {
      setTimeout(function () {
        U.toast('离线模式：数据暂存本机，恢复网络后自动同步', 'warn', 3200);
      }, 600);
    }
  }

  /* ================= 草稿自动保存 ================= */
  function bindDraft() {
    var sec = Math.max(5, Number(S.state.settings.autoSaveSec) || 30);
    setInterval(function () {
      if (S.state.view !== 'calc') return;
      global.WB.calcView.readCalc();
      S.saveDraft();
      var el = $('saveState');
      el.textContent = '● 已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }, sec * 1000);
    window.addEventListener('beforeunload', function () {
      if (S.state.view === 'calc') {
        try { global.WB.calcView.readCalc(); } catch (e) {}
        S.saveDraft();
      }
    });
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { /* 已在上方处理 */ }
    });
  }

  /* ================= 顶部导航 ================= */
  function bindNav() {
    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
    });
  }

  /* ================= 启动 ================= */
  function init() {
    S.load();
    /* 草稿恢复 */
    var restored = S.restoreDraft();
    if (restored) {
      setTimeout(function () { U.toast('已恢复上次未完成的报价草稿', 'ok', 2600); }, 500);
    }
    updateOnline();
    bindOnline();
    bindNav();
    bindShortcuts();
    bindGlobalSearch();
    bindDraft();
    global.WB.calcView.init();
    global.WB.libsView.init();
    global.WB.quotesView.init();
    /* 识别三入口（图片/文字/文本配方）+ 识别历史 + 空状态卡片事件绑定；
     * 缺失该初始化会导致三入口按钮点击无任何反应（历史回归根因） */
    if (global.WB.recognize && global.WB.recognize.init) global.WB.recognize.init();
    /* V5：报价小宠——渲染常驻精灵（等级由累计报价次数驱动） */
    if (global.WB.pet && global.WB.pet.init) global.WB.pet.init();
    /* V14：最近使用初始渲染——优先用 applyRecent（还原展开态 / 有记录默认展开），
     * 确保「存档页有记录」时核算台入口不再空着 */
    if (global.WB.calcView.applyRecent) global.WB.calcView.applyRecent();
    else if (global.WB.calcView.renderRecent) global.WB.calcView.renderRecent();
    updateCrumb();
    /* 首屏 3 秒可交互：预渲染完成后隐藏加载态 */
    document.body.classList.add('ready');
    if (S.state.view !== 'calc') switchView(S.state.view);
  }

  function reloadAll() {
    global.WB.calcView.fillCalc();
    global.WB.calcView.renderMatLines();
    global.WB.calcView.renderPackLines();
    global.WB.calcView.renderCompareBadge && global.WB.calcView.renderCompareBadge();
    global.WB.libsView.init();
    global.WB.quotesView.refresh();
    /* V14：导入/恢复数据后最近使用同步刷新（数据被整体替换时不残留空列表） */
    if (global.WB.calcView.applyRecent) global.WB.calcView.applyRecent();
  }

  global.WB.app = {
    init: init, switchView: switchView, reloadAll: reloadAll,
    updateCrumb: updateCrumb, openGlobalSearch: openGlobalSearch
  };
  /* 启动（确保 DOM 就绪） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
