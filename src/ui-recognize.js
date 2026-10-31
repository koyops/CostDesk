/* ============================================================
 * ui-recognize.js — 配方识别三入口 + 识别确认（先确认后入库）+ 识别历史
 * 入口：图片识别（Tesseract.js 纯浏览器 OCR，失败降级手动粘贴）
 *       文字识别（粘贴配方文字，直达结构化解析）
 *       文本配方（TXT / Word / Excel 文档上传提取）
 * 流程：解析 → 识别确认弹窗（逐行修改/删行/补行/匹配原料库/建草稿）
 *       → 确认后才写入原料清单，未确认不污染任何数据
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, P = global.WB.parse, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc, num = C.num;

  var state = S.state;

  var UNIT_OPTIONS = ['μg', 'mg', 'g', 'kg', 'IU', '%', 'ml', 'L', '粒', '片', '袋', '滴', '杯', '支', '瓶'];

  /* ============================================================
   * V14：识别弹窗「✨AI 识别」快捷入口
   * - 已配置（设置里 开启 + Endpoint + Key 齐全）：默认优先送 AI
   *     · 图片 → 视觉模型（base64 直读）
   *     · 文本 / 报价单 → 文本模型
   *   失败/无返回自动回退本地解析（原有链路不变）。
   * - 未配置：按钮置灰，点击提示「请到 设置 → AI 识别 配置」并直接跳转。
   * - 开关状态记忆在 meta.ui.aiPref，四个识别弹窗共用同一偏好。
   * ============================================================ */
  function aiConfigured() {
    var sm = global.WB.smart;
    return !!(sm && sm.aiConfig && sm.aiConfig());
  }
  function aiPrefOn() {
    var ui = (state.meta && state.meta.ui) || {};
    return ui.aiPref !== false;
  }
  function setAiPref(v) {
    if (!state.meta.ui) state.meta.ui = {};
    state.meta.ui.aiPref = !!v;
    S.persist();
  }
  /* 是否真的走 AI：已配置 且 用户没关掉 */
  function aiActive() { return aiConfigured() && aiPrefOn(); }
  /* 跳转设置页并定位到「AI 识别增强」卡片 */
  function gotoAiSettings() {
    if (global.WB.app && global.WB.app.switchView) global.WB.app.switchView('settings');
    setTimeout(function () {
      var card = $('card-ai');
      if (card && card.scrollIntoView) { try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
      var ep = $('s-aiEndpoint');
      if (ep && ep.focus) { try { ep.focus({ preventScroll: true }); } catch (e2) { ep.focus(); } }
    }, 120);
  }
  /* 弹窗顶部 AI 开关（HTML 片段） */
  function aiToggleHtml() {
    var on = aiConfigured();
    var active = on && aiPrefOn();
    var state_txt = on ? (active ? '优先 AI' : '已关闭') : '未配置';
    var tip = on
      ? (active
        ? '已配置：图片送视觉模型、文本/报价单送文本模型；失败自动回退本地解析'
        : '已关闭：本次全部走本地解析（点击重新开启）')
      : '未配置 AI：点击右侧按钮前往「设置 → AI 识别」填写 Endpoint / Key';
    return '<div class="ai-bar' + (on ? '' : ' ai-bar-off') + '">' +
      '<button type="button" class="ai-toggle' + (active ? ' on' : '') + (on ? '' : ' off') + '" id="recAiToggle" ' +
        'title="' + esc(tip) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<span class="ait-ic">✨</span><span class="ait-t">AI 识别</span>' +
        '<span class="ait-state" id="recAiState">' + state_txt + '</span>' +
      '</button>' +
      '<span class="ai-tip">' + esc(tip) + '</span>' +
      (on ? '' : '<button type="button" class="btn btn-xs" id="recAiGoto">去设置</button>') +
      '</div>';
  }
  /* 绑定开关注（在每个弹窗创建后调用一次） */
  function bindAiToggle(root) {
    if (!root) return;
    var btn = root.querySelector('#recAiToggle');
    var gotoTip = function () { U.toast('请到 设置 → AI 识别 配置 Endpoint / Key', 'warn', 3200); gotoAiSettings(); };
    if (btn) btn.addEventListener('click', function () {
      if (!aiConfigured()) { gotoTip(); return; }
      var v = !aiPrefOn();
      setAiPref(v);
      refreshAiToggle(root);
      U.toast(v ? 'AI 识别已开启：优先送 AI，失败自动回退本地' : 'AI 识别已关闭：本次全部走本地解析', 'ok');
    });
    var go = root.querySelector('#recAiGoto');
    if (go) go.addEventListener('click', gotoTip);
  }
  function refreshAiToggle(root) {
    var btn = root && root.querySelector ? root.querySelector('#recAiToggle') : null;
    if (!btn) return;
    var on = aiConfigured();
    var active = on && aiPrefOn();
    btn.classList.toggle('on', active);
    btn.classList.toggle('off', !on);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    var st = btn.querySelector('#recAiState') || btn.querySelector('.ait-state');
    if (st) st.textContent = on ? (active ? '优先 AI' : '已关闭') : '未配置';
    var bar = btn.closest ? btn.closest('.ai-bar') : null;
    if (bar) bar.classList.toggle('ai-bar-off', !on);
  }

  /* ================= 三入口事件绑定 ================= */
  function init() {
    var bImg = $('btnImgRecognize'), bTxt = $('btnTextRecognize'), bFile = $('btnFileRecognize');
    if (bImg) bImg.addEventListener('click', imgRecognize);
    if (bTxt) bTxt.addEventListener('click', textRecognize);
    if (bFile) bFile.addEventListener('click', fileRecognize);
    var bh = $('btnRecognHistory');
    if (bh) bh.addEventListener('click', openRecognizeHistory);
    /* 空状态四入口卡片 */
    bindEmptyCard('emptyImg', imgRecognize);
    bindEmptyCard('emptyText', textRecognize);
    bindEmptyCard('emptyAddMat', function () { if (global.WB.calcView.addMaterialLine) global.WB.calcView.addMaterialLine(); });
    bindEmptyCard('emptyFormula', openFormulaPicker);
    /* OCR 可用性静默探测：CDN 不可用 → 隐藏图片识别入口（非死按钮）；
     * 文字识别/文本配方纯本地，始终可用，不受影响 */
    probeOcrAvailability();
  }
  function bindEmptyCard(id, fn) {
    var el = $(id);
    if (el) el.addEventListener('click', fn);
  }
  /* OCR 静默探测：失败即隐藏图片识别入口（顶部按钮 + 空状态卡片），绝不显示「点了没反应」的死按钮 */
  var _tesseractFailed = false;
  function probeOcrAvailability() {
    if (_tesseractFailed) { hideImgEntry(); return; }
    if (typeof Tesseract !== 'undefined' && Tesseract.recognize) return;
    loadTesseract().catch(function () { hideImgEntry(); });
  }
  function hideImgEntry() {
    _tesseractFailed = true;
    var b = $('btnImgRecognize');
    if (b) b.style.display = 'none';
    var ec = $('emptyImg');
    if (ec) ec.style.display = 'none';
  }

  /* ================= 图片识别（Tesseract.js 本地 OCR） ================= */
  var TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var _tesseractPromise = null;
  function loadTesseract() {
    if (typeof Tesseract !== 'undefined' && Tesseract.recognize) return Promise.resolve();
    if (_tesseractPromise) return _tesseractPromise;
    _tesseractPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { _tesseractPromise = null; _tesseractFailed = true; reject(new Error('Tesseract CDN 加载失败')); };
      document.head.appendChild(s);
    });
    return _tesseractPromise;
  }
  /* 图片 → base64 dataURL（AI 视觉识别用） */
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('读取图片失败')); };
      fr.readAsDataURL(file);
    });
  }
  /* 图片 OCR 全链路（V13 分层）：AI 视觉优先（已配置时）→ 失败/无网回退本地 Tesseract OCR（本地模式）
   * → 文本解析 → 识别确认表；任何环节失败降级手动粘贴 + 重试 */
  function runOcr(file) {
    var scan = scanning(file.name);
    var sm = global.WB.smart;
    var cfg = (sm && sm.aiConfig) ? sm.aiConfig() : null;
    if (cfg && aiPrefOn()) {          /* V14：弹窗开关关闭时强制走本地 */
      scan.update('AI 视觉识别中', 0.15);
      fileToDataUrl(file).then(function (du) {
        return sm.aiVisionImage(du);
      }).then(function (ai) {
        if (ai && ai.length) {
          scan.close();
          U.toast('AI 视觉识别完成（' + ai.length + ' 行），请核对确认', 'ok');
          parseFromAi(ai, String(file.name || '图片'), 'img');
          return null;
        }
        U.toast('AI 识别失败或无返回，已回退本地 OCR（本地模式）', 'warn');
        return localOcr(file, scan);
      }).catch(function () {
        U.toast('AI 识别异常，已回退本地 OCR（本地模式）', 'warn');
        return localOcr(file, scan);
      });
    } else {
      localOcr(file, scan);
    }
  }
  /* 本地 OCR（Tesseract.js chi_sim+eng）→ parseFromText */
  function localOcr(file, scan) {
    return loadTesseract().then(function () {
      return Tesseract.recognize(file, 'chi_sim+eng', {
        logger: function (m) {
          if (!m || typeof m.progress !== 'number') return;
          scan.update(m.status === 'recognizing text' ? '文字识别中（本地模式）' : ((m.status || '识别中') + '（本地模式）'), m.progress);
        }
      });
    }).then(function (r) {
      var text = (r && r.data && r.data.text) || '';
      scan.close();
      if (!text.trim()) { openOcrFallback(file, true); return; }
      parseFromText(text, 'img');
    }).catch(function () {
      scan.close();
      openOcrFallback(file, true);
    });
  }
  function ensureImgInput(onPick) {
    var inp = $('recImgInput');
    if (inp) { if (onPick) inp._onPick = onPick; return inp; }
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.id = 'recImgInput';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      if (!inp.files || !inp.files[0]) return;
      if (inp._onPick) {
        var cb = inp._onPick;
        inp._onPick = null;
        cb(inp.files[0]);
        return;
      }
      runOcr(inp.files[0]);
    });
    return inp;
  }
  /* 图片文件校验：类型（jpg/png/webp/bmp）与大小（≤20MB）；不合法返回提示文案，合法返回空串 */
  function checkImageFile(f) {
    var name = (f.name || '').toLowerCase();
    var okExt = /\.(jpe?g|png|webp|bmp)$/.test(name);
    var okType = /^image\/(jpeg|png|webp|bmp)$/.test(f.type || '');
    if (!okExt && !okType) return '仅支持图片文件（jpg / png / webp / bmp）';
    if (f.size > 20 * 1024 * 1024) return '图片超过 20MB 上限，请压缩后重试';
    return '';
  }
  /* V5：图片识别入口 → 拖放面板（整体为拖放区：dragover 高亮 + drop 立即识别） */
  function openImgPickPanel() {
    var html = aiToggleHtml() +
      '<p class="muted" style="font-size:12px;margin-bottom:10px">将配方图片（配料表照片 / 标签 / 供应商资料图）拖入下方区域，或点击选择图片。支持 <b>jpg / png / webp / bmp</b>，单张不超过 <b>20MB</b>，一次仅识别一张。</p>' +
      '<div class="ocr-drop" id="ocrDrop" role="button" tabindex="0" aria-label="选择或拖拽配方图片">' +
        '<div class="od-ic">' + U.ic('image', 30) + '</div>' +
        '<div class="od-t">点击选择 或 拖拽图片到此处</div>' +
        '<div class="od-s" id="ocrDropHint">支持 jpg / png / webp / bmp · ≤20MB</div>' +
      '</div>';
    var m = U.openModal(html, {
      title: '图片识别配方',
      wide: false,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '手动粘贴文字', cls: '', onClick: function () {
            m.close();
            openOcrFallback({ name: '图片' }, false);
          }
        }
      ]
    });
    bindAiToggle(m.el);
    var drop = m.el.querySelector('#ocrDrop');
    var hint = m.el.querySelector('#ocrDropHint');
    if (!drop) return;
    function setDrag(on) {
      drop.classList.toggle('drag', on);
      if (hint) {
        hint.textContent = on ? '松开上传，开始识别…' : '支持 jpg / png / webp / bmp · ≤20MB';
        hint.classList.toggle('drag-hint', on);
      }
    }
    drop.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDrag(true);
    });
    drop.addEventListener('dragenter', function (e) { e.preventDefault(); setDrag(true); });
    drop.addEventListener('dragleave', function () { setDrag(false); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      setDrag(false);
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) { U.toast('未检测到文件，请重试', 'warn'); return; }
      if (files.length > 1) U.toast('仅支持单张图片，已取第一张进行识别', 'warn');
      var f = files[0];
      var err = checkImageFile(f);
      if (err) { U.toast(err + '，已忽略', 'err'); return; }
      m.close();
      runOcr(f);
    });
    drop.addEventListener('click', function () {
      var inp = ensureImgInput(function (f) {
        var err = checkImageFile(f);
        if (err) { U.toast(err + '，已忽略', 'err'); return; }
        m.close();
        runOcr(f);
      });
      inp.value = '';
      inp.click();
    });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); }
    });
  }
  function imgRecognize() {
    /* 已知 OCR 引擎不可用：直接走手动粘贴降级，不再经过选图-识别-失败的无效链路 */
    if (_tesseractFailed) {
      U.toast('OCR 引擎不可用（离线或网络受限），已切换为手动粘贴图片文字', 'warn');
      openOcrFallback({ name: '图片' }, false);
      return;
    }
    openImgPickPanel();
  }
  /* 扫描加载态（进度驱动，不自动超时关闭；返回 update/close 句柄） */
  function scanning(name, kind) {
    var isDoc = kind === 'doc';
    var scan = U.openModal(
      '<div class="scan-box"><div class="scan-ring"></div>' +
      '<p class="scan-text">' + (isDoc ? '正在解析文档：' : '正在识别图片：') + '<b>' + esc(name) + '</b></p>' +
      '<p class="scan-prog">加载识别引擎…</p>' +
      '<div class="scan-track"><div class="scan-fill" style="width:0%"></div></div></div>',
      { title: isDoc ? '文档解析' : '图片识别', static: true, footBtns: [] }
    );
    function update(status, progress) {
      var st = scan.el.querySelector('.scan-prog');
      var fill = scan.el.querySelector('.scan-fill');
      var pct = progress == null ? 0 : Math.max(0, Math.min(100, Math.round(progress * 100)));
      if (st) st.textContent = (status || '识别中') + ' · ' + pct + '%';
      if (fill) fill.style.width = pct + '%';
    }
    function close() {
      setTimeout(function () { scan.close(); }, 260);
    }
    return { update: update, close: close };
  }
  /* OCR 降级：本地识别失败 / CDN 不可用 → 手动粘贴图片文字（含重试按钮） */
  function openOcrFallback(file, withRetry) {
    var tip = withRetry
      ? '本地 OCR 识别未能完成（CDN 加载失败或图片文字不清晰）。<b>可将图片中的配料表文字粘贴到下方</b>，系统会自动结构化解析；或点击下方「重试图片识别」。'
      : '请将图片中的配料表文字粘贴到下方，系统会自动结构化解析（如「每粒含：维生素C 200mg，牛磺酸 100mg」）。';
    var html = aiToggleHtml() +
      '<p class="muted" style="font-size:12px;margin-bottom:8px">' + tip + '</p>' +
      '<textarea id="ocrText" rows="8" class="recognize-ta" placeholder="粘贴图片中的配料表文字，如：&#10;每粒含：维生素C（抗坏血酸）200mg，牛磺酸 100mg&#10;辅料：淀粉、硬脂酸镁&#10;由XX生物科技有限公司提供"></textarea>' +
      '<p class="muted" style="font-size:11px;margin-top:6px">支持 中英文单位、每粒含/每100g含 前缀、顿号逗号分号、括号别称、辅料行、百分比。</p>';
    var m = U.openModal(html, {
      title: '图片文字提取（' + esc(file.name) + '）',
      wide: true,
      footBtns: (withRetry
        ? [{ text: '重试图片识别', cls: '', onClick: function () { m.close(); runOcr(file); } }]
        : []
      ).concat([
        { text: '取消', cls: '' },
        {
          text: '开始解析', cls: 'btn-primary', onClick: function () {
            var v = m.el.querySelector('#ocrText').value;
            if (!v.trim()) { U.toast('请先粘贴文字', 'warn'); return false; }
            parseFromText(v, 'img');
          }
        }
      ])
    });
    bindAiToggle(m.el);
    var ta = m.el.querySelector('#ocrText');
    setTimeout(function () { if (ta && document.activeElement !== ta) ta.focus(); }, 60);
  }

  /* ================= 文字识别 ================= */
  function textRecognize() {
    var html = aiToggleHtml() +
      '<p class="muted" style="font-size:12px;margin-bottom:8px">粘贴配方/配料表文字，系统自动拆分成结构化成分行。支持多行，可用逗号、顿号、分号分隔。</p>' +
      '<textarea id="recText" rows="8" class="recognize-ta" placeholder="示例：&#10;每粒含：维生素C（抗坏血酸）200mg，牛磺酸 100mg，锌 5mg&#10;辅料：淀粉、硬脂酸镁、二氧化硅&#10;净含量：60g（30粒）&#10;由XX生物科技有限公司提供"></textarea>' +
      '<div class="recognize-demo muted" style="font-size:11px;margin-top:6px">' + U.ic('sparkles', 13) + ' 试试点一下填入示例</div>';
    var m = U.openModal(html, {
      title: '文字识别配方',
      wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        {
          text: '开始解析', cls: 'btn-primary', onClick: function () {
            var v = m.el.querySelector('#recText').value;
            if (!v.trim()) { U.toast('请先粘贴配方文字', 'warn'); return false; }
            parseFromText(v, 'text');
          }
        }
      ]
    });
    bindAiToggle(m.el);
    var demo = m.el.querySelector('.recognize-demo');
    if (demo) demo.addEventListener('click', function () {
      m.el.querySelector('#recText').value = '每粒含：维生素C（抗坏血酸）200mg，牛磺酸 100mg，锌 5mg\n辅料：淀粉、硬脂酸镁、二氧化硅\n净含量：60g（30粒）\n由XX生物科技有限公司提供';
    });
    setTimeout(function () { var ta = m.el.querySelector('#recText'); if (ta) ta.focus(); }, 60);
  }

  /* ================= 文本配方（文件上传） ================= */
  function ensureFileInput() {
    var inp = $('recFileInput');
    if (inp) return inp;
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.txt,.doc,.docx,.xls,.xlsx';
    inp.id = 'recFileInput';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      if (!inp.files || !inp.files[0]) return;
      handleDocFile(inp.files[0]);
    });
    return inp;
  }
  /* 文档 → 提取文字 → 解析（原 fileRecognize 内联逻辑抽出，供弹窗与 input 共用） */
  function handleDocFile(f) {
    var scan = scanning(f.name, 'doc');
    extractDocText(f, function (text) {
      scan.close();
      if (text && text.trim()) {
        parseFromText(text, 'file');
      } else {
        U.toast('未能从该文档提取文字，请改用「文字识别」粘贴内容', 'warn');
        textRecognize();
      }
    });
  }
  /* V14：文本配方入口改为面板（顶部 ✨AI 识别 开关），面板内再选文件/拖拽上传 */
  function fileRecognize() {
    var html = aiToggleHtml() +
      '<p class="muted" style="font-size:12px;margin-bottom:10px">上传配方文档（<b>TXT / Word(.docx) / Excel(.xlsx)</b>），自动提取文字并结构化解析。老格式 .doc / .xls 请先另存为新格式，或改用「文字识别」粘贴内容。</p>' +
      '<div class="ocr-drop" id="recFileDrop" role="button" tabindex="0" aria-label="选择或拖拽配方文档">' +
        '<div class="od-ic">' + U.ic('file', 30) + '</div>' +
        '<div class="od-t">点击选择 或 拖拽文档到此处</div>' +
        '<div class="od-s">支持 txt / docx / xlsx</div>' +
      '</div>';
    var m = U.openModal(html, {
      title: '文本配方识别',
      footBtns: [
        { text: '取消', cls: '' },
        { text: '手动粘贴文字', cls: '', onClick: function () { m.close(); textRecognize(); } }
      ]
    });
    bindAiToggle(m.el);
    /* 预创建隐藏文件输入，保证入口链路与旧版一致（#recFileInput 始终就绪） */
    var inp = ensureFileInput();
    var drop = m.el.querySelector('#recFileDrop');
    if (!drop) return;
    function pick() { inp.value = ''; inp.click(); }
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('drag');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) { U.toast('未检测到文件，请重试', 'warn'); return; }
      m.close();
      handleDocFile(files[0]);
    });
  }

  /* ================= 文档文本提取（TXT / DOCX / XLSX，纯前端尽力而为） ================= */
  function extractDocText(file, cb) {
    var name = (file.name || '').toLowerCase();
    if (/\.txt$/.test(name) || /\.csv$/.test(name)) {
      var r = new FileReader();
      r.onload = function () { cb(String(r.result || '')); };
      r.onerror = function () { cb(null); };
      r.readAsText(file, 'utf-8');
      return;
    }
    if (/\.(docx|xlsx)$/.test(name)) {
      var br = new FileReader();
      br.onload = function () {
        try {
          zipExtractText(br.result, /\.docx$/.test(name), cb);
        } catch (e) { cb(null); }
      };
      br.onerror = function () { cb(null); };
      br.readAsArrayBuffer(file);
      return;
    }
    cb(null); // .doc / .xls 老格式二进制，无内置解析
  }
  /* 极简 ZIP 中央目录读取 + DecompressionStream 解压 */
  function zipExtractText(buf, isDocx, cb) {
    if (typeof DecompressionStream === 'undefined') { cb(null); return; }
    var view = new DataView(buf);
    var eocd = -1;
    for (var i = buf.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) { cb(null); return; }
    var count = view.getUint16(eocd + 10, true);
    var cdStart = view.getUint32(eocd + 16, true);
    var entries = [];
    var off = cdStart;
    for (var n = 0; n < count; n++) {
      if (view.getUint32(off, true) !== 0x02014b50) break;
      var method = view.getUint16(off + 10, true);
      var compSize = view.getUint32(off + 20, true);
      var nameLen = view.getUint16(off + 28, true);
      var extraLen = view.getUint16(off + 30, true);
      var commentLen = view.getUint16(off + 32, true);
      var localOff = view.getUint32(off + 42, true);
      var name = '';
      for (var j = 0; j < nameLen; j++) name += String.fromCharCode(view.getUint8(off + 46 + j));
      entries.push({ name: name, method: method, compSize: compSize, localOff: localOff });
      off += 46 + nameLen + extraLen + commentLen;
    }
    var wanted = isDocx ? /^word\/document\.xml$/ : /^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/;
    var tasks = entries.filter(function (e) { return wanted.test(e.name) && e.method === 8; });
    if (!tasks.length) { cb(null); return; }
    var texts = [], pending = tasks.length, done = false;
    tasks.forEach(function (e) {
      var lo = e.localOff;
      var nameLen2 = view.getUint16(lo + 26, true);
      var extraLen2 = view.getUint16(lo + 28, true);
      var dataStart = lo + 30 + nameLen2 + extraLen2;
      var slice = buf.slice(dataStart, dataStart + e.compSize);
      inflate(slice).then(function (decomp) {
        var xml = new TextDecoder('utf-8').decode(decomp);
        if (isDocx) {
          texts.push(stripXml(xml));
        } else {
          var t = '';
          var re = /<t[^>]*>([\s\S]*?)<\/t>/g, m;
          while ((m = re.exec(xml))) t += unescapeXml(m[1]) + ' ';
          texts.push(t);
        }
      }).catch(function () { texts.push(''); }).then(function () {
        pending--;
        if (pending === 0 && !done) { done = true; cb(texts.join('\n').replace(/\n{2,}/g, '\n')); }
      });
    });
  }
  function inflate(buf) {
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([buf]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer();
  }
  function stripXml(xml) {
    return unescapeXml(xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ' '));
  }
  function unescapeXml(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /* ================= 解析入口（三入口汇合；V13：AI 结构化优先并带来源标记，未配置走本地同步「本地模式」，失败回退本地） ================= */
  function aiItemsToRes(ai, rawText) {
    var res = { rawText: String(rawText || ''), items: [], suppliers: [], prefix: 'AI 结构化', netContent: '', warns: [], aiUsed: true };
    ai.forEach(function (r) {
      if (!r || !r.name) return;
      res.items.push({
        name: String(r.name).trim(),
        amount: (r.amount === undefined || r.amount === null) ? null : Number(r.amount),
        unit: r.unit || null,
        kind: r.kind === 'excipient' ? 'excipient' : 'active',
        confidence: (typeof r.confidence === 'number') ? r.confidence : 0.8,
        note: r.note ? String(r.note) : '', raw: ''
      });
    });
    return res;
  }
  /* AI 结果直接进确认表（图片视觉通道入口） */
  function parseFromAi(ai, rawText, sourceType) {
    var res = aiItemsToRes(ai, rawText);
    afterParse(res, sourceType);
  }
  function parseFromText(text, sourceType) {
    var sm = global.WB.smart;
    if (sm && sm.aiConfig() && aiPrefOn()) {   /* V14：弹窗开关关闭时强制走本地 */
      sm.aiStructure(text || '', 'formula').then(function (ai) {
        var res;
        if (ai && ai.length) {
          res = aiItemsToRes(ai, text);
        } else {
          U.toast('AI 识别失败或无返回，已回退本地解析（本地模式）', 'warn');
          res = P.parseFormulaText(text || '');
          res.prefix = res.prefix || '本地模式';
        }
        afterParse(res, sourceType);
      });
    } else {
      var res = P.parseFormulaText(text || '');
      res.prefix = res.prefix || '本地模式';
      afterParse(res, sourceType);
    }
  }
  function afterParse(res, sourceType) {
    if (!res.items.length) {
      U.toast('未能解析出成分行，请检查格式（如：维生素C 200mg，用逗号/顿号分隔）', 'warn');
      return;
    }
    var items = P.matchMaterial(res.items, state.data.materials);
    openRecognizeConfirm(items, sourceType, res.rawText || '', res);
  }

  /* ================= 识别确认弹窗（先确认后入库） ================= */
  function openRecognizeConfirm(items, sourceType, rawText, res) {
    res = res || {};
    /* 同单位 → 自动换算含量% */
    var rows = items.map(function (it) { return makeRow(it); });
    var warns = res.warns || [];
    var head = '';
    /* V13：识别来源标记（AI 模式 / 本地模式），让用户明确当前结果出自哪条链路 */
    head += '<span class="rec-tag ' + (res.aiUsed ? 'rec-ai' : 'rec-local') + '">' + (res.aiUsed ? 'AI 模式' : '本地模式') + '</span>';
    if (res.prefix) head += '<span class="rec-tag">' + esc(res.prefix) + '</span>';
    if (res.netContent) head += '<span class="rec-tag">净含量 ' + esc(res.netContent) + '</span>';
    if (res.suppliers && res.suppliers.length) head += '<span class="rec-tag">供应商：' + res.suppliers.map(esc).join('、') + '</span>';
    if (warns.length) head += '<span class="rec-tag rec-warn">⚠ ' + warns.map(esc).join('；') + '</span>';

    var body =
      '<div class="rec-head">' + (head || '<span class="muted" style="font-size:12px">已解析 ' + rows.length + ' 行成分，请核对后确认导入</span>') + '</div>' +
      '<div class="rec-table-wrap"><table class="rec-table">' +
      '<tr><th style="width:26px">#</th><th>原料名称</th><th style="width:84px">用量</th><th style="width:70px">单位</th><th style="width:110px">含量%</th><th style="width:96px">类型</th><th>匹配原料库</th><th style="width:70px">置信</th><th style="width:64px">操作</th></tr>' +
      '<tbody id="recRows"></tbody></table></div>' +
      '<div class="rec-ops">' +
      '<button type="button" class="btn btn-sm" id="recAddRow">' + U.ic('plus', 14) + '补一行</button>' +
      '<button type="button" class="btn btn-sm" id="recMatchAll">' + U.ic('swap', 14) + '一键匹配原料库</button>' +
      '<span class="muted" style="font-size:11px">确认前不会写入任何数据；未匹配的行可点击「建草稿」入原料库。</span>' +
      '</div>';

    var m = U.openModal(body, {
      title: '识别确认 · ' + (sourceType === 'img' ? '图片' : sourceType === 'file' ? '文本配方' : '粘贴文字') + '（' + rows.length + ' 行）',
      wide: true,
      footBtns: [
        { text: '取消', cls: '' },
        { text: '重新识别', cls: '', onClick: function () { if (sourceType === 'text') textRecognize(); else textRecognize(); } },
        {
          text: '确认导入原料清单', cls: 'btn-primary', onClick: function () {
            return confirmImport(rows, sourceType, rawText, res, m);
          }
        }
      ]
    });

    /* 补一行 / 一键匹配原料库：位于 .rec-ops（#recRows tbody 之外），是常驻静态按钮，
     * 只在弹窗创建时绑定一次。若放进 bindRowEvents（每次 render 都执行），监听器会
     * 不断叠加，导致点一次「补一行」实际插入多行（V4 回归缺陷，本修复为根因） */
    var addBtn = m.el.querySelector('#recAddRow');
    if (addBtn) addBtn.addEventListener('click', function () {
      rows.push({ name: '', amount: null, unit: null, kind: 'active', confidence: 0.5, note: '', raw: '', matchedMaterialId: '' });
      render();
    });
    var ma = m.el.querySelector('#recMatchAll');
    if (ma) ma.addEventListener('click', function () {
      var matched = P.matchMaterial(rows, state.data.materials);
      var n = 0;
      rows.forEach(function (r, i) { r.matchedMaterialId = matched[i].matchedMaterialId; if (r.matchedMaterialId) n++; });
      U.toast('已匹配 ' + n + ' / ' + rows.length + ' 行到原料库', n === rows.length ? 'ok' : 'warn');
      render();
    });

    function render() {
      var tb = m.el.querySelector('#recRows');
      var html = '';
      rows.forEach(function (r, idx) {
        var matched = r.matchedMaterialId ? S.materialById(r.matchedMaterialId) : null;
        var confCls = r.confidence >= 0.9 ? 'conf-hi' : (r.confidence >= 0.7 ? 'conf-mid' : 'conf-lo');
        /* V13：低置信/乱码行 → 整行红标 + 「待确认」标记，不允许静默当作正确值 */
        var pending = r.confidence < 0.7 || /乱码|待确认/.test(r.note || '');
        html += '<tr data-i="' + idx + '"' + (pending ? ' class="row-low"' : '') + '>' +
          '<td>' + (idx + 1) + '</td>' +
          '<td><input class="r-name" value="' + esc(r.name) + '" data-i="' + idx + '">' +
            (pending ? '<span class="rec-pending" title="' + esc(r.note || '置信度低') + '">待确认</span>' : '') +
            '<span class="src-badge ' + (res.aiUsed ? 'src-ai' : 'src-local') + '">' + (res.aiUsed ? 'AI' : '本地') + '</span>' + '</td>' +
          '<td><input class="r-amount" type="number" min="0" step="any" value="' + (r.amount === null ? '' : esc(r.amount)) + '" data-i="' + idx + '"></td>' +
          '<td><select class="r-unit" data-i="' + idx + '">' + unitOptions(r.unit) + '</select></td>' +
          '<td><input class="r-ratio" type="number" min="0" step="0.01" value="' + (r.ratio === null || r.ratio === undefined ? '' : esc(global.WB.smart ? global.WB.smart.fmtRatio(r.ratio) : r.ratio)) + '" data-i="' + idx + '" title="换算后的含量，可手动修改"></td>' +
          '<td><select class="r-kind" data-i="' + idx + '">' +
          '<option value="active"' + (r.kind !== 'excipient' ? ' selected' : '') + '>有效成分</option>' +
          '<option value="excipient"' + (r.kind === 'excipient' ? ' selected' : '') + '>辅料</option></select></td>' +
          '<td>' + (matched
            ? '<span class="rec-match-ok">' + U.ic('check', 13) + ' ' + esc(matched.name) + '</span>'
            : '<span class="rec-match-no">未匹配</span> <button type="button" class="btn btn-xs" data-i="' + idx + '" data-act="draft">建草稿</button>') + '</td>' +
          '<td><span class="conf ' + confCls + '">' + Math.round(r.confidence * 100) + '%</span></td>' +
          '<td><button type="button" class="btn btn-xs" data-i="' + idx + '" data-act="rerow" title="重新识别这一行（AI 已配置时走 AI，否则本地规则）">' + U.ic('swap', 12) + '</button>' +
          '<button type="button" class="btn btn-xs btn-danger" data-i="' + idx + '" data-act="del" title="删除该行">' + U.ic('close', 12) + '</button></td>' +
          '</tr>';
      });
      tb.innerHTML = html;
      bindRowEvents(m);
    }
    function unitOptions(cur) {
      var html = '<option value="">—</option>';
      UNIT_OPTIONS.forEach(function (u) {
        html += '<option value="' + u + '"' + (u === cur ? ' selected' : '') + '>' + u + '</option>';
      });
      return html;
    }
    function bindRowEvents(m) {
      var tb = m.el.querySelector('#recRows');
      $$('input.r-name, input.r-amount, input.r-ratio', tb).forEach(function (inp) {
        inp.addEventListener('input', function () {
          var r = rows[Number(this.getAttribute('data-i'))];
          if (!r) return;
          if (inp.classList.contains('r-name')) r.name = inp.value;
          else if (inp.classList.contains('r-amount')) r.amount = inp.value === '' ? null : num(inp.value);
          else r.ratio = inp.value === '' ? null : num(inp.value);
        });
      });
      $$('select.r-unit, select.r-kind', tb).forEach(function (sel) {
        sel.addEventListener('change', function () {
          var r = rows[Number(this.getAttribute('data-i'))];
          if (!r) return;
          if (sel.classList.contains('r-unit')) { r.unit = sel.value; recomputeRatio(); }
          else r.kind = sel.value;
        });
      });
      $$('button[data-act=del]', tb).forEach(function (b) {
        b.addEventListener('click', function () {
          rows.splice(Number(this.getAttribute('data-i')), 1);
          if (!rows.length) { U.toast('至少保留一行，或取消', 'warn'); return; }
          recomputeRatio(); render();
        });
      });
      $$('button[data-act=draft]', tb).forEach(function (b) {
        b.addEventListener('click', function () {
          var r = rows[Number(this.getAttribute('data-i'))];
          if (!r) return;
          createDraft(r);
          render();
        });
      });
      /* V13：重新识别这一行（AI 已配置且有原文走 AI 文本通道，否则本地规则重解析） */
      $$('button[data-act=rerow]', tb).forEach(function (b) {
        b.addEventListener('click', function () { rerow(Number(this.getAttribute('data-i'))); });
      });
      /* 注：#recAddRow / #recMatchAll 为 tbody 之外的常驻按钮，已在 openRecognizeConfirm
       * 中一次性绑定，此处不得重复绑定（否则监听器叠加导致补一行插多行） */
    }
    /* V13：单行重识别——应用解析结果到行并回匹配原料库 */
    function rerow(idx) {
      var r = rows[idx];
      if (!r) return;
      var sm = global.WB.smart;
      var line = (r.raw && String(r.raw).trim()) || r.name || '';
      var applyItem = function (it, srcNote) {
        if (!it || !it.name) { U.toast('未能重新解析该行，请手动修改或删除', 'warn'); render(); return; }
        r.name = it.name; r.amount = it.amount; r.unit = it.unit; r.kind = it.kind;
        r.confidence = (typeof it.confidence === 'number') ? it.confidence : 0.6;
        r.note = it.note || srcNote || '';
        var mm = P.matchMaterial([r], state.data.materials);
        r.matchedMaterialId = mm[0].matchedMaterialId;
        recomputeRatio();
        render();
        U.toast('已重新识别：' + r.name + (r.confidence < 0.7 ? '（置信度低，请人工核对）' : ''), r.confidence < 0.7 ? 'warn' : 'ok');
      };
      var applyLocal = function () {
        var rr = P.parseFormulaText(line);
        applyItem(rr.items && rr.items[0], '本地重识别');
      };
      if (line && sm && sm.aiConfig && sm.aiConfig()) {
        sm.aiStructure(line, 'formula').then(function (arr) {
          if (arr && arr[0] && arr[0].name) {
            var a = arr[0];
            applyItem({
              name: String(a.name).trim(),
              amount: (a.amount === undefined || a.amount === null) ? null : Number(a.amount),
              unit: a.unit || null,
              kind: a.kind === 'excipient' ? 'excipient' : 'active',
              confidence: (typeof a.confidence === 'number') ? a.confidence : 0.8,
              note: a.note ? String(a.note) : 'AI 重识别'
            });
          } else applyLocal();
        });
      } else {
        applyLocal();
      }
    }
    function createDraft(r) {
      if (!r.name.trim()) { U.toast('请先填写原料名称', 'warn'); return; }
      var now = new Date().toISOString();
      var sm = global.WB.smart;
      var cat = '识别草稿';
      if (sm) {
        try { var cr = sm.classifyName(r.name.trim()); if (cr && cr.cat) cat = cr.cat; } catch (e) {}
      }
      var mat = {
        id: S.genId('mat'), name: r.name.trim(), inciName: '', casNo: '', grade: '食品级',
        defaultUnit: r.unit || 'kg', moq: 1, category: cat, suppliers: [], priceHistory: [],
        tags: ['识别草稿'], warnLow: undefined, warnHigh: undefined,
        createdAt: now, updatedAt: now
      };
      state.data.materials.push(mat);
      S.persist();
      r.matchedMaterialId = mat.id;
      U.toast('已创建原料草稿：' + r.name + (cat !== '识别草稿' ? '（自动分类：' + cat + '）' : ''), 'ok');
    }
    function recomputeRatio() {
      /* 同单位 → 自动换算含量%（总和=100），不同单位/混合 → 保持原值 */
      var same = true, unit = null, hasAmount = false;
      rows.forEach(function (r) {
        if (r.amount === null || r.amount === undefined) return;
        hasAmount = true;
        var u = r.unit || '';
        if (!unit) unit = u; else if (u !== unit) same = false;
      });
      if (!hasAmount) return;
      if (!same) return;
      var sum = rows.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
      if (!(sum > 0)) return;
      var pctUnit = unit === '%';
      rows.forEach(function (r) {
        if (pctUnit) { if (r.ratio === null || r.ratio === undefined) r.ratio = r.amount; return; }
        r.ratio = r.amount === null ? null : r.amount / sum * 100;
      });
    }
    recomputeRatio();
    render();
    return m;
  }

  /* 构造可编辑行（带含量占位） */
  function makeRow(it) {
    return {
      name: it.name || '', amount: it.amount, unit: it.unit, kind: it.kind || 'active',
      confidence: it.confidence || 0.5, note: it.note || '', raw: it.raw || '',
      matchedMaterialId: it.matchedMaterialId || '', ratio: it.kind === 'excipient' && it.amount === null ? 0 : null
    };
  }

  /* ================= 确认导入（先确认后入库） ================= */
  function confirmImport(rows, sourceType, rawText, res, modal) {
    var valid = rows.filter(function (r) { return (r.name || '').trim(); });
    if (!valid.length) { U.toast('请至少保留一行有效原料', 'warn'); return false; }
    var unmatched = valid.filter(function (r) { return !r.matchedMaterialId; });
    if (unmatched.length) {
      U.toast('有 ' + unmatched.length + ' 行未匹配原料库，请先点击「建草稿」或删除', 'warn');
      return false;
    }
    var badRatio = valid.filter(function (r) { return !(r.ratio > 0) && r.kind === 'active'; });
    if (badRatio.length) {
      U.toast('有效成分「' + badRatio[0].name + '」含量需大于 0，请填写或保持同单位自动换算', 'warn');
      return false;
    }
    /* 入库：写入原料清单 */
    var added = valid.map(function (r) {
      var mat = S.materialById(r.matchedMaterialId);
      var sup = mat ? S.defaultSupplierPrice(mat) : null;
      return {
        id: S.genId('ml'), materialId: r.matchedMaterialId, name: r.name.trim(), ratio: r.ratio === null ? 0 : r.ratio,
        supplierId: sup ? sup.id : '', supplierName: sup ? sup.supplierName : '',
        price: sup ? num(sup.price) : 0, currency: sup ? sup.currency : 'CNY',
        quoteDate: sup ? sup.quoteDate : '', validUntil: sup ? sup.validUntil : '',
        source: sup ? sup.source : '', isTemp: false
      };
    });
    state.calc.mats = state.calc.mats.concat(added);
    if (!state.calc.name) { /* 不给方案起名，保持现状 */ }
    S.persist();
    /* 记录识别历史 */
    S.pushRecognHistory({
      id: S.genId('rec'), sourceType: sourceType, rawText: rawText || '',
      prefix: res.prefix || '', netContent: res.netContent || '',
      suppliers: res.suppliers || [],
      items: valid.map(function (r) { return { name: r.name, amount: r.amount, unit: r.unit, kind: r.kind, ratio: r.ratio, confidence: r.confidence, matchedMaterialId: r.matchedMaterialId }; }),
      createdAt: new Date().toISOString()
    });
    S.persist();
    U.toast('已确认导入 ' + added.length + ' 行原料，可直接一键报价', 'ok');
    global.WB.calcView.fillCalc && global.WB.calcView.fillCalc();
    global.WB.calcView.renderMatLines && global.WB.calcView.renderMatLines();
    global.WB.calcView.renderPackLines && global.WB.calcView.renderPackLines();
    global.WB.calcView.autoCalc && global.WB.calcView.autoCalc();
    return true;
  }

  /* ================= 识别历史（最近 10 次回看复用） ================= */
  function openRecognizeHistory() {
    var list = state.meta.recognizeHistory || [];
    if (!list.length) { U.toast('暂无识别历史', 'warn'); return; }
    var html = '<div class="rec-history">';
    list.forEach(function (rec, idx) {
      var src = rec.sourceType === 'img' ? U.ic('image', 12) + ' 图片' : rec.sourceType === 'file' ? U.ic('file', 12) + ' 文档' : U.ic('text', 12) + ' 文字';
      var preview = String(rec.rawText || '').replace(/\s+/g, ' ').slice(0, 56);
      html += '<div class="rec-h-item">' +
        '<div class="rec-h-main"><span class="rec-tag">' + src + '</span> ' +
        '<b>' + (rec.prefix ? esc(rec.prefix) + '·' : '') + (rec.items ? rec.items.length : 0) + ' 行</b> ' +
        '<span class="muted">' + esc(rec.createdAt ? rec.createdAt.slice(0, 16).replace('T', ' ') : '') + '</span>' +
        '<div class="rec-h-preview">' + esc(preview || '（无原文）') + '</div></div>' +
        '<div class="rec-h-ops">' +
        '<button type="button" class="btn btn-sm" data-i="' + idx + '" data-act="reuse">回看复用</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-i="' + idx + '" data-act="del">删除</button>' +
        '</div></div>';
    });
    html += '</div>';
    var m = U.openModal(html, {
      title: '最近识别记录（最多 10 条）',
      wide: true,
      footBtns: [{ text: '关闭', cls: '' }]
    });
    $$('button[data-act=reuse]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = list[Number(this.getAttribute('data-i'))];
        if (!rec || !rec.items || !rec.items.length) return;
        var items = rec.items.map(function (it) {
          return Object.assign({}, it, { name: it.name, amount: it.amount, unit: it.unit, kind: it.kind, confidence: it.confidence || 0.7, note: '', raw: '' });
        });
        items = P.matchMaterial(items, state.data.materials);
        openRecognizeConfirm(items, rec.sourceType, rec.rawText || '', { prefix: rec.prefix, netContent: rec.netContent, suppliers: rec.suppliers || [] });
      });
    });
    $$('button[data-act=del]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        state.meta.recognizeHistory.splice(Number(this.getAttribute('data-i')), 1);
        S.persist();
        U.toast('已删除该识别记录', 'ok');
        m.close();
        openRecognizeHistory();
      });
    });
  }

  /* ================= 空状态：选配方带入 ================= */
  function openFormulaPicker() {
    var list = state.data.formulas;
    if (!list.length) { U.toast('配方库为空，请先到「配方库」新建', 'warn'); return; }
    var opts = '<option value="">— 选择配方 —</option>';
    list.forEach(function (f) {
      opts += '<option value="' + esc(f.id) + '">' + esc(f.name) + '（' + esc(f.dosageName || '') + '·' + esc(f.type) + '）</option>';
    });
    var m = U.openModal(
      '<label class="field"><span class="f-label">选择配方带入</span><select id="pickFormula">' + opts + '</select></label>' +
      '<p class="muted mt8" style="font-size:12px">带入后将自动填充剂型、克重、含量与包材，可直接调整后一键报价。</p>',
      {
        title: '选配方带入',
        footBtns: [
          { text: '取消', cls: '' },
          {
            text: '带入', cls: 'btn-primary', onClick: function () {
              var fid = m.el.querySelector('#pickFormula').value;
              if (!fid) { U.toast('请先选择配方', 'warn'); return false; }
              global.WB.calcView.applyFormula(fid);
              S.pushRecent('formulas', fid);
              S.persist();
              U.toast('已带入配方', 'ok');
            }
          }
        ]
      }
    );
  }

  global.WB = global.WB || {};
  global.WB.recognize = {
    init: init, parseFromText: parseFromText, openRecognizeConfirm: openRecognizeConfirm,
    openRecognizeHistory: openRecognizeHistory, imgRecognize: imgRecognize,
    textRecognize: textRecognize, fileRecognize: fileRecognize,
    extractDocText: extractDocText, runOcr: runOcr, loadTesseract: loadTesseract,
    openOcrFallback: openOcrFallback, scanning: scanning,
    probeOcrAvailability: probeOcrAvailability, hideImgEntry: hideImgEntry,
    openImgPickPanel: openImgPickPanel, checkImageFile: checkImageFile,
    /* V14：AI 快捷入口（供报价单解析等其它弹窗复用） */
    aiToggleHtml: aiToggleHtml, bindAiToggle: bindAiToggle, aiPrefOn: aiPrefOn,
    setAiPref: setAiPref, aiConfigured: aiConfigured, gotoAiSettings: gotoAiSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
