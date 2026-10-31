/* ============================================================
 * test-v7.js — V7 交付自检（jsdom 验收）
 * 覆盖 13 项自检：CostDesk 品牌 / 图标无 emoji / 真·实时联动
 * （原料配比·商务参数·无价容错）/ 一键报价回归 / 宝可梦式小宠
 * （四级形态·喂糖·改名·拖动记忆·进化全屏提示·气泡）/ 零报错
 * 运行：node src/test-v7.js （先 node src/build.js 构建）
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

setTimeout(async () => {
  try {
    const WB = window.WB;
    const S = WB.store, U = WB.ui;
    const state = S.state;

    /* ============ ① 品牌：CostDesk 全站统一 ============ */
    eq(document.title, 'CostDesk · 保健品采购快速报价', 'S1 HTML title = CostDesk');
    const bn = document.querySelector('.brand-name');
    ok(!!bn && bn.textContent.trim() === 'CostDesk', 'S1 侧栏品牌主标题 CostDesk');
    const bs = document.querySelector('.brand-sub');
    ok(!!bs && bs.textContent.indexOf('成本台') >= 0, 'S1 品牌副标含「成本台」');
    const crumb = document.getElementById('crumb');
    ok(!!crumb && crumb.textContent.indexOf('CostDesk') >= 0, 'S1 面包屑品牌 CostDesk');
    const logo = document.querySelector('.brand-logo.brand-cd, .brand-cd svg');
    ok(!!logo, 'S2 CostDesk 品牌图标为内联 SVG（.brand-cd svg）');
    const doc0 = document.documentElement.innerHTML;
    ok(doc0.indexOf('QuoteCore') < 0 && !/报价核(?!算)/u.test(doc0), 'S2 无旧品牌残留（报价核/QuoteCore，报价核算字样除外）');
    ok(!document.querySelector('.brand-logo img, .brand-logo .emoji'), 'S2 品牌图标非 img/非系统图标');

    /* ============ ② 实时联动：单一入口 + 委托覆盖 ============ */
    ok(document.querySelectorAll('[data-trigger="calc"]').length >= 19, 'S3 静态核算控件 data-trigger 委托目标 ≥19 个（V11 删除杂费字段后余量）');
    ok(typeof WB.calcView.autoCalc === 'function' && typeof WB.calcView.runQuote === 'function', 'S3 单一重算入口 autoCalc 导出（recalcAndRender 内部同引用）');

    /* 搭建可核算表单：选剂型 → 填参数 → 绑定价原料/包材 */
    const dosageSel = document.getElementById('f-dosage');
    const capDosage = state.data.dosageForms.filter(d => d.name === '胶囊')[0] || state.data.dosageForms[0];
    dosageSel.value = capDosage.id;
    dosageSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('f-name').value = 'V7自检·复合维生素';
    document.getElementById('f-weight').value = 3;
    document.getElementById('f-count').value = 60;

    const mats = state.data.materials || [];
    const ma = mats[0] || null;
    const mb = mats[1] || mats[0] || null;
    if (ma && (!ma.suppliers || !ma.suppliers.length)) ma.suppliers = [{ id: 'sA', supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '' }];
    if (mb && ma !== mb && (!mb.suppliers || !mb.suppliers.length)) mb.suppliers = [{ id: 'sB', supplierName: '供应商B', price: 12, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '' }];
    ok(!!ma && !!mb, 'S4 种子原料库可用（存在原料）');
    if (ma && mb) {
      state.calc.mats.push({ id: 'v7m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' });
      state.calc.mats.push({ id: 'v7m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: 12, currency: 'CNY', isTemp: false, altHint: '' });
      const pks = state.data.packagings || [];
      if (pks[0]) state.calc.packs.push({ id: 'v7p1', packagingId: pks[0].id, name: pks[0].name, num: 1 });
      WB.calcView.renderMatLines();
      WB.calcView.renderPackLines();
      WB.calcView.readCalc();
      WB.calcView.runQuote();
      const stTxt = document.getElementById('resultState').textContent;
      ok(stTxt.indexOf('已核算') >= 0, 'S7 一键报价回归：状态=已核算（' + stTxt + '）');
      ok((state.meta.snapshots || []).length >= 1, 'S7 一键报价自动记录参数快照');
      const bodyTxt = document.getElementById('resultBody').textContent;
      ok(bodyTxt.indexOf('单份成本') >= 0 && bodyTxt.indexOf('含税') >= 0, 'S7 结果含成本/含税明细');

      /* ③ 实时联动：改原料配比 → 结果自动刷新 */
      const row1 = document.querySelector('#matList tr.line[data-id="v7m1"]');
      ok(!!row1, 'S4 原料行 v7m1 已渲染');
      const ratioInp = row1.querySelector('input.l-ratio');
      ratioInp.value = 30;                       /* 60 → 30，总成本必变 */
      ratioInp.dispatchEvent(new window.Event('input', { bubbles: true }));
      await sleep(430);                          /* > debounce 300ms */
      eq(document.getElementById('resultState').textContent.trim(), '✓ 实时核算', 'S4 改配比后状态=✓ 实时核算');
      const snapAfterRatio = document.getElementById('resultBody').innerHTML;
      ok(snapAfterRatio !== '', 'S4 结果区已重算渲染');
      const row1PriceSpan = row1.querySelector('.mt-price');
      ok(row1PriceSpan && !row1.classList.contains('np'), 'S4 有价原料行无「无价」标红');

      /* ④ 实时联动：改商务参数（利润率）→ 结果自动刷新 */
      const profitInp = document.getElementById('f-profit');
      profitInp.value = (Number(profitInp.value) || 0) + 3;
      profitInp.dispatchEvent(new window.Event('input', { bubbles: true }));
      await sleep(430);
      eq(document.getElementById('resultState').textContent.trim(), '✓ 实时核算', 'S5 改商务参数后状态=✓ 实时核算');

      /* ⑤ 无价容错：新增无供应商原料行 → 不中断、标红、结果仍出 */
      const mc = mats[2] || ma;
      if (mc.suppliers) mc.suppliers = [];
      state.calc.mats.push({ id: 'v7m3', materialId: mc.id, name: mc.name + '·无价', ratio: 0, supplierId: '', supplierName: '', price: 0, currency: 'CNY', isTemp: false, altHint: '' });
      WB.calcView.renderMatLines();
      WB.calcView.autoCalc();                    /* 同步触发重算（np 标红在该入口内完成） */
      const row3 = document.querySelector('#matList tr.line[data-id="v7m3"]');
      ok(!!row3 && row3.classList.contains('np'), 'S6 无价原料行标红（np class）且不中断');
      ok(document.getElementById('resultState').textContent.indexOf('核算') >= 0, 'S6 无价行存在时结果仍渲染');
      ok(errors.length === 0, 'S6 容错链路 0 console.error（' + errors.slice(0, 2).join('; ') + '）');
    }

    /* ============ ⑥ 宝可梦式报价小宠 ============ */
    const petRoot = document.getElementById('petRoot');
    const petBody = petRoot && petRoot.querySelector('.pet-body');
    ok(!!petRoot && !!petBody, 'S8 小宠常驻（#petRoot .pet-body）');
    ok(!!document.getElementById('petBubble'), 'S8 气泡元素 #petBubble 常驻');
    ok(petBody.querySelector('svg.pet-svg') !== null, 'S8 小宠纯内联 SVG');
    ok(WB.pet.calcLevel(0) === 1 && WB.pet.calcLevel(9) === 1 && WB.pet.calcLevel(10) === 2 &&
      WB.pet.calcLevel(29) === 2 && WB.pet.calcLevel(30) === 3 && WB.pet.calcLevel(80) === 3,
      'S8 V10 三体型阈值 0/10/30（80 封顶大橘，无闪耀四级）');

    const c0 = WB.pet.getCount();
    WB.pet.onQuote();
    ok(WB.pet.getCount() === c0 + 1, 'S9 报价成功计数 +1');
    ok(petBody.classList.contains('celebrate'), 'S9 庆祝跳跃动效类 celebrate');
    await sleep(120);
    const bubbleEl = document.getElementById('petBubble');
    ok(!!bubbleEl && bubbleEl.classList.contains('show') && bubbleEl.textContent.length > 0, 'S9 等级气泡显示（含文本）');

    /* 面板开合（V10：点击宠物 toggle，无 X 按钮） */
    petBody.click();
    ok(petBody.classList.contains('panel-open'), 'S9 单击展开信息面板（panel-open）');
    ok(document.getElementById('petPanel') !== null, 'S9 信息面板容器 petPanel 生成');
    ok(document.querySelectorAll('#petPanel .pc-item').length === 3, 'S9 进化链三档预览（幼猫/成猫/大橘）');
    petBody.click();
    ok(!petBody.classList.contains('panel-open'), 'S9 再次单击关闭面板');

    /* 喂糖果：计数 +1 且气泡台词（无返回值契约） */
    const f0 = WB.pet.getFeeds();
    WB.pet.feed();
    ok(WB.pet.getFeeds() === f0 + 1 && document.getElementById('petBubble').classList.contains('show'),
      'S9 喂糖果彩蛋计数 +1 且气泡播报台词');

    /* 改名（面板内输入同步） */
    WB.pet.setName('糖糖');
    ok(WB.pet.getName() === '糖糖', 'S9 改名生效');
    petBody.click();
    const ni = document.getElementById('petNameInput');
    ok(!!ni && ni.value === '糖糖', 'S9 改名同步到面板输入框');
    petBody.click();

    /* 拖动记忆位置 */
    WB.pet.setPos(130, 90);
    const gp = WB.pet.getPos();
    ok(!!gp && Math.abs(gp.x - 130) < 0.5 && Math.abs(gp.y - 90) < 0.5, 'S10 setPos/getPos 位置一致');
    let petStored = null;
    try { petStored = JSON.parse(window.localStorage.getItem('WB_PET_V2') || 'null'); } catch (e) {}
    ok(!!petStored && petStored.pos && Math.abs(petStored.pos.x - 130) < 0.5, 'S10 位置已持久化 localStorage（WB_PET_V2.pos.x=130）');

    /* 最小化还原 */
    WB.pet.setMini(true);
    ok(petBody.classList.contains('mini'), 'S9 最小化小圆点');
    WB.pet.setMini(false);
    ok(!petBody.classList.contains('mini'), 'S9 还原常驻');

    /* 进化提示（10 → Lv2 成猫）：真实触发 onQuote 跨阈值 → evo-overlay 弹层 */
    WB.pet.debugSetCount(9);                     /* Lv1 幼猫 */
    WB.pet.onQuote();                            /* exp 9→10 触发进化 */
    await sleep(1600);                           /* 等 evolveAnim 1.4s → showLevelUp */
    const ov = document.querySelector('.evo-overlay');
    ok(!!ov && ov.textContent.indexOf('成猫') >= 0, 'S11 进化弹层 .evo-overlay 显示（进化到成猫）');
    WB.pet.debugSetCount(0);                     /* 归零不影响后续 */

    /* ============ ⑦ 产物零 emoji + SVG 图标 ============ */
    const finalHtml = document.documentElement.innerHTML;
    ok(!/[\u{1F000}-\u{1FAFF}]/u.test(finalHtml), 'S12 全产物无 emoji 功能图标（astral 扫描）');
    ok(document.querySelectorAll('.ic, svg.ic, .brand-logo svg, svg.pet-svg').length > 0, 'S12 SVG 图标系统在渲染');

    /* ============ ⑧ 全程零运行期错误 ============ */
    ok(errors.length === 0, 'S13 全程 0 console.error / jsdomError（' + errors.slice(0, 3).join('; ') + '）');

    console.log('\nV7 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
}, 200);
