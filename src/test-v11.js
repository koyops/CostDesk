/* ============================================================
 * test-v11.js — V11 定点修改交付门禁（jsdom 验收）
 * 对应 V11 用户清单 6 项：
 *  1 桌宠不再消失：旧版多精灵/损坏 WB_PET_V2 存档回退默认橘猫；
 *    切板块、二次刷新后仍渲染（含旧版顶层 x/y 迁移）
 *  2 商务参数「杂费」字段删除：DOM 无 f-misc、默认核算态无 misc 键、
 *    页面可见文本无「杂费」字样、无 calcMisc 联动残留
 *  3 商务参数底部灰色说明小字删除：字段下拉（人工/半自动/全自动）保留，
 *    卡片末尾无说明块、排版不错乱
 *  4 四板块独立重置：产品/商务/原料/包材各自「重置」按钮 + 确认弹窗；
 *    取消不执行；确认只清本板块
 *  5 一键全重置：工具区「全重置」按钮 + 确认弹窗（含范围文案）；
 *    确认后四板块清空、核算面板回到待核算态
 *  6 重置只清「当前录入态」：原料价格库/包材库/配方库/报价存档/
 *    设置/宠物数据（WB_PET_V2）等共享持久数据一律不动
 * 运行：node src/build.js 构建后 → node src/test-v11.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'CostDesk.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; console.error('FAIL:', label); }
}
function eq(a, e, label) {
  if (a === e) pass++;
  else { fail++; console.error('FAIL:', label, 'expected', JSON.stringify(e), 'got', JSON.stringify(a)); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 构造独立 jsdom 实例；seed(window) 在脚本执行前写入 localStorage */
function boot(seedFn, tag) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  const dom = new JSDOM(html, {
    url: 'http://localhost/oem-v3.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.URL.createObjectURL = window.URL.createObjectURL || function () { return 'blob:fake'; };
      window.URL.revokeObjectURL = window.URL.revokeObjectURL || function () {};
      window.print = function () {};
      window.scrollTo = function () {};
      window.Image = window.Image || function () { this.onload = null; this.onerror = null; this.src = ''; };
      if (seedFn) { try { seedFn(window); } catch (e) { errors.push('seed error: ' + e.message); } }
    }
  });
  return { dom: dom, window: dom.window, document: dom.window.document, errors: errors };
}

/* 弹窗工具：取最近一个 modal-mask，按文案点底部按钮 */
function modalFootBtn(doc, text) {
  const masks = doc.querySelectorAll('#modalRoot .modal-mask');
  const m = masks[masks.length - 1];
  if (!m) return null;
  const btns = m.querySelectorAll('.modal-foot button');
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === text) return btns[i];
  }
  return null;
}
function modalCount(doc) { return doc.querySelectorAll('#modalRoot .modal-mask').length; }

/* 取当前草稿（localStorage）解析后的 calc */
function draftCalc(win) {
  try {
    const raw = win.localStorage.getItem('wb_oem_v2_draft');
    if (!raw) return null;
    return JSON.parse(raw).calc;
  } catch (e) { return null; }
}

(async () => {
  try {
    /* ============================================================
     * 场景 A：干净存档实例 —— 完成 ②③④⑤⑥ 主流程
     * ============================================================ */
    const A = boot(null, 'clean');
    const { window: win, document: doc } = A;
    const document = doc; /* 场景 A 内全局 document 即 jsdom 文档 */
    const { WB } = win;
    const S = WB.store, U = WB.ui, C = WB.calc, P = WB.pet;
    const state = S.state;

    await sleep(220); /* 等待初始化收尾 */

    ok(A.errors.length === 0, '① 干净实例加载 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');

    /* ---------- ② 杂费字段删除（#73） ---------- */
    eq(document.getElementById('f-misc'), null, '② DOM 不存在 #f-misc（杂费输入框已删）');
    ok(!('misc' in S.defaultCalc()), '② defaultCalc() 不含 misc 键（核算默认态无杂费）');
    ok(!('misc' in state.calc), '② 当前 state.calc 不含 misc 键');
    ok(!('calcMisc' in C), '② 计算引擎无 calcMisc API 残留');
    /* 只扫「可见文本」：body.textContent 会含内联 <script> 源码（其中有旧档兼容注释），需剔除 */
    const visibleRoot = doc.body.cloneNode(true);
    visibleRoot.querySelectorAll('script, style, template').forEach((n) => n.remove());
    ok(visibleRoot.textContent.indexOf('杂费') < 0, '② 页面可见文本无「杂费」字样');
    const bizFields = ['f-moq', 'f-factoryMoq', 'f-ladder', 'f-taxInc', 'f-tax', 'f-profit', 'f-admin', 'f-processFee', 'f-premium', 'f-testFee', 'f-freight', 'f-fx'];
    bizFields.forEach((id) => ok(!!document.getElementById(id), '② 商务参数字段保留：#' + id));

    /* ---------- ③ 底部说明小字删除（#74） ---------- */
    const bizBody = document.getElementById('bizBody');
    const bizChildren = Array.prototype.slice.call(bizBody.children);
    ok(bizChildren.length >= 12 && bizChildren.every((el) => el.classList && el.classList.contains('field')),
      '③ 商务参数体仅由字段(label.field)组成，无说明小字段/段落混入（' + bizChildren.length + ' 个字段）');
    const lastField = bizChildren[bizChildren.length - 1];
    ok(!!lastField && !!lastField.querySelector('#f-fx'), '③ 商务参数最后一项为「汇率 f-fx」，其后无底部说明块');
    ok(!document.querySelector('#card-biz .card-note, #card-biz .biz-note, #card-biz .form-note, #card-biz [class*="-note"]:not(.card-note)'),
      '③ #card-biz 内无 .card-note/.biz-note/.form-note 等说明尾巴');
    ok(!document.getElementById('f-processLevel'), '③ V13 人工档位下拉已删除（无 f-processLevel）');
    const feeEl = document.getElementById('f-processFee');
    ok(!!feeEl && feeEl.tagName === 'INPUT' && feeEl.getAttribute('data-trigger') === 'calc',
      '③ V13 人工费为手填数值输入框（data-trigger=calc 实时联动）');

    /* ---------- ① 桌宠基础（干净存档） ---------- */
    const petRoot = document.getElementById('petRoot');
    ok(!!petRoot && !!document.getElementById('petBody'), '① #petRoot/#petBody 挂载（干净存档桌宠渲染）');
    ok(P.getSpecies() === 'cat', '① 干净存档默认物种=cat（橘猫）');
    const petSvg = document.querySelector('#petBody svg.pet-svg');
    ok(!!petSvg &&
      Array.prototype.every.call(petSvg.querySelectorAll('image'), im => String(im.getAttribute('href') || '').indexOf('data:image/') === 0) &&
      petSvg.querySelectorAll('foreignObject').length === 0,
      '① 桌宠为内联贴图 SVG（零外链 / 无 HTML 外挂）');

    /* ---------- ② 旧档报价兼容（无杂费字段按 0 处理，不崩） ---------- */
    const oldQ = {
      id: S.genId('q'), quoteNo: 'OLD-MISC-001', name: '老档含杂费', customer: '旧客户', date: '2026-06-01',
      biz: { moq: 3000, taxInc: 'extax', tax: 13, profit: 30, admin: 0, processLevel: '人工', testFee: 5, freight: 0, fx: 1, misc: 12.34 },
      calc: S.defaultCalc(), items: [], amount: 0, status: 'quoted', createdAt: '2026-06-01T00:00:00.000Z'
    };
    state.data.quotes.push(oldQ);
    let oldOk = true;
    try {
      /* 复用 V10 兼容读取路径：quotesView 读档不因 misc 而崩，且 misc 不进入核算态 */
      if (WB.quotesView && typeof WB.quotesView.openQuoteDetail === 'function') {
        WB.quotesView.openQuoteDetail(oldQ.id);
        const m = doc.querySelectorAll('#modalRoot .modal-mask');
        const last = m[m.length - 1];
        if (last) last.querySelectorAll('.modal-close').forEach((b) => b.click());
      }
    } catch (e) { oldOk = false; }
    ok(oldOk, '② 打开含旧杂费字段的报价存档不抛异常（兼容读取，杂费忽略）');
    const visClone2 = doc.body.cloneNode(true);
    visClone2.querySelectorAll('script, style, template').forEach((n) => n.remove());
    ok(visClone2.textContent.indexOf('杂费') < 0, '② 存档详情渲染不出现「杂费」条目');

    /* ============ ④ 四板块独立重置（#75） ============ */
    /* 准备：产品/商务/原料/包材四板块都填入数据 */
    const libMatCount0 = state.data.materials.length;
    const libPackCount0 = state.data.packaging.length;
    const libFormCount0 = state.data.formulas.length;
    const libQuoteCount0 = state.data.quotes.length;
    const petRaw0 = win.localStorage.getItem('WB_PET_V2');

    const ma = state.data.materials[0];
    const mb = state.data.materials[1] || ma;
    if (ma && (!ma.suppliers || !ma.suppliers.length)) ma.suppliers = [{ id: S.genId('sup'), supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', validUntil: '', source: 'manual', isDefault: true }];
    if (mb && ma !== mb && (!mb.suppliers || !mb.suppliers.length)) mb.suppliers = [{ id: S.genId('sup'), supplierName: '供应商B', price: 12, currency: 'CNY', quoteDate: '2026-08-01', validUntil: '', source: 'manual', isDefault: true }];
    const pk = state.data.packaging[0];
    ok(!!ma && !!mb && !!pk, '④ 种子原料/包材库可复用（materials≥1 且 packaging≥1）');

    state.calc.name = 'V11门禁·多板块方案';
    state.calc.customer = '门禁客户';
    state.calc.weight = 3; state.calc.count = 60; state.calc.net = '180g'; state.calc.box = '12瓶/箱';
    state.calc.moq = 9000; state.calc.factoryMoq = 2000; state.calc.tax = 13; state.calc.profit = 45;
    state.calc.admin = 2; state.calc.processFee = 0.35; state.calc.testFee = 3; state.calc.freight = 1; state.calc.fx = 1;
    state.calc.mats = [
      { id: 'v11m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' },
      { id: 'v11m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: 12, currency: 'CNY', isTemp: false, altHint: '' }
    ];
    state.calc.packs = [{ id: 'v11p1', packagingId: pk.id, name: pk.name, supplierName: '包材商A', price: pk.price || 0.5, currency: 'CNY', qtyPerUnit: 1, isTemp: false, altHint: '' }];
    WB.calcView.fillCalc();
    WB.calcView.renderMatLines();
    WB.calcView.renderPackLines();
    S.saveDraft(); /* 直接改 state 不触发输入事件，手动落一次草稿作为重置基线 */
    ok(win.localStorage.getItem('wb_oem_v2_draft') !== null, '④ 填数据后草稿已写入（后续验证重置只清录入态）');

    const prodBtn = document.getElementById('btnResetProd');
    const bizBtn = document.getElementById('btnResetBiz');
    const matsBtn = document.getElementById('btnResetMats');
    const packsBtn = document.getElementById('btnResetPacks');
    const allBtn = document.getElementById('btnResetAll');
    ok(!!prodBtn && !!bizBtn && !!matsBtn && !!packsBtn, '④ 四板块各自有独立重置按钮（product/biz/mats/packs）');
    ok(!!allBtn, '⑤ 核算台工具区有「一键全重置」按钮');

    /* --- 4a. 产品参数重置：取消不执行 --- */
    const bizCollapsedBefore = document.getElementById('card-biz').classList.contains('collapsed');
    prodBtn.click();
    eq(modalCount(doc), 1, '④a 点「产品参数重置」弹出确认弹窗');
    const t1 = doc.querySelector('#modalRoot .modal-mask .modal-head h3');
    ok(!!t1 && t1.textContent.indexOf('重置') >= 0, '④a 弹窗标题含重置确认（' + (t1 ? t1.textContent : '') + '）');
    const cancels = modalFootBtn(doc, '取消');
    ok(!!cancels, '④a 弹窗提供「取消」');
    const calcSnapCancel = JSON.stringify(state.calc);
    cancels.click();
    eq(modalCount(doc), 0, '④a 点取消后弹窗关闭');
    eq(JSON.stringify(state.calc), calcSnapCancel, '④a 取消不执行任何清空');
    eq(document.getElementById('card-biz').classList.contains('collapsed'), bizCollapsedBefore,
      '④a 重置按钮点击未误触发卡片折叠（stopPropagation 生效）');

    /* --- 4b. 产品参数重置：确认只清产品板块 --- */
    prodBtn.click();
    const confirmReset1 = modalFootBtn(doc, '确认重置');
    ok(!!confirmReset1, '④b 弹窗提供「确认重置」');
    confirmReset1.click();
    eq(state.calc.name, '', '④b 确认后方案名称清空');
    eq(state.calc.weight, '', '④b 确认后克重清空（回录入空态）');
    eq(state.calc.moq, 9000, '④b 商务参数 MOQ 保留（9000 未被动）');
    eq(state.calc.mats.length, 2, '④b 原料清单保留（2 行未被动）');
    eq(state.calc.packs.length, 1, '④b 包材清单保留（1 行未被动）');
    eq(document.getElementById('f-name').value, '', '④b 表单同步清空（方案名输入框）');

    /* --- 4c. 商务参数重置：确认只清商务板块（恢复默认） --- */
    bizBtn.click();
    const confirmReset2 = modalFootBtn(doc, '确认重置');
    ok(!!confirmReset2, '④c 商务重置弹窗可确认');
    confirmReset2.click();
    eq(state.calc.moq, 5000, '④c 商务 MOQ 恢复默认 5000');
    eq(state.calc.profit, 30, '④c 目标利润率恢复默认 30');
    eq(state.calc.processFee, 0, '④c 人工费恢复默认 0（V13 手填）');
    eq(state.calc.testFee, 0, '④c 检测附加费恢复默认 0');
    eq(state.calc.mats.length, 2, '④c 原料清单仍保留（2 行）');
    eq(state.calc.packs.length, 1, '④c 包材清单仍保留（1 行）');
    eq(state.calc.name, '', '④c 产品参数保持已重置态（方案名为空）');

    /* --- 4d. 原料清单重置：只清原料行 --- */
    matsBtn.click();
    const confirmReset3 = modalFootBtn(doc, '确认重置');
    ok(!!confirmReset3, '④d 原料重置弹窗可确认');
    confirmReset3.click();
    eq(state.calc.mats.length, 0, '④d 原料清单清空（0 行）');
    eq(state.calc.packs.length, 1, '④d 包材清单保留（1 行）');
    eq(state.calc.moq, 5000, '④d 商务参数保持默认/未被连带');
    eq(state.data.materials.length, libMatCount0, '④d 原料价格库条目数不变（共享数据未动）');

    /* --- 4e. 包材清单重置：只清包材行；全部清单清空后核算面板回待核算 --- */
    packsBtn.click();
    const confirmReset4 = modalFootBtn(doc, '确认重置');
    ok(!!confirmReset4, '④e 包材重置弹窗可确认');
    confirmReset4.click();
    eq(state.calc.packs.length, 0, '④e 包材清单清空（0 行）');
    eq(state.data.packaging.length, libPackCount0, '④e 包材库条目数不变');
    await sleep(430);
    ok(document.getElementById('resultState').textContent.indexOf('待核算') >= 0,
      '④e 原料/包材均清空 → 核算面板回到待核算态（' + document.getElementById('resultState').textContent + '）');

    /* ============ ⑤ 一键全重置（#75） ============ */
    state.calc.name = '全重置前方案';
    state.calc.mats = [{ id: 'v11m3', materialId: ma.id, name: ma.name, ratio: 100, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' }];
    state.calc.packs = [{ id: 'v11p2', packagingId: pk.id, name: pk.name, supplierName: '包材商A', price: 0.5, currency: 'CNY', qtyPerUnit: 1, isTemp: false, altHint: '' }];
    WB.calcView.fillCalc();
    WB.calcView.renderMatLines();
    WB.calcView.renderPackLines();

    allBtn.click();
    eq(modalCount(doc), 1, '⑤ 点「全重置」弹出确认弹窗');
    const allTxt = doc.querySelector('#modalRoot .modal-mask .modal-body').textContent;
    ok(allTxt.indexOf('四个基础板块') >= 0, '⑤ 弹窗说明覆盖四个板块范围');
    ok(allTxt.indexOf('原料价格库') >= 0 && allTxt.indexOf('报价存档') >= 0, '⑤ 弹窗声明不影响共享持久数据');
    /* 先取消一次 */
    const cancels2 = modalFootBtn(doc, '取消');
    ok(!!cancels2, '⑤ 全重置弹窗提供「取消」');
    cancels2.click();
    eq(state.calc.mats.length, 1, '⑤ 取消后不清空原料清单');
    /* 再确认 */
    allBtn.click();
    const confirmAll = modalFootBtn(doc, '确认全重置');
    ok(!!confirmAll, '⑤ 全重置弹窗提供「确认全重置」');
    confirmAll.click();
    eq(state.calc.name, '', '⑤ 全重置后方案名称清空');
    eq(state.calc.mats.length, 0, '⑤ 全重置后原料清单清空');
    eq(state.calc.packs.length, 0, '⑤ 全重置后包材清单清空');
    eq(state.calc.moq, 5000, '⑤ 全重置后商务参数回默认（MOQ 5000）');
    eq(document.getElementById('f-name').value, '', '⑤ 表单同步（方案名空）');
    ok(document.getElementById('resultState').textContent.trim().indexOf('待核算') >= 0,
      '⑤ 全重置后核算面板回到待核算态（' + document.getElementById('resultState').textContent + '）');

    /* ============ ⑥ 共享持久数据不动（#75/#72 契约） ============ */
    eq(state.data.materials.length, libMatCount0, '⑥ 原料价格库条目数全程不变');
    eq(state.data.packaging.length, libPackCount0, '⑥ 包材库条目数全程不变');
    eq(state.data.formulas.length, libFormCount0, '⑥ 配方库条目数全程不变');
    eq(state.data.quotes.length, libQuoteCount0, '⑥ 报价存档条目数全程不变');
    eq(win.localStorage.getItem('WB_PET_V2'), petRaw0, '⑥ 桌宠持久数据（WB_PET_V2）未被重置触碰');
    ok(!!win.localStorage.getItem('wb_oem_v2_data'), '⑥ 主数据存档仍在（未整体清库）');
    const dc = draftCalc(win);
    ok(dc && dc.mats.length === 0 && dc.packs.length === 0, '⑥ 草稿中的当前录入态已清空（仅录入态受影响）');

    /* ⑥ 与②：重置后仍无杂费残留 */
    eq(document.getElementById('f-misc'), null, '⑥+② 重置流程后 #f-misc 依然不存在');
    ok(A.errors.length === 0, '⑥ 场景 A 全程 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');

    /* ============================================================
     * 场景 B：旧版多精灵存档（V6-V9 同 key WB_PET_V2）+ 旧顶层 x/y
     * ============================================================ */
    const legacy = {
      active: 'fire', unlocked: ['fire', 'elec', 'sky'],
      pets: {
        fire: { exp: 12, streak: 3, feeds: 2, name: '小火龙', mood: 'happy' },
        elec: { exp: 8, streak: 1, feeds: 0, name: '', mood: 'idle' },
        sky: { exp: 3, streak: 0, feeds: 0, name: '', mood: 'idle' }
      },
      mini: false,
      x: 137, y: 286,            /* 旧版顶层位置 */
      mood: 'happy', logs: []
    };
    const B = boot((w) => w.localStorage.setItem('WB_PET_V2', JSON.stringify(legacy)), 'legacy-pets');
    await sleep(220);
    const WB2 = B.window.WB, P2 = WB2.pet, doc2 = B.window.document;
    ok(B.errors.length === 0, '① 旧多精灵存档加载 0 console.error/jsdomError（' + B.errors.slice(0, 3).join('; ') + '）');
    eq(P2.getSpecies(), 'cat', '① 旧多精灵存档（active=fire）→ 回退默认橘猫 cat');
    ok(!!doc2.getElementById('petBody'), '① 旧存档下 #petBody 正常渲染');
    const pos2 = P2.getPos();
    eq(pos2.x, 137, '① 旧顶层 x/y 迁移为 pos（x=137 保留）');
    eq(pos2.y, 286, '① 旧顶层 x/y 迁移为 pos（y=286 保留）');
    ok(P2.getCount() >= 0 && P2.getLevel() >= 1 && P2.getLevel() <= 3,
      '① 回退后橘猫经验/等级合法（count=' + P2.getCount() + '，等级经验由报价金额同步，与旧物种存档无关）');
    eq(P2.getStreak(), 0, '① 旧物种连胜 streak 不误嫁接到橘猫');
    eq(P2.getFeeds(), 0, '① 旧物种喂食次数 feeds 不误嫁接到橘猫');
    ok(P2.getName().indexOf('小火龙') < 0, '① 旧物种昵称「小火龙」不误嫁接到橘猫（实际：' + P2.getName() + '）');
    /* 切板块不消失 */
    const navMats = doc2.querySelector('.nav-item[data-view="mats"]');
    const navCalc = doc2.querySelector('.nav-item[data-view="calc"]');
    if (navMats && navCalc) {
      navMats.click();
      ok(!!doc2.getElementById('petBody'), '① 切到「原料价格库」板块桌宠仍在');
      navCalc.click();
      ok(!!doc2.getElementById('petBody'), '① 切回「核算台」板块桌宠仍在');
    } else {
      ok(false, '① 顶部板块导航存在（可验证切板块不消失）');
    }
    /* 二次刷新（模拟：清空宠物 DOM 后重新 init）不消失 */
    doc2.getElementById('petRoot').innerHTML = '';
    WB2.pet.init();
    ok(!!doc2.getElementById('petBody') && !!doc2.querySelector('#petBody svg.pet-svg'),
      '① 刷新（重新 init）后桌宠重新渲染不消失');
    const imgs2 = doc2.querySelectorAll('#petBody svg.pet-svg image');
    eq(
      imgs2.length >= 7 &&
      Array.prototype.every.call(imgs2, im => String(im.getAttribute('href') || '').indexOf('data:image/') === 0) &&
      doc2.querySelectorAll('#petBody foreignObject').length === 0,
      true, '① 刷新后仍为内联贴图（' + imgs2.length + ' 层 data URI）'
    );

    /* ============================================================
     * 场景 C：损坏存档 / 结构残缺 → 兜底默认橘猫，不崩
     * ============================================================ */
    const C1 = boot((w) => w.localStorage.setItem('WB_PET_V2', '{oops not json'), 'corrupt-json');
    await sleep(220);
    ok(C1.errors.length === 0, '① 损坏 JSON（WB_PET_V2）加载 0 报错');
    ok(!!C1.document.getElementById('petBody'), '① 损坏 JSON 下桌宠仍渲染默认橘猫');

    const C2 = boot((w) => w.localStorage.setItem('WB_PET_V2', JSON.stringify({ active: 'sky', pets: { sky: { exp: 50 } }, mini: true })), 'no-cat-archive');
    await sleep(220);
    eq(C2.window.WB.pet.getSpecies(), 'cat', '① 无猫存档（active=sky）→ 兜底 cat');
    ok(!!C2.document.getElementById('petBody'), '① 无猫存档下渲染不缺失');

    const C3 = boot((w) => w.localStorage.setItem('WB_PET_V2', JSON.stringify({ active: 'cat', pets: [ { id: 'cat' } ] })), 'array-pets');
    await sleep(220);
    ok(C3.errors.length === 0, '① 旧数组 pets 结构加载 0 报错');
    eq(C3.window.WB.pet.getSpecies(), 'cat', '① 旧数组 pets 结构 → 兜底为对象结构 cat');

    /* ============ 汇总 ============ */
    console.log('\nV11 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
})();
