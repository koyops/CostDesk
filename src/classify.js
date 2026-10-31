/* ============================================================
 * classify.js — V12 原料智能分类 + 报价单鲁棒解析 + AI 识别桥接（纯函数为主，可单测）
 * 1. classifyName：关键词→分类 自动识别（最长关键词优先，自定义规则优先）
 * 2. parseQuoteLines：供应商报价单鲁棒解析（表格粘贴/竖排/名称价格互换/
 *    千分位/范围值/元·克·吨/USD¥€/MOQ交期税点噪声剥离/行号清理）
 * 3. aiStructure：可选 AI 结构化（OpenAI Chat Completions 兼容），
 *    未配置/无网/失败一律回退本地解析，保证默认离线可用
 * ============================================================ */
(function (global) {
  'use strict';

  /* ================= 默认分类规则库（可在设置中增改） ================= */
  var DEFAULT_RULES = [
    { kw: '维生素', cat: '维生素' }, { kw: '维他命', cat: '维生素' },
    { kw: 'VC', cat: '维生素' }, { kw: 'VE', cat: '维生素' }, { kw: 'VB', cat: '维生素' },
    { kw: 'VA', cat: '维生素' }, { kw: 'VD', cat: '维生素' }, { kw: 'VK', cat: '维生素' },
    { kw: '维C', cat: '维生素' }, { kw: '维E', cat: '维生素' }, { kw: '维A', cat: '维生素' },
    { kw: '维D', cat: '维生素' }, { kw: '维B', cat: '维生素' }, { kw: '维K', cat: '维生素' },
    { kw: '叶酸', cat: '维生素' }, { kw: '烟酰胺', cat: '维生素' }, { kw: '泛酸', cat: '维生素' },
    { kw: '生物素', cat: '维生素' }, { kw: '肌醇', cat: '维生素' },
    { kw: '氨基酸', cat: '氨基酸' }, { kw: '赖氨酸', cat: '氨基酸' }, { kw: '牛磺酸', cat: '氨基酸' },
    { kw: '精氨酸', cat: '氨基酸' }, { kw: '谷氨酰胺', cat: '氨基酸' }, { kw: '甘氨酸', cat: '氨基酸' },
    { kw: '脯氨酸', cat: '氨基酸' }, { kw: '色氨酸', cat: '氨基酸' }, { kw: '蛋氨酸', cat: '氨基酸' },
    { kw: '亮氨酸', cat: '氨基酸' }, { kw: '缬氨酸', cat: '氨基酸' }, { kw: 'BCAA', cat: '氨基酸' },
    { kw: '肌酸', cat: '氨基酸' }, { kw: '胶原蛋白', cat: '氨基酸' },
    { kw: '钙', cat: '矿物质' }, { kw: '镁', cat: '矿物质' }, { kw: '锌', cat: '矿物质' },
    { kw: '铁', cat: '矿物质' }, { kw: '硒', cat: '矿物质' }, { kw: '铜', cat: '矿物质' },
    { kw: '锰', cat: '矿物质' }, { kw: '铬', cat: '矿物质' }, { kw: '钼', cat: '矿物质' },
    { kw: '碘', cat: '矿物质' }, { kw: '螯合', cat: '矿物质' }, { kw: '矿物盐', cat: '矿物质' },
    { kw: '葡萄糖酸锌', cat: '矿物质' }, { kw: '葡萄糖酸钙', cat: '矿物质' },
    { kw: '葡萄糖酸铁', cat: '矿物质' }, { kw: '葡萄糖酸铜', cat: '矿物质' },
    { kw: '乳酸亚铁', cat: '矿物质' }, { kw: '柠檬酸钙', cat: '矿物质' }, { kw: '碳酸钙', cat: '矿物质' },
    { kw: '提取物', cat: '草本提取物' }, { kw: '人参', cat: '草本提取物' }, { kw: '灵芝', cat: '草本提取物' },
    { kw: '麦卢卡', cat: '草本提取物' }, { kw: '蜂胶', cat: '草本提取物' }, { kw: '黄芪', cat: '草本提取物' },
    { kw: '枸杞', cat: '草本提取物' }, { kw: '姜黄', cat: '草本提取物' }, { kw: '银杏', cat: '草本提取物' },
    { kw: '茶多酚', cat: '草本提取物' }, { kw: '绿茶', cat: '草本提取物' }, { kw: '葡萄籽', cat: '草本提取物' },
    { kw: '叶黄素', cat: '草本提取物' }, { kw: '辅酶Q10', cat: '草本提取物' }, { kw: '虾青素', cat: '草本提取物' },
    { kw: '白藜芦醇', cat: '草本提取物' }, { kw: '芦荟', cat: '草本提取物' }, { kw: '酸枣仁', cat: '草本提取物' },
    { kw: '茯苓', cat: '草本提取物' }, { kw: '玛咖', cat: '草本提取物' },
    { kw: '益生菌', cat: '益生菌' }, { kw: '乳酸菌', cat: '益生菌' }, { kw: '双歧杆菌', cat: '益生菌' },
    { kw: '鼠李糖乳杆菌', cat: '益生菌' }, { kw: '嗜酸乳杆菌', cat: '益生菌' }, { kw: '干酪乳杆菌', cat: '益生菌' },
    { kw: '植物乳杆菌', cat: '益生菌' }, { kw: '乳杆菌', cat: '益生菌' },
    { kw: '鱼油', cat: '油脂' }, { kw: '磷脂', cat: '油脂' }, { kw: '卵磷脂', cat: '油脂' },
    { kw: '亚麻籽油', cat: '油脂' }, { kw: '藻油', cat: '油脂' }, { kw: 'DHA', cat: '油脂' },
    { kw: 'EPA', cat: '油脂' }, { kw: 'MCT', cat: '油脂' }, { kw: '椰子油', cat: '油脂' },
    { kw: '橄榄油', cat: '油脂' }, { kw: '共轭亚油酸', cat: '油脂' }, { kw: '油脂', cat: '油脂' },
    { kw: '蜂蜜', cat: '糖类' }, { kw: '赤藓糖醇', cat: '糖类' }, { kw: '木糖醇', cat: '糖类' },
    { kw: '白砂糖', cat: '糖类' }, { kw: '葡萄糖', cat: '糖类' }, { kw: '果糖', cat: '糖类' },
    { kw: '乳糖', cat: '糖类' }, { kw: '麦芽糊精', cat: '糖类' }, { kw: '糖浆', cat: '糖类' },
    { kw: '低聚果糖', cat: '糖类' }, { kw: '低聚半乳糖', cat: '糖类' }, { kw: '异麦芽酮糖', cat: '糖类' },
    { kw: '甜菊糖', cat: '糖类' }, { kw: '聚葡萄糖', cat: '糖类' }, { kw: '糖', cat: '糖类' },
    { kw: '香精', cat: '其他' }, { kw: '香料', cat: '其他' }, { kw: '色素', cat: '其他' },
    { kw: '山梨酸钾', cat: '其他' }, { kw: '防腐', cat: '其他' }, { kw: '柠檬酸', cat: '其他' },
    { kw: '明胶', cat: '其他' }, { kw: '淀粉', cat: '其他' }, { kw: '纤维素', cat: '其他' },
    { kw: '硬脂酸镁', cat: '其他' }, { kw: '二氧化硅', cat: '其他' }, { kw: '微晶纤维', cat: '其他' }
  ];
  var BASE_CATS = ['维生素', '矿物质', '氨基酸', '草本提取物', '益生菌', '油脂', '糖类', '其他'];

  /* 读取规则：设置中存过（settings.catRules）则用用户的，否则用默认（不回写） */
  function getRules() {
    var s = (global.WB && global.WB.store && global.WB.store.state && global.WB.store.state.settings) || null;
    if (s && Array.isArray(s.catRules) && s.catRules.length) {
      return s.catRules.filter(function (r) { return r && r.kw && r.cat; })
        .map(function (r) { return { kw: String(r.kw), cat: String(r.cat), custom: !!r.custom }; });
    }
    return defaultRules();
  }
  function defaultRules() { return DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }); }
  function baseCats() { return BASE_CATS.slice(); }

  /* 分类识别：最长关键词优先；等长时自定义规则优先；大小写不敏感 */
  function classifyName(name, rulesOpt) {
    var n = String(name == null ? '' : name).toLowerCase();
    if (!n) return { cat: '', kw: '' };
    var rules = rulesOpt || getRules();
    var best = null;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var kw = String(r.kw || '').toLowerCase();
      if (!kw) continue;
      if (n.indexOf(kw) < 0) continue;
      if (!best || kw.length > best.kw.length || (kw.length === best.kw.length && r.custom && !best.custom)) {
        best = { cat: r.cat, kw: r.kw, custom: !!r.custom };
      }
    }
    return best || { cat: '', kw: '' };
  }

  /* ================= 含量显示格式化：最多 2 位小数，去尾零（内部仍精确） ================= */
  function fmtRatio(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '';
    var r = Math.round(Number(n) * 100) / 100;
    return String(r);
  }

  /* ================= 报价单鲁棒解析 ================= */
  /* 归一化：全角→半角（保留换行） */
  function qnorm(s) {
    return String(s == null ? '' : s)
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[，]/g, ',').replace(/[；;]/g, ';')
      .replace(/[：]/g, ':').replace(/[。．]/g, '.')
      .replace(/[￥]/g, '¥')
      .replace(/\u00A0/g, ' ')
      .trim();
  }
  /* 价格主模式：币种符号/代码 + 数字（支持千分位/小数/范围）+ 币种词 + 每单位 */
  var PRICE_RE =
    '([$¥€£]|USD|EUR|GBP|HKD|JPY|RMB|CNY|美元|欧元|英镑|港币|日元)?\\s*' +
    '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)' +
    '(?:\\s*[-~～至]\\s*(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?))?' +
    '\\s*(USD|EUR|GBP|HKD|JPY|RMB|CNY|美元|欧元|英镑|港币|日元|元|块)?' +
    '(?:\\s*[\\/每]\\s*(kg|千克|公斤|克|g|吨|t))?';
  var MOQ_RE = /(?:MOQ|moq|起订量?|最小起订|起订)\s*[:：]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(kg|千克|公斤|克|g|吨|t|个|瓶|粒|片|袋|支)?/i;
  var LEAD_RE = /(\d{1,3})\s*天?\s*(?:交货|交期|货期)|(?:交货|交期|货期)\s*[:：]?\s*(\d{1,3})\s*天?/;
  var DATE_RE = /\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:至\s*\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}/g;
  var NOISE_RE = /(税点\s*\d+(?:\.\d+)?\s*%?|含税|不含税|含运|含运费|现款|月结\s*\d{1,3}\s*天?|票面|到厂|自提|包邮)/gi;
  var NUM_RE = new RegExp(PRICE_RE, 'gi');
  /* 行首编号剥离：仅当标点后不是数字（避免吃掉 "85.5" 的小数点） */
  var LINE_NO_RE = /^(?:\(\d{1,3}\)|\d{1,3}[、.)])(?!\d)\s*/;

  function toNum(s) { return parseFloat(String(s).replace(/,/g, '')); }
  function curCode(v) {
    if (!v) return '';
    var map = { 'USD': 'USD', '美元': 'USD', '$': 'USD', 'EUR': 'EUR', '欧元': 'EUR', '€': 'EUR', 'GBP': 'GBP', '英镑': 'GBP', '£': 'GBP', 'HKD': 'HKD', '港币': 'HKD', 'JPY': 'JPY', '日元': 'JPY', 'RMB': 'CNY', 'CNY': 'CNY', '元': 'CNY', '块': 'CNY', '¥': 'CNY' };
    var c = map[v];
    if (c) return c;
    return map[String(v).toUpperCase()] || '';
  }
  /* 每单位换算到 元/kg 口径（仅数值倍率，币种不变） */
  function perKgMul(unit) {
    if (!unit) return 1;
    var u = String(unit).toLowerCase();
    if (u === 'kg' || u === '千克' || u === '公斤') return 1;
    if (u === 'g' || u === '克') return 1000;
    if (u === 't' || u === '吨') return 0.001;
    return 1;
  }
  function unitLabel(unit) {
    if (!unit) return 'kg';
    var u = String(unit).toLowerCase();
    if (u === 'g' || u === '克') return 'g';
    if (u === '吨' || u === 't') return 't';
    return 'kg';
  }

  /* 剥离噪声并找出价格；返回 {price, currency, perUnit, rest, moq, lead, note} 或 null */
  function extractPrice(line) {
    var moq = '', lead = '', note = [];
    var mm = line.match(MOQ_RE);
    if (mm) { moq = mm[1] + (mm[2] || 'kg'); line = line.replace(mm[0], ' '); }
    var lm = line.match(LEAD_RE);
    if (lm) { lead = (lm[1] || lm[2]) + '天'; line = line.replace(lm[0], ' '); }
    line = line.replace(DATE_RE, ' ').replace(NOISE_RE, ' ');

    /* 收集价格候选：跳过紧贴字母/数字的数字（辅酶Q10 / DHA30 / B12 中的数字） */
    var cjkIdx = line.search(/[\u4e00-\u9fa5]/);
    var cands = [], m, re = new RegExp(NUM_RE.source, 'gi');
    while ((m = re.exec(line))) {
      if (m.index > 0 && /[A-Za-z0-9]/.test(line.charAt(m.index - 1))) { re.lastIndex = m.index + 1; continue; }
      cands.push({
        idx: m.index, len: m[0].length,
        price: toNum(m[2]), price2: m[3] ? toNum(m[3]) : null,
        currency: curCode(m[1] || m[4] || ''),
        perUnit: m[5] ? unitLabel(m[5]) : 'kg',
        hasAnchor: !!(m[1] || m[4] || m[5])
      });
      if (!m[0].length) re.lastIndex++;
    }
    if (!cands.length) return null;
    /* 选取策略：优先带锚（币种/元/每单位）→ 取最后一个锚定候选；
     * 全部无锚 → 取"首个出现在中文名之后的数字"（行号在名称前被自然排除）；兜底取最后一个 */
    var anchored = cands.filter(function (c) { return c.hasAnchor; });
    var best;
    if (anchored.length) best = anchored[anchored.length - 1];
    else {
      var afterCjk = (cjkIdx >= 0) ? cands.filter(function (c) { return c.idx > cjkIdx; }) : [];
      best = afterCjk.length ? afterCjk[0] : cands[cands.length - 1];
    }
    /* 无锚且像年份的整数 → 不是价格 */
    if (!best.hasAnchor && best.price >= 1900 && best.price <= 2999 && best.price % 1 === 0) return null;
    /* 范围值取均值 */
    if (best.price2 !== null && best.price2 > best.price) {
      var avg = (best.price + best.price2) / 2;
      note.push('范围 ' + best.price + '~' + best.price2 + ' 取均值');
      best.price = avg;
    }
    /* 每 kg 换算提示 */
    var mul = perKgMul(best.perUnit);
    if (mul !== 1) note.push(best.perUnit === 'g' ? '元/克已按 ×1000 换算为元/kg' : '元/吨已按 ÷1000 换算为元/kg');
    best.price = Math.round(best.price * mul * 10000) / 10000;
    best.moq = moq; best.lead = lead; best.note = note;
    best.rest = line.slice(0, best.idx) + ' ' + line.slice(best.idx + best.len);
    return best;
  }

  function cleanName(s) {
    return String(s || '')
      .replace(/^[^\u4e00-\u9fa5A-Za-z(]+/, '')                          /* 行首残留符号/数字 */
      .replace(/^[\d.、)\s]+/, '')
      .replace(/\b(USD|EUR|GBP|HKD|JPY|RMB|CNY)\b/gi, ' ')
      .replace(/[$¥€£]/g, ' ')
      .replace(/\b(MOQ|moq)\b/g, ' ')
      .trim()
      .replace(/[\s,;:、]+$/g, '')
      .replace(/^[^\u4e00-\u9fa5A-Za-z(]+/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*([(/])\s*/g, '$1')
      .replace(/\s*([/)])\s*/g, '$1')
      .trim();
  }
  function hasNameChar(s) { return /[\u4e00-\u9fa5A-Za-z]/.test(String(s || '')); }
  function nameScore(s) {
    var t = String(s || '').replace(/[^(\u4e00-\u9fa5A-Za-z0-9·)]/g, '');
    return t.replace(/[^(\u4e00-\u9fa5A-Za-z·)]/g, '').length;   /* 以中文/字母字数为主 */
  }
  function looksHeader(s) {
    var h = String(s || '');
    return /(原料名称|产品名称|^品名|单价|供应商|分类|序号|报价单|报价日期|有效期)/.test(h) && !/\d+(?:\.\d+)?\s*(元|USD|¥)/i.test(h);
  }

  /* 主入口：文本 → [{name, price, currency, perUnit, moq, leadTime, note, raw}] */
  function parseQuoteLines(text) {
    var lines = qnorm(text).split(/[\r\n]+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var items = [];
    var pendingName = null;   /* 竖排：名称行悬置，等待下一行的价格 */
    lines.forEach(function (line0) {
      var line = line0.replace(LINE_NO_RE, '');
      if (looksHeader(line)) { pendingName = null; return; }
      var ex = extractPrice(line);
      if (ex) {
        var nameSide = cleanName(ex.rest);
        var twoLine = false;
        var name = '';
        if (nameScore(nameSide) >= 2) {
          name = nameSide;
        } else if (pendingName) {
          /* 价格在前 / 名称在上一行（竖排） */
          name = pendingName;
          twoLine = true;
        } else {
          return;   /* 只有价格没有名称，且无悬置名称：放弃该行 */
        }
        var notes = ex.note.slice();
        if (twoLine) notes.push('名称与价格分两行（竖排）');
        /* 名称侧残留 MOQ/交期 补捕 */
        if (!ex.moq) { var mm2 = nameSide.match(MOQ_RE); if (mm2) ex.moq = mm2[1] + (mm2[2] || 'kg'); }
        if (!ex.lead) { var lm2 = nameSide.match(LEAD_RE); if (lm2) ex.lead = (lm2[1] || lm2[2]) + '天'; }
        var cur = ex.currency || 'CNY';
        var fxHint = fxHintFor(ex.price, cur);
        items.push({
          name: name,
          price: ex.price,
          currency: cur,
          perUnit: ex.perUnit,
          moq: ex.moq || '',
          leadTime: ex.lead || '',
          note: notes.concat(fxHint ? [fxHint] : []).join('；'),
          raw: line0
        });
        pendingName = null;
      } else if (hasNameChar(line) && !looksHeader(line)) {
        var nm = cleanName(line.replace(NOISE_RE, ' '));
        if (nm && nameScore(nm) >= 2) pendingName = nm;
      }
    });
    return items;
  }

  function fxSettings() {
    var s = (global.WB && global.WB.store && global.WB.store.state && global.WB.store.state.settings) || null;
    return (s && s.fx) || { CNY: 1, USD: 7.1, EUR: 7.7, HKD: 0.91, JPY: 0.048, GBP: 9.0 };
  }
  function fxHintFor(price, currency) {
    if (!currency || currency === 'CNY') return '';
    var rate = fxSettings()[currency] || 1;
    var cny = Math.round(price * rate * 100) / 100;
    return '≈ ¥' + cny + '/kg（按汇率 ' + rate + ' 折算，仅提示；入库按原币 ' + currency + '）';
  }

  /* ================= AI 结构化（可选增强） ================= */
  function aiConfig() {
    var s = (global.WB && global.WB.store && global.WB.store.state && global.WB.store.state.settings) || null;
    if (s && s.aiEnabled && s.aiEndpoint && s.aiKey) {
      return {
        endpoint: s.aiEndpoint, key: s.aiKey,
        model: s.aiModel || 'gpt-4o-mini',
        visionModel: s.aiVisionModel || s.aiModel || 'gpt-4o'   /* V13：视觉模型独立可配，留空沿用主模型 */
      };
    }
    return null;
  }
  function extractJsonArray(txt) {
    try {
      var m = String(txt).match(/\[[\s\S]*\]/);
      if (!m) return null;
      var arr = JSON.parse(m[0]);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }
  var QUOTE_PROMPT = '你是保健品原料报价单解析器。从文本中提取每一行"原料名+单价"，只输出 JSON 数组，每项字段：name(原料名), price(数字,统一为每kg价格), currency(USD/EUR/CNY等), moq(字符串,可为空), leadTime(字符串,可为空), note(备注,可为空), confidence(0到1)。元/克价格请乘1000换算为元/kg，元/吨除以1000。不要输出其他文字。\n文本：\n';
  var FORMULA_PROMPT = '你是保健品配料表结构化解析器。从文本中提取成分行，只输出 JSON 数组，每项字段：name(成分名), amount(数字或null), unit(单位字符串或null), kind(active或excipient), confidence(0到1)。不要输出其他文字。\n文本：\n';
  /* 通用 AI 调用：mode 'quote' | 'formula'；未配置 → resolve(null)；失败/无网 → resolve(null)（调用方回退本地） */
  function aiStructure(text, mode) {
    var cfg = aiConfig();
    if (!cfg) return Promise.resolve(null);
    var prompt = (mode === 'formula' ? FORMULA_PROMPT : QUOTE_PROMPT) + String(text || '');
    var body = JSON.stringify({
      model: cfg.model, temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (o) {
      var txt = (o && o.choices && o.choices[0] && o.choices[0].message && o.choices[0].message.content) || '';
      return extractJsonArray(txt);
    }).catch(function () { return null; });
  }

  /* V13：AI 视觉识别（图片 base64 dataURL → 结构化成分 JSON）。
   * 兼容 OpenAI Chat Completions 视觉消息格式；未配置/失败/无网 → resolve(null)（调用方回退本地 OCR）。 */
  var VISION_PROMPT = '你是保健品配料表图片识别器。仔细读取图片中的配料/成分表，只输出 JSON 数组，每项字段：name(成分标准名，优先中文规范名，如"维生素C"而非"VC"), amount(数字或null), unit(单位字符串或null，如 mg/g/%), kind(active或excipient), price(数字或null，图中若有价格按元/kg填), note(备注或空), confidence(0到1，不确定请如实给低分)。忽略与成分无关的文字（品牌、净含量、广告语）。不要输出其他文字。';
  function aiVisionImage(dataUrl) {
    var cfg = aiConfig();
    if (!cfg) return Promise.resolve(null);
    var body = JSON.stringify({
      model: cfg.visionModel, temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }]
    });
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (o) {
      var txt = (o && o.choices && o.choices[0] && o.choices[0].message && o.choices[0].message.content) || '';
      return extractJsonArray(txt);
    }).catch(function () { return null; });
  }

  global.WB = global.WB || {};
  global.WB.smart = {
    classifyName: classifyName,
    getRules: getRules,
    defaultRules: defaultRules,
    baseCats: baseCats,
    fmtRatio: fmtRatio,
    parseQuoteLines: parseQuoteLines,
    fxHintFor: fxHintFor,
    aiConfig: aiConfig,
    aiStructure: aiStructure,
    aiVisionImage: aiVisionImage,
    DEFAULT_RULES: DEFAULT_RULES
  };
})(typeof window !== 'undefined' ? window : globalThis);
