/* ============================================================
 * ui-common.js — 公共 UI 工具：DOM 选择器 / 转义 / toast / 弹窗 / 下载
 * ============================================================ */
(function (global) {
  'use strict';
  var calc = global.WB.calc;

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Toast 自动消失
   * V14：第 4 个参数 onClick 可选 —— 传入后 toast 变为可点击（如「还差：剂型」点击定位到缺失字段）。
   * 向后兼容：原有三参调用行为完全不变。 */
  function toast(msg, type, ms, onClick) {
    var root = $('toastRoot');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '') + (onClick ? ' toast-act' : '');
    t.textContent = msg;
    if (onClick) {
      t.setAttribute('role', 'button');
      t.setAttribute('tabindex', '0');
      t.title = '点击定位到缺失字段';
      var fire = function () {
        if (t.parentNode) t.parentNode.removeChild(t);
        onClick();
      };
      t.addEventListener('click', fire);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    }
    root.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 3000);
  }

  /* 通用弹窗：html 为 body 内容，footBtns = [{text, cls, onClick}] */
  function openModal(html, opts) {
    opts = opts || {};
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    var m = document.createElement('div');
    m.className = 'modal' + (opts.wide ? ' wide' : '');
    m.innerHTML =
      '<div class="modal-head"><h3>' + esc(opts.title || '') + '</h3>' +
      '<button type="button" class="modal-close">×</button></div>' +
      '<div class="modal-body">' + html + '</div>' +
      '<div class="modal-foot"></div>';
    var foot = m.querySelector('.modal-foot');
    (opts.footBtns || [{ text: '关闭', cls: '', onClick: null }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.cls ? ' ' + b.cls : '');
      btn.textContent = b.text;
      btn.addEventListener('click', function () {
        if (b.onClick && b.onClick() === false) return; // 返回 false 不关闭
        close();
      });
      foot.appendChild(btn);
    });
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    m.querySelector('.modal-close').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask && !opts.static) close(); });
    mask.appendChild(m);
    $('modalRoot').appendChild(mask);
    return { el: m, close: close, foot: foot, mask: mask };
  }

  /* 确认对话框 */
  function confirmDlg(msg, onOk, okText) {
    openModal('<p style="font-size:14px">' + msg + '</p>', {
      title: '操作确认',
      footBtns: [
        { text: '取消', cls: '' },
        { text: okText || '确认', cls: 'btn-primary', onClick: function () { onOk && onOk(); } }
      ]
    });
  }

  /* 文件下载 */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }

  /* 千分位输入（oninput 时调用，光标保持） */
  function fmtInput(input) {
    var pos = input.selectionStart;
    var v = input.value.replace(/[^\d.]/g, '');
    var parts = v.split('.');
    var intP = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    input.value = parts.length > 1 ? intP + '.' + (parts[1] || '') : intP;
    input.setSelectionRange(Math.min(pos, input.value.length), Math.min(pos, input.value.length));
  }

  /* ============================================================
   * V4 线性图标系统（Lucide 风格，1.7px 描边内联 SVG，零外部依赖）
   * 用法：ic('zap', 16) → '<svg ...>…</svg>'；替代全站 emoji 功能图标
   * ============================================================ */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    printer: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    text: '<path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M12 4v16"/><path d="M8 20h8"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    pills: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    arrowup: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
    package: '<path d="m7.5 4.3 9 5.1"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    flask: '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4L14.2 10.4a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7M7 16h10"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
    layers: '<path d="m12 2-10 5 10 5 10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v-4M12 15V7M17 15v-6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    swap: '<path d="m8 3-4 4 4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
    dna: '<path d="M2 15c6.7-9 13.3 3 20-6"/><path d="M2 9c6.7 9 13.3-3 20 6"/><path d="M9 2c1 4 1 16 0 20M15 2c-1 4-1 16 0 20"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'
  };
  function ic(name, size, cls) {
    var s = size || 16;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* V8：工艺档位规范化为「人工 / 半自动 / 全自动」三级。
   * 旧档名兼容映射（普通→人工、复杂/加难→半自动、定制→全自动），
   * 保证既有核算结果与历史记录数值完全不变；非映射名（自定义档）原样保留。 */
  var PROC_IDX = { '人工': 0, '普通': 0, '半自动': 1, '复杂': 1, '加难': 1, '全自动': 2, '定制': 2 };
  var PROC_LABELS = ['人工', '半自动', '全自动'];
  function procIdx(l) {
    return (l in PROC_IDX) ? PROC_IDX[l] : 0;
  }
  function procLabel(l) {
    if (!l) return PROC_LABELS[0];
    return (l in PROC_IDX) ? PROC_LABELS[Math.min(Math.max(PROC_IDX[l], 0), 2)] : String(l);
  }

  global.WB.ui = {
    $: $, $$: $$, esc: esc, toast: toast,
    openModal: openModal, confirmDlg: confirmDlg,
    download: download, debounce: debounce, fmtInput: fmtInput,
    ic: ic, ICONS: ICONS,
    num: calc.num, fmt: calc.fmt, money: calc.money, pct: calc.pct,
    procIdx: procIdx, procLabel: procLabel, PROC_LABELS: PROC_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
