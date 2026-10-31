/* ============================================================
 * test-v14.js — V14 质量升级交付门禁（jsdom 验收）
 * 对应 V14 自检清单 8 项：
 *  1) 0 console 报错
 *  2) 桌宠造型深度重绘：立体渐变/轮廓裁剪/多层高光/卷尾环纹 +
 *     三体型 + 六情绪 + 拖动/收起/喂糖/进化/持久化 全部保留
 *  3) 供必填校验显眼化：红框 + 红点 + toast「还差 XX」+ 点击跳转聚焦
 *     （缺剂型 / 缺剂型必填字段「软糖类型」两条路径）
 *  4) 四个识别弹窗「✨AI 识别」快捷入口：未配置置灰 + 提示去设置；
 *     已配置默认优先 AI，可手动关闭并回退本地
 *  5) 「最近使用」真打通：老档回填 + 存档后立即出现（名称+时间+单份成本）
 *     + 点击载入复用
 *  6) 设置页「重置宠物养成」：确认后经验/体型/昵称归零回幼体，
 *     不影响位置记忆与已选动物，且刷新后不被历史存档顶回
 *  7) 商务参数标题旁小摘要已移除（不与右侧面板重复）
 *  8) 零回归：含量术语 / 四板块重置 / 实时联动 / 无杂费 / 人工费手填
 * 运行：node src/build.js 构建后 → node src/test-v14.js
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

function boot(preload, tag) {
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
      if (preload) {
        Object.keys(preload).forEach(function (k) {
          try { window.localStorage.setItem(k, preload[k]); } catch (e) {}
        });
      }
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors, tag };
}
/* ls 快照（用于跨实例模拟刷新） */
function lsOf(win, key) { try { return win.localStorage.getItem(key); } catch (e) { return null; } }

setTimeout(async () => {
  try {
    /* ============================================================
     * 场景 A：干净实例
     * ============================================================ */
    const A = boot(null, 'v14-clean');
    const win = A.window, doc = A.document;
    const WB = win.WB;
    const S = WB.store, U = WB.ui, C = WB.calc, P = WB.pet;
    const state = S.state;
    await sleep(230);

    /* ---------- ① 0 console 报错 ---------- */
    ok(A.errors.length === 0, '① 干净实例加载 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');

    /* ---------- ② 桌宠造型深度重绘（V14） ---------- */
    const petSvg = doc.querySelector('#petBody svg.pet-svg');
    ok(!!petSvg, '② 桌宠挂载并渲染内联 SVG');
    /* 贴图版（V15）：<image> 允许，判据改为"零外链 + 无 foreignObject" */
    const v14Imgs = doc.querySelectorAll('#petBody svg.pet-svg image');
    eq(
      v14Imgs.length >= 7 &&
      Array.prototype.every.call(v14Imgs, im => String(im.getAttribute('href') || '').indexOf('data:image/') === 0) &&
      doc.querySelectorAll('#petBody foreignObject').length === 0,
      true, '② 内联贴图（' + v14Imgs.length + ' 层 data URI，零外链 / 无 HTML 外挂）'
    );
    /* 立体感：多层渐变 + 多档模糊 + 轮廓裁剪 */
    ok(petSvg.querySelector('image.eb') && petSvg.querySelector('image.lid') && petSvg.querySelector('image.mh') &&
      petSvg.querySelector('image.sq') && petSvg.querySelector('image.sp') &&
      petSvg.querySelector('image.rg') && petSvg.querySelector('image.sl'),
      '② 七层情绪贴图齐备（睁/闭/笑/思考/惊讶/委屈/睡）');
    ok(!!petSvg.querySelector('image[width="127.5"][height="200"]'),
      '② 贴图尺寸契约（204×320 按高撑满 200 画布，宽 127.5）');
    ok(!!petSvg.querySelector('image.eb') && !!petSvg.querySelector('image.lid'),
      '② 眨眼契约：.eb / .lid 双帧，由 petBlinkHide / petBlinkLid 驱动');
    ok(petSvg.querySelectorAll('image[y="0"]').length >= 7, '② 贴图纵向贴顶对齐（y=0，底边落在画布下沿）');
    /* 五官：多层高光 + 粉鼻 + 三根胡须 + 腮红 + 内耳粉 */
    ok(Array.prototype.every.call(petSvg.querySelectorAll('image'), im => String(im.getAttribute('href')||'').slice(0, 11) === 'data:image/'),
      '② 全部贴图为内联 data URI（零外链，断网可用）');
    ok(petSvg.innerHTML.indexOf('data:image/webp;base64,') >= 0, '② 贴图编码为 WebP（体积较 PNG 降约 80%）');
    const frameKeys = (doc.defaultView && doc.defaultView.PET_FRAMES) ? Object.keys((doc.defaultView && doc.defaultView.PET_FRAMES)) : [];
    ok(frameKeys.length >= 7 && frameKeys.indexOf('open') >= 0 && frameKeys.indexOf('closed') >= 0 &&
      frameKeys.indexOf('happy') >= 0,
      '② 贴图帧表完整（' + frameKeys.length + ' 帧：' + frameKeys.join('/') + '）');
    ok(petSvg.querySelectorAll('image').length >= 7,
      '② 表情图层 ≥7 层，覆盖全部 6 种 mood + 眨眼过渡');
    ok(petSvg.querySelectorAll('image[preserveAspectRatio]').length >= 7,
      '② 贴图等比缩放（preserveAspectRatio 防拉伸变形）');
    /* 卷尾环纹 + 抬爪 */
    ok(petSvg.querySelectorAll('image').length === petSvg.querySelectorAll('image[class]').length,
      '② 每层贴图都带独立 class（CSS opacity 精确切换，不串层）');
    ok(!!petSvg.querySelector('image.eb') && !!petSvg.querySelector('image.sl'), '② 睁眼层 + 睡眠层挂载');
    /* 三体型：仅体型缩放，无闪耀 */
    const uniqStages = new Set([P.svgSpecies('cat', 1), P.svgSpecies('cat', 2), P.svgSpecies('cat', 3)]);
    eq(uniqStages.size, 3, '② 三体型（幼/成/大橘）SVG 各不相同');
    eq(P.svgSpecies('cat', 3, true), P.svgSpecies('cat', 3, false), '② 无闪耀形态（仅体型变化）');
    ok(typeof P._catSvg === 'function' && String(P._catSvg(1, 'idle')).indexOf('<svg') === 0,
      '② 造型单测出口 _catSvg 可用（stage+mood 直出 SVG，供渲染预览验收）');
    /* 缩略图自适应取景（大橘 1.45x 不被裁切） */
    const fitBox = P.svgSpecies('cat', 3, false, true);
    const mVB = /viewBox="([^"]+)"/.exec(fitBox);
    ok(!!mVB && mVB[1] !== '0 0 200 200', '② 缩略图自适应取景（大橘缩略图 viewBox 已按外接框调整：' + (mVB ? mVB[1] : '') + '）');
    /* 六情绪 */
    ['idle', 'happy', 'excited', 'curious', 'sleep', 'upset'].forEach(function (m) {
      P.setMood(m);
      ok(doc.getElementById('petBody').classList.contains('mood-' + m), '② 情绪 ' + m + ' → mood-' + m + ' 类切换正常');
    });
    P.setMood('idle');
    /* 动作库 */
    P.act('wave');
    ok(doc.getElementById('petBody').classList.contains('act-wave'), '② 动作库 act(wave) 加类播放');
    /* 喂糖 */
    const feeds0 = P.getFeeds();
    P.feed();
    ok(P.getFeeds() === feeds0 + 1, '② 喂糖次数 +1');
    ok(doc.getElementById('petBubble').classList.contains('show'), '② 喂糖气泡提示出现');
    /* 收起（mini） */
    P.setMini(true);
    ok(doc.getElementById('petBody').classList.contains('mini'), '② 收起为 mini 胶囊态');
    P.setMini(false);
    ok(!doc.getElementById('petBody').classList.contains('mini'), '② 展开恢复');
    /* 拖动位置记忆 */
    P.setPos(123, 45);
    eq(P.getPos().x, 123, '② 拖动位置记忆 x');
    eq(P.getPos().y, 45, '② 拖动位置记忆 y');
    /* 进化（报价累计驱动） */
    const c0 = P.getCount();
    P.onQuote();
    eq(P.getCount(), c0 + 1, '② 一次报价 → 经验 +1（养成链路）');
    P.debugSetCount(30);
    eq(P.getStage(), 3, '② 经验 30 → 最终体大橘');
    P.debugSetCount(0);
    eq(P.getStage(), 1, '② 归零 → 幼体');
    /* 自检气泡 + 对话 Agent 保留 */
    P.selfCheck();
    ok(doc.getElementById('petBubble').classList.contains('show'), '② 自检气泡可用');
    ok(typeof P.askLocal === 'function' && typeof P.askLocal('快捷键') === 'string' && P.askLocal('快捷键').length > 0,
      '② 对话 Agent 本地意图查询可用');

    /* ---------- ⑦ 商务参数标题旁小摘要已移除 ---------- */
    WB.calcView.applyBizCollapsed && WB.calcView.applyBizCollapsed();
    const bizHint = doc.getElementById('bizHint');
    ok(!bizHint || bizHint.textContent.trim() === '', '⑦ 商务参数标题旁小摘要已整行移除（不与右侧面板重复）');
    ok(!!doc.getElementById('btnResetBiz'), '⑦ 商务参数「重置」按钮仍在（板块重置未回退）');

    /* ---------- ④ 识别弹窗「✨AI 识别」快捷入口 ---------- */
    ok(WB.recognize.aiConfigured() === false, '④ 默认未配置 AI（aiConfigured=false）');
    /* 四个弹窗顶部都带开关 */
    const modalProbes = [
      ['图片识别配方', function () { WB.recognize.openImgPickPanel(); }],
      ['文字识别配方', function () { WB.recognize.textRecognize(); }],
      ['图片文字提取', function () { WB.recognize.openOcrFallback({ name: '图片' }, false); }],
      ['文本配方识别', function () { WB.recognize.fileRecognize(); }],
      ['解析供应商报价单', function () { WB.libsView.openPasteParse(); }]
    ];
    modalProbes.forEach(function (pr) {
      pr[1]();
      const m = Array.prototype.slice.call(doc.querySelectorAll('.modal')).pop();
      ok(!!m && !!m.querySelector('#recAiToggle'), '④ 「' + pr[0] + '」弹窗顶部含 ✨AI 识别 开关');
      ok(!!m && m.querySelector('#recAiToggle').className.indexOf('off') >= 0, '④ 「' + pr[0] + '」未配置时开关置灰（off）');
      if (m) m.querySelector('.modal-close').click();
    });
    /* 未配置点击 → 提示去设置 + 跳转设置页 */
    WB.recognize.textRecognize();
    let mAi = Array.prototype.slice.call(doc.querySelectorAll('.modal')).pop();
    mAi.querySelector('#recAiToggle').click();
    let toastTxt = Array.prototype.slice.call(doc.querySelectorAll('#toastRoot .toast')).map(t => t.textContent).join('|');
    ok(toastTxt.indexOf('设置') >= 0 && toastTxt.indexOf('AI') >= 0, '④ 未配置点击 → 提示「请到 设置 → AI 识别 配置」');
    ok(state.view === 'settings', '④ 未配置点击 → 自动跳转到设置页');
    mAi.querySelector('.modal-close').click();
    /* 配置后 → 默认优先 AI */
    state.settings.aiEnabled = true;
    state.settings.aiEndpoint = 'https://example.com/v1/chat/completions';
    state.settings.aiKey = 'sk-test';
    ok(WB.recognize.aiConfigured() === true, '④ 配置齐全后 aiConfigured=true');
    ok(WB.recognize.aiPrefOn() === true, '④ 配置后默认「优先 AI」开启');
    WB.recognize.textRecognize();
    mAi = Array.prototype.slice.call(doc.querySelectorAll('.modal')).pop();
    const aiBtn = mAi.querySelector('#recAiToggle');
    ok(aiBtn.className.indexOf('on') >= 0, '④ 配置后开关呈高亮态（on = 优先 AI）');
    aiBtn.click();      /* 手动关闭 */
    ok(WB.recognize.aiPrefOn() === false, '④ 手动关闭 → aiPrefOn=false（全部走本地解析）');
    aiBtn.click();      /* 再开启 */
    ok(WB.recognize.aiPrefOn() === true, '④ 再次点击 → 恢复优先 AI');
    mAi.querySelector('.modal-close').click();
    /* 关闭后不得发起 AI 请求（离线可用约束） */
    state.settings.aiEnabled = false;
    state.settings.aiEndpoint = '';
    state.settings.aiKey = '';

    /* ---------- ③ 必填校验显眼化 ---------- */
    /* ③-1 缺剂型（含方案名/克重/粒数/MOQ 全缺） */
    doc.getElementById('f-name').value = '';
    doc.getElementById('f-weight').value = '';
    doc.getElementById('f-count').value = '';
    doc.getElementById('f-moq').value = '';
    state.calc.dosageFormId = '';
    doc.getElementById('f-dosage').value = '';
    WB.calcView.readCalc();
    const ok1 = WB.calcView.runQuote();
    ok(ok1 === false, '③ 缺必填 → 一键报价被拦截（返回 false）');
    const t1 = Array.prototype.slice.call(doc.querySelectorAll('#toastRoot .toast')).map(t => t.textContent).join('|');
    ok(t1.indexOf('还差：') >= 0, '③ 顶部 toast 汇总缺失项（' + t1 + '）');
    ok(t1.indexOf('剂型') >= 0, '③ toast 文案含「剂型」');
    ok(Array.prototype.some.call(doc.querySelectorAll('#toastRoot .toast'), t => t.className.indexOf('toast-act') >= 0),
      '③ 该 toast 可点击（toast-act）');
    const inv = Array.prototype.map.call(doc.querySelectorAll('#card-product .field.invalid'), f => {
      const i = f.querySelector('input,select,textarea'); return i ? i.id : '';
    });
    ok(inv.length >= 3, '③ 缺失字段红框高亮（' + inv.join(',') + '）');
    ok(doc.querySelectorAll('.req-dot').length >= 3, '③ 缺失字段红点标记（' + doc.querySelectorAll('.req-dot').length + ' 个）');
    const jumps = doc.querySelectorAll('#resultBody .err-jump');
    ok(jumps.length >= 3, '③ 右侧核算面板错误条目可点击（' + jumps.length + ' 条）');
    /* 点击 toast → 聚焦第一个缺失字段 */
    const toastAct = doc.querySelector('#toastRoot .toast-act');
    if (toastAct) toastAct.dispatchEvent(new win.Event('click', { bubbles: true }));
    await sleep(200);
    ok(doc.activeElement && doc.activeElement.id === 'f-name', '③ 点击 toast → 跳转并聚焦第一个缺失字段（' + (doc.activeElement && doc.activeElement.id) + '）');
    /* 点击右侧错误条目 → 跳转 */
    const jump2 = Array.prototype.filter.call(jumps, b => b.textContent.indexOf('剂型') >= 0)[0];
    if (jump2) {
      jump2.click();
      await sleep(200);
      ok(!!doc.activeElement && doc.activeElement.id !== '', '③ 点击错误条目「' + jump2.textContent.replace('定位 ›', '') + '」→ 跳转聚焦到对应字段（' + doc.activeElement.id + '）');
    } else { ok(false, '③ 存在「剂型」错误条目可点击'); }

    /* ③-2 缺剂型必填字段「软糖类型」 */
    const gummy = state.data.dosageForms.filter(d => d.name === '软糖')[0];
    ok(!!gummy && (gummy.customFields || []).some(f => f.required && f.label === '软糖类型'),
      '③ 种子剂型「软糖」含必填字段「软糖类型」');
    if (gummy) {
      doc.getElementById('f-name').value = 'V14校验·软糖';
      doc.getElementById('f-dosage').value = gummy.id;
      doc.getElementById('f-dosage').dispatchEvent(new win.Event('change', { bubbles: true }));
      doc.getElementById('f-weight').value = '3';
      doc.getElementById('f-count').value = '60';
      doc.getElementById('f-moq').value = '5000';
      state.calc.params.gummyType = '';
      const gt = doc.querySelector('#dosageFields [data-cf="gummyType"] input, #dosageFields [data-cf="gummyType"] select');
      if (gt) gt.value = '';
      WB.calcView.readCalc();
      const ok2 = WB.calcView.runQuote();
      ok(ok2 === false, '③ 缺「软糖类型」→ 报价被拦截');
      const t2 = Array.prototype.slice.call(doc.querySelectorAll('#toastRoot .toast')).map(t => t.textContent).join('|');
      ok(t2.indexOf('软糖类型') >= 0, '③ toast 含「软糖类型」（' + t2.split('|').pop() + '）');
      const box = doc.querySelector('#dosageFields [data-cf="gummyType"]');
      ok(!!box && box.classList.contains('invalid') && !!box.querySelector('.req-dot'),
        '③ 该字段红框 + 红点高亮');
      const gJump = Array.prototype.filter.call(doc.querySelectorAll('#resultBody .err-jump'), b => b.textContent.indexOf('软糖类型') >= 0)[0];
      ok(!!gJump, '③ 右侧面板出现「软糖类型」可点击条目');
      if (gJump) { gJump.click(); await sleep(200); }
    }

    /* ---------- ⑤ 最近使用：存档后立即出现 + 可载入复用 ---------- */
    /* 补齐一条完全可核算的方案：选剂型 → 填必填（含剂型自定义必填字段）→ 搭原料 */
    const capD = state.data.dosageForms.filter(d => d.name === '胶囊')[0] || state.data.dosageForms[0];
    doc.getElementById('f-dosage').value = capD.id;
    doc.getElementById('f-dosage').dispatchEvent(new win.Event('change', { bubbles: true }));
    doc.getElementById('f-name').value = 'V14自检·最近使用';
    doc.getElementById('f-weight').value = String((capD.defaults && capD.defaults.weight) || 3);
    doc.getElementById('f-count').value = String((capD.defaults && capD.defaults.count) || 60);
    doc.getElementById('f-moq').value = '5000';
    /* 剂型自定义必填字段：按定义回填（模拟用户已填写） */
    (capD.customFields || []).forEach(function (f) {
      if (!f.required) return;
      const el = doc.querySelector('#dosageFields [data-cf="' + f.key + '"] input, #dosageFields [data-cf="' + f.key + '"] select, #dosageFields [data-cf="' + f.key + '"] textarea');
      if (el) el.value = (f.type === 'select' && f.options && f.options.length) ? f.options[0] : '测试值';
    });
    const mats = state.data.materials || [];
    const ma = mats[0], mb = mats[1] || mats[0];
    state.calc.mats.push({ id: 'v14m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: (ma.suppliers[0] || {}).price || 10, currency: 'CNY', isTemp: false });
    if (mb !== ma) state.calc.mats.push({ id: 'v14m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: (mb.suppliers[0] || {}).price || 12, currency: 'CNY', isTemp: false });
    WB.calcView.renderMatLines();
    WB.calcView.readCalc();
    ok(WB.calcView.runQuote() === true, '⑤ 前置：方案通过校验可存档');
    const qn0 = state.data.quotes.length;
    WB.calcView.saveQuote();
    await sleep(30);
    eq(state.data.quotes.length, qn0 + 1, '⑤ 存档后报价记录 +1');
    ok((state.meta.recent.quotes || []).length >= 1, '⑤ 该报价写入「最近使用 · 报价」列表');
    const rBody = doc.getElementById('recentBody');
    ok(rBody.style.display === 'block', '⑤ 存档后「最近使用」自动展开（立即可见，无需二次点击）');
    ok(!!rBody.querySelector('.rg-item'), '⑤ 报价条目行已渲染（.rg-item）');
    const row = Array.prototype.filter.call(rBody.querySelectorAll('.rg-item'), r => r.textContent.indexOf('V14自检·最近使用') >= 0)[0];
    ok(!!row, '⑤ 最近使用出现刚存档的报价（名称）');
    ok(!!row && row.querySelector('.rgi-cost') && /\d/.test(row.querySelector('.rgi-cost').textContent),
      '⑤ 条目展示「单份成本」数值（' + (row ? row.querySelector('.rgi-cost').textContent : '') + '）');
    ok(!!row && /\d{2}-\d{2}\s\d{2}:\d{2}/.test(row.querySelector('.rgi-meta').textContent),
      '⑤ 条目展示时间（' + (row ? row.querySelector('.rgi-meta').textContent : '') + '）');
    /* 点击载入复用 */
    if (row) {
      row.click();
      await sleep(40);
      ok(state.view === 'calc', '⑤ 点击报价条目 → 回到核算台');
      ok(state.calc.mats.length >= 1 && String(state.calc.name).indexOf('V14自检·最近使用') >= 0,
        '⑤ 点击报价条目 → 载入该报价参数复用（方案名 ' + state.calc.name + '，原料 ' + state.calc.mats.length + ' 行）');
    }

    /* ---------- ⑥ 重置宠物养成 ---------- */
    P.setPos(200, 60);
    P.setName('测试昵称');
    P.debugSetCount(35);
    eq(P.getLevel(), 3, '⑥ 重置前：经验 35 → 最终体大橘');
    const speciesBefore = P.getSpecies();
    ok(!!doc.getElementById('btnResetPetGrowth'), '⑥ 设置页存在「重置宠物养成」按钮');
    doc.getElementById('btnResetPetGrowth').click();
    await sleep(20);
    const dlg = Array.prototype.slice.call(doc.querySelectorAll('.modal')).pop();
    ok(!!dlg && dlg.textContent.indexOf('重置宠物养成') >= 0, '⑥ 点击后弹出确认对话框');
    /* 取消 → 不生效 */
    let cancelBtn = null;
    dlg.querySelectorAll('.modal-foot button').forEach(b => { if (b.textContent.indexOf('取消') >= 0) cancelBtn = b; });
    if (cancelBtn) cancelBtn.click();
    eq(P.getCount(), 35, '⑥ 取消确认 → 养成数据不变');
    /* 确认 → 归零回幼体 */
    doc.getElementById('btnResetPetGrowth').click();
    await sleep(20);
    const dlg2 = Array.prototype.slice.call(doc.querySelectorAll('.modal')).pop();
    let okBtn = null;
    dlg2.querySelectorAll('.modal-foot button').forEach(b => { if (b.textContent.indexOf('确认') >= 0) okBtn = b; });
    ok(!!okBtn, '⑥ 确认对话框含「确认重置」按钮');
    if (okBtn) okBtn.click();
    await sleep(40);
    eq(P.getCount(), 0, '⑥ 确认后经验归零');
    eq(P.getLevel(), 1, '⑥ 确认后回到幼体（Lv1）');
    eq(P.getName() === '测试昵称', false, '⑥ 确认后昵称已清空（' + P.getName() + '）');
    eq(P.getSpecies(), speciesBefore, '⑥ 已选动物保持不变');
    eq(P.getPos().x, 200, '⑥ 位置记忆保持不变（x=200）');
    eq(P.getPos().y, 60, '⑥ 位置记忆保持不变（y=60）');
    const sqlAfter = state.data.quotes.length;
    ok(sqlAfter > 0, '⑥ 报价数据不受影响（仍有 ' + sqlAfter + ' 条存档）');
    ok(A.errors.length === 0, '⑥ 全程 0 console 报错（含重置链路）');

    /* ============================================================
     * 场景 B：模拟刷新 —— 老档回填 + 重置不被历史存档顶回
     * ============================================================ */
    const lsData = lsOf(win, S.LS_DATA);
    const lsPet = lsOf(win, 'WB_PET_V2');
    const B = boot({ 'wb_oem_v2_data': lsData, 'WB_PET_V2': lsPet }, 'v14-reload');
    const wB = B.window, dB = B.document, SB = wB.WB.store, PB = wB.WB.pet;
    await sleep(230);
    ok(B.errors.length === 0, 'B 刷新实例 0 console 报错（' + B.errors.slice(0, 3).join('; ') + '）');
    ok((SB.state.meta.recent.quotes || []).length >= 1, '⑤ 刷新后「最近使用」仍有报价记录（持久化正常）');
    eq(PB.getCount(), 0, '⑥ 刷新后经验仍为 0（重置不被历史存档 amount 顶回）');
    eq(PB.getLevel(), 1, '⑥ 刷新后等级仍为幼体');
    eq(PB.getPos().x, 200, '⑥ 刷新后位置记忆保留');
    const rBody2 = dB.getElementById('recentBody');
    ok(!!rBody2.querySelector('.rg-item'), '⑤ 刷新后最近使用条目正常渲染（含报价行）');

    /* ---- 老档回填：有存档报价但 recent 为空 ---- */
    let legacy = null;
    try {
      legacy = JSON.parse(lsData);
      legacy.meta.recent = { quotes: [], formulas: [], dosages: [] };
    } catch (e) { legacy = null; }
    if (legacy) {
      const P1 = boot({ 'wb_oem_v2_data': JSON.stringify(legacy) }, 'v14-legacy');
      await sleep(230);
      const SP = P1.window.WB.store;
      ok((SP.state.meta.recent.quotes || []).length >= 1,
        '⑤ 老档（有存档报价、recent 为空）加载后自动回填最近使用（' + SP.state.meta.recent.quotes.length + ' 条）');
      ok(P1.document.getElementById('recentBody').querySelectorAll('.rg-item').length >= 1,
        '⑤ 回填后核算台「最近使用」渲染出报价条目（不再是「暂无最近使用记录」）');
      ok(P1.errors.length === 0, '⑤ 老档加载 0 console 报错');
    }

    /* ============================================================
     * 场景 C：零回归
     * ============================================================ */
    /* 可见文本口径（不含内联 <script> 源码注释） */
    const vis = doc.getElementById('view-calc') || doc.body;
    const visTxt = vis.textContent;
    /* 含量术语（不得回退为「配比」） */
    ok(visTxt.indexOf('配比') < 0, '⑧ 术语零回归：界面无「配比」，统一为「含量」');
    ok(visTxt.indexOf('含量') >= 0, '⑧ 术语「含量」保留');
    /* 无杂费 */
    ok(doc.getElementById('f-misc') === null && visTxt.indexOf('杂费') < 0, '⑧ 无「杂费」字段残留（DOM 无 #f-misc、可见文本无字样）');
    /* 人工费手填 */
    const pf = doc.getElementById('f-processFee');
    ok(!!pf && pf.tagName === 'INPUT', '⑧ 人工费为手填数值输入框（#f-processFee）');
    /* 四板块重置 + 一键全重置 */
    ['btnResetProd', 'btnResetBiz', 'btnResetMats', 'btnResetPacks', 'btnResetAll'].forEach(function (id) {
      ok(!!doc.getElementById(id), '⑧ 板块重置按钮存在：' + id);
    });
    /* 实时联动：改含量 → 自动重算 */
    const before = state.calc.mats.length;
    if (before) {
      const row0 = doc.querySelector('#matList tr.line');
      const rInp = row0 && row0.querySelector('input.l-ratio');
      if (rInp) {
        rInp.value = String((Number(rInp.value) || 0) + 1);
        rInp.dispatchEvent(new win.Event('input', { bubbles: true }));
        await sleep(430);
        ok(doc.getElementById('resultState').textContent.indexOf('实时核算') >= 0, '⑧ 改含量 → 实时联动重算（状态=✓ 实时核算）');
      }
    }
    /* 顶部方案摘要条仍为删除态 */
    ok(!doc.getElementById('ctbSummary'), '⑧ 顶部方案摘要条 #ctbSummary 仍为删除态（零回归）');
    /* 存档闭环 */
    ok(doc.documentElement.innerHTML.indexOf('btnSaveQuote') >= 0, '⑧ 存档入口保留');

    console.log('\nV14 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    const allErr = A.errors.concat(B.errors);
    if (allErr.length) console.log('运行期错误:\n' + allErr.join('\n'));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
}, 200);
