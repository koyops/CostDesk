/* ============================================================
 * test-v8.js — V8 交付自检（jsdom 验收）
 * 覆盖 12 项自检：
 *   ① 工艺复杂度→人工方式（三级下拉 + 旧档名映射费率恒等 + 实时联动）
 *   ② 桌宠养成（V10 招财橘猫 × 三体型：仅体型进化无闪耀 / 单宠经验三档 /
 *      面板三格进度链 / 自检日志 / 拖动记忆不跟随鼠标 / V2 存储）
 *   ③ 品牌区层级（图标 + CostDesk + 单行副标，无堆叠文字）
 *   ④ 消除空缺感（必填占位全量 / 双栏网格 / 空状态四入口 / 摘要条省略不丢信息）
 *   ⑤ 结果区重排（横幅→2×2→饼图→明细→整单高亮→MOQ阶梯→底部操作，
 *      千分位右对齐、按钮文字完整、横向滚动不挤压）
 *   ⑥ 零 emoji / 零外链 / 零运行期错误
 * 运行：node src/test-v8.js （先 node src/build.js 构建）
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'CostDesk.html'), 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));

const dom = new JSDOM(html, {
  url: 'http://localhost/oem-v3.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole
});
const { window } = dom;
const { document } = window;
window.URL.createObjectURL = window.URL.createObjectURL || function () { return 'blob:fake'; };
window.URL.revokeObjectURL = window.URL.revokeObjectURL || function () {};
window.print = function () {};
window.scrollTo = function () {};
window.Image = window.Image || function () { this.onload = null; this.onerror = null; this.src = ''; };

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; console.error('FAIL:', label); }
}
function eq(a, e, label) {
  if (a === e) pass++;
  else { fail++; console.error('FAIL:', label, 'expected', e, 'got', a); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function cssText() {
  let out = '';
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const rules = document.styleSheets[i].cssRules;
      for (let j = 0; j < rules.length; j++) out += rules[j].cssText + '\n';
    } catch (e) {
      const n = document.styleSheets[i].ownerNode;
      if (n && n.textContent) out += n.textContent;
    }
  }
  return out;
}
const cssMin = () => cssText().replace(/\s+/g, '');

setTimeout(async () => {
  try {
    const WB = window.WB;
    const S = WB.store, U = WB.ui, P = WB.pet;
    const state = S.state;

    /* ============ V1 ③ 品牌区层级：图标 + CostDesk + 单行副标 ============ */
    const brandName = document.querySelector('.sidebar .brand-name');
    const brandSub = document.querySelector('.sidebar .brand-sub');
    ok(!!brandName && brandName.textContent.trim() === 'CostDesk', 'V1 品牌主标题 CostDesk（16-18px 加粗深色系）');
    const bnFs = brandName && parseFloat(window.getComputedStyle(brandName).fontSize);
    ok(bnFs >= 15.5 && bnFs <= 18.5, 'V1 主标题字号 15.5-18.5px（实际 ' + bnFs + 'px）');
    ok(!!brandSub && brandSub.textContent.indexOf('成本台') >= 0, 'V1 单行副标含「成本台 · 采购快速报价」');
    const bsFs = brandSub && parseFloat(window.getComputedStyle(brandSub).fontSize);
    ok(bsFs >= 10 && bsFs <= 13, 'V1 副标字号 10-13px（实际 ' + bsFs + 'px）');
    const brandText = document.querySelector('.sidebar .brand-text');
    eq(brandText ? brandText.children.length : -1, 2, 'V1 品牌文字区仅两个子元素（主标题+副标），无堆叠');
    const logo = document.querySelector('.sidebar .brand-logo.brand-cd svg');
    ok(!!logo, 'V1 品牌图标存在（内联 SVG）');
    const lgW = logo && parseFloat(window.getComputedStyle(logo).width);
    ok(lgW >= 36 && lgW <= 42, 'V1 图标约 40px（实际 ' + lgW + 'px）');
    const brandHtml = document.querySelector('.sidebar .brand').innerHTML;
    ok(brandHtml.indexOf('nav-item') < 0 && (brandHtml.match(/<span/g) || []).length === 4,
      'V1 品牌区内仅 4 个 span（logo/文字块/主标题/副标），无其它文字堆叠');

    /* ============ V2 ④ 消除空缺感：占位标签 / 双栏对齐 / 空状态 / 摘要条 ============ */
    const requiredIds = ['f-name', 'f-customer', 'f-weight', 'f-count', 'f-net', 'f-box', 'f-moq',
      'f-factoryMoq', 'f-ladder', 'f-tax', 'f-profit', 'f-admin', 'f-premium', 'f-testFee',
      'f-freight', 'f-processFee'];
    let phMissing = [];
    requiredIds.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) { phMissing.push(id + '(缺失)'); return; }
      const wrap = el.closest('.field');
      const labelOk = !!wrap && !!wrap.querySelector('.f-label') && wrap.querySelector('.f-label').textContent.replace(/[*ⓘ\s]/g, '').length > 0;
      if (el.tagName === 'SELECT') { if (!labelOk) phMissing.push(id + '(无标签)'); return; }
      const ph = (el.getAttribute('placeholder') || '').trim();
      const val = el.getAttribute('value');          /* 缺省值属性（数字默认值也算填充，不空白） */
      if (!ph && (val === null || val === '')) phMissing.push(id + '(占位空且无缺省值)');
      if (!labelOk) phMissing.push(id + '(无标签)');
    });
    eq(phMissing.length, 0, 'V2 必填字段占位/标签全量（缺失: ' + phMissing.join(',') + '）');
    ok(!!document.getElementById('card-product') && !!document.getElementById('card-biz'),
      'V2 产品/商务双卡片并存（两栏对齐）');
    const cssM = cssMin();
    ok(cssM.indexOf('grid-template-columns:minmax(0,1fr)minmax(0,1fr)') >= 0, 'V2 双栏网格 calc-grid-2 两列等宽');
    ok(cssM.indexOf('minmax(230px,1fr)') >= 0, 'V2 表单 .form-grid 自适应两列（行高统一）');
    ok(!document.getElementById('ctbSummary') && document.getElementById('calcTopbar'),
      'V13 顶部方案摘要条已删除（工具栏保留且无 ctbSummary）');
    const calcEmpty = document.getElementById('calcEmpty');
    const emptyShown = calcEmpty && (calcEmpty.style.display !== 'none' || window.getComputedStyle(calcEmpty).display !== 'none');
    ok(!!calcEmpty && emptyShown, 'V2 无数据时空状态四入口展示（不出现标题无内容的空白区）');

    /* ============ V3 ①→V13 工艺档位下拉已移除，改为「人工费（元/份）」手填 ============ */
    ok(!document.getElementById('f-processLevel'), 'V13 人工档位下拉已删除（无 f-processLevel）');
    const feeInput = document.getElementById('f-processFee');
    ok(!!feeInput && feeInput.tagName === 'INPUT' && feeInput.getAttribute('data-trigger') === 'calc',
      'V13 人工费为手填数值输入框且带实时联动触发');
    eq(String(feeInput.value || '0'), '0', 'V13 人工费默认 0');
    eq(U.procIdx('普通'), 0, 'V3 旧档 普通 → idx0 = 人工');
    eq(U.procIdx('复杂'), 1, 'V3 旧档 复杂 → idx1 = 半自动');
    eq(U.procIdx('加难'), 1, 'V3 旧档 加难 → idx1 = 半自动');
    eq(U.procIdx('定制'), 2, 'V3 旧档 定制 → idx2 = 全自动');
    eq(U.procLabel('普通'), '人工', 'V3 旧档名 普通 归一为 人工');
    eq(U.procLabel('加难'), '半自动', 'V3 旧档名 加难 归一为 半自动');
    eq(U.procLabel('定制'), '全自动', 'V3 旧档名 定制 归一为 全自动');
    eq(U.procLabel(''), '人工', 'V3 空档名回退 人工');
    eq(U.procLabel('自定义新档'), '自定义新档', 'V3 未映射档名原样透传（费率走自定义精确匹配）');

    /* ============ V4 ② V10 桌宠：单只招财橘猫 × 三体型 ============ */
    const list0 = P.listSpecies();
    eq(list0.length, 1, 'V4 图鉴仅 1 只动物系桌宠（橘猫，扩展位预留）');
    const names = list0.map(x => x.name);
    ok(names.indexOf('招财橘猫') >= 0, 'V4 桌宠名 招财橘猫');
    const stgOk = list0.every(x => Array.isArray(x.stages) && x.stages.length === 3);
    ok(stgOk, 'V4 仅三体型（幼猫/成猫/大橘），无闪耀形态');
    eq(JSON.stringify(list0[0].stages), JSON.stringify(['幼猫', '成猫', '大橘']), 'V4 进化链 幼猫→成猫→大橘');
    /* 三套内联 SVG = 同一只猫仅体型不同（scale 0.55/1.0/1.45） */
    const catSvg1 = P.svgSpecies('cat', 1);
    const catSvg2 = P.svgSpecies('cat', 2);
    const catSvg3 = P.svgSpecies('cat', 3);
    ok(catSvg1.indexOf('<svg') >= 0 && catSvg1.indexOf('</svg>') > 0, 'V4 幼体为完整内联 SVG（零外部资源）');
    ok(new Set([catSvg1, catSvg2, catSvg3]).size === 3, 'V4 三体型 SVG 各不相同（体型缩放）');
    ok(catSvg3.indexOf('scale(1.45)') > 0 && catSvg1.indexOf('scale(0.55)') > 0, 'V4 终/幼仅差缩放系数（同几何骨架）');
    /* 无闪耀：shiny 参数被忽略 → 与普通最终体完全一致 */
    ok(P.svgSpecies('cat', 3, true) === P.svgSpecies('cat', 3, false), 'V4 无闪耀形态（shiny 参数忽略，形态上限=最终体）');
    ok(catSvg1.indexOf('an-wing') < 0 && catSvg3.indexOf('an-wing') < 0, 'V4 无跨物种新增结构（严禁判若两宠/加翼加鳍）');

    /* ============ V5 ② 桌宠：经验三档 / 无解锁链 / 面板三格 ============ */
    eq(P.getSpecies(), 'cat', 'V5 默认出战 招财橘猫');
    eq(JSON.stringify(P.getUnlocked()), JSON.stringify(['cat']), 'V5 初始解锁 cat（无多只解锁链）');
    P.debugSetCount(10);                        /* exp=10 → 成猫 */
    eq(P.getCount(), 10, 'V5 当前经验=10');
    eq(P.getLevel(), 2, 'V5 Lv 阈值 0/10/30：exp10 → Lv2');
    eq(P.getStage(), 2, 'V5 stage=2（成猫）');
    const bEl0 = document.getElementById('petBody');
    ok(!!bEl0 && bEl0.classList.contains('st2'), 'V5 DOM 同步 st2 形态类');
    P.onQuote();                                /* exp 10→11 */
    eq(P.getCount(), 11, 'V5 报价 +1 exp');
    /* 面板：三体型进度链 */
    bEl0.click();
    ok(bEl0.classList.contains('panel-open'), 'V5 点击展开信息面板');
    ok(document.querySelectorAll('#petPanel .pc-item').length === 3, 'V5 进化链 3 格（幼猫/成猫/大橘）');
    ok(document.querySelectorAll('#petPanel .pc-item.pc-cur').length === 2, 'V5 已完成 2 格点亮（pc-cur）');
    bEl0.click();
    ok(!document.getElementById('petBody').classList.contains('panel-open'), 'V5 再次单击关闭面板（无 X 按钮）');
    P.debugSetCount(0);

    /* ============ V7 ② 自检 / 拖动换位 / 情绪 / 存储 ============ */
    const beforeLogs = P.getLogs().length;
    const sc = P.selfCheck(true);
    ok(Array.isArray(sc), 'V7 手动自检返回 issues 数组（含过期报价预警则非空）');
    eq(P.getLogs().length, beforeLogs + 1, 'V7 自检写入日志 +1');
    const lastLog = P.getLogs()[P.getLogs().length - 1];
    ok(!!lastLog && typeof lastLog.t === 'number' && 'issues' in lastLog, 'V7 日志条目含 t/issues');
    const bubble = document.getElementById('petBubble');
    ok(!!bubble && bubble.classList.contains('show') && bubble.textContent.length > 0, 'V7 自检结果气泡播报');
    P.setPos(200, 120);
    const gp = P.getPos();
    ok(!!gp && Math.abs(gp.x - 200) < 0.5 && Math.abs(gp.y - 120) < 0.5, 'V7 setPos/getPos 一致');
    const v2 = JSON.parse(window.localStorage.getItem('WB_PET_V2') || 'null');
    ok(!!v2 && v2.active === 'cat' && v2.pets && v2.pets.cat, 'V7 数据落 WB_PET_V2（单猫 exp 持久化）');
    const bodyEl = document.getElementById('petBody');
    ok(bodyEl.querySelector('.pet-bubble') !== null || document.getElementById('petBubble') !== null,
      'V7 气泡容器常驻（拖动记忆位置，非跟随鼠标）');
    const docHtml0 = document.documentElement.innerHTML;
    ok(docHtml0.indexOf('pet-follow') < 0, 'V7 无鼠标跟随实现残留（pet-follow）');
    P.setMood('sleep');
    ok(document.getElementById('petBody').classList.contains('sleep'), 'V7 情绪 sleep 生效');
    P.setMood('idle');
    P.setMini(true);
    ok(document.getElementById('petBody').classList.contains('mini'), 'V7 最小化小圆点');
    P.setMini(false);
    ok(!document.getElementById('petBody').classList.contains('mini'), 'V7 还原常驻');

    /* ============ V8 ⑤ 结果区重排：搭可核算表单并一键报价 ============ */
    const dosageSel = document.getElementById('f-dosage');
    const capDosage = state.data.dosageForms.filter(d => d.name === '胶囊')[0] || state.data.dosageForms[0];
    const origDosageId = capDosage.id;
    dosageSel.value = capDosage.id;
    dosageSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('f-name').value = 'V8自检·复合维生素';
    document.getElementById('f-weight').value = 3;
    document.getElementById('f-count').value = 60;
    document.getElementById('f-moq').value = 10000;

    const mats = state.data.materials || [];
    const ma = mats[0] || null, mb = mats[1] || mats[0] || null;
    if (ma && (!ma.suppliers || !ma.suppliers.length)) ma.suppliers = [{ id: 'sA', supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '' }];
    if (mb && ma !== mb && (!mb.suppliers || !mb.suppliers.length)) mb.suppliers = [{ id: 'sB', supplierName: '供应商B', price: 12, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '' }];
    ok(!!ma && !!mb, 'V8 种子原料库可用');
    if (ma && mb) {
      state.calc.mats.push({ id: 'v8m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' });
      state.calc.mats.push({ id: 'v8m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: 12, currency: 'CNY', isTemp: false, altHint: '' });
      const pks = state.data.packagings || [];
      if (pks[0]) state.calc.packs.push({ id: 'v8p1', packagingId: pks[0].id, name: pks[0].name, num: 1 });
      WB.calcView.renderMatLines();
      WB.calcView.renderPackLines();
      WB.calcView.readCalc();
      WB.calcView.runQuote();
      const stTxt = document.getElementById('resultState').textContent;
      ok(stTxt.indexOf('已核算') >= 0, 'V8 一键报价回归：状态=已核算（' + stTxt + '）');
      ok((state.meta.snapshots || []).length >= 1, 'V8 报价自动记录快照');
      ok(!!document.querySelector('#resultBody [data-k="unitCost"].flash'), 'V8 一键报价关键数字整体点亮（flash 类）');
      const body = document.getElementById('resultBody');
      const bi = body.innerHTML;
      /* 层级顺序：横幅 → 2×2 → 饼图 → 明细 → 整单高亮 → MOQ 阶梯 → 底部操作 */
      const orderMarks = ['class="r-big"', '成本构成占比', '成本构成明细', 'class="total-bar"', 'MOQ 阶梯报价', 'result-ops'];
      let prevIdx = -1, orderOk = true;
      orderMarks.forEach(function (m) {
        const idx = bi.indexOf(m);
        if (idx <= prevIdx) orderOk = false;
        prevIdx = idx;
      });
      ok(orderOk && prevIdx > 0, 'V8 结果区层级顺序：2×2 → 饼图占比 → 明细 → 整单蓝条 → MOQ阶梯 → 底部操作');
      const cells = body.querySelectorAll('.r-big .cell');
      eq(cells.length, 4, 'V8 核心指标 2×2 = 4 卡');
      const kset = Array.prototype.map.call(body.querySelectorAll('.r-big .n'), n => n.getAttribute('data-k')).join(',');
      eq(kset, 'unitCost,upTax,inTax,profitRate', 'V8 4 卡 data-k = unitCost/upTax/inTax/profitRate');
      ok(body.querySelector('.pie-svg path.pie-seg') !== null, 'V8 成本构成饼图（SVG 扇区）');
      ok(body.querySelectorAll('.pie-legend .pl-row').length >= 3, 'V8 饼图旁占比图例 ≥3 行');
      const tb = body.querySelector('.total-bar');
      const tbV = tb && tb.querySelector('.tb-v');
      ok(!!tb && !!tbV && tbV.getAttribute('data-k') === 'd-total' && tbV.textContent.indexOf('¥') >= 0,
        'V8 整单成本独立高亮条（.total-bar .tb-v[d-total]）');
      ok(/,/.test(tbV.textContent), 'V8 整单金额含千分位（' + tbV.textContent + '）');
      const ladderWrap = body.querySelector('.ladder-scroll');
      ok(!!ladderWrap && ladderWrap.querySelectorAll('table.ladder-table tr').length >= 2, 'V8 MOQ 阶梯表渲染 ≥2 行');
      ok(ladderWrap.textContent.indexOf('整单金额') >= 0, 'V8 阶梯表头含整单金额');
      const c5 = ladderWrap.querySelector('td[data-k="t0c5"]');
      ok(!!c5 && c5.textContent.indexOf('¥') >= 0, 'V8 阶梯金额右列渲染');
      const opsBtns = body.querySelectorAll('.result-ops button');
      eq(opsBtns.length, 3, 'V8 底部操作 3 键');
      const opsTxt = Array.prototype.map.call(opsBtns, b => b.textContent).join('|');
      ok(opsTxt.indexOf('导出报价单') >= 0 && opsTxt.indexOf('导出 Excel') >= 0 && opsTxt.indexOf('存档') >= 0,
        'V8 操作键文字完整（导出报价单/导出 Excel/存档）');
      ok(cssM.indexOf('overflow-x:auto') >= 0 && cssM.indexOf('ladder-scroll') >= 0, 'V8 阶梯区横向滚动不挤压');
      ok(cssM.indexOf('result-ops') >= 0 && cssM.indexOf('white-space:nowrap') >= 0, 'V8 底部按钮不换行截断');
      ok(cssM.indexOf('text-align:right') >= 0, 'V8 数字右对齐样式在档');

      /* ⑤ 实时联动回归（改配比 → 结果自动刷新） */
      const row1 = document.querySelector('#matList tr.line[data-id="v8m1"]');
      const ratioInp = row1 && row1.querySelector('input.l-ratio');
      ratioInp.value = 30;
      ratioInp.dispatchEvent(new window.Event('input', { bubbles: true }));
      await sleep(600);
      eq(document.getElementById('resultState').textContent.trim(), '✓ 实时核算', 'V8 改配比后状态=✓ 实时核算（实时联动）');

      /* ⑤ 风险横幅：两项无价原料 → err 横幅可展开，不中断 */
      const mc = mats[2] || ma;
      if (mc.suppliers) mc.suppliers = [];
      const mc2 = mats[3] || mats[1] || ma;
      if (mc2.suppliers && mc2 !== ma) mc2.suppliers = [];
      state.calc.mats.push({ id: 'v8m3', materialId: mc.id, name: mc.name + '·无价A', ratio: 0, supplierId: '', supplierName: '', price: 0, currency: 'CNY', isTemp: false, altHint: '' });
      state.calc.mats.push({ id: 'v8m4', materialId: mc2.id, name: mc2.name + '·无价B', ratio: 0, supplierId: '', supplierName: '', price: 0, currency: 'CNY', isTemp: false, altHint: '' });
      WB.calcView.renderMatLines();
      WB.calcView.autoCalc();
      const bnErr = document.querySelector('#resultBody .bn.bn-err');
      ok(!!bnErr && bnErr.textContent.indexOf('原料红') >= 0, 'V8 无价原料红色横幅完整展示（不截断）');
      const bnHead = bnErr && bnErr.querySelector('.bn-head');
      if (bnErr) {
        const bnDetail = bnErr.querySelector('.bn-detail');
        ok(!!bnDetail && bnDetail.style.display === 'none', 'V8 横幅明细可展开（初始收起）');
        bnHead.click();
        ok(bnDetail.style.display === 'block', 'V8 点击横幅头展开明细');
      }
      ok(document.getElementById('resultState').textContent.indexOf('核算') >= 0, 'V8 横幅存在时结果仍渲染（不中断）');
    }

    /* ============ V9 ①→V13 人工费手填实时联动（档位费率依赖已移除） ============ */
    state.calc.processFee = 0;
    WB.calcView.fillCalc();
    const feeEl = document.getElementById('f-processFee');
    const setFee = async function (v) {
      feeEl.value = v;
      feeEl.dispatchEvent(new window.Event('input', { bubbles: true }));
      await sleep(600);
      return document.querySelector('#resultBody [data-k="d-proc"]').textContent;
    };
    const fMan = await setFee('1.23');
    ok(fMan.indexOf('1.23') >= 0, 'V13 手填人工费 1.23 → d-proc=¥1.23（' + fMan + '）');
    eq(document.getElementById('resultState').textContent.trim(), '✓ 实时核算', 'V13 手填人工费实时联动重算');
    const fZero = await setFee('0');
    ok(fZero.indexOf('0') >= 0, 'V13 手填人工费 0 → d-proc=¥0（' + fZero + '）');
    state.calc.processFee = 0;
    WB.calcView.fillCalc();

    /* ============ V10 ④ 空缺感收尾：清空后空状态回归 + 占位符语义 ============ */
    state.calc.mats.length = 0;
    state.calc.packs.length = 0;
    state.calc.name = '';
    WB.calcView.fillCalc();
    const ce2 = document.getElementById('calcEmpty');
    ok(!!ce2 && (ce2.style.display !== 'none' || window.getComputedStyle(ce2).display !== 'none'),
      'V10 清空后空状态四入口重新出现（无“有标题无内容”空白）');
    ok(document.getElementById('f-processFee').value === '0' || document.getElementById('f-processFee').value === '',
      'V13 清空后人工费输入框回 0（无摘要条依赖）');

    /* ============ V11 ② 自检日志封顶 20 条 ============ */
    for (let i = 0; i < 5; i++) P.selfCheck(true);
    ok(P.getLogs().length <= 20, 'V11 自检日志有封顶（当前 ' + P.getLogs().length + '/20）');
    for (let i = 0; i < 25; i++) P.selfCheck(true);
    eq(P.getLogs().length, 20, 'V11 自检日志封顶 20 条（unshift 截断）');
    const lastOk = P.getLogs()[P.getLogs().length - 1];
    ok(!!lastOk && typeof lastOk.issues === 'number', 'V11 日志条目结构含 issues 计数');

    /* ============ V12 ⑥ 零 emoji / 零外部资源（小宠零外链，OCR CDN 除外）/ 零运行期错误 ============ */
    const finalHtml = document.documentElement.innerHTML;
    ok(!/[\u{1F000}-\u{1FAFF}]/u.test(finalHtml), 'V12 全产物无 emoji（astral 扫描）');
    const remoteRes = [];
    document.querySelectorAll('script[src],link[href],img[src]').forEach(function (el) {
      const u = el.src || el.href || '';
      if (/^https?:/i.test(u)) remoteRes.push(el.tagName + ':' + u);
    });
    const nonOcr = remoteRes.filter(function (u) { return u.indexOf('tesseract') < 0 && u.indexOf('jsdelivr') < 0; });
    ok(nonOcr.length === 0, 'V12 运行期除 OCR 引擎(tesseract.js, V4 文档化)外零外部资源（' + nonOcr.join(',') + '）');
    const petRootHtml = document.getElementById('petRoot').innerHTML;
    ok(petRootHtml.indexOf('<script') < 0 && petRootHtml.indexOf('<img') < 0 &&
      petRootHtml.indexOf('src="http') < 0 && petRootHtml.indexOf('href="http') < 0 && petRootHtml.indexOf('url(http') < 0,
      'V12 报价小宠区域零外链（纯内联 SVG/CSS，无 img/script/远程资源）');
    ok(!/<(?:link|img)[^>]+(?:src|href)="http/i.test(html), 'V12 静态产物无 link/img 外链');
    ok(html.indexOf('url(http') < 0, 'V12 CSS 无远程背景图引用');
    ok(errors.length === 0, 'V12 全程 0 console.error / jsdomError（' + errors.slice(0, 3).join('; ') + '）');

    console.log('\nV8 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
}, 200);
