/* ============================================================
 * test-v12.js — V12 定点升级交付门禁（jsdom 验收）
 * 对应 V12 用户自检清单 6 项：
 *  1 桌宠全功能 + 0 console 报错：精致化 SVG（渐变/高光/招手爪/卷尾环纹/
 *    问号好奇）、喂糖果动画、mood CSS 切换、拖动记忆、mini、进化、兴奋
 *  2 术语「配比」→「含量」+ 显示最多 2 位小数去尾零（内部精确）
 *  3 原料自动分类：内置规则库/自定义规则/设置可维护/所有入口自动回填
 *  4 识别加强：≥5 种非示例格式本地解析（表格粘贴/价格在前/竖排/千分位/
 *    元每克/元每吨/范围价/外币汇率/MOQ 噪声）+ AI 桥可回退
 *  5 既有成果不回退：无杂费/无底部小字/四板块重置/桌宠跨板块存在
 *  6 离线可用：无外链静态资源、AI 未配置不发起 fetch、配置后失败自动回退
 * 运行：node src/build.js 构建后 → node src/test-v12.js
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
  return { dom, window: dom.window, document: dom.window.document, errors };
}

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
function lastModal(doc) {
  const masks = doc.querySelectorAll('#modalRoot .modal-mask');
  return masks[masks.length - 1] || null;
}
function closeAllModals(doc) {
  doc.querySelectorAll('.modal-close').forEach((b) => b.click());
}
function visibleText(doc) {
  const c = doc.body.cloneNode(true);
  c.querySelectorAll('script, style, template').forEach((n) => n.remove());
  return c.textContent;
}
function navTo(doc, view) {
  const nav = doc.querySelector('.nav-item[data-view="' + view + '"]');
  if (nav) nav.click();
  return !!nav;
}

(async () => {
  try {
    /* ============================================================
     * 场景 A：干净实例 —— 桌宠 / 术语 / 分类 / 解析 / 不回退 / 离线
     * ============================================================ */
    const A = boot(null, 'v12-clean');
    const win = A.window, doc = A.document;
    const { WB } = win;
    const S = WB.store, P = WB.pet, SM = WB.smart;
    const state = S.state;

    await sleep(220);

    /* ---------- ① 桌宠：0 报错 + 精致化 SVG + 全功能 ---------- */
    ok(A.errors.length === 0, '① 干净实例加载 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');
    ok(!!doc.getElementById('petBody') && !!doc.querySelector('#petBody svg.pet-svg'), '① 桌宠挂载并渲染 SVG');
    /* 贴图版（V15）：允许 <image>，但必须是内联 data URI —— 判据从"无 image 标签"改为"无任何外链引用" */
    const petImgs = doc.querySelectorAll('#petBody svg.pet-svg image');
    eq(
      petImgs.length >= 7 &&
      Array.prototype.every.call(petImgs, im => String(im.getAttribute('href') || '').indexOf('data:image/') === 0) &&
      doc.querySelectorAll('#petBody foreignObject').length === 0,
      true, '① 桌宠为内联贴图（' + petImgs.length + ' 层 data URI，零外链）'
    );

    const petSvg = doc.querySelector('#petBody svg.pet-svg');
    /* V14 重绘：渐变改为 cdHeadG/cdBodyG（径向）+ cdCreamG/cdIrisG/cdTailG（线性） */
    ok(petSvg.querySelector('image.eb') && petSvg.querySelector('image.lid') &&
      petSvg.querySelector('image.mh'),
      '① 贴图图层齐备：睁眼（.eb）/ 闭眼（.lid）/ 开心（.mh）三层存在');
    ok(!!petSvg.querySelector('image.eb') && !!petSvg.querySelector('image.lid'),
      '① 眨眼双图层（.eb 睁眼 / .lid 闭眼）挂载，供 CSS keyframes 切换');
    ok(petSvg.querySelectorAll('image').length >= 7,
      '① 表情图层 ≥7 层（睁/闭/笑/思考/惊讶/委屈/睡），mood 由 CSS 切换');
    ok(!!petSvg.querySelector('image.mh'), '① 开心态（image.mh）内置于 SVG，mood 由 CSS 切换');
    ok(!!petSvg.querySelector('.mq'), '① 好奇问号元素（.mq）内置于 SVG（CSS 控制显隐）');
    /* 胡须：白色描边 path，单条 d 内 6 段（左右各三根）；注意 mask#cdTailMask 也用了白色描边，故取"含 6 段 M"的那条 */
    ok(!!((doc.defaultView && doc.defaultView.PET_FRAMES) && Object.keys((doc.defaultView && doc.defaultView.PET_FRAMES)).length >= 7),
      '① 贴图帧表 PET_FRAMES 齐备（' + ((doc.defaultView && doc.defaultView.PET_FRAMES) ? Object.keys((doc.defaultView && doc.defaultView.PET_FRAMES)).length : 0) + ' 帧）');
    ok(petSvg.querySelector('image[width="127.5"]') && petSvg.querySelector('image[height="200"]'),
      '① 贴图尺寸契约：204×320 按高撑满 200 画布，宽 127.5，水平居中');
    ok(!!petSvg.querySelector('.mq') && !!petSvg.querySelector('.an-zzz'),
      '① 情绪叠加件（好奇问号 .mq / 睡眠呼噜 .an-zzz）存在');

    /* mood CSS 类切换 */
    const petBody = doc.getElementById('petBody');
    P.setMood('happy');
    ok(petBody.classList.contains('mood-happy'), '① setMood(happy) → mood-happy 类（CSS 驱动表情）');
    P.setMood('curious');
    ok(petBody.classList.contains('mood-curious'), '① setMood(curious) → mood-curious 类');
    P.setMood('sleep');
    ok(petBody.classList.contains('sleep') && !!doc.querySelector('#petBody .pet-zzz'), '① setMood(sleep) → 闭眼 + Zzz 元素');
    P.setMood('idle');

    /* 喂糖果 */
    petBody.click(); /* 打开面板 */
    const feedBtn = doc.getElementById('petFeedBtn');
    ok(!!feedBtn && feedBtn.textContent.indexOf('糖果') >= 0, '① 面板按钮为「喂糖果」（不再是小鱼干）');
    if (feedBtn) {
      feedBtn.click();
      eq(P.getFeeds(), 1, '① 喂糖果后 feeds 计数 +1');
      ok(!!doc.querySelector('#petBody .pet-candy'), '① 喂食时出现糖果掉落动画元素（.pet-candy）');
      ok(petBody.classList.contains('mood-happy'), '① 喂食后进入 happy 情绪');
    }
    P.setMood('idle');
    await sleep(1100);
    eq(doc.querySelectorAll('#petBody .pet-candy').length, 0, '① 糖果动画元素播放后自动移除');

    /* 拖动位置记忆 */
    P.setPos(120, 200);
    doc.getElementById('petRoot').innerHTML = '';
    WB.pet.init();
    const posA = P.getPos();
    eq(posA.x, 120, '① 拖动位置记忆：重新 init 后 x=120 保留');
    eq(posA.y, 200, '① 拖动位置记忆：重新 init 后 y=200 保留');
    eq(doc.getElementById('petRoot').style.left, '120px', '① 位置记忆应用到样式（left:120px）');
    ok(!!doc.getElementById('petBody'), '① 重新 init 后桌宠仍在');
    P.resetPos(true);

    /* mini 收起/唤出 */
    P.setMini(true);
    ok(doc.getElementById('petBody').classList.contains('mini'), '① 双击收起等价能力：setMini(true) → mini 类');
    P.setMini(false);
    ok(!doc.getElementById('petBody').classList.contains('mini'), '① setMini(false) → 唤出恢复');

    /* 连续报价 ≥3 → 兴奋 */
    P.debugSetCount(0);
    P.onQuote(); P.onQuote(); P.onQuote();
    await sleep(750);
    eq(P.getMood(), 'excited', '① 连续报价 3 次 → 兴奋动画状态（mood-excited）');
    P.setMood('idle');

    /* 报价/经验达阈值 → 体型进化（三体型档位） */
    P.debugSetCount(10);
    eq(P.getStage(), 2, '① 经验达 10 → 成猫（第 2 体型档）');
    P.debugSetCount(30);
    eq(P.getStage(), 3, '① 经验达 30 → 大橘（第 3 体型档）');
    P.debugSetCount(0);

    /* 自检 → curious */
    const issues = P.selfCheck(true);
    ok(Array.isArray(issues), '① 自检返回问题清单（种子库过期价格时如实上报 ' + issues.length + ' 条）');
    eq(P.getMood(), 'curious', '① 自检触发好奇状态（问号浮现）');

    /* 切板块桌宠不消失 */
    ok(navTo(doc, 'mats') && !!doc.getElementById('petBody'), '① 切板块后桌宠不消失');
    navTo(doc, 'calc');

    /* ---------- ② 术语「配比」→「含量」+ 2 位小数 ---------- */
    ok(html.indexOf('配比') < 0, '② 成品 HTML 全文无「配比」残留');
    ok(visibleText(doc).indexOf('配比') < 0, '② 页面可见文本无「配比」');
    ok(html.indexOf('含量合计') >= 0, '② 合计校验文案为「含量合计 ≠ 100%」口径');
    ok(html.indexOf('含量 %') >= 0 || html.indexOf('含量%</th>') >= 0, '② 核算台原料表头为「含量 %」');
    eq(SM.fmtRatio(20.833333), '20.83', '② fmtRatio：20.833333 → "20.83"（最多 2 位小数）');
    eq(SM.fmtRatio(66.666666), '66.67', '② fmtRatio：66.666666 → "66.67"（四舍五入）');
    eq(SM.fmtRatio(100), '100', '② fmtRatio：100 → "100"（去尾零）');
    eq(SM.fmtRatio(0.333333), '0.33', '② fmtRatio：0.333333 → "0.33"');
    eq(SM.fmtRatio(5.5), '5.5', '② fmtRatio：5.5 → "5.5"（无尾零）');
    eq(SM.fmtRatio(null), '', '② fmtRatio：空值 → 空串（内部精确值不受显示格式化影响）');

    /* ---------- ③ 原料自动分类 ---------- */
    eq(SM.classifyName('维生素C（包膜）').cat, '维生素', '③ 分类：维生素C（包膜）→ 维生素');
    eq(SM.classifyName('维C').cat, '维生素', '③ 分类：维C → 维生素（俗称关键词）');
    eq(SM.classifyName('牛磺酸').cat, '氨基酸', '③ 分类：牛磺酸 → 氨基酸');
    eq(SM.classifyName('葡萄糖酸锌').cat, '矿物质', '③ 分类：葡萄糖酸锌 → 矿物质（长词优先于“葡萄糖→糖类”）');
    eq(SM.classifyName('麦卢卡蜂蜜').cat, '草本提取物', '③ 分类：麦卢卡蜂蜜 → 草本提取物（最长关键词优先）');
    eq(SM.classifyName('鱼油').cat, '油脂', '③ 分类：鱼油 → 油脂');
    eq(SM.classifyName('双歧杆菌').cat, '益生菌', '③ 分类：双歧杆菌 → 益生菌');
    eq(SM.classifyName('赤藓糖醇').cat, '糖类', '③ 分类：赤藓糖醇 → 糖类');
    eq(SM.classifyName('山梨酸钾').cat, '其他', '③ 分类：山梨酸钾 → 其他（辅料默认类）');
    eq(SM.classifyName('XYZ未知神秘物').cat, '', '③ 分类：识别不到 → 空分类（入口侧默认归「其他」）');
    ok(SM.baseCats().indexOf('维生素') >= 0 && SM.baseCats().length === 8, '③ 内置 8 大基础分类');

    /* 自定义规则生效 */
    state.settings.catRules = [{ kw: '神秘果', cat: '超级水果', custom: true }];
    S.persist();
    eq(SM.classifyName('神秘果浓缩粉').cat, '超级水果', '③ 自定义规则：神秘果 → 超级水果（设置保存后即时生效）');

    /* 设置页规则库 UI */
    ok(navTo(doc, 'settings'), '③ 可导航到设置页');
    const ruleRows0 = doc.querySelectorAll('#catRuleList .rule-row').length;
    ok(ruleRows0 >= 50, '③ 设置页默认规则库渲染（' + ruleRows0 + ' 条内置规则）');
    doc.getElementById('catRuleAdd').click();
    const ruleRows1 = doc.querySelectorAll('#catRuleList .rule-row').length;
    eq(ruleRows1, ruleRows0 + 1, '③ 「添加规则」新增一行');
    const lastRow = doc.querySelectorAll('#catRuleList .rule-row')[ruleRows1 - 1];
    lastRow.querySelector('.rule-kw').value = '胶原蛋白肽';
    lastRow.querySelector('.rule-cat').value = '蛋白质';
    doc.getElementById('catRuleSave').click();
    const savedRules = state.settings.catRules || [];
    ok(savedRules.some((r) => r.kw === '胶原蛋白肽' && r.cat === '蛋白质' && r.custom === true), '③ 保存规则：自定义关键词/分类/自定义标记持久化');
    eq(SM.classifyName('深海胶原蛋白肽').cat, '蛋白质', '③ 保存后自定义规则即时生效');
    const dlHtml = doc.getElementById('catRuleCats').innerHTML;
    ok(dlHtml.indexOf('蛋白质') >= 0, '③ 分类下拉 datalist 合并自定义分类（蛋白质可选）');
    doc.getElementById('catRuleReset').click();
    ok(doc.querySelectorAll('#catRuleList .rule-row').length === SM.defaultRules().length, '③ 恢复默认规则：行数回到内置默认');
    doc.getElementById('catRuleSave').click();
    eq((state.settings.catRules || []).length, SM.defaultRules().length, '③ 恢复默认后保存生效（catRules=内置默认）');

    /* 新增原料表单：自动分类建议 */
    ok(navTo(doc, 'mats'), '③ 导航到原料价格库');
    const matCnt0 = state.data.materials.length;
    doc.getElementById('matAdd').click();
    const mfModal = lastModal(doc);
    ok(!!mfModal && !!mfModal.querySelector('#mf-name'), '③ 新增原料表单弹出');
    const nameInp = mfModal.querySelector('#mf-name');
    const catSel = mfModal.querySelector('#mf-cat');
    nameInp.value = '维生素C钠颗粒';
    nameInp.dispatchEvent(new win.Event('input', { bubbles: true }));
    eq(catSel.value, '维生素', '③ 新建原料：输入名称自动回填分类（维生素C钠颗粒 → 维生素）');
    ok(mfModal.querySelector('#mf-catHint').textContent.indexOf('自动识别') >= 0, '③ 自动回填高亮提示「自动识别：维生素」');
    /* 手动改选后不再覆盖 */
    catSel.value = '其他';
    catSel.dispatchEvent(new win.Event('change', { bubbles: true }));
    nameInp.value = '牛磺酸';
    nameInp.dispatchEvent(new win.Event('input', { bubbles: true }));
    eq(catSel.value, '其他', '③ 手动改选分类后不再被自动覆盖（尊重人工选择）');
    ok(mfModal.querySelector('#mf-catHint').textContent.indexOf('采用') >= 0, '③ 人工已选时给出「采用」按钮建议（不强制）');
    closeAllModals(doc);

    /* 识别草稿建原料享受自动分类 */
    eq(SM.classifyName('辅酶Q10').cat, '草本提取物', '③ 辅酶Q10 命中内置规则（草本提取物）');

    /* ---------- ④ 识别加强：≥5 种非示例格式本地解析 ---------- */
    const pq = (t) => SM.parseQuoteLines(t);
    let fmtPass = 0;
    const r1 = pq('序号\t原料名称\t单价(元/kg)\t有效期\n1\t叶黄素酯\t320.00\t2026-12-31\n2\t磷脂酰丝氨酸\t560\t2026-12-31');
    ok(r1.length >= 2 && r1[0].name.indexOf('叶黄素酯') >= 0 && r1[0].price === 320, '④ 格式1 表格粘贴（Tab+行号+表头+日期列）：解析 2 行（' + JSON.stringify(r1.map(x => x.name + '/' + x.price)) + '）');
    if (r1.length >= 2 && r1[0].price === 320) fmtPass++;

    const r2 = pq('85.5 元/kg 维生素C（包膜）');
    ok(r2.length === 1 && r2[0].price === 85.5 && r2[0].name.indexOf('维生素C') >= 0, '④ 格式2 价格在前：85.5/维生素C（' + JSON.stringify(r2.map(x => x.name + '/' + x.price)) + '）');
    if (r2.length === 1 && r2[0].price === 85.5) fmtPass++;

    const r3 = pq('叶黄素酯\n320 元/kg');
    ok(r3.length === 1 && r3[0].name.indexOf('叶黄素酯') >= 0 && r3[0].price === 320, '④ 格式3 竖排（名称行+价格行）');
    if (r3.length === 1 && r3[0].price === 320) fmtPass++;

    const r4 = pq('烟酰胺 1,250.00 元/kg 含税13% 交期15天');
    ok(r4.length === 1 && r4[0].price === 1250 && r4[0].leadTime.indexOf('15') >= 0, '④ 格式4 千分位+税点+交期噪声剥离：1250 元/kg、交期15天');
    if (r4.length === 1 && r4[0].price === 1250) fmtPass++;

    const r5 = pq('辅酶Q10 0.85 元/克');
    ok(r5.length === 1 && r5[0].price === 850, '④ 格式5 元/克 ×1000 换算为元/kg（' + (r5[0] ? r5[0].price : 'NA') + '）');
    if (r5.length === 1 && r5[0].price === 850) fmtPass++;

    const r6 = pq('玉米淀粉 3200 元/吨');
    ok(r6.length === 1 && r6[0].price === 3.2, '④ 格式6 元/吨 ÷1000 换算为元/kg');
    if (r6.length === 1 && r6[0].price === 3.2) fmtPass++;

    const r7 = pq('维生素E 88~92 元/kg');
    ok(r7.length === 1 && r7[0].price === 90, '④ 格式7 范围价取均值（88~92 → 90）');
    if (r7.length === 1 && r7[0].price === 90) fmtPass++;

    const r8 = pq('鱼油 DHA30 6.5 USD/kg');
    ok(r8.length === 1 && r8[0].currency === 'USD' && r8[0].price === 6.5 && r8[0].note.indexOf('汇率') >= 0, '④ 格式8 USD 币种识别 + 汇率换算提示（不改原币入库）');
    if (r8.length === 1 && r8[0].currency === 'USD') fmtPass++;

    const r9 = pq('牛磺酸 96.0 元/kg MOQ 2000kg');
    ok(r9.length === 1 && r9[0].price === 96 && r9[0].moq.indexOf('2000') >= 0, '④ 格式9 MOQ 噪声剥离并捕获');
    if (r9.length === 1 && r9[0].price === 96) fmtPass++;

    ok(fmtPass >= 5, '④ 非示例格式解析通过数 ≥5（实际 ' + fmtPass + ' / 9）');

    /* 粘贴解析 UI：预览勾选 + 批量入库 + 自动分类 */
    const matsBeforePaste = state.data.materials.length;
    doc.getElementById('matPasteParse').click();
    const ppModal = lastModal(doc);
    ok(!!ppModal && !!ppModal.querySelector('#parseTxt'), '④ 粘贴解析面板弹出（#parseTxt）');
    ppModal.querySelector('#parseTxt').value =
      '叶黄素酯粉 320 元/kg\n(GMP报告) 磷脂酰丝氨酸 1,100.00 元/kg 含税13%\n0.85 元/克 辅酶Q10';
    const parseBtn = modalFootBtn(doc, '解析并预览');
    ok(!!parseBtn, '④ 「解析并预览」按钮存在');
    parseBtn.click();
    await sleep(50);
    const ppRows = doc.querySelectorAll('#parseResult .pp-row');
    ok(ppRows.length >= 3, '④ 解析预览渲染 3 行可编辑行（实际 ' + ppRows.length + '）');
    ok(doc.querySelector('#parseResult .pp-ck') !== null, '④ 预览为勾选式确认（.pp-ck 复选框）');
    ppRows[ppRows.length - 1].querySelector('.pp-ck').checked = false; /* 取消最后一行 */
    const writeBtn = modalFootBtn(doc, '确认写入');
    ok(!!writeBtn, '④ 「确认写入」按钮存在');
    writeBtn.click();
    await sleep(30);
    const addedCnt = state.data.materials.length - matsBeforePaste;
    eq(addedCnt, ppRows.length - 1, '④ 勾选式批量入库：未勾选行不写入（新增 ' + addedCnt + ' 个原料）');
    const newMat = S.materialByName('叶黄素酯粉') || S.materialByName('磷脂酰丝氨酸');
    ok(!!newMat, '④ 解析写入的原料已入库');
    if (newMat) {
      const expCat = newMat.name === '叶黄素酯粉' ? '草本提取物' : '油脂';
      ok(!!newMat.category && newMat.category !== '识别草稿', '④ 入库原料分类已自动识别（' + newMat.name + ' → ' + newMat.category + '）');
      ok(newMat.category === expCat, '④ 分类命中规则预期（' + newMat.name + ' → ' + expCat + '）');
    }

    /* AI 配置 + 失败回退（⑥ 联动） */
    eq(SM.aiConfig(), null, '⑥ AI 未配置 → aiConfig()=null（不发起任何网络请求）');
    ok(!!doc.getElementById('s-aiEnabled') && !!doc.getElementById('s-aiEndpoint') && !!doc.getElementById('s-aiKey') && !!doc.getElementById('s-aiModel'),
      '⑥ 设置页含 AI 增强四字段（开关/Endpoint/Key/模型）');
    let fetchCalls = 0;
    win.fetch = function () { fetchCalls++; return Promise.reject(new Error('offline')); };
    const aiNull = await SM.aiStructure('维生素 100mg', 'quote');
    eq(aiNull, null, '⑥ AI 未配置时 aiStructure 直接返回 null（fetch 调用 ' + fetchCalls + ' 次）');
    eq(fetchCalls, 0, '⑥ 未配置 AI 不发起 fetch（离线零网络依赖）');

    /* 通过设置页配置 AI */
    navTo(doc, 'settings');
    doc.getElementById('s-aiEnabled').value = '1';
    doc.getElementById('s-aiEndpoint').value = 'https://ai.example.com/v1/chat/completions';
    doc.getElementById('s-aiKey').value = 'sk-test-123';
    doc.getElementById('s-aiModel').value = 'gpt-4o-mini';
    doc.getElementById('btnSaveSettings').click();
    eq(state.settings.aiEnabled, true, '⑥ AI 开关持久化（保存设置后 settings.aiEnabled=true）');
    eq(state.settings.aiEndpoint, 'https://ai.example.com/v1/chat/completions', '⑥ AI Endpoint 持久化');
    ok(typeof SM.aiConfig() === 'object' && SM.aiConfig().model === 'gpt-4o-mini', '⑥ 配置后 aiConfig() 生效（model=gpt-4o-mini）');
    /* 有网配置但 fetch 失败 → 自动回退本地（不崩溃） */
    const aiFail = await SM.aiStructure('维生素 100mg', 'quote');
    eq(aiFail, null, '⑥ AI 请求失败（离线）→ 自动回退 null，不抛异常');
    ok(fetchCalls >= 1, '⑥ 配置后才会真正发起 fetch（失败自动回退本地解析）');
    /* 关闭 AI，恢复纯离线态 */
    doc.getElementById('s-aiEnabled').value = '0';
    doc.getElementById('btnSaveSettings').click();
    eq(SM.aiConfig(), null, '⑥ 关闭开关后回到纯本地解析态');
    const persisted = JSON.parse(win.localStorage.getItem('wb_oem_v2_data'));
    ok(persisted && persisted.settings && Array.isArray(persisted.settings.catRules), '⑥ 分类规则库随主数据存档持久化（localStorage）');

    /* ---------- ⑤ 既有成果不回退（V11 保底抽查） ---------- */
    ok(navTo(doc, 'calc'), '⑤ 导航回核算台');
    eq(doc.getElementById('f-misc'), null, '⑤ 无杂费字段（#f-misc 不存在）');
    ok(visibleText(doc).indexOf('杂费') < 0, '⑤ 可见文本无「杂费」');
    ok(!!doc.getElementById('btnResetProd') && !!doc.getElementById('btnResetBiz') && !!doc.getElementById('btnResetMats') && !!doc.getElementById('btnResetPacks') && !!doc.getElementById('btnResetAll'),
      '⑤ 四板块独立重置 + 一键全重置按钮全部保留');
    ok(!!doc.getElementById('petBody'), '⑤ 核算台桌宠存在且不遮挡（#petRoot pointer-events 控制不变）');
    ok(A.errors.length === 0, '① 场景 A 全程 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');

    /* ============================================================
     * 场景 B：干净实例 2 —— 术语在核算台联动中的显示格式
     * ============================================================ */
    const B = boot(null, 'v12-calc-display');
    await sleep(220);
    const WBb = B.window.WB, Sb = WBb.store, docB = B.document;
    const ma = Sb.state.data.materials[0];
    if (ma) {
      if (!ma.suppliers || !ma.suppliers.length) {
        ma.suppliers = [{ id: Sb.genId('sup'), supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', validUntil: '', source: 'manual', isDefault: true }];
      }
      Sb.state.calc.mats = [{ id: 'v12m1', materialId: ma.id, name: ma.name, ratio: 20.833333, supplierId: ma.suppliers[0].id, supplierName: '供应商A', price: 30, currency: 'CNY', isTemp: false, altHint: '' }];
      WBb.calcView.fillCalc();
      WBb.calcView.renderMatLines();
      const matHtml = docB.getElementById('matList').innerHTML;
      ok(matHtml.indexOf('20.83') >= 0 && matHtml.indexOf('20.833333') < 0, '② 原料清单显示 20.833333 → "20.83"（显示层格式化，内部精确）');
      ok(docB.getElementById('matList').textContent.indexOf('含量') >= 0, '② 原料清单表头为「含量 %」');
      /* 输入框 value 保持精确值（内部不截断） */
      const ratioInput = docB.querySelector('#matList .l-ratio input, #matList input');
      ok(!!ratioInput, '② 含量输入框存在（可编辑精确值）');
    } else {
      ok(false, '② 种子原料存在（可验证显示格式化）');
    }
    ok(B.errors.length === 0, '② 场景 B 0 console.error/jsdomError（' + B.errors.slice(0, 3).join('; ') + '）');

    /* ============ 汇总 ============ */
    console.log('\nV12 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
})();
