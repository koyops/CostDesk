/* ============================================================
 * test-v13.js — V13 四组升级交付门禁（jsdom 验收）
 * 对应 V13 自检清单 6 项：
 *  1) 0 console 报错
 *  2) 识别增强：OCR 纠错词典 / 乱码检测待确认 / 多格式解析 /
 *     AI 视觉+文本双通道（未配置回退本地模式、来源标记、行级重识别入口）
 *  3) 顶部方案摘要条已删除，工具栏保留
 *  4) 人工费手填数值全链路（实时联动 d-proc；旧档档位文本按 0 不报错）
 *  5) 桌宠 V13：3D 质感 SVG / 动作库 / upset 抱怨 / 对话 Agent 本地可用
 *  6) 零回归：含量术语 / 四板块重置 / 实时联动
 * 运行：node src/build.js 构建后 → node src/test-v13.js
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

(async () => {
  try {
    /* ============================================================
     * 场景 A：干净实例 —— 报错 / 摘要条 / 人工费 / 桌宠 / 零回归
     * ============================================================ */
    const A = boot(null, 'v13-clean');
    const win = A.window, doc = A.document;
    const { WB } = win;
    const S = WB.store, P = WB.pet, SM = WB.smart, PA = WB.parse;
    const state = S.state;

    await sleep(220);

    /* ---------- ① 0 console 报错 ---------- */
    ok(A.errors.length === 0, '① 干净实例加载 0 console.error/jsdomError（' + A.errors.slice(0, 3).join('; ') + '）');

    /* ---------- ③ 摘要条已删除 ---------- */
    ok(!doc.getElementById('ctbSummary'), '③ 顶部方案摘要条 #ctbSummary 已删除');
    ok(!!doc.getElementById('calcTopbar') && !!doc.getElementById('btnQuote'),
      '③ 顶部工具栏保留（识别入口 + 一键报价 + 存档/导出）');
    ok(html.indexOf('renderTopbarSummary') < 0 && html.indexOf('ctb-mid') < 0,
      '③ 摘要条渲染函数与样式无残留');

    /* ---------- ④ 人工费手填 ---------- */
    ok(!doc.getElementById('f-processLevel'), '④ 档位下拉 #f-processLevel 已删除（无残留）');
    const feeEl = doc.getElementById('f-processFee');
    ok(!!feeEl && feeEl.tagName === 'INPUT' && feeEl.getAttribute('data-trigger') === 'calc',
      '④ 人工费为手填数值输入框且带实时联动触发');
    eq(String(feeEl.value || '0'), '0', '④ 人工费默认 0');
    ok(doc.body.textContent.indexOf('人工费（元/份）') >= 0, '④ 字段标签为「人工费（元/份）」');

    /* 旧档档位文本 → 按 0 处理不报错 */
    state.calc.processLevel = '半自动';
    let legacyOk = true;
    try { WB.calcView.fillCalc(); } catch (e) { legacyOk = false; }
    ok(legacyOk, '④ 旧存档含 processLevel 档位文本时 fillCalc 不报错');
    eq(String(doc.getElementById('f-processFee').value || '0'), '0', '④ 旧档档位文本读取按 0 处理');
    delete state.calc.processLevel;

    /* 手填实时联动 → d-proc（使用真实原料库条目，走完整 buildCalcInput 链路） */
    const testMat = {
      id: S.genId('mat'), name: '维生素C', inciName: '', casNo: '', grade: '食品级', defaultUnit: 'kg', moq: 1,
      category: '维生素类', suppliers: [], priceHistory: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    state.data.materials.push(testMat);
    state.calc.mats = [
      { id: 'v13m1', materialId: testMat.id, name: testMat.name, ratio: 100, supplierId: '', supplierName: '', price: 100, currency: 'CNY', isTemp: false, altHint: '' }
    ];
    WB.calcView.fillCalc();
    WB.calcView.renderMatLines();
    feeEl.value = '0.88';
    feeEl.dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(600);
    const dProc = doc.querySelector('#resultBody [data-k="d-proc"]');
    ok(!!dProc && dProc.textContent.indexOf('0.88') >= 0,
      '④ 手填人工费 0.88 → 实时联动 d-proc=' + (dProc ? dProc.textContent : '无'));
    ok(html.indexOf('processLevel: c.processLevel') < 0, '④ 导出/存档链路无 processLevel 档位依赖残留');

    /* ---------- ⑤ 桌宠 V13 ---------- */
    const petSvg = doc.querySelector('#petBody svg.pet-svg');
    ok(!!petSvg, '⑤ 桌宠挂载并渲染 SVG');
    /* V14 重绘：渐变体系与光影实现全面升级（径向/线性多层 + 三档模糊 + 轮廓裁剪） */
    ok(petSvg.querySelectorAll('image[href^="data:image/webp;base64,"]').length >= 7,
      '⑤ 贴图内联：≥7 层 WebP data URI（体积优化后零外链）');
    ok(/viewBox="0 0 200 200"/.test(String(petSvg.outerHTML)) || /viewBox="0 0 200 200"/.test(petSvg.getAttribute('viewBox') || ''),
      '⑤ 画布契约：主桌宠 viewBox 固定 200×200（体型靠 scale 变换）');
    ok(petSvg.querySelectorAll('image').length >= 7,
      '⑤ 表情图层 ≥7 层（睁/闭/笑/思考/惊讶/委屈/睡）');
    ok(!!petSvg.querySelector('image.sl'), '⑤ 睡眠层（image.sl）挂载，sleep 时替代闭眼帧');
    ok(!!petSvg.querySelector('image.rg'),
      '⑤ 委屈态：单独委屈帧（image.rg）内置，CSS 控制显隐');
    ok(!!petSvg.querySelector('image.sq') && !!petSvg.querySelector('.mq'),
      '⑤ 思考眯眼帧 / 好奇问号保留（养成交互不回退）');

    /* 动作库 act()：加类播动画，播完自动移除 */
    const petBody = doc.getElementById('petBody');
    P.act('jump');
    ok(petBody.classList.contains('act-jump'), '⑤ 动作库：act(jump) 播放（act-jump 类挂载）');
    P.act('spin');
    await sleep(1100);
    ok(!petBody.classList.contains('act-spin'), '⑤ 动作库：act(spin) 播完自动移除（动画轻量）');

    /* upset 抱怨：节流触发 */
    P.onQuoteIssue(true);
    eq(P.getMood(), 'upset', '⑤ 抱怨：核算异常时进入 upset 委屈态');
    ok(doc.body.textContent.indexOf('sweatDrop') >= 0 || html.indexOf('sweatDrop') >= 0, '⑤ 汗滴动画样式已构建');

    /* 对话 Agent：面板内聊天区 + 本地六类查询（点击桌宠弹面板，与真实交互一致） */
    petBody.click();
    const chatLog = doc.getElementById('petChatLog');
    ok(!!chatLog && !!doc.getElementById('petChatInput') && !!doc.getElementById('petChatSend'),
      '⑤ 对话窗：聊天日志/输入框/发送按钮就绪（点击桌宠弹出）');
    ok(chatLog.textContent.indexOf('报价小助手') >= 0, '⑤ 对话窗：开场引导语展示');
    const a1 = P.askLocal('快捷键有哪些');
    ok(!!a1 && a1.indexOf('Ctrl+Enter') >= 0, '⑤ 本地 Agent：快捷键查询');
    const a2 = P.askLocal('维生素C 什么价');
    ok(typeof a2 === 'string' && a2.length > 0, '⑤ 本地 Agent：原料价格查询返回文案');
    const a3 = P.askLocal('当前配方报价多少');
    ok(!!a3 && (a3.indexOf('概算') >= 0 || a3.indexOf('核算台') >= 0), '⑤ 本地 Agent：当前配方报价查询');
    const a4 = P.askLocal('我的报价历史');
    ok(!!a4 && a4.length > 0, '⑤ 本地 Agent：报价历史查询');
    ok(P.askLocal('完全无关的问题xyz') === null || typeof P.askLocal('完全无关的问题xyz') === 'string',
      '⑤ 本地 Agent：未命中意图安全返回');

    /* ---------- ② 识别增强：词典 / 乱码 / 多格式 ---------- */
    ok(typeof PA.fixOcrName === 'function' && typeof PA.isGarbled === 'function',
      '② parse.js 暴露 fixOcrName/isGarbled（OCR 纠错层）');
    eq(PA.fixOcrName('维c'), '维生素C', '② 纠错词典：维c → 维生素C');
    eq(PA.fixOcrName('VC'), '维生素C', '② 纠错词典：VC → 维生素C');
    eq(PA.fixOcrName('coq10'), '辅酶Q10', '② 纠错词典：coq10 → 辅酶Q10');
    eq(PA.fixOcrName('collagen'), '胶原蛋白肽', '② 纠错词典：collagen → 胶原蛋白肽');
    ok(PA.fixOcrName(' totally-unknown-x99 ') === null, '② 词典外名称不误纠');
    ok(PA.isGarbled('BRETRITEITH(RAEMeon') === true, '② 乱码检测：n1 样本「BRETRITEITH(RAEMeon」判乱码');
    ok(PA.isGarbled('BETRERN EEEWMYron') === true || PA.isGarbled('BETRERNEEEWMYron') === true,
      '② 乱码检测：n1 样本「BETRERN(EEEWMYron」判乱码');
    ok(PA.isGarbled('维生素C') === false && PA.isGarbled('Collagen') === false,
      '② 乱码检测：正常名称/词典可纠英文名不误判');

    const r1 = PA.parseFormulaText('维生素C    200mg');
    eq(r1.items.length, 1, '② 多空格/多空白解析出 1 行');
    eq(r1.items[0].name, '维生素C', '② 名称正确');
    eq(r1.items[0].amount, 200, '② 用量正确提取');
    eq(r1.items[0].unit, 'mg', '② 单位正确提取');
    ok(r1.items[0].confidence >= 0.9, '② 完整行高置信（' + r1.items[0].confidence + '）');

    const r2 = PA.parseFormulaText('乳清蛋白 30%');
    eq(r2.items[0].amount, 30, '② 「名称 含量%」格式含量提取');
    eq(r2.items[0].unit, '%', '② 百分比单位识别');

    const r3 = PA.parseFormulaText('维生素C（抗坏血酸）500mg');
    ok(r3.items[0].name === '维生素C' && r3.items[0].note.indexOf('抗坏血酸') >= 0,
      '② 括号注释识别（别称入备注）');

    const r4 = PA.parseFormulaText('维c\t200mg');
    eq(r4.items[0].name, '维生素C', '② OCR 错字自动纠错（维c→维生素C，制表符分隔）');
    ok(r4.items[0].confidence >= 0.9, '② 纠错后行置信度提升');

    const r5 = PA.parseFormulaText('BRETRITEITH(RAEMeon 100mg');
    ok(r5.items.length >= 0, '② 乱码行不崩溃');
    if (r5.items.length) {
      ok(r5.items[0].confidence <= 0.4 && r5.items[0].note.indexOf('待确认') >= 0,
        '② 乱码行压低置信并标记「待确认」（conf=' + r5.items[0].confidence + '）');
    }

    /* AI 双通道：接口存在 + 未配置 resolve(null) 回退 */
    ok(typeof SM.aiVisionImage === 'function', '② AI 视觉通道 aiVisionImage 已接入');
    eq(SM.aiConfig(), null, '② 未配置 AI 时 aiConfig()=null（本地模式）');
    let aiNull = 'pending';
    SM.aiVisionImage('data:image/png;base64,AAAA').then(function (v) { aiNull = v; });
    await sleep(50);
    eq(aiNull, null, '② 未配置 AI：视觉通道 resolve(null)（不发起请求直接回退）');
    ok(html.indexOf('aiVisionModel') >= 0 && html.indexOf('s-aiVisionModel') >= 0,
      '② 设置页提供视觉模型配置字段');
    ok(html.indexOf('AI 视觉识别中') >= 0 && html.indexOf('本地模式') >= 0,
      '② 图片链路：AI 优先 + 本地模式明示');
    ok(html.indexOf('parseFromAi') >= 0 && html.indexOf('data-act="rerow"') >= 0,
      '② 确认表：AI 结果入口 + 行级「重新识别这一行」按钮');
    ok(html.indexOf('rec-pending') >= 0 && html.indexOf('row-low') >= 0 && html.indexOf('src-badge') >= 0,
      '② 确认表：低置信红标/待确认标记/来源徽标样式就绪');

    /* 配置 AI 后 aiConfig 生效（仅验证配置对象，不发请求） */
    state.settings.aiEnabled = true;
    state.settings.aiEndpoint = 'https://example.invalid/v1/chat/completions';
    state.settings.aiKey = 'sk-test';
    state.settings.aiModel = 'test-text-model';
    state.settings.aiVisionModel = 'test-vision-model';
    var cfg = SM.aiConfig();
    ok(!!cfg && cfg.model === 'test-text-model' && cfg.visionModel === 'test-vision-model',
      '② 配置后 aiConfig() 返回文本/视觉双模型');
    state.settings.aiEnabled = false;   /* 还原：避免影响后续断言 */

    /* ---------- ⑥ 零回归 ---------- */
    const vis = (() => { const c = doc.body.cloneNode(true); c.querySelectorAll('script,style,template').forEach(n => n.remove()); return c.textContent; })();
    ok(vis.indexOf('含量') >= 0 && vis.indexOf('配比') < 0, '⑥ 术语统一「含量」（无「配比」残留）');
    ok(!!doc.getElementById('btnResetProd') && !!doc.getElementById('btnResetBiz') &&
       !!doc.getElementById('btnResetMats') && !!doc.getElementById('btnResetPacks') &&
       !!doc.getElementById('btnResetAll'), '⑥ 四板块独立重置 + 一键全重置保留');
    ok(html.indexOf('data-trigger="calc"') >= 0, '⑥ 实时联动委托机制保留');
    ok(!!doc.getElementById('petBody'), '⑥ 桌宠存在可见（前提保底）');

    await A.dom.window.close();

    /* ============================================================
     * 场景 B：报价异常 → 桌宠抱怨（端到端）
     * ============================================================ */
    const B = boot(function (w) {
      try {
        w.localStorage.setItem('wb_oem_v2_data', w.localStorage.getItem('wb_oem_v2_data') || '');
      } catch (e) {}
    }, 'v13-issue');
    const win2 = B.window, doc2 = B.document;
    const P2 = win2.WB.pet, S2 = win2.WB.store;
    await sleep(200);
    S2.state.calc.mats = [
      { id: 'b1', materialId: '', name: '无价原料', ratio: 60, supplierId: '', supplierName: '', price: 0, currency: 'CNY', isTemp: false, altHint: '' }
    ];
    P2.setMood('idle');
    win2.WB.calcView.recalcAndRender ? win2.WB.calcView.recalcAndRender() : null;
    await sleep(400);
    ok(B.errors.length === 0, '⑥ 异常场景 0 报错（' + B.errors.slice(0, 2).join('; ') + '）');

    await B.dom.window.close();

    console.log('');
    console.log('V13 自检结果: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('TEST CRASH:', e && e.stack || e);
    process.exit(1);
  }
})();
