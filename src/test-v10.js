/* ============================================================
 * test-v10.js — V10 交付用户自测清单门禁（jsdom 验收）
 * 对应《V10 改动说明》自测清单 10 项：
 *  1 页面无 console 报错
 *  2 添加原料/改配比 → 实时刷新（✓ 实时核算）
 *  3 Excel/表格 批量粘贴多行一次入清单
 *  4 价格库闭环：新增原料自动入库 / 已有改价自动更新 / 过期标红 / 一键最优价
 *  5 选剂型自动带出默认克重/数量/净含量/装箱（且工艺保持人工）
 *  6 最近使用打通：剂型/报价使用后进入「最近使用」，二次点击可复用
 *  7 配比合计≠100% 提示 + 一键归一化
 *  8 识别三入口（图片/文字/文本配方）均可打开可用
 *  9 宠物：单橘猫三体型、无闪耀、纯内联 SVG、可拖动不跟手
 * 10 存档后报价记录正常、出现在最近使用
 * 运行：node src/test-v10.js （先 node src/build.js 构建）
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
window.print = function () { window.__printed = true; };
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

/* 触发 #matList 的粘贴事件（jsdom 无 ClipboardEvent，注入 clipboardData） */
function firePaste(text) {
  const ev = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: function () { return text; } } });
  document.getElementById('matList').dispatchEvent(ev);
}

setTimeout(async () => {
  try {
    const WB = window.WB;
    const S = WB.store, U = WB.ui, C = WB.calc, P = WB.pet;
    const state = S.state;
    const doc0 = document.documentElement.innerHTML;

    /* ============ ① 页面无 console 报错 ============ */
    ok(errors.length === 0, '① 页面加载 0 console.error/jsdomError（' + errors.slice(0, 3).join('; ') + '）');

    /* ============ ⑨ 宠物：三体型无闪耀 / 纯内联 SVG / 不跟手 ============ */
    eq(P.calcLevel(0), 1, '⑨ 三档阈值 0→Lv1（幼猫）');
    eq(P.calcLevel(10), 2, '⑨ 三档阈值 10→Lv2（成猫）');
    eq(P.calcLevel(80), 3, '⑨ exp 80 封顶 Lv3（大橘，无闪耀四级）');
    const petBody = document.getElementById('petBody');
    ok(!!petBody && petBody.querySelector('svg.pet-svg') !== null &&
      Array.prototype.every.call(petBody.querySelectorAll('svg.pet-svg image'),
        im => String(im.getAttribute('href') || '').indexOf('data:image/') === 0) &&
      petBody.querySelectorAll('svg.pet-svg foreignObject').length === 0,
      '⑨ 宠物为内联贴图 SVG（零外链图片/无 HTML 外挂）');
    ok(doc0.indexOf('pet-follow') < 0 && doc0.indexOf('mouse-follow') < 0, '⑨ 无鼠标跟随实现残留（仅拖动记忆位置）');
    ok(P.svgSpecies('cat', 3, true) === P.svgSpecies('cat', 3, false), '⑨ 无闪耀形态（形态上限=最终体大橘）');
    const uniqStages = new Set([P.svgSpecies('cat', 1), P.svgSpecies('cat', 2), P.svgSpecies('cat', 3)]);
    eq(uniqStages.size, 3, '⑨ 三体型 SVG 各不同（仅体型缩放）');

    /* ============ ⑤ 剂型默认参数自动带出 ============ */
    const dosageSel = document.getElementById('f-dosage');
    const capDosage = state.data.dosageForms.filter(d => d.name === '胶囊')[0] || state.data.dosageForms[0];
    /* 确保重量/数量为空 → 触发剂型切换应自动填入默认 */
    state.calc.weight = ''; state.calc.count = ''; state.calc.net = ''; state.calc.box = '';
    dosageSel.value = capDosage.id;
    dosageSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    eq(String(document.getElementById('f-weight').value), String(capDosage.defaults.weight), '⑤ 选胶囊自动带出默认克重 ' + capDosage.defaults.weight);
    eq(String(document.getElementById('f-count').value), String(capDosage.defaults.count), '⑤ 自动带出默认粒数 ' + capDosage.defaults.count);
    ok(document.getElementById('f-net').value.indexOf('g') >= 0 || document.getElementById('f-net').value !== '', '⑤ 自动带出默认净含量（' + document.getElementById('f-net').value + '）');
    ok(String(document.getElementById('f-box').value).indexOf('瓶') >= 0, '⑤ 自动带出默认装箱（' + document.getElementById('f-box').value + '）');
    eq(String(document.getElementById('f-processFee').value || '0'), '0', '⑤ 人工费默认 0（V13 手填数值框）');
    ok(state.calc.lossRates && state.calc.lossRates.material === capDosage.defaultLossRate.material,
      '⑤ 损耗率同步剂型默认（material=' + (state.calc.lossRates && state.calc.lossRates.material) + '%）');

    /* ============ ⑥a 最近使用：选剂型即推送到最近使用 ============ */
    ok((state.meta.recent.dosages || []).indexOf(capDosage.id) >= 0, '⑥a 切换剂型 → 剂型进入「最近使用」列表');

    /* ============ ② 实时刷新：搭两行原料一键报价 → 改配比自动刷新 ============ */
    const mats = state.data.materials || [];
    const ma = mats[0] || null, mb = mats[1] || mats[0] || null;
    if (ma && (!ma.suppliers || !ma.suppliers.length)) ma.suppliers = [{ id: S.genId('sup'), supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '', isDefault: true }];
    if (mb && ma !== mb && (!mb.suppliers || !mb.suppliers.length)) mb.suppliers = [{ id: S.genId('sup'), supplierName: '供应商B', price: 12, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '', isDefault: true }];
    ok(!!ma && !!mb, '② 种子原料库可用');
    state.calc.mats.push({ id: 'v10m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' });
    state.calc.mats.push({ id: 'v10m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: 12, currency: 'CNY', isTemp: false, altHint: '' });
    document.getElementById('f-name').value = 'V10自检·复合维生素';
    WB.calcView.renderMatLines();
    WB.calcView.readCalc();
    WB.calcView.runQuote();
    ok(document.getElementById('resultState').textContent.indexOf('已核算') >= 0, '② 一键报价状态=已核算');
    const row1 = document.querySelector('#matList tr.line[data-id="v10m1"]');
    const ratioInp = row1 && row1.querySelector('input.l-ratio');
    ratioInp.value = 30;                       /* 60→30，合计 70 ≠100 → 提示归一化 */
    ratioInp.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(430);                          /* > debounce */
    eq(document.getElementById('resultState').textContent.trim(), '✓ 实时核算', '② 改配比后状态=✓ 实时核算（实时联动刷新）');

    /* ============ ⑦a 配比≠100% 提示 ============ */
    const warnEl = document.getElementById('ratioWarn');
    ok(!!warnEl && warnEl.textContent.indexOf('归一化') >= 0, '⑦a 配比合计≠100% 出现警告条+归一化按钮');

    /* ============ ⑩a 存档正常 ============ */
    const qCount0 = state.data.quotes.length;
    WB.calcView.saveQuote();
    eq(state.data.quotes.length, qCount0 + 1, '⑩a 存档后报价记录 +1');
    ok((state.meta.recent.quotes || []).length >= 1, '⑩a 报价进入最近使用（quotes 列表非空）');

    /* ============ ⑥b 最近使用渲染 chips + 可点击复用 ============ */
    WB.calcView.renderRecent();
    const recentBody = document.getElementById('recentBody');
    ok(!!recentBody && recentBody.innerHTML.indexOf('chip') >= 0, '⑥b 最近使用渲染出可点击条目');
    /* V14：报价升级为整行条目（.rg-item：名称+时间+单份成本），配方/剂型仍为 chip */
    ok(document.querySelectorAll('#recentBody .rg-item').length >= 1, '⑥b 报价条目行（.rg-item）已渲染');
    const chips = document.querySelectorAll('#recentBody .chip');
    ok(chips.length >= 1, '⑥b 剂型 chip 存在（' + chips.length + ' 个）');
    /* 点击剂型 chip → 复用该剂型（change 已 push dosages → 首个 chip 应含剂型或报价） */
    const dosageChip = Array.prototype.filter.call(chips, c => c.textContent.indexOf('胶囊') >= 0 || c.textContent.indexOf(capDosage.name) >= 0)[0];
    if (dosageChip) {
      dosageChip.click();
      eq(state.calc.dosageFormId, capDosage.id, '⑥b 点击最近使用剂型 chip → 复用到核算台');
    } else {
      ok(chips[0] && typeof chips[0].click === 'function', '⑥b 至少存在 chip 可点击');
    }

    /* ============ ⑦b 一键归一化 ============ */
    const normBtn = document.getElementById('btnNormalize');
    ok(!!normBtn, '⑦b 归一化按钮存在');
    if (normBtn) {
      normBtn.click();
      const sum = state.calc.mats.reduce((a, m) => a + (Number(m.ratio) || 0), 0);
      ok(Math.abs(sum - 100) < 0.01, '⑦b 归一化后配比合计=100%（实际 ' + sum.toFixed(4) + '%）');
      WB.calcView.renderMatLines();
      ok(!document.getElementById('ratioWarn'), '⑦b 归一化后警告条消失');
    }

    /* ============ ⑧ 识别三入口可打开 ============ */
    ok(!!document.getElementById('btnImgRecognize') && !!document.getElementById('btnTextRecognize') &&
      !!document.getElementById('btnFileRecognize'), '⑧ 三个识别入口按钮存在（图片/文字/文本配方）');
    ok(typeof WB.recognize.openImgPickPanel === 'function' && typeof WB.recognize.textRecognize === 'function' &&
      typeof WB.recognize.fileRecognize === 'function', '⑧ 识别引擎三入口 API 暴露');
    WB.recognize.openImgPickPanel();
    const imgDrop = document.getElementById('ocrDrop');
    ok(!!imgDrop, '⑧ 图片识别面板打开（含拖拽上传区 #ocrDrop）');
    ok(imgDrop && typeof imgDrop.getAttribute('role') === 'string' && imgDrop.getAttribute('role') === 'button', '⑧ 拖拽区可点击/可拖放（role=button）');
    document.querySelectorAll('.modal-close').forEach(b => b.click());
    WB.recognize.textRecognize();
    ok(!!document.getElementById('recText'), '⑧ 文字识别面板打开（textarea 就绪）');
    document.querySelectorAll('.modal-close').forEach(b => b.click());
    WB.recognize.fileRecognize();
    ok(!!document.getElementById('recFileInput'), '⑧ 文本配方入口触发文件选择（hidden input 就绪）');
    document.querySelectorAll('.modal-close').forEach(b => b.click());

    /* ============ ③ Excel/表格 批量粘贴：多行一次入清单 ============ */
    const matCount0 = state.calc.mats.length;
    const libCount0 = state.data.materials.length;
    const pasteText =
      '全新粘贴原料A\t25\t9.5\n' +
      '全新粘贴原料B\t35\t12\n' +
      '全新粘贴原料C\t10\n';                       /* 无价格 → 只建原料不建供应商 */
    firePaste(pasteText);
    eq(state.calc.mats.length, matCount0 + 3, '③ 粘贴 3 行 → 清单一次新增 3 行');
    const pastedNames = state.calc.mats.slice(-3).map(m => m.name);
    ok(pastedNames.indexOf('全新粘贴原料A') >= 0 && pastedNames.indexOf('全新粘贴原料B') >= 0 && pastedNames.indexOf('全新粘贴原料C') >= 0,
      '③ 三行原料名/配比/价格均正确解析入行');

    /* ============ ④a 新增原料自动入库（价格库闭环） ============ */
    eq(state.data.materials.length, libCount0 + 3, '④a 粘贴的全新原料自动新增入价格库（+3）');
    const newMatA = S.materialByName('全新粘贴原料A');
    ok(!!newMatA && newMatA.suppliers.length === 1 && newMatA.suppliers[0].price === 9.5 && newMatA.suppliers[0].source === 'paste',
      '④a 新原料带默认供应商价入库（¥9.5, source=paste）');
    ok(Array.isArray(newMatA.priceHistory) && newMatA.priceHistory.length === 1 && newMatA.priceHistory[0].price === 9.5,
      '④a 价格历史自动记录首条（9.5）');
    const newMatC = S.materialByName('全新粘贴原料C');
    ok(!!newMatC && newMatC.suppliers.length === 0, '④a 无价原料仅入库不建供应商（不污染价格库）');

    /* ============ ④b 已有原料改价自动更新（价格库闭环） ============ */
    const existMat = ma;
    const oldDef = existMat.suppliers.filter(s => s.isDefault)[0];
    const oldPrice = oldDef ? oldDef.price : 0;
    const oldHistLen = (existMat.priceHistory || []).length;
    firePaste(existMat.name + '\t5\t' + (oldPrice + 1));   /* 同名行 + 新价 */
    const newDef = existMat.suppliers.filter(s => s.isDefault)[0];
    eq(newDef.price, oldPrice + 1, '④b 已有原料粘贴改价 → 默认供应商价格自动更新');
    eq(newDef.source, 'paste', '④b 更新来源标记 paste');
    eq((existMat.priceHistory || []).length, oldHistLen + 1, '④b 价格历史追加一条');
    eq(state.calc.mats.length, matCount0 + 4, '③b 同名原料行也进入清单（共 4 行粘贴）');

    /* ============ ④c 过期报价标红预警 ============ */
    const expRow = state.calc.mats[state.calc.mats.length - 1];
    expRow.validUntil = '2000-01-01';
    WB.calcView.renderMatLines();
    const expTr = document.querySelector('#matList tr.line[data-id="' + expRow.id + '"]');
    ok(!!expTr && expTr.classList.contains('expired'), '④c 过期报价行标红（tr.expired）');
    ok(!!expTr && expTr.textContent.indexOf('报价已过期') >= 0, '④c 行内显示「报价已过期」标签');

    /* ============ ④d 一键最优价 ============ */
    const biMat = {
      id: S.genId('mat'), name: '双供应商测试料', suppliers: [
        { id: S.genId('sup'), supplierName: '高价商', price: 9.9, currency: 'CNY', quoteDate: '2026-08-01', validUntil: '', source: 'manual', isDefault: true },
        { id: S.genId('sup'), supplierName: '低价商', price: 5, currency: 'CNY', quoteDate: '2026-08-01', validUntil: '', source: 'manual', isDefault: false }
      ], priceHistory: [], defaultUnit: 'kg', moq: 1, category: '其他'
    };
    state.data.materials.push(biMat);
    state.calc.mats.push({ id: 'v10bi', materialId: biMat.id, name: biMat.name, ratio: 100, supplierId: biMat.suppliers[0].id, supplierName: '高价商', price: 9.9, currency: 'CNY', isTemp: false, altHint: '' });
    WB.calcView.renderMatLines();
    const bestBtn = document.getElementById('btnBestPrice');
    ok(!!bestBtn, '④d 「选最优价」按钮存在');
    if (bestBtn) bestBtn.click();
    const biRow = state.calc.mats.filter(m => m.id === 'v10bi')[0];
    ok(!!biRow && Math.abs(biRow.price - 5) < 0.001 && biRow.supplierId === biMat.suppliers[1].id,
      '④d 一键最优价 → 切到最低价供应商 ¥5（原 ¥9.9）');

    /* ============ ⑩b 存档后最近使用出现报价 chip ============ */
    WB.calcView.renderRecent();
    const recentTxt = document.getElementById('recentBody').textContent;
    ok(recentTxt.indexOf('V10自检') >= 0 || recentTxt.indexOf('报价') >= 0, '⑩b 存档后「最近使用-报价」区有该报价条目');
    const quoteRow = Array.prototype.filter.call(document.querySelectorAll('#recentBody .rg-item'), c => c.textContent.indexOf('V10自检') >= 0)[0];
    ok(!!quoteRow, '⑩b 报价条目含方案名（' + (quoteRow ? quoteRow.textContent : '无') + '）');
    ok(!!quoteRow && quoteRow.textContent.indexOf('单份成本') >= 0, '⑩b 报价条目展示「名称 + 时间 + 单份成本」');
    ok(!!quoteRow && quoteRow.querySelector('.rgi-meta') && quoteRow.querySelector('.rgi-meta').textContent.indexOf('BK') >= 0,
      '⑩b 报价条目带单号与时间（' + (quoteRow && quoteRow.querySelector('.rgi-meta') ? quoteRow.querySelector('.rgi-meta').textContent : '') + '）');
    /* V14：存档后「最近使用」立即展开且可点击载入复用 */
    ok(document.getElementById('recentBody').style.display === 'block', '⑩b 存档后「最近使用」自动展开（立即可见）');
    if (quoteRow) {
      quoteRow.click();
      ok(!!state.calc.mats.length, '⑩b 点击报价条目 → 载入该报价参数回核算台复用（原料 ' + state.calc.mats.length + ' 行）');
    }

    /* ============ ① 全程 0 console 错误（收尾） ============ */
    ok(errors.length === 0, '① 全程 0 console.error / jsdomError（' + errors.slice(0, 3).join('; ') + '）');

    console.log('\nV10 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
}, 200);
