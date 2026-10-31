/* ============================================================
 * ui-pet.js — V10 招财橘猫（动物系桌宠）
 * 进化机制：仅体型变化（幼猫→成猫→大橘），无闪耀/异色。
 * 保留交互：拖动/记忆/双击收起/喂糖/兴奋/打盹/自检/气泡/进化动画。
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.WB.store, U = global.WB.ui, C = global.WB.calc;
  var $ = U.$, $$ = U.$$, esc = U.esc;

  var LS_KEY = 'WB_PET_V2';
  var SLEEP_MS = 4 * 60 * 1000;   /* 4分钟无操作进入睡眠 */
  var CHECK_MS = 4 * 60 * 1000;   /* 自检间隔 */

  /* ---------- 物种元数据（动物系，可扩展） ---------- */
  var SPECIES = [
    {
      id: 'cat', name: '招财橘猫', stages: ['幼猫', '成猫', '大橘'],
      color: '#F59E5B', desc: '招财进宝，接单大吉！',
      unlockAt: 0
    }
  ];
  var SPMAP = {};
  SPECIES.forEach(function (sp) { SPMAP[sp.id] = sp; });

  /* 缩略图取景：按当前体型缩放后的实际外接框自适应，避免 1.45x 时被容器裁切。
  * 造型外接范围（未缩放）= x 36.25..163.75 / y 0..200（204x320 立绘按高撑满 200 画布）
  * 缩放基点为 (100,190)。 */
  function thumbViewBox(s) {
    var x0 = 100 + (36.25 - 100) * s, x1 = 100 + (163.75 - 100) * s;
    var y0 = 190 + (0 - 190) * s, y1 = 190 + (200 - 190) * s;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var w = (x1 - x0) * 1.10, h = (y1 - y0) * 1.10;
    return (cx - w / 2).toFixed(1) + ' ' + (cy - h / 2).toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1);
  }

  /* 经验阈值：幼0 → 成10 → 终30 */
  var TIERS = [0, 10, 30];

  function defaults() {
    return {
      active: 'cat',
      unlocked: ['cat'],
      pets: { cat: { exp: 0, streak: 0, feeds: 0, name: '', mood: 'idle' } },
      mini: false,
      pos: { x: null, y: null },
      mood: 'idle',
      lastActive: Date.now(),
      logs: [],
      lastCheck: 0
    };
  }

  var data = defaults();
  var curMood = 'idle';
  var sleepCheckT = null;
  var autoCheckT = null;
  var evolveT = null;
  var bubbleT = null;

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          var d = defaults();
          /* V11 兼容：旧版多精灵存档（V6-V9 同 key）active 可能是 fire/elec/sky，
           * 或无 pets 字段/旧 list 数组结构 → 一律回退为默认橘猫，禁止 render 崩溃。 */
          if (typeof o.pets !== 'object' || !o.pets || Array.isArray(o.pets)) o.pets = d.pets;
          if (!SPMAP[o.active]) o.active = d.active;
          if (!Array.isArray(o.unlocked) || !o.unlocked.length) o.unlocked = d.unlocked;
          if (typeof o.pos !== 'object' || !o.pos) {
            /* 旧版在顶层存 x/y：顺手迁移为 pos，保留位置记忆 */
            o.pos = (typeof o.x === 'number' && typeof o.y === 'number') ? { x: o.x, y: o.y } : { x: null, y: null };
          } else {
            o.pos = { x: (typeof o.pos.x === 'number') ? o.pos.x : null, y: (typeof o.pos.y === 'number') ? o.pos.y : null };
          }
          data = Object.assign(d, o);
          SPECIES.forEach(function (sp) {
            if (!data.pets[sp.id]) data.pets[sp.id] = { exp: 0, streak: 0, feeds: 0, name: '', mood: 'idle' };
          });
          if (!SPMAP[data.active]) data.active = d.active;   /* 二次防御 */
        }
      }
    } catch (e) { /* 存储损坏 → 保留 defaults 默认值，不抛异常 */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function item(id) { return data.pets[id] || (data.pets[id] = { exp: 0, streak: 0, feeds: 0, name: '', mood: 'idle' }); }
  function active() { return item(data.active); }

  function calcLevel(exp) {
    for (var i = TIERS.length - 1; i >= 0; i--) if (exp >= TIERS[i]) return i + 1;
    return 1;
  }
  function stageOf(exp) { return Math.min(3, calcLevel(exp)); }
  function levelInfo(lv) {
    if (lv >= 3) return { name: '大橘', next: null, need: 0 };
    var need = TIERS[lv] - (active().exp || 0);
    return { name: SPECIES[0].stages[lv - 1] || '成猫', next: SPECIES[0].stages[lv] || '大橘', need: Math.max(0, need) };
  }

  function formName(lv) {
    return SPECIES[0].stages[Math.max(0, Math.min(2, lv - 1))] || '成猫';
  }

  /* ---------- 三次贝塞尔采样（尾巴环纹按法线生成，保证垂直于尾巴走向） ---------- */
  function bezPt(p0, p1, p2, p3, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }
  function bezTan(p0, p1, p2, p3, t) {
    var u = 1 - t, a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
    return [a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
            a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1])];
  }

  /* ============================================================
   * 桌宠造型 —— 二次元猫娘立绘（贴图版）
   *
   * 素材：204×320 RGBA 单帧立绘，转 WebP(q82) 后 base64 内联，
   *      见 petframes.js 的 PET_FRAMES。零外链、断网可用。
   * 画布：viewBox 0 0 200 200；按高度撑满，宽 127.5，水平居中。
   * 图层：每帧一张 <image>，由 CSS opacity 切换，复用既有契约类：
   *       .eb 睁眼 / .lid 闭眼 / .mh 开心 / .sq 思考眯眼 / .sp 惊讶 /
   *       .rg 委屈 / .sl 睡眠 / .mq 问号 / .an-star 星星 / .an-zzz 呼噜
   * 三体型：外层 <g transform="scale(s)">，s = 0.55 / 1.0 / 1.45
   * ============================================================ */
  var PET_LAYERS = [
    ['open', 'eb'],
    ['closed', 'lid'],
    ['happy', 'mh'],
    ['squint', 'sq'],
    ['surprise', 'sp'],
    ['grab', 'rg'],
    ['sleep', 'sl']
  ];

  function catSvg(stage, moodOpt, fit) {
    var s = stage === 1 ? 0.55 : stage === 2 ? 1.0 : 1.45;
    var m = moodOpt || 'idle';
    var isExcited = m === 'excited';
    var F = (typeof global.PET_FRAMES === 'object' && global.PET_FRAMES) || {};

    /* 204x320 → 高 200 时宽 127.5，水平居中 */
    var IH = 200;
    var IW = 127.5;
    var IX = 36.25;

    var layers = '';
    for (var i = 0; i < PET_LAYERS.length; i++) {
      var key = PET_LAYERS[i][0], cls = PET_LAYERS[i][1];
      var b64 = F[key];
      if (!b64) continue;
      layers += '<image class="' + cls + '" x="' + IX + '" y="0" width="' + IW + '" height="' + IH +
        '" preserveAspectRatio="xMidYMax meet" href="data:image/webp;base64,' + b64 + '"/>';
    }

    /* 情绪叠加件（沿用旧契约：问号 / 星星 / 呼噜） */
    var curiousMark = '<g class="mq"><text x="156" y="48" font-size="24" font-weight="800" fill="#60A5FA" font-family="monospace">?</text></g>';
    var stars = isExcited
      ? '<g class="an-star">' +
          '<polygon points="100,6 103.2,15.6 113,15.6 105.2,21.6 108.2,31 100,25.2 91.8,31 94.8,21.6 87,15.6 96.8,15.6" fill="#FBBF24"/>' +
          '<polygon points="62,18 64.4,23.4 70,23.4 65.6,27 67.2,32.6 62,29.4 56.8,32.6 58.4,27 54,23.4 59.6,23.4" fill="#FBBF24" opacity="0.82"/>' +
          '<polygon points="138,18 140.4,23.4 146,23.4 141.6,27 143.2,32.6 138,29.4 132.8,32.6 134.4,27 130,23.4 135.6,23.4" fill="#FBBF24" opacity="0.82"/>' +
        '</g>'
      : '';
    var zzz = '<g class="an-zzz"><text x="150" y="54" font-size="17" fill="#93C5FD" font-family="monospace">Z</text>' +
      '<text x="163" y="38" font-size="13" fill="#BFDBFE" font-family="monospace">z</text></g>';

    var content = layers + curiousMark + stars + zzz;

    var scaleGroup = '<g transform="translate(100,190) scale(' + s + ') translate(-100,-190)">' + content + '</g>';
    var vb = fit ? thumbViewBox(s) : '0 0 200 200';
    return '<svg class="pet-svg" viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + scaleGroup + '</svg>';
  }

  function svgSpecies(id, stage, shiny, fit) {
    /* shiny 参数保留兼容但忽略 */
    var st = Math.max(1, Math.min(3, stage || 1));
    return catSvg(st, data.pets[data.active] ? data.pets[data.active].mood : 'idle', !!fit);
  }

  /* ---------- DOM 辅助 ---------- */
  function rootEl() { return $('petRoot'); }
  function bodyEl() { return $('petBody'); }

  function applyPos() {
    var r = rootEl();
    if (!r) return;
    var p = data.pos || {};
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      r.style.right = 'auto'; r.style.bottom = 'auto';
      r.style.left = p.x + 'px'; r.style.top = p.y + 'px';
    } else {
      r.style.left = 'auto'; r.style.top = 'auto';
      r.style.right = '22px'; r.style.bottom = '22px';
    }
  }
  function resetPos(silent) {
    data.pos = { x: null, y: null };
    save();
    applyPos();
    if (!silent) U.toast('桌宠位置已重置', 'ok');
  }
  function setPos(x, y) { data.pos = { x: x, y: y }; save(); applyPos(); }
  function getPos() { return Object.assign({}, data.pos); }

  /* ---------- 渲染 ---------- */
  function render() {
    var root = rootEl();
    if (!root) return;
    var sp = SPMAP[data.active];
    if (!sp) { data.active = SPECIES[0].id; sp = SPMAP[data.active]; save(); }   /* 防御：物种异常回退橘猫 */
    var pet = active();
    var lv = calcLevel(pet.exp);
    var st = stageOf(pet.exp);
    var name = (pet.name || sp.name);
    var svg = svgSpecies(data.active, st, false);

    root.innerHTML =
      '<div id="petBody" class="pet-body' + (data.mini ? ' mini' : '') + ' st' + st + ' mood-' + curMood + '" title="' + esc(name) + ' · ' + formName(lv) + '">' +
        '<div class="pet-glow"></div>' + svg +
        '<div class="pet-burst">' + sparkHtml(6) + '</div>' +
        '<div class="pet-bubble" id="petBubble"></div>' +
        (curMood === 'sleep' ? '<div class="pet-zzz"><span class="z1">Z</span><span class="z2">z</span><span class="z3">z</span></div>' : '') +
      '</div>';

    bindEvents();
    applyPos();
  }

  function sparkHtml(n) {
    var h = '';
    for (var i = 0; i < n; i++) {
      h += '<div class="pet-spark s' + (i + 1) + '"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0L6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8Z" fill="#FBBF24"/></svg></div>';
    }
    return h;
  }

  function updatePanel() {
    var p = $('petPanel');
    if (!p) return;
    var sp = SPMAP[data.active];
    var pet = active();
    var lv = calcLevel(pet.exp);
    var st = stageOf(pet.exp);
    var info = levelInfo(lv);
    var svgMini = svgSpecies(data.active, st, false, true);
    var nextTxt = info.next ? ('距离「' + info.next + '」还需 ' + info.need + ' 次报价') : '已成长为最终形态！';

    p.innerHTML =
      '<div class="pp-head">' + svgMini + '<div><div class="pp-name">' + esc(pet.name || sp.name) + '</div>' +
      '<div class="pp-lv">Lv.' + lv + ' · ' + formName(lv) + '</div></div></div>' +
      '<div class="pp-bar"><div class="pp-fill" style="width:' + Math.min(100, lv >= 3 ? 100 : (pet.exp / TIERS[lv] * 100)) + '%"></div></div>' +
      '<div class="pp-next">' + esc(nextTxt) + '</div>' +
      '<div class="pp-chain">' +
        '<div class="pc-item' + (st >= 1 ? ' pc-cur' : '') + '"><div class="pc-svg">' + svgSpecies(data.active, 1, false, true) + '</div><div class="pc-lv">幼猫</div></div>' +
        '<div class="pc-item' + (st >= 2 ? ' pc-cur' : '') + '"><div class="pc-svg">' + svgSpecies(data.active, 2, false, true) + '</div><div class="pc-lv">成猫</div></div>' +
        '<div class="pc-item' + (st >= 3 ? ' pc-cur' : '') + '"><div class="pc-svg">' + svgSpecies(data.active, 3, false, true) + '</div><div class="pc-lv">大橘</div></div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text3);margin:-6px 0 10px;text-align:center">更多物种 · 开发中，敬请期待</div>' +
      '<div class="pp-row"><label>昵称</label><input id="petNameInput" value="' + esc(pet.name || '') + '" placeholder="给猫咪起个名字…"></div>' +
      '<div class="pp-row"><button class="btn btn-sm" id="petFeedBtn">喂糖果</button><button class="btn btn-sm btn-ghost" id="petResetBtn">重置位置</button></div>' +
      /* V13：桌宠 = AI 报价助手（点击对话，本地 Agent 默认离线可用） */
      '<div class="pp-chat"><div class="pp-chat-log" id="petChatLog"></div>' +
      '<div class="pp-chat-row"><input id="petChatInput" placeholder="问我：原料价格 / 当前报价…"><button class="btn btn-sm btn-primary" id="petChatSend">发送</button></div></div>';

    var inp = $('petNameInput');
    if (inp) inp.addEventListener('change', function () { setName(this.value.trim()); });
    var fb = $('petFeedBtn');
    if (fb) fb.addEventListener('click', feed);
    var rb = $('petResetBtn');
    if (rb) rb.addEventListener('click', function () { resetPos(); });
    bindChat();
  }

  /* ============================================================
   * V13 对话 Agent：桌宠 = AI 报价助手
   * 本地意图解析（默认离线可用）：原料价格 / 最便宜供应商 / 当前报价 /
   * 剂型参数 / 报价历史 / 快捷键；可选在线大模型增强（设置页配置），
   * 未配置/无网/失败回退本地。只读查询，不上传无关数据，写操作不执行。
   * ============================================================ */
  var FAQ_HINT = '可以问我：<b>某原料什么价</b> / <b>哪家供应商最便宜</b> / <b>当前配方报价多少</b> / <b>某剂型默认参数</b> / <b>我的报价历史</b> / <b>快捷键</b>';
  function fmtMoney(n) { return '¥' + (Math.round((n || 0) * 1000) / 1000); }
  function findMaterial(q) {
    var mats = S.state.data.materials || [];
    var t = String(q || '').replace(/什么价|价格|多少钱|单价|报价|最便宜|哪家|供应商|最低|的|是|请|帮我|查|看看|一下/g, '').replace(/[？?。，,、\s]/g, '').trim();
    if (!t) return null;
    var best = null, bestLen = 0;
    mats.forEach(function (m) {
      var n = m.name || '';
      if (n && (t.indexOf(n) >= 0 || n.indexOf(t) >= 0) && n.length > bestLen) { best = m; bestLen = n.length; }
    });
    return best;
  }
  function supLine(s) {
    return esc(s.supplierName || s.name || '供应商') + '：<b>' + fmtMoney(s.price || 0) + '</b>/' + esc(s.currency || 'CNY') +
      (s.validUntil ? '（有效期至 ' + esc(String(s.validUntil).slice(0, 10)) + '）' : '');
  }
  function agentLocal(q) {
    var qs = String(q || '');
    if (/快捷键|shortcut/i.test(qs)) {
      return '常用快捷键：<b>Ctrl+Enter</b> 一键报价 · <b>Ctrl+S</b> 存档 · <b>Ctrl+E</b> 导出 Excel。双击我可收起/唤出，长按喂糖果~';
    }
    if (/历史|最近/.test(qs) && /报价|单|记录/.test(qs)) {
      var qs5 = (S.state.data.quotes || []).slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }).slice(0, 5);
      if (!qs5.length) return '还没有报价存档哦，去核算台点「一键报价」试试吧！';
      return '最近 ' + qs5.length + ' 条报价：<br>' + qs5.map(function (x) {
        return '· ' + esc(x.projectName || x.name || '未命名') + ' —— ' + fmtMoney(x.amount || 0) + '（' + esc(String(x.createdAt || '').slice(0, 10)) + '）';
      }).join('<br>');
    }
    if (/当前|这(个|份|次)|现在|概算/.test(qs) || (/报价|多少|成本/.test(qs) && /配方|方案/.test(qs))) {
      var sum = global.WB.calcView && global.WB.calcView.getQuoteSummary ? global.WB.calcView.getQuoteSummary() : null;
      if (!sum) return '核算台还没有原料/包材，先添加后再问我报价吧！';
      return '当前方案「<b>' + esc(sum.name) + '</b>」概算（MOQ ' + sum.moq + '）：单份成本 <b>' + fmtMoney(sum.unitCost) + '</b> · 不含税 <b>' + fmtMoney(sum.upTax) + '</b> · 含税 <b>' + fmtMoney(sum.inTax) + '</b>（' + sum.mats + ' 行原料 / ' + sum.packs + ' 行包材）。点「一键报价」可看完整明细。';
    }
    if (/剂型|默认参数|工艺/.test(qs)) {
      var ds = S.state.data.dosageForms || [];
      var d = null, dl = 0;
      ds.forEach(function (x) { var n = x.name || ''; if (n && qs.indexOf(n) >= 0 && n.length > dl) { d = x; dl = n.length; } });
      if (!d) return '请告诉我剂型名，比如「胶囊的默认参数」。现有剂型：' + ds.map(function (x) { return esc(x.name); }).join('、');
      var def = d.defaults || {}, lr = d.defaultLossRate || {};
      return '剂型「<b>' + esc(d.name) + '</b>」默认参数：克重 ' + esc(String(def.weight || '-')) + 'g · 每瓶 ' + esc(String(def.count || '-')) + ' 粒 · 净含量 ' + esc(String(def.net || '-')) + ' · 装箱 ' + esc(String(def.box || '-')) + ' · 损耗 原料' + esc(String(lr.material)) + '% / 包材' + esc(String(lr.packaging)) + '% / 生产' + esc(String(lr.production)) + '%。';
    }
    if (/最便宜|哪家|供应商|最低/.test(qs)) {
      var m2 = findMaterial(qs);
      if (!m2) return '没找到对应原料，试试「维生素C 哪家最便宜」。';
      var sups = (m2.suppliers || []).slice().sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
      if (!sups.length) return '「' + esc(m2.name) + '」还没有供应商报价。';
      return '「<b>' + esc(m2.name) + '</b>」供应商价（低→高）：<br>' + sups.slice(0, 3).map(supLine).join('<br>');
    }
    if (/什么价|价格|多少钱|单价|价/.test(qs)) {
      var m3 = findMaterial(qs);
      if (!m3) return '没找到该原料，试试「维生素C 什么价」。原料库共 ' + (S.state.data.materials || []).length + ' 种。';
      var bestS = C.bestSupplier ? C.bestSupplier(m3.suppliers || []) : null;
      if (!bestS) return '「' + esc(m3.name) + '」暂无有效报价（可能已过期）。';
      return '「<b>' + esc(m3.name) + '</b>」当前最优价：' + supLine(bestS) + '。' + ((m3.suppliers || []).length > 1 ? '（共 ' + m3.suppliers.length + ' 家比价）' : '');
    }
    if (/你好|您好|hi|hello|你是|你能|帮助|能做什么|怎么用/i.test(qs)) {
      return '喵~ 我是报价小助手！' + FAQ_HINT;
    }
    return null;
  }
  /* 在线大模型增强：只上传脱敏上下文摘要（原料名+最优价 / 当前方案概算），不传客户资料 */
  function agentAI(q, cb) {
    var sm = global.WB.smart;
    var cfg = sm && sm.aiConfig ? sm.aiConfig() : null;
    if (!cfg || typeof fetch !== 'function') return false;
    var ctx = [];
    (S.state.data.materials || []).slice(0, 20).forEach(function (m) {
      var b = C.bestSupplier ? C.bestSupplier(m.suppliers || []) : null;
      ctx.push(m.name + (b ? ' 最优价' + (b.price || 0) + (b.currency || 'CNY') + '/kg' : ' 无有效报价'));
    });
    var sum = global.WB.calcView && global.WB.calcView.getQuoteSummary ? global.WB.calcView.getQuoteSummary() : null;
    if (sum) ctx.push('当前方案：' + sum.name + '，MOQ' + sum.moq + '，单份成本约' + (Math.round(sum.unitCost * 1000) / 1000) + '元');
    fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model, temperature: 0.4,
        messages: [
          { role: 'system', content: '你是成本台桌宠「报价小助手」（橘猫），只读查询助手。用简短中文回答（120字内，可用<br>换行、<b>加粗）。只依据给定上下文回答，不编造数据。上下文：' + ctx.join('；') },
          { role: 'user', content: String(q) }
        ]
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (o) {
      var t = (o && o.choices && o.choices[0] && o.choices[0].message && o.choices[0].message.content) || '';
      cb(t ? String(t) : null);
    }).catch(function () { cb(null); });
    return true;
  }
  function lightHtml(t) {
    return String(t).replace(/\r/g, '').replace(/\n/g, '<br>').replace(/<(?!\/?b>|\/?br\s*\/?>)[^>]*>/gi, '');
  }
  function chatMsg(role, html) {
    var log = $('petChatLog');
    if (!log) return null;
    var d = document.createElement('div');
    d.className = 'pc-msg ' + (role === 'user' ? 'user' : 'bot');
    d.innerHTML = html;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function bindChat() {
    var inp = $('petChatInput'), btn = $('petChatSend');
    if (!inp || !btn || inp._bound) return;
    inp._bound = true;
    chatMsg('bot', '喵~ 我是你的报价小助手！' + FAQ_HINT);
    function send() {
      var q = (inp.value || '').trim();
      if (!q) return;
      inp.value = '';
      chatMsg('user', esc(q));
      act('nuzzle');
      var local = agentLocal(q);
      if (local !== null) { chatMsg('bot', local); return; }
      var pend = chatMsg('bot', '<span class="muted">思考中…</span>');
      var handled = agentAI(q, function (t) {
        if (pend) {
          pend.innerHTML = t ? lightHtml(t) : '喵…AI 没有回应（可能无网或接口异常），稍后再试。';
          var log = $('petChatLog');
          if (log) log.scrollTop = log.scrollHeight;
        }
      });
      if (!handled) pend.innerHTML = '喵…这个问题我暂时不懂。' + FAQ_HINT;
    }
    btn.addEventListener('click', send);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  }

  function syncMoodClass(b) {
    if (!b) return;
    b.classList.remove('mood-idle', 'mood-happy', 'mood-curious', 'mood-sleep', 'mood-excited', 'mood-upset');
    b.classList.add('mood-' + curMood);
  }

  function setMood(m) {
    if (curMood === m) return;
    curMood = m;
    data.mood = m;
    var b = bodyEl();
    if (b) {
      syncMoodClass(b);
      b.classList.toggle('sleep', m === 'sleep');   /* 触发 .pet-body.sleep 闭眼/Zzz 视觉 */
      if (m === 'sleep') {
        b.insertAdjacentHTML('beforeend', '<div class="pet-zzz"><span class="z1">Z</span><span class="z2">z</span><span class="z3">z</span></div>');
      } else {
        var z = b.querySelector('.pet-zzz');
        if (z) z.remove();
      }
      if (m === 'excited') {
        var star = b.querySelector('.an-star');
        if (!star) {
          var svg = b.querySelector('svg');
          if (svg) svg.insertAdjacentHTML('beforeend',
            '<g class="an-star">' +
            '<polygon points="100,12 103,20 112,20 105,26 108,34 100,28 92,34 95,26 88,20 97,20" fill="#FBBF24"/>' +
            '<polygon points="70,24 72,28 77,28 73,31 74,36 70,33 66,36 67,31 63,28 68,28" fill="#FBBF24" opacity="0.8"/>' +
            '<polygon points="130,24 132,28 137,28 133,31 134,36 130,33 126,36 127,31 123,28 128,28" fill="#FBBF24" opacity="0.8"/>' +
            '</g>');
        }
      }
    }
    save();
  }
  function getMood() { return curMood; }

  function wake() {
    if (curMood !== 'sleep') return;
    setMood('idle');
    data.lastActive = Date.now();
    save();
    bubble('喵~ 睡醒啦！');
  }

  function bubble(html) {
    var b = $('petBubble');
    if (!b) return;
    b.innerHTML = html;
    b.classList.add('show');
    if (bubbleT) clearTimeout(bubbleT);
    bubbleT = setTimeout(function () { b.classList.remove('show'); }, 3200);
  }

  /* ---------- 报价触发 ---------- */
  function onQuote() {
    var pet = active();
    pet.exp = (pet.exp || 0) + 1;
    pet.streak = (pet.streak || 0) + 1;
    data.lastActive = Date.now();
    save();

    var oldLv = calcLevel(pet.exp - 1);
    var newLv = calcLevel(pet.exp);
    if (newLv > oldLv) {
      evolveAnim();
    } else {
      celebrate();
    }
    if (pet.streak >= 3) {
      setTimeout(function () { if (getMood() !== 'sleep') setMood('excited'); }, 600);
      setTimeout(function () { if (getMood() === 'excited') setMood('idle'); }, 5000);
    }
  }

  function fireExcited() {
    setMood('excited');
    setTimeout(function () { if (getMood() === 'excited') setMood('idle'); }, 4000);
  }

  /* ---------- V13 动作库：一次性动作（act-* 类驱动 CSS 动画，播完自动移除） ---------- */
  var ACT_MS = { jump: 700, spin: 900, wave: 2200, chew: 1700, nuzzle: 900, stretch: 1100 };
  var actT = {};
  function act(name) {
    var b = bodyEl();
    if (!b || !ACT_MS[name]) return;
    var cls = 'act-' + name;
    if (actT[name]) clearTimeout(actT[name]);
    b.classList.remove('act-jump', 'act-spin', 'act-wave', 'act-chew', 'act-nuzzle', 'act-stretch');
    /* 强制 reflow：连续触发同一动作也能重播 */
    void b.offsetWidth;
    b.classList.add(cls);
    actT[name] = setTimeout(function () { b.classList.remove(cls); }, ACT_MS[name]);
  }
  /* 抱怨：报价失败 / 含量错误 / 无价格等场景（节流 45s，避免打扰） */
  var lastComplain = 0;
  function onQuoteIssue(bad) {
    var now = Date.now();
    if (!bad) return;
    if (now - lastComplain < 45000) return;
    if (curMood === 'sleep' || data.mini) return;
    lastComplain = now;
    setMood('upset');
    var msgs = ['喵？含量好像不对哦…', '有的原料没有价格，算不准啦！', '检查一下含量是不是 100%？', '这笔报价有点问题，帮我看看嘛'];
    bubble(msgs[Math.floor(Math.random() * msgs.length)]);
    act('nuzzle');
    setTimeout(function () { if (getMood() === 'upset') setMood('idle'); }, 4200);
  }

  /* ---------- 进化动画（放大 + 微光） ---------- */
  function evolveAnim() {
    var b = bodyEl();
    if (!b) { render(); return; }
    b.classList.add('evolving');
    bubble('长大啦！喵~');
    if (evolveT) clearTimeout(evolveT);
    evolveT = setTimeout(function () {
      b.classList.remove('evolving');
      render();
      showLevelUp();
      setMood('happy');
      setTimeout(function () { if (getMood() === 'happy') setMood('idle'); }, 3500);
    }, 1400);
  }

  function celebrate() {
    var b = bodyEl();
    if (!b) return;
    b.classList.add('celebrate');
    setTimeout(function () { b.classList.remove('celebrate'); }, 900);
    if (Math.random() > 0.6) {
      var msgs = ['报价成功！', '又成一单~', '喵喵喵！', '太棒了！', '继续加油！'];
      bubble(msgs[Math.floor(Math.random() * msgs.length)]);
    }
  }

  function showLevelUp() {
    var ov = document.createElement('div');
    ov.className = 'evo-overlay';
    var sp = SPMAP[data.active];
    var pet = active();
    var lv = calcLevel(pet.exp);
    ov.innerHTML = '<div class="evo-box">' +
      '<div class="evo-title">' + esc(sp.name) + ' 长大了！</div>' +
      '<div class="evo-stage">进化到 「' + esc(formName(lv)) + '」</div>' +
      '<div style="margin-top:12px">' + svgSpecies(data.active, stageOf(pet.exp), false, true) + '</div>' +
      '<div class="evo-desc">' + esc(sp.desc) + '</div></div>';
    document.body.appendChild(ov);
    setTimeout(function () { ov.classList.add('in'); }, 30);
    setTimeout(function () { ov.classList.remove('in'); setTimeout(function () { ov.remove(); }, 450); }, 2200);
  }

  /* ---------- 自检（V12：自检时进入 curious 好奇状态） ---------- */
  function selfCheck(manual) {
    var issues = [];
    var now = Date.now();
    var matExp = 0;
    S.state.data.materials.forEach(function (m) {
      (m.suppliers || []).forEach(function (s) {
        if (C.priceStatus(s) === 'expired') matExp++;
      });
    });
    if (matExp > 0) issues.push('价格库有 <b>' + matExp + '</b> 条报价已过期，记得更新哦');
    if (issues.length) {
      bubble(issues[0]);
    } else if (manual) {
      bubble('一切正常，继续加油接单吧！喵~');
    }
    /* 好奇状态：自检期间头顶浮现问号，4 秒后恢复（睡眠中不打扰） */
    if (getMood() !== 'sleep' && (issues.length || manual)) {
      setMood('curious');
      setTimeout(function () { if (getMood() === 'curious') setMood('idle'); }, 4000);
    }
    data.lastCheck = now;
    data.logs = data.logs || [];
    data.logs.unshift({ t: now, issues: issues.length });
    if (data.logs.length > 20) data.logs.length = 20;
    save();
    return issues;
  }

  function scheduleAutoCheck() {
    if (autoCheckT) clearInterval(autoCheckT);
    autoCheckT = setInterval(function () {
      if (data.mini || curMood === 'sleep') return;
      var now = Date.now();
      if (now - (data.lastCheck || 0) > CHECK_MS) selfCheck(false);
    }, 60000);
  }

  /* ---------- 喂食（V12：糖果掉落动画） ---------- */
  function feed() {
    var pet = active();
    pet.feeds = (pet.feeds || 0) + 1;
    save();
    var b = bodyEl();
    if (b && !b.querySelector('.pet-candy')) {
      b.insertAdjacentHTML('beforeend',
        '<div class="pet-candy"><svg width="26" height="26" viewBox="0 0 26 26">' +
        '<path d="M7,13 L1,8 L1,18 Z" fill="#F87171"/>' +
        '<path d="M19,13 L25,8 L25,18 Z" fill="#F87171"/>' +
        '<circle cx="13" cy="13" r="6.5" fill="#FCA5A5" stroke="#F87171" stroke-width="1.5"/>' +
        '<circle cx="10.8" cy="11" r="1.4" fill="#FFF" opacity="0.85"/>' +
        '</svg></div>');
      setTimeout(function () { var c = b.querySelector('.pet-candy'); if (c) c.remove(); }, 1000);
    }
    var msgs = ['好甜！喵~', '糖果真好吃！', '再来一颗嘛~', '咕噜咕噜…', '谢谢主人！'];
    bubble(msgs[Math.floor(Math.random() * msgs.length)]);
    setMood('happy');
    act('chew');
    setTimeout(function () { if (getMood() === 'happy') setMood('idle'); }, 3000);
  }

  function getName() { return active().name || SPMAP[data.active].name; }
  function setName(n) {
    active().name = n;
    save();
    var b = bodyEl();
    if (b) b.title = (n || SPMAP[data.active].name) + ' · ' + formName(calcLevel(active().exp));
    updatePanel();
  }
  function getStreak() { return active().streak || 0; }
  function getFeeds() { return active().feeds || 0; }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    var body = bodyEl();
    var root = rootEl();
    if (!body || body._bound) return;
    body._bound = true;

    /* 单击展开面板 */
    body.addEventListener('click', function (e) {
      if (data.mini) { setMini(false); return; }
      if (curMood === 'sleep') { wake(); return; }
      var p = $('petPanel');
      if (!p) {
        p = document.createElement('div');
        p.id = 'petPanel'; p.className = 'pet-panel';
        root.appendChild(p);
      }
      var open = body.classList.contains('panel-open');
      if (open) { body.classList.remove('panel-open'); }
      else { updatePanel(); body.classList.add('panel-open'); }
    });

    /* 双击收起/唤出 */
    body.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      if (data.mini) { setMini(false); }
      else { setMini(true); }
    });

    /* 长按喂糖 */
    var longT = null;
    body.addEventListener('mousedown', function () {
      longT = setTimeout(function () { feed(); }, 800);
    });
    body.addEventListener('mouseup', function () { clearTimeout(longT); });
    body.addEventListener('mouseleave', function () { clearTimeout(longT); });

    /* 触摸长按 */
    body.addEventListener('touchstart', function () { longT = setTimeout(function () { feed(); }, 900); });
    body.addEventListener('touchend', function () { clearTimeout(longT); });

    initDrag(body, root);
  }

  function initDrag(body, root) {
    var dragging = false, sx, sy, ox, oy;
    body.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = root.getBoundingClientRect();
      ox = r.left; oy = r.top;
      body.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var nx = ox + (e.clientX - sx);
      var ny = oy + (e.clientY - sy);
      root.style.left = nx + 'px'; root.style.top = ny + 'px';
      root.style.right = 'auto'; root.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      body.style.cursor = 'pointer';
      var r = root.getBoundingClientRect();
      data.pos = { x: r.left, y: r.top };
      save();
    });
  }

  function setMini(v) {
    data.mini = !!v;
    var b = bodyEl();
    if (b) b.classList.toggle('mini', data.mini);
    if (!data.mini) render();
    save();
  }

  /* 历史存档经验迁移（V11 遗留逻辑：按旧报价 amount 求和作为初始经验）。
   * V14：改为「只迁移一次」——否则「重置养成」归零后，下次刷新会被历史存档重新顶回高等级，
   * 重置形同虚设。迁移完成后由 onQuote() 逐单累加驱动成长。 */
  function syncFromQuotes() {
    if (data.synced) return;
    data.synced = true;
    var total = 0;
    S.state.data.quotes.forEach(function (q) { total += (q.amount || 0); });
    var pet = active();
    pet.exp = Math.max(pet.exp || 0, Math.floor(total));
    save();
  }

  /* V14：重置养成 —— 经验/等级/昵称归零回到幼体。
   * 明确保留：位置记忆（pos）与已选动物（active/unlocked），不影响桌面摆放与造型选择。 */
  function resetGrowth() {
    var p = active();
    p.exp = 0;
    p.streak = 0;
    p.feeds = 0;
    p.name = '';
    p.mood = 'idle';
    data.mood = 'idle';
    data.logs = [];
    save();
    curMood = 'idle';
    render();
    updatePanel();
    var b = bodyEl();
    if (b) b.title = SPMAP[data.active].name + ' · ' + formName(calcLevel(0));
    bubble('重新开始啦！喵~');
    setMood('happy');
    setTimeout(function () { if (getMood() === 'happy') setMood('idle'); }, 2600);
    return { exp: 0, level: calcLevel(0), name: getName() };
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!document.getElementById('petRoot')) return;
    load();
    syncFromQuotes();
    curMood = data.mood || 'idle';
    if (['idle','sleep','happy','curious','excited','upset'].indexOf(curMood) < 0) curMood = 'idle';
    render();
    if (sleepCheckT) clearInterval(sleepCheckT);
    sleepCheckT = setInterval(function () {
      var b = bodyEl();
      if (!b) return;
      if (data.mini || curMood === 'sleep') return;
      if (Date.now() - (data.lastActive || Date.now()) > SLEEP_MS) setMood('sleep');
    }, 20000);
    setTimeout(function () {
      var b = bodyEl();
      if (b && !data.mini && curMood !== 'sleep' && (Date.now() - (data.lastActive || Date.now())) > SLEEP_MS) setMood('sleep');
    }, 1500);
    scheduleAutoCheck();
  }

  global.WB = global.WB || {};
  global.WB.pet = {
    init: init,
    onQuote: onQuote,
    setMini: setMini,
    getLevel: function () { return calcLevel(active().exp); },
    getStage: function () { return stageOf(active().exp); },
    getCount: function () { return active().exp; },
    getName: getName,
    setName: setName,
    getMood: getMood,
    setMood: setMood,
    feed: feed,
    /* V13：动作库 + 抱怨（含量错误/报价失败时由核算台调用） */
    act: act,
    onQuoteIssue: onQuoteIssue,
    askLocal: agentLocal,   /* V13：本地 Agent 意图查询（测试/调试用） */
    resetPos: resetPos,
    setPos: setPos,
    getPos: getPos,
    getStreak: getStreak,
    getFeeds: getFeeds,
    calcLevel: calcLevel,
    levelInfo: levelInfo,
    stageOf: stageOf,
    svgSpecies: svgSpecies,
    _catSvg: catSvg,        /* V14：造型单测/渲染预览用（按 stage + mood 直出 SVG） */
    getSpecies: function () { return data.active; },
    setSpecies: function (id) { if (SPMAP[id]) { data.active = id; save(); render(); } },
    unlockSpecies: function () {}, /* 保留兼容 */
    getUnlocked: function () { return data.unlocked.slice(); },
    listSpecies: function () { return SPECIES.map(function (s) { return Object.assign({}, s); }); },
    selfCheck: selfCheck,
    resetGrowth: resetGrowth,   /* V14：设置页「重置宠物养成」（经验/昵称归零回幼体，保留位置与已选动物） */
    getLogs: function () { return (data.logs || []).slice(); },
    openPanel: function () {
      var b = bodyEl();
      if (b) { if (curMood === 'sleep') wake(); b.classList.remove('mini'); b.classList.add('panel-open'); updatePanel(); }
    },
    debugSetCount: function (n) { active().exp = n; save(); render(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
