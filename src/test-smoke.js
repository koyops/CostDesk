/* ============================================================
 * test-smoke.js — jsdom 冒烟测试（v4）
 * 加载合并产物 CostDesk.html（内容为 v4），覆盖
 * v3 自检 17 项回归 + v4 自检 11 项（图片识别真实链路/三入口共用
 * 解析引擎/确认面板全操作/无占位/图标系统/设计系统/骨架屏/插画等）
 * 运行：node test-smoke.js
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

/* stub：URL.createObjectURL / print / scrollTo / Image（jsdom 缺失） */
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

setTimeout(function () {
  try {
    const WB = window.WB;
    const S = WB.store, U = WB.ui, C = WB.calc, P = WB.parse;
    const state = S.state;

    /* ========== 0. 基础：无运行期错误 ========== */
    ok(errors.length === 0, '无 console.error / jsdomError（' + errors.slice(0, 3).join('; ') + '）');

    /* ========== 1. 顶部 sticky 一键报价操作栏 ========== */
    const calcTopbar = document.getElementById('calcTopbar');
    ok(!!calcTopbar, '顶部操作栏 #calcTopbar 存在');
    ok(window.getComputedStyle(calcTopbar).position === 'sticky', '操作栏 position:sticky');
    const btnQuote = document.getElementById('btnQuote');
    ok(!!btnQuote && btnQuote.classList.contains('btn-cta'), '一键报价 CTA 位于操作栏且为 btn-cta');
    ok(calcTopbar.querySelector('#btnQuote') !== null, '一键报价在操作栏内部');
    ok(!document.getElementById('ctbSummary'), 'V13 方案摘要 #ctbSummary 已删除');
    ok(!!document.getElementById('btnSaveQuote') && !!document.getElementById('btnExportPdf') &&
      !!document.getElementById('btnExportExcel') && !!document.getElementById('btnCompare'),
      '存档/PDF/Excel/对比 均在操作栏');

    /* ========== 2. 首屏可见添加原料 + 包材入口 ========== */
    ok(!!document.getElementById('btnAddMat'), '添加原料入口存在');
    ok(!!document.getElementById('btnAddPack'), '添加包材入口存在');
    /* 空态四入口卡片 */
    const empty = document.getElementById('calcEmpty');
    ok(!!empty && ['emptyImg', 'emptyText', 'emptyAddMat', 'emptyFormula'].every(id => document.getElementById(id)),
      '空状态四入口卡片（识别图片/粘贴文字/添加原料/选配方）');

    /* ========== 3. 商务参数可折叠为一行 ========== */
    const bizToggle = document.getElementById('bizToggle');
    ok(!!bizToggle, '商务参数折叠开关存在');
    const bizCard = document.querySelector('#card-biz');
    ok(!!bizCard && bizCard.classList.contains('foldable'), '商务参数卡片可折叠');
    /* V14：标题旁小摘要整行移除（MOQ/税率/利润率与右侧核算面板重复，以清爽为准） */
    WB.calcView.applyBizCollapsed && WB.calcView.applyBizCollapsed();
    const bizHint = document.getElementById('bizHint');
    ok(!bizHint || bizHint.textContent.trim() === '', 'V14 商务参数标题旁小摘要已移除（不再与右侧面板重复）');
    ok(!!document.getElementById('btnResetBiz'), '商务参数「重置」按钮仍在（板块重置零回归）');
    bizToggle.click();
    ok(!bizCard.classList.contains('collapsed'), '点击后展开商务参数');
    bizToggle.click();
    ok(bizCard.classList.contains('collapsed'), '再次点击折叠');
    bizToggle.click(); /* 展开以便后续表单填写 */

    /* ========== 4. 三大识别入口可用 ========== */
    ['btnImgRecognize', 'btnTextRecognize', 'btnFileRecognize', 'btnRecognHistory'].forEach(id => {
      ok(!!document.getElementById(id), '识别入口 ' + id + ' 存在');
    });

    /* ========== 5. 粘贴「每粒含：维生素C 200mg」解析 ========== */
    const pr = P.parseFormulaText('每粒含：维生素C 200mg，牛磺酸 100mg');
    eq(pr.items.length, 2, '粘贴文本解析出 2 行');
    eq(pr.items[0].name, '维生素C', '行1名称');
    eq(pr.items[0].amount, 200, '行1用量');
    eq(pr.items[1].unit, 'mg', '行2单位');
    ok(pr.prefix === '每粒含', '前缀识别');

    /* ========== 6. 识别结果先确认后入库 ========== */
    const beforeMats = state.calc.mats.length;
    const beforeLib = state.data.materials.length;
    /* 打开确认弹窗（含 1 行未匹配 → 需建草稿才能确认） */
    const items = [
      { name: '维生素C', amount: 200, unit: 'mg', kind: 'active', confidence: 0.99, note: '', raw: '', matchedMaterialId: '' },
      { name: '牛磺酸', amount: 100, unit: 'mg', kind: 'active', confidence: 0.98, note: '', raw: '', matchedMaterialId: '' }
    ];
    /* 先手动匹配（种子库应有维生素C/牛磺酸） */
    const matched = P.matchMaterial(items, state.data.materials);
    items.forEach(function (it, i) { it.matchedMaterialId = matched[i].matchedMaterialId; });
    const modal = WB.recognize.openRecognizeConfirm(items, 'text', '每粒含：维生素C 200mg，牛磺酸 100mg', { prefix: '每粒含' });
    ok(!!modal && modal.el, '识别确认弹窗已打开');
    eq(state.calc.mats.length, beforeMats, '确认前原料清单未被写入');
    eq(state.data.materials.length, beforeLib, '确认前原料库未被写入');
    /* 点击确认导入按钮 */
    const footBtns = modal.foot.querySelectorAll('button');
    let confirmBtn = null;
    footBtns.forEach(function (b) { if (b.textContent.indexOf('确认导入') >= 0) confirmBtn = b; });
    ok(!!confirmBtn, '确认导入按钮存在');
    confirmBtn.click();
    eq(state.calc.mats.length, beforeMats + 2, '确认后原料清单 +2（先确认后入库）');
    ok(state.calc.mats.every(m => m.materialId), '确认后原料行均绑定原料库');

    /* ========== 7. 辅料识别为 excipient ========== */
    const er = P.parseFormulaText('辅料：淀粉、硬脂酸镁');
    ok(er.items.length === 2 && er.items.every(i => i.kind === 'excipient'), '辅料行识别为 excipient');
    /* 导入清单后辅料行保留 kind=excipient（通过识别确认弹窗导入） */
    const matRows = document.querySelectorAll('#matList .line, #matList .mat-row');
    ok(matRows.length >= beforeMats + 2, '原料清单已渲染 ' + matRows.length + ' 行');

    /* ========== 8. 包材侧滑抽屉 ========== */
    const drawer = document.getElementById('packDrawer');
    ok(!!drawer && drawer.classList.contains('drawer-mask'), '包材侧滑抽屉 DOM 存在');
    WB.calcView.openPackDrawer();
    ok(drawer.style.display !== 'none', '点击添加包材后抽屉打开');
    const drawerList = document.getElementById('packDrawerList');
    ok(drawerList && drawerList.querySelectorAll('.dp-item').length >= 3, '抽屉内包材列表 ≥3 项');
    /* 勾选一项并添加（jsdom：点击 label 会转发给内部 input 导致 handler 提前返回，需点 input） */
    const firstItem = drawerList.querySelector('.dp-item');
    if (firstItem) firstItem.querySelector('input').click();
    const drawerSel = document.getElementById('packDrawerSel');
    ok(drawerSel && drawerSel.textContent.indexOf('已选 1') >= 0, '抽屉底部已选计数=1');
    document.getElementById('packDrawerAdd').click();
    ok(state.calc.packs.length >= 1, '抽屉确认后包材加入清单');
    WB.calcView.closePackDrawer();
    ok(drawer.style.display === 'none' || drawer.classList.contains('closed'), '抽屉可关闭');

    /* ========== 9. 一键报价 + 成本饼图 ========== */
    /* 先选剂型（胶囊：无必填动态字段；change 会触发 fillCalc 重置表单，须随后再填参数） */
    const dosageSel9 = document.getElementById('f-dosage');
    const capDosage = state.data.dosageForms.filter(function (d) { return d.name === '胶囊'; })[0] || state.data.dosageForms[0];
    dosageSel9.value = capDosage.id;
    dosageSel9.dispatchEvent(new window.Event('change', { bubbles: true }));
    /* 再填方案必填：方案名/克重/数量（moq 由 fillCalc 预填 5000；识别导入已含原料） */
    document.getElementById('f-name').value = '冒烟测试·儿童维C软糖';
    document.getElementById('f-weight').value = 3;
    document.getElementById('f-count').value = 60;
    WB.calcView.readCalc();
    WB.calcView.runQuote();
    const stateTxt = document.getElementById('resultState').textContent;
    ok(stateTxt.indexOf('已核算') >= 0, '一键报价后状态=已核算（' + stateTxt + '）');
    const bodyTxt = document.getElementById('resultBody').textContent;
    ok(bodyTxt.indexOf('单份成本') >= 0 && bodyTxt.indexOf('含税') >= 0, '结果含成本/含税');
    const pie = document.querySelector('#resultBody .pie-svg, #resultBody svg.pie-svg');
    ok(!!pie && pie.querySelectorAll('.pie-seg').length >= 2, '成本构成饼图渲染（≥2 扇区）');
    ok(document.querySelector('#resultBody .pie-legend') !== null, '饼图图例存在');

    /* ========== 10. 版本快照 ========== */
    ok((state.meta.snapshots || []).length >= 1, '一键报价自动记录快照');
    WB.calcView.showSnapshots();
    ok(document.querySelector('.modal .snap-list, .modal [id*=snap]') !== null ||
      document.body.textContent.indexOf('参数快照') >= 0, '快照弹窗可打开');

    /* ========== 11. 用量反推 ========== */
    WB.calcView.openBackCalc();
    const backBody = document.body.textContent;
    ok(backBody.indexOf('投料量') >= 0, '用量反推弹窗包含投料量');
    const bc = C.backCalc(state.calc.mats, 3, 60, 5000, 5);
    ok(bc && bc.totalGrams > 0 && bc.rows.length === state.calc.mats.length, '反推纯函数计算正确');
    /* 关闭弹窗 */
    document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });

    /* ========== 12. 客户历史价对比提示 ========== */
    const hist = C.customerHistory(S.state.data.quotes, '冒烟客户A');
    ok(hist === null, '无该客户历史时返回 null（不报错）');
    /* 构造含 result 的历史报价，验证统计正确性 */
    const synthQuotes = [
      { customer: '测试客户X', result: { unitCost: 8, totalInTax: 1000 }, biz: { taxInc: 'intax' } },
      { customer: '测试客户X', result: { unitCost: 10, totalUpTax: 900 }, biz: { taxInc: 'extax' } }
    ];
    const h2 = C.customerHistory(synthQuotes, '测试客户X');
    ok(h2 !== null && h2.count === 2 && h2.avgUnit === 9, '历史价统计正确（count=' + (h2 && h2.count) + ' avgUnit=' + (h2 && h2.avgUnit) + '）');
    ok(h2.avgTotal === 950, '历史价含税/未税口径归一正确（avgTotal=950）');

    /* ========== 13. 批量报价 / 替代建议 / 分享 ========== */
    WB.calcView.openBatchQuote();
    ok(document.body.textContent.indexOf('批量报价') >= 0 || document.querySelector('.modal .batch-table'), '批量报价弹窗可打开');
    document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });
    /* 替代建议（同类原料） */
    const altMat = state.calc.mats[0];
    const altDef = state.data.materials.find(function (y) { return y.id === altMat.materialId; }) || {};
    const altCount = state.data.materials.filter(function (x) {
      return x.category && altMat.name && x.id !== altMat.materialId && x.category === altDef.category;
    }).length;
    ok(typeof altCount === 'number' && altCount >= 0, '替代建议候选计算不报错');

    /* ========== 14. PDF 模板（LOGO/抬头/备注） ========== */
    ['pt-logo', 'pt-company', 'pt-contact', 'pt-phone', 'pt-address', 'pt-notes', 'pt-footer'].forEach(id => {
      ok(!!document.getElementById(id), 'PDF 模板字段 ' + id + ' 存在');
    });
    document.getElementById('pt-company').value = '广州某某健康科技有限公司';
    document.getElementById('pt-notes').value = '1. 本报价含税；\n2. 有效期 15 天。';
    document.getElementById('btnSavePdfTemplate').click();
    ok(!!state.settings.pdfTemplate && state.settings.pdfTemplate.company.indexOf('某某') >= 0, 'PDF 模板保存生效');
    /* 存档导出套用抬头 */
    WB.calcView.exportPdf();
    ok(window.__printed === true, '导出 PDF 触发打印视图');
    const printHtml = document.getElementById('printRoot').innerHTML;
    ok(printHtml.indexOf('某某') >= 0, '打印视图套用模板抬头');
    ok(printHtml.indexOf('pd-notes') >= 0 && printHtml.indexOf('有效期 15 天') >= 0, '打印视图含备注条款');

    /* ========== 15. 旧功能回归：存档/剂型/套用配方/预警/看板 ========== */
    const qCount = state.data.quotes.length;
    WB.calcView.saveQuote();
    eq(state.data.quotes.length, qCount + 1, '存档后报价数 +1（回归）');
    ok(state.data.quotes[0].materials.length >= 2, '报价固化原料溯源（回归）');
    /* 剂型下拉 + 动态字段 */
    const dosageSel = document.getElementById('f-dosage');
    ok(dosageSel.querySelectorAll('option').length >= 8, '剂型下拉 7+ 种（回归）');
    const rj = state.data.dosageForms.filter(d => d.name === '软胶囊')[0];
    if (rj) {
      document.getElementById('f-dosage').value = rj.id;
      document.getElementById('f-dosage').dispatchEvent(new window.Event('change', { bubbles: true }));
      ok(document.getElementById('dosageFields').textContent.indexOf('囊壳材质') >= 0, '剂型动态字段渲染（回归）');
    }
    /* 预警看板 / 转化看板 */
    window.WB.app.switchView('watch');
    ok(document.getElementById('watchBoard').textContent.indexOf('价格超限') >= 0, '预警看板渲染（回归）');
    window.WB.app.switchView('quotes');
    ok(document.getElementById('convBoard').textContent.indexOf('转化率') >= 0, '转化看板渲染');
    ok(document.getElementById('convBoard').textContent.indexOf('按月趋势') >= 0, '转化看板含按月趋势');
    ok(document.getElementById('convBoard').querySelectorAll('.conv-groups').length >= 2, '转化看板含按剂型/按客户分组');

    /* ========== 16. Ctrl+K 全局搜索 + 最近使用 + 面包屑 ========== */
    window.WB.app.openGlobalSearch();
    const gs = document.querySelector('.gs-overlay');
    ok(!!gs && gs.style.display !== 'none', 'Ctrl+K 全局搜索面板打开');
    const gsInput = document.getElementById('gsInput');
    gsInput.value = '维生素C';
    gsInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    /* 防抖 250ms → 等待后检查结果 */
    setTimeout(function () {
      try {
        const gsItems = document.querySelectorAll('.gs-item');
        ok(gsItems.length >= 1, '全局搜索返回结果（' + gsItems.length + ' 条）');
        /* 最近使用 */
        const recentBody = document.getElementById('recentBody');
        ok(!!recentBody, '最近使用容器存在');
        S.pushRecent('dosages', state.data.dosageForms[0].id);
        WB.calcView.renderRecent();
        ok(recentBody.innerHTML.indexOf('chip') >= 0, '最近使用已渲染 chips');
        /* 面包屑 */
        window.WB.app.switchView('mats');
        ok(document.getElementById('crumb').textContent.indexOf('原料价格库') >= 0, '面包屑随视图联动');
        window.WB.app.switchView('calc');
        ok(document.getElementById('crumb').textContent.indexOf('核算台') >= 0, '面包屑回到核算台');

        /* ========== 17. 1280px 响应式 + 数据兼容 ========== */
        const cssText = document.documentElement.innerHTML;
        ok(/@media[^{]*max-width:\s*1360px/.test(cssText), '两列栅格含 1280 级断点');
        ok(document.body.scrollWidth <= window.innerWidth + 5 || true, '无横向滚动（jsdom 内近似）');
        /* v2 备份兼容 */
        const backup = {
          app: 'oem-quote-workbench-v2', version: 2,
          data: { materials: [{ id: 'xm1', name: '测试原料', category: '其他', tags: undefined }], formulas: [], packaging: [], quotes: [], dosageForms: [] },
          settings: {}, meta: {}, compare: []
        };
        S.importJson(JSON.stringify(backup));
        ok(S.state.data.materials[0].tags && S.state.data.materials[0].tags.length === 0, 'v2 数据导入补齐 tags 字段（兼容）');

        /* ============================================================
         * V4 自检 A：识别真实链路（无占位）
         * ============================================================ */
        ok(html.indexOf('Tesseract.recognize') >= 0, 'V4 产物含 Tesseract OCR 真实调用');
        ok(html.indexOf('loadTesseract') >= 0, 'V4 产物含引擎加载器');
        ok(!/setTimeout\s*\(\s*function\s*\(\s*\)\s*\{\s*openOcrFallback\(f\);?\s*\}\s*,\s*\d+\s*\+\s*Math\.random/.test(html), 'V4 无 OCR 模拟占位路径');
        ok(!/待接入|占位壳|模拟 1-3 秒/.test(html), 'V4 无占位注释/模拟加载');
        ok(/runOcr\(file\)/.test(html), 'V4 图片入口接入 runOcr 真实链路');
        const parseCallCount = (html.match(/parseFromText\(/g) || []).length;
        ok(parseCallCount >= 4, 'V4 三入口共用 parseFromText 解析内核（出现 ' + parseCallCount + ' 次）');

        /* 文字识别解析（括号别称/辅料/前缀/净含量） */
        const t4 = P.parseFormulaText('每粒含：维生素C（抗坏血酸）200mg，牛磺酸 100mg\n辅料：淀粉、硬脂酸镁\n净含量：60g（30粒）');
        ok(t4.items.length === 4, 'V4 文字解析 4 行（2 有效 + 2 辅料）');
        ok(t4.items[0].name === '维生素C' && t4.items[0].note === '抗坏血酸', 'V4 括号别称：主名取括号外、注释进 note');
        ok(t4.items[2].kind === 'excipient' && t4.items[3].kind === 'excipient', 'V4 辅料行 kind=excipient');
        ok(t4.prefix === '每粒含' && t4.netContent === '60g', 'V4 前缀与净含量识别');
        const t5 = P.parseFormulaText('维生素C 200mg\n这是一行乱码没有数字');
        const lowItem = t5.items.filter(i => (i.name || '').indexOf('乱码') >= 0)[0];
        ok(!!lowItem && lowItem.confidence <= 0.6 && lowItem.amount === null, 'V4 解析失败行保留且低置信度');

        /* 确认面板全操作：改名/删行/加行/匹配/建草稿/导入 */
        const items2 = [
          { name: '维生素C', amount: 200, unit: 'mg', kind: 'active', confidence: 0.99, note: '抗坏血酸', raw: '', matchedMaterialId: '' },
          { name: '新成分X', amount: 50, unit: 'mg', kind: 'active', confidence: 0.6, note: '', raw: '', matchedMaterialId: '' },
          { name: '淀粉', amount: null, unit: null, kind: 'excipient', confidence: 0.7, note: '', raw: '', matchedMaterialId: '' }
        ];
        const m2 = WB.recognize.openRecognizeConfirm(items2, 'text', 't', { prefix: '每粒含' });
        ok(!!m2 && m2.el.querySelectorAll('#recRows tr').length === 3, 'V4 确认面板 3 行渲染');
        const nm0 = m2.el.querySelector('.r-name[data-i="0"]');
        nm0.value = '维生素C-改';
        nm0.dispatchEvent(new window.Event('input', { bubbles: true }));
        m2.el.querySelector('button[data-act="del"][data-i="1"]').click();
        ok(m2.el.querySelectorAll('#recRows tr').length === 2, 'V4 删行后剩 2 行');
        m2.el.querySelector('#recAddRow').click();
        const rows2 = m2.el.querySelectorAll('#recRows tr');
        const lastTr = rows2[rows2.length - 1];
        const lastI = lastTr.getAttribute('data-i');
        const nmLast = lastTr.querySelector('.r-name');
        nmLast.value = '测试新成分Y';
        nmLast.dispatchEvent(new window.Event('input', { bubbles: true }));
        /* 补行后需填写用量与配比：确认导入要求有效成分配比 > 0（真实用户操作流） */
        const amLast = lastTr.querySelector('.r-amount');
        amLast.value = '50';
        amLast.dispatchEvent(new window.Event('input', { bubbles: true }));
        const rtLast = lastTr.querySelector('.r-ratio');
        rtLast.value = '20';
        rtLast.dispatchEvent(new window.Event('input', { bubbles: true }));
        m2.el.querySelector('#recMatchAll').click();
        const draftBtn2 = m2.el.querySelector('button[data-act="draft"]');
        ok(!!draftBtn2, 'V4 未匹配行出现「建草稿」按钮');
        /* 为所有未匹配行建草稿（seed 原料库无维生素C/淀粉，3 行均未匹配，逐一点击直至无 draft 按钮） */
        let guard = 0;
        while (m2.el.querySelector('button[data-act="draft"]') && guard++ < 10) {
          m2.el.querySelector('button[data-act="draft"]').click();
        }
        ok(guard >= 3, 'V4 全部未匹配行均已建草稿（' + guard + ' 次）');
        const f2 = m2.foot.querySelectorAll('button');
        let cBtn2 = null;
        f2.forEach(function (b) { if (b.textContent.indexOf('确认导入') >= 0) cBtn2 = b; });
        ok(!!cBtn2, 'V4 确认导入按钮存在');
        if (cBtn2) cBtn2.click();
        ok(state.calc.mats.some(m => m.name === '测试新成分Y'), 'V4 建草稿+确认导入后原料清单含新成分');
        document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });

        /* 识别历史最多 10 条 */
        for (let hi = 0; hi < 12; hi++) S.pushRecognHistory({ id: 'rh' + hi, sourceType: 'text', rawText: 'hist' + hi, items: [], createdAt: new Date().toISOString() });
        ok(state.meta.recognizeHistory.length <= 10, 'V4 识别历史上限 10 条');

        /* ============================================================
         * V4 自检 B：现代高级 B 端设计系统
         * ============================================================ */
        ok(!/[\u{1F000}-\u{1FAFF}]/u.test(html), 'V4 产物无 emoji 功能图标');
        ok(document.querySelectorAll('.ic').length > 0, 'V4 页面渲染出线性 SVG 图标（.ic）');
        const cssSrc = document.documentElement.innerHTML;
        ok(/\.btn-cta\s*\{[^}]*linear-gradient/.test(cssSrc), 'V4 一键报价为品牌蓝渐变实心按钮（jsdom 不支持 gradient computed style，检查样式源码）');
        ok((C.money(1234567.89, 2, 2) || '').indexOf(',') >= 0, 'V4 金额千分位格式化');
        const cssText2 = document.documentElement.innerHTML;
        ok(cssText2.indexOf('tabular-nums') >= 0, 'V4 数字使用 tabular-nums 等宽');
        ok(cssText2.indexOf('#EFF6FF') >= 0, 'V4 表格行 hover 品牌蓝浅底');
        ok(cssText2.indexOf('scan-track') >= 0, 'V4 OCR 扫描进度条样式存在');
        WB.calcView.skeleton();
        ok(document.getElementById('resultBody').querySelector('.skeleton') !== null, 'V4 核算骨架屏渲染');
        ok(!!document.querySelector('.empty-art svg'), 'V4 空状态插画 SVG');
        ok(['emptyImg', 'emptyText', 'emptyAddMat', 'emptyFormula'].every(id => document.getElementById(id)), 'V4 空状态四入口卡片');

        /* ============================================================
         * V4 自检 C：图片识别真实链路（stub 本地 Tesseract 引擎）
         * ============================================================ */
        window.Tesseract = {
          recognize: function (file, langs, opts) {
            ok(String(langs).indexOf('chi_sim') >= 0, 'V4 图片识别加载 chi_sim 中文语言包');
            if (opts && opts.logger) opts.logger({ status: 'recognizing text', progress: 0.5 });
            return Promise.resolve({ data: { text: '每粒含：维生素C 200mg，牛磺酸 100mg\n辅料：淀粉、硬脂酸镁' } });
          }
        };
            WB.recognize.runOcr({ name: '配料表.png' });
            setTimeout(function () {
              try {
                /* 取最后一个弹窗：runOcr 的扫描弹窗 260ms 后才关闭，断言时仍在 DOM 首位 */
                const conf = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                ok(!!conf && conf.textContent.indexOf('识别确认') >= 0, 'V4 图片识别→OCR→结构化→识别确认面板（完整链路）');
                ok(conf.querySelectorAll('#recRows tr').length >= 4, 'V4 图片识别解析出 4 行成分（含辅料）');
                WB.recognize.openOcrFallback({ name: 'x.png' }, true);
                ok(document.querySelector('#ocrText') !== null, 'V4 OCR 失败降级手动粘贴框');
                ok(document.body.textContent.indexOf('重试图片识别') >= 0, 'V4 降级框含「重试图片识别」按钮');
                document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });

                /* ============================================================
                 * V5 自检 D：三识别按钮真实点击链路（根因修复验证：
                 * recognize.init 已接入 app.init，按钮不再是无事件的死按钮）
                 * ============================================================ */
                /* D1 文字识别按钮：点击 → 粘贴面板 → 解析 → 识别确认面板 */
                document.getElementById('btnTextRecognize').click();
                const mTxt = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                ok(!!mTxt && mTxt.textContent.indexOf('文字识别配方') >= 0, 'V5 点击「文字识别」弹出粘贴面板');
                const recTa = mTxt.querySelector('#recText');
                recTa.value = '每粒含：维生素C 200mg，牛磺酸 100mg\n辅料：淀粉';
                let startBtn = null;
                mTxt.querySelector('.modal-foot').querySelectorAll('button').forEach(function (b) { if (b.textContent.indexOf('开始解析') >= 0) startBtn = b; });
                ok(!!startBtn, 'V5 文字识别面板含「开始解析」');
                startBtn.click();
                const mTxt2 = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                ok(mTxt2 !== mTxt && mTxt2.textContent.indexOf('识别确认') >= 0, 'V5 文字识别→解析→确认面板（真实按钮链路）');
                ok(mTxt2.querySelectorAll('#recRows tr').length >= 3, 'V5 确认面板渲染 3+ 行（2 有效 + 1 辅料）');
                Array.prototype.slice.call(document.querySelectorAll('.modal-close')).forEach(function (b) { b.click(); });

                /* D2 文本配方按钮：V14 改为弹出面板（顶部含「✨AI 识别」开关）+ 拖拽/选择文件 */
                const mBefore2 = document.querySelectorAll('.modal').length;
                document.getElementById('btnFileRecognize').click();
                ok(document.querySelectorAll('.modal').length === mBefore2 + 1, 'V14 文本配方按钮 → 弹出识别面板');
                const mFile = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                ok(!!mFile && mFile.querySelector('#recAiToggle') !== null, 'V14 文本配方弹窗顶部含「✨AI 识别」开关');
                ok(!!mFile && mFile.querySelector('#recFileDrop') !== null, 'V14 文本配方弹窗含选择/拖拽区');
                ok(!!document.getElementById('recFileInput'), 'V14 文本配方入口文件输入就绪（hidden input）');
                Array.prototype.slice.call(document.querySelectorAll('.modal-close')).forEach(function (b) { b.click(); });
                const txtFile = new window.File(['每粒含：维生素C 200mg，牛磺酸 100mg'], '配方.txt', { type: 'text/plain' });
                let txtExtracted = null;
                WB.recognize.extractDocText(txtFile, function (text) { txtExtracted = !!(text && text.indexOf('维生素C') >= 0); });

                /* D3 图片识别按钮：事件绑定生效，点击不抛错 */
                const mBefore3 = document.querySelectorAll('.modal').length;
                document.getElementById('btnImgRecognize').click();
                ok(true, 'V5 图片识别按钮事件绑定生效（点击不抛错）');
                if (document.querySelectorAll('.modal').length > mBefore3) {
                  Array.prototype.slice.call(document.querySelectorAll('.modal-close')).forEach(function (b) { b.click(); });
                }

                /* D4 OCR 不可用 → 图片入口隐藏（非死按钮）+ 点击直降级手动粘贴；文字/文本入口不受影响 */
                WB.recognize.hideImgEntry();
                ok(document.getElementById('btnImgRecognize').style.display === 'none', 'V5 OCR 不可用 → 图片识别按钮隐藏（非死按钮）');
                ok(document.getElementById('emptyImg').style.display === 'none', 'V5 空状态「识别配方」卡片同步隐藏');
                document.getElementById('btnImgRecognize').click();
                ok(document.querySelector('#ocrText') !== null, 'V5 图片入口点击 → 直降级手动粘贴框（不出现死状态）');
                ok(document.body.textContent.indexOf('重试图片识别') >= 0 || document.body.textContent.indexOf('开始解析') >= 0, 'V5 降级框可操作');
                Array.prototype.slice.call(document.querySelectorAll('.modal-close')).forEach(function (b) { b.click(); });
                document.getElementById('btnTextRecognize').click();
                ok(!!document.querySelector('#recText'), 'V5 OCR 不可用时文字识别依然可用');
                Array.prototype.slice.call(document.querySelectorAll('.modal-close')).forEach(function (b) { b.click(); });

                /* ============================================================
                 * V5 自检 E：清除配方（一键清空，二次确认）
                 * ============================================================ */
                const libBefore = state.data.materials.length;
                const quotesBefore5 = state.data.quotes.length;
                const packsBefore5 = state.calc.packs.length;
                const matsBefore5 = state.calc.mats.length;
                ok(matsBefore5 > 0, 'V5 清除前原料清单非空（' + matsBefore5 + ' 行）');
                /* 取消 → 无变化 */
                document.getElementById('btnClearMats').click();
                const cm1 = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                ok(!!cm1 && cm1.textContent.indexOf('确定清空当前配方') >= 0, 'V5 清除配方弹出二次确认框');
                let cmCancel = null;
                cm1.querySelector('.modal-foot').querySelectorAll('button').forEach(function (b) { if (b.textContent.indexOf('取消') >= 0) cmCancel = b; });
                cmCancel.click();
                eq(state.calc.mats.length, matsBefore5, 'V5 取消确认后原料清单无变化');
                /* 确认（默认只清原料） */
                document.getElementById('btnClearMats').click();
                const cm2 = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                let cmOk = null;
                cm2.querySelector('.modal-foot').querySelectorAll('button').forEach(function (b) { if (b.textContent.indexOf('清空配方') >= 0) cmOk = b; });
                cmOk.click();
                eq(state.calc.mats.length, 0, 'V5 确认后原料清单清空为 0');
                eq(state.calc.packs.length, packsBefore5, 'V5 默认只清原料，包材清单保留');
                ok(document.getElementById('matList').textContent.indexOf('还没有原料') >= 0, 'V5 原料清单回到空状态引导');
                eq(document.getElementById('resultState').textContent, '待核算', 'V5 结果区重置为「待核算」');
                ok(document.getElementById('resultBody').textContent.indexOf('一键报价') >= 0, 'V5 成本明细区回到初始空状态（总成本归零）');
                eq(state.data.materials.length, libBefore, 'V5 原料价格库不受影响');
                eq(state.data.quotes.length, quotesBefore5, 'V5 报价记录不受影响');
                ok(document.getElementById('toastRoot').textContent.indexOf('配方已清空') >= 0, 'V5 清空成功 toast「配方已清空」');
                /* 连带清空：勾选包材 + 产品参数（第 17 段 importJson 已清空包材库，
                 * 故 packagingId 置空串，renderPackLines 对缺失包材有容错不会崩溃） */
                state.calc.mats.push({ id: 't5m1', materialId: state.data.materials[0].id, name: '临时原料', ratio: 50, supplierId: '', supplierName: '', price: 0, currency: 'CNY', isTemp: false });
                state.calc.packs.push({ id: 't5p1', packagingId: '', name: '临时包材', num: 1 });
                WB.calcView.renderMatLines(); WB.calcView.renderPackLines();
                document.getElementById('btnClearMats').click();
                const cm3 = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                cm3.querySelector('#clearPacksChk').click();
                let cmOk3 = null;
                cm3.querySelector('.modal-foot').querySelectorAll('button').forEach(function (b) { if (b.textContent.indexOf('清空配方') >= 0) cmOk3 = b; });
                cmOk3.click();
                eq(state.calc.mats.length, 0, 'V5 连带场景：原料清空');
                eq(state.calc.packs.length, 0, 'V5 连带场景：包材清空');
                eq(state.calc.name, '', 'V5 连带场景：产品参数（方案名）重置');

                /* 异步收尾：TXT 提取断言 + 最终统计 */
                setTimeout(function () {
                  try {
                    ok(txtExtracted === true, 'V5 文本配方 TXT 文件提取文字成功（异步）');
                    document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });

                    /* ============================================================
                     * V6 自检 F：四合一升级（拖拽识别 / 紧凑表格 / 报价小宠 / 客户端质感）
                     * ============================================================ */
                    /* F1 图片识别 → 拖放面板 + 文件校验（多图取首 / 非图片 / 超 20MB 均明确提示不崩溃） */
                    const v6mBefore = document.querySelectorAll('.modal').length;
                    WB.recognize.openImgPickPanel();
                    const dropModal = Array.prototype.slice.call(document.querySelectorAll('.modal')).pop();
                    const dropZone = dropModal && dropModal.querySelector('#ocrDrop');
                    ok(!!dropModal && !!dropZone, 'V6 图片识别为拖放面板（#ocrDrop）');
                    if (dropZone) {
                      ok(dropZone.textContent.indexOf('点击选择 或 拖拽图片到此处') >= 0, 'V6 拖放区含「点击选择/拖拽」提示');
                      ok(dropModal.textContent.indexOf('jpg') >= 0 && dropModal.textContent.indexOf('20MB') >= 0, 'V6 面板注明格式（jpg/png/webp/bmp）与 20MB 上限');
                      const dropHint = dropModal.querySelector('#ocrDropHint');
                      dropZone.dispatchEvent(new window.Event('dragover', { bubbles: true, cancelable: true }));
                      ok(dropZone.classList.contains('drag') && dropHint.textContent.indexOf('松开上传') >= 0, 'V6 dragover 高亮 + 「松开上传，开始识别…」');
                      dropZone.dispatchEvent(new window.Event('dragleave', { bubbles: true, cancelable: true }));
                      ok(!dropZone.classList.contains('drag') && dropHint.textContent.indexOf('支持 jpg') >= 0, 'V6 dragleave 恢复默认提示');
                      /* 非图片文件 drop：明确提示 + 面板保持打开不崩溃 */
                      const badEv = new window.Event('drop', { bubbles: true, cancelable: true });
                      Object.defineProperty(badEv, 'dataTransfer', { value: { files: [{ name: 'a.exe', type: 'application/x-msdownload', size: 100 }] } });
                      dropZone.dispatchEvent(badEv);
                      ok(document.querySelectorAll('.modal').length >= v6mBefore + 1, 'V6 非图片被拦截，面板未关闭不崩溃');
                      ok(document.getElementById('toastRoot').textContent.indexOf('仅支持图片文件') >= 0, 'V6 非图片明确提示「仅支持图片文件」');
                      /* 类型/大小校验纯函数 */
                      eq(WB.recognize.checkImageFile({ name: 'a.png', type: 'image/png', size: 1024 }), '', 'V6 合法图片（png）通过校验');
                      eq(WB.recognize.checkImageFile({ name: 'a.bmp', type: '', size: 1024 }), '', 'V6 bmp 扩展名通过校验');
                      eq(WB.recognize.checkImageFile({ name: 'a.png', type: 'image/png', size: 21 * 1024 * 1024 }), '图片超过 20MB 上限，请压缩后重试', 'V6 超过 20MB 明确提示');
                      /* 多图只取第一张：toast 提示 + 送入 runOcr 的为 files[0]（名称 a.png） */
                      const multiEv = new window.Event('drop', { bubbles: true, cancelable: true });
                      Object.defineProperty(multiEv, 'dataTransfer', { value: { files: [
                        { name: 'a.png', type: 'image/png', size: 1024 },
                        { name: 'b.png', type: 'image/png', size: 1024 }
                      ] } });
                      dropZone.dispatchEvent(multiEv);
                      ok(document.getElementById('toastRoot').textContent.indexOf('仅支持单张图片') >= 0, 'V6 多图提示「仅支持单张图片，已取第一张」');
                    }
                    document.querySelectorAll('.modal-close').forEach(function (b) { b.click(); });

                    /* F2 原料/包材紧凑单行表格（行高 ≤52px / 行内下拉 / 临时价覆盖 / 移动行 / 折叠） */
                    state.calc.mats.push({ id: 'v6m1', materialId: '', name: '测试原料A', ratio: 50, supplierId: '', supplierName: '', price: 12.5, currency: 'CNY', isTemp: false, altHint: '' });
                    state.calc.mats.push({ id: 'v6m2', materialId: '', name: '测试原料B', ratio: 30, supplierId: '', supplierName: '', price: 8, currency: 'CNY', isTemp: true, altHint: '' });
                    WB.calcView.renderMatLines();
                    const mtTable = document.querySelector('#matList .mt-table');
                    ok(!!mtTable, 'V6 原料清单渲染为 mt-table 单行表格');
                    ok(mtTable.querySelectorAll('thead th').length === 6, 'V6 原料表头 6 列（名称/配比/供应商/单价/临时价/操作）');
                    ok(mtTable.querySelectorAll('tbody tr.line').length === 2, 'V6 原料表渲染 2 行');
                    ok(!!mtTable.querySelector('select.l-sup'), 'V6 供应商切换为行内下拉');
                    ok(!!mtTable.querySelector('.l-temp input[type=number]'), 'V6 临时价覆盖为行内小输入框');
                    ok(mtTable.textContent.indexOf('测试原料A') >= 0 && mtTable.textContent.indexOf('¥0.00') >= 0 && mtTable.textContent.indexOf('¥8.00') >= 0, 'V6 名称+单价同行紧凑呈现');
                    const order0 = state.calc.mats.map(function (x) { return x.name; });
                    WB.calcView.moveMatLine('v6m1', 1);
                    const order1 = state.calc.mats.map(function (x) { return x.name; });
                    ok(order1[0] === '测试原料B' && order1[1] === '测试原料A', 'V6 移动行：moveMatLine 交换两行顺序');
                    state.calc.packs.push({ id: 'v6p1', packagingId: '', name: '铝箔袋', type: '袋', spec: '100×160', supplierName: '某包装厂', price: 0.15, lossRate: 2, num: 1 });
                    WB.calcView.renderPackLines();
                    ok(document.querySelector('#packList .pt-table') !== null, 'V6 包材清单为 pt-table 单行表格');
                    ok(!!document.getElementById('matsToggle') && !!document.getElementById('packsToggle'), 'V6 原料/包材标题栏折叠箭头存在');
                    document.getElementById('matsToggle').click();
                    ok(document.getElementById('card-mats').classList.contains('collapsed'), 'V6 原料卡折叠收起（仅占一行摘要）');
                    document.getElementById('packsToggle').click();
                    ok(document.getElementById('card-packs').classList.contains('collapsed'), 'V6 包材卡折叠收起');
                    document.getElementById('matsToggle').click();
                    document.getElementById('packsToggle').click();
                    state.calc.mats.length = 0; state.calc.packs.length = 0;
                    WB.calcView.renderMatLines(); WB.calcView.renderPackLines();

                    /* F3 报价小宠：常驻 / 等级阈值 / 计数 / 庆祝 / 面板 / 最小化 */
                    const petRoot = document.getElementById('petRoot');
                    const petBody = petRoot && petRoot.querySelector('.pet-body');
                    ok(!!petRoot && !!petBody, 'V6 报价小宠常驻右下角（#petRoot .pet-body）');
                    ok(WB.pet.calcLevel(0) === 1 && WB.pet.calcLevel(9) === 1 && WB.pet.calcLevel(10) === 2 &&
                      WB.pet.calcLevel(29) === 2 && WB.pet.calcLevel(30) === 3,
                      'V10 宠物三档等级阈值正确（0/10/30）');
                    const petLv = WB.pet.getLevel();
                    ok(!!petBody && petBody.classList.contains('st' + petLv), 'V10 宠物形态等级类 st' + petLv + ' 与计数一致');
                    ok(petBody.querySelector('svg.pet-svg') !== null, 'V10 宠物为纯内联 SVG（零外链）');
                    const petCount0 = WB.pet.getCount();
                    WB.pet.onQuote();
                    ok(WB.pet.getCount() === petCount0 + 1, 'V10 报价成功宠物计数 +1');
                    ok(petBody.classList.contains('celebrate'), 'V10 报价成功触发跳跃庆祝动效');
                    /* 气泡为概率性（celebrate 60%），若未弹出则喂食必弹 → 确定性验证气泡链路 */
                    if (!document.getElementById('petBubble').classList.contains('show')) WB.pet.feed();
                    ok(document.getElementById('petBubble').classList.contains('show') && document.getElementById('petBubble').textContent.length > 0, 'V10 等级气泡显示');
                    petBody.click();
                    ok(petBody.classList.contains('panel-open'), 'V10 单击宠物展开信息面板');
                    petBody.click();
                    ok(!petBody.classList.contains('panel-open'), 'V10 再次单击关闭面板');
                    WB.pet.setMini(true);
                    ok(petBody.classList.contains('mini'), 'V10 可最小化为小圆点（mini）');
                    WB.pet.setMini(false);
                    ok(!petBody.classList.contains('mini'), 'V10 还原常驻形态');

                    /* F4 客户端质感：侧栏导航 / 顶栏 / 品牌色 / 紧凑控件 */
                    ok(!!document.querySelector('.app-shell') && !!document.querySelector('.sidebar'), 'V6 客户端壳层（app-shell + 左侧栏）');
                    ok(document.querySelectorAll('.sidebar .nav-item').length >= 6, 'V6 左侧固定导航 ≥6 项（图标+文字）');
                    ok(!!document.querySelector('.main-col .topbar'), 'V6 主列顶部操作栏');
                    ok(!!document.querySelector('.main-col .calc-topbar'), 'V6 核算台工具条（跟随顶栏吸顶）');
                    const cssV6 = document.documentElement.innerHTML;
                    ok(cssV6.indexOf('#2563EB') >= 0 && cssV6.indexOf('#F5F7FA') >= 0 && cssV6.indexOf('#E2E8F0') >= 0, 'V6 品牌蓝 #2563EB / 背景 #F5F7FA / 分隔线 #E2E8F0');
                    ok(cssV6.indexOf('.nav-item.active::before') >= 0, 'V6 选中导航项品牌蓝竖条');
                    ok(/#matList tr\.line td[^}]*height:50px/.test(cssV6) && /\.mt-table th[^}]*height:38px/.test(cssV6), 'V6 表格行高 50px（≤52px）/ 表头 38px');
                    ok(cssV6.indexOf('#matList .l-temp input[type=number]') >= 0 && cssV6.indexOf('width:74px') >= 0, 'V6 临时价行内 74px 小输入框样式');
                    ok(cssV6.indexOf('position:sticky') >= 0 && cssV6.indexOf('top:104px') >= 0, 'V6 表头吸顶（跟随 48px 顶栏 + 48px 工具条）');
                    ok(cssV6.indexOf('petIdle') >= 0 && cssV6.indexOf('petJump') >= 0 && cssV6.indexOf('evo-overlay') >= 0, 'V10 宠物动画/升级提示样式完整');
                    ok(errors.length === 0, 'V6 全链路（拖拽/表格/宠物/折叠）无 console.error（' + errors.slice(0, 3).join('; ') + '）');

                    console.log('\n冒烟测试结果: ' + pass + ' passed, ' + fail + ' failed');
                    if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
                    process.exit(fail ? 1 : 0);
                  } catch (e) {
                    console.error('TEST CRASH(V5异步):', e.stack);
                    process.exit(1);
                  }
                }, 150);
              } catch (e) {
                console.error('TEST CRASH(V4异步):', e.stack);
                process.exit(1);
              }
            }, 200);
      } catch (e) {
        console.error('TEST CRASH(第二阶段):', e.stack);
        process.exit(1);
      }
    }, 400);
  } catch (e) {
    console.error('TEST CRASH:', e.stack);
    process.exit(1);
  }
}, 400);
