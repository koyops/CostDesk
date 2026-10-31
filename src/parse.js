/* ============================================================
 * parse.js — 配方文本解析引擎（纯函数，无 DOM，可单测）
 * 输入：配料表 / 配方文字（OCR 结果、粘贴文本、文档提取）
 * 输出：结构化成分行 RecognizedItem[] + 供应商标注 + 前缀/净含量
 * 覆盖格式：每粒含/每100g含 前缀、逗号顿号分号拆分、中英文单位、
 *          百分比、括号注释（别称）、辅料行、供应商行、净含量行、范围值
 * ============================================================ */
(function (global) {
  'use strict';

  /* 单位表：识别顺序很重要（μg 必须在 g 前，mg 在 g 前） */
  var UNIT_ORDER = ['μg', 'mcg', 'ug', 'mg', 'g', 'kg', 'iu', 'IU', '%', 'ml', 'l', 'L', '粒', '片', '颗', '袋', '滴', '杯', '支', '瓶'];
  var UNIT_MAP = {
    'μg': 'μg', 'mcg': 'μg', 'ug': 'μg',
    'mg': 'mg', 'g': 'g', 'kg': 'kg',
    'iu': 'IU', 'IU': 'IU',
    '%': '%', 'ml': 'ml', 'l': 'L', 'L': 'L',
    '粒': '粒', '片': '粒', '颗': '粒', '袋': '袋', '滴': '滴', '杯': '杯', '支': '支', '瓶': '瓶'
  };
  var UNIT_RE = new RegExp('(' + UNIT_ORDER.join('|') + ')', 'i');

  /* 常见辅料关键词（用于自动判断 excipient 类型） */
  var EXCIPIENT_KW = ['淀粉', '糊精', '硬脂酸镁', '二氧化硅', '微晶纤维素', '乳糖', '蔗糖', '白砂糖',
    '麦芽糊精', '明胶', '水', '山梨糖醇', '木糖醇', '香精', '色素', '柠檬酸', '碳酸氢钠',
    '氢化植物油', '滑石粉', '硬脂酸', '聚乙二醇', '羟丙甲纤维素', '甘油', '糖浆', '葡萄糖浆', '果胶', '卡拉胶', '琼脂'];
  /* 辅料/其他成分 小节标记 */
  var EXCIPIENT_SECTION_RE = /^(辅料|其他成分|基质|载体|填充剂|赋形剂|粘合剂|崩解剂|润滑剂)[:：]?/;
  var ACTIVE_SECTION_RE = /^(有效成分|主要成分|功效成分|活性成分|成分)[:：]?/;
  var PREFIX_RE = /^(每[0-9]*\.?[0-9]*(?:g|克|ml|毫升|粒|片|袋|颗|瓶|支|杯)?含|配料|原料)[:：]?\s*/;
  var SUPPLIER_RE = /由([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,24}?)(公司|集团|科技|生物|药业|制药|贸易|食品)/;
  var NET_RE = /净含量[:：]?([\d.]+)\s*(g|kg|克|毫升|ml|mL|L)/;
  /* 吞掉净含量片段、括号尾注（如 "(30粒)"）及紧随的标点，避免残留 ".每粒含" 使前缀锚定失败。
     注意：文本已经过 norm() 归一化，全角括号/句号已转为半角 */
  var NET_RE_LINE = /净含量:?[\d.]+\s*(?:g|kg|克|毫升|ml|mL|L)\s*(?:\([^)]*\))?(?:[\s.,;]+|$)/;
  var RANGE_RE = /(\d+(?:\.\d+)?)\s*[-~～至]\s*(\d+(?:\.\d+)?)/g;
  var PER_UNIT_RE = /[\/／](粒|片|颗|袋|支|杯|瓶)$/;

  /* 归一化：全角→半角分隔符，统一括号；保留换行结构 */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/\uFF0C/g, ',').replace(/\u3001/g, ',').replace(/[；;]/g, ';')
      .replace(/\uFF1A/g, ':').replace(/[：]/g, ':')
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[。．]/g, '.')
      .replace(/[·•]/g, ' ')
      .replace(/\uFF05/g, '%')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\r?\n\s*/g, '\n')
      .trim();
  }

  function isExcipientName(name) {
    for (var i = 0; i < EXCIPIENT_KW.length; i++) {
      if (name.indexOf(EXCIPIENT_KW[i]) >= 0) return true;
    }
    return false;
  }

  /* 解析单个成分块，如 "维生素C 200mg" / "VC 20%" / "淀粉" */
  function parseItem(chunk, kindHint) {
    chunk = norm(chunk);
    if (!chunk) return null;
    /* 纯符号/数字行忽略 */
    if (/^[\d.,%()\s\-~]+$/.test(chunk)) return null;
    var item = { name: chunk, amount: null, unit: null, kind: kindHint || 'active', confidence: 0.6, note: '', raw: chunk };

    /* 括号注释（别称）：维生素C（抗坏血酸）500mg */
    var pm = chunk.match(/^(.+?)\s*\(([^)]{1,20})\)\s*(.*)$/);
    if (pm && pm[1].trim() && pm[2].trim()) {
      item.name = pm[1].trim();
      item.note = pm[2].trim();
      chunk = item.name + ' ' + (pm[3] || '').trim();
    }

    /* 末尾 每粒/每片 等单位指示：VC 200mg/粒 */
    var pu = chunk.match(PER_UNIT_RE);
    if (pu) {
      item.note = (item.note ? item.note + '·' : '') + '每' + pu[1];
      chunk = chunk.replace(PER_UNIT_RE, '');
    }

    /* 从右往左锚定「数值+单位」结尾，避免名称中数字（如维生素D3）被误取 */
    var unitRe = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(' + UNIT_ORDER.join('|') + ')\\s*$');
    var um = chunk.match(unitRe);
    if (um) {
      item.name = cleanName(chunk.slice(0, um.index));
      item.amount = parseFloat(um[1]);
      item.unit = UNIT_MAP[um[2].toLowerCase()] || um[2];
    } else {
      var nm = chunk.match(/(\d+(?:\.\d+)?)\s*$/);
      if (nm) {
        item.name = cleanName(chunk.slice(0, nm.index));
        item.amount = parseFloat(nm[1]);
        item.unit = null;
      } else {
        item.name = cleanName(chunk);
      }
    }

    /* 类型判定 */
    if (item.kind !== 'excipient' && isExcipientName(item.name)) item.kind = 'excipient';

    /* 置信度 */
    if (item.amount !== null && item.unit) item.confidence = 0.95;
    else if (item.amount !== null) item.confidence = 0.8;
    else if (item.kind === 'excipient') item.confidence = 0.7;
    else item.confidence = 0.55;

    /* V13：OCR 纠错词典修复 + 乱码/可疑英文检测（低置信「待确认」，不静默当正确值） */
    var fixed = fixOcrName(item.name);
    if (fixed) {
      if (fixed !== item.name) item.note = (item.note ? item.note + '·' : '') + '已纠错:' + item.name;
      item.name = fixed;
      item.confidence = Math.min(0.95, Math.max(item.confidence, 0.9));
    } else {
      var latin = item.name.replace(/[^a-zA-Z]/g, '');
      if (isGarbled(item.name)) {
        item.confidence = Math.min(item.confidence, 0.35);
        item.note = (item.note ? item.note + '·' : '') + '疑似乱码待确认';
      } else if (latin.length >= 8) {
        /* 词典外长英文串：无法验证是否正确 → 压置信度提示人工核对 */
        item.confidence = Math.min(item.confidence, 0.6);
        item.note = (item.note ? item.note + '·' : '') + '英文待确认';
      }
    }

    return item;
  }

  function cleanName(name) {
    return name
      .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')
      .replace(/[,;:：、\s]+$/, '')
      .trim();
  }

  /* ================= V13：OCR 纠错词典 + 乱码检测 =================
   * 图片 OCR 把英文/复杂标签识别成乱码（如 "BETRERN(EEEWMYron"）是主要痛点。
   * 分层治理：① 常见保健品原料别名/缩写/OCR 近形错字 → 映射回标准名；
   *           ② 无元音辅音串等噪声特征 → 判定乱码，压低置信度并标「待确认」。 */
  var OCR_FIX_DICT = [
    { name: '维生素C', aka: ['vc', '维c', '维他命c', '抗坏血酸', 'l抗坏血酸', 'ascorbicacid', '维生素丙', 'vitaminc'] },
    { name: '维生素C钠', aka: ['sodiumascorbate', 'vc钠', '维c钠', '抗坏血酸钠'] },
    { name: '维生素E', aka: ['ve', '维e', '维他命e', '生育酚', 'tocopherol', 'dlaetocopherol', 'dlalpha生育酚', 'vitamine'] },
    { name: '维生素A', aka: ['va', '维a', '维他命a', '视黄醇', 'retinol', '棕榈酸视黄酯'] },
    { name: '维生素D3', aka: ['vd3', '维d3', '胆钙化醇', 'cholecalciferol', '维生素d', 'vd'] },
    { name: '维生素K2', aka: ['vk2', '维k2', 'menaquinone', '甲萘醌'] },
    { name: '维生素B1', aka: ['vb1', '维b1', '硫胺素', 'thiamine'] },
    { name: '维生素B2', aka: ['vb2', '维b2', '核黄素', 'riboflavin'] },
    { name: '维生素B6', aka: ['vb6', '维b6', '吡哆醇', 'pyridoxine'] },
    { name: '维生素B12', aka: ['vb12', '维b12', '甲钴胺', '钴胺素', 'cyanocobalamin'] },
    { name: '烟酰胺', aka: ['烟酰胺', '尼克酰胺', 'niacinamide', '维生素b3', 'vb3', '烟酸', 'niacin'] },
    { name: '泛酸钙', aka: ['泛酸', 'pantothenate', '维生素b5', 'vb5', 'd泛酸钙'] },
    { name: '生物素', aka: ['biotin', '维生素h', 'vh', '维生素b7', 'vb7'] },
    { name: '叶酸', aka: ['folicacid', 'folate', '蝶酰谷氨酸'] },
    { name: '辅酶Q10', aka: ['辅酶q10', 'coenzymeq10', 'coq10', 'ubiquinone', '泛醌'] },
    { name: '胶原蛋白肽', aka: ['胶原蛋白', '胶原肽', '水解胶原蛋白', 'collagen', 'collagenpeptide', '鱼胶原', '小分子肽'] },
    { name: '褪黑素', aka: ['melatonin', '松果体素'] },
    { name: '益生菌', aka: ['probiotic', '乳酸菌', '双歧杆菌', '嗜酸乳杆菌', '鼠李糖乳杆菌', '益生元'] },
    { name: '鱼油', aka: ['fishoil', '深海鱼油', '欧米伽3', 'omega3', 'ω3'] },
    { name: 'DHA藻油', aka: ['dha', '二十二碳六烯酸', '藻油dha', 'docosahexaenoicacid'] },
    { name: 'EPA', aka: ['二十碳五烯酸', 'eicosapentaenoicacid'] },
    { name: '氨基葡萄糖', aka: ['氨糖', '氨基葡萄糖盐酸盐', '硫酸氨基葡萄糖', 'glucosamine'] },
    { name: '硫酸软骨素', aka: ['软骨素', 'chondroitin', 'chondroitinsulfate'] },
    { name: '碳酸钙', aka: ['钙', 'calcium', '柠檬酸钙', '乳酸钙', '葡萄糖酸钙', '磷酸钙'] },
    { name: '葡萄糖酸锌', aka: ['锌', 'zinc', '柠檬酸锌', '硫酸锌'] },
    { name: '富马酸亚铁', aka: ['铁', 'iron', '硫酸亚铁', '甘氨酸亚铁', '血红素铁'] },
    { name: '氧化镁', aka: ['镁', 'magnesium', '柠檬酸镁', '甘氨酸镁'] },
    { name: '亚硒酸钠', aka: ['硒', 'selenium', '硒酵母'] },
    { name: '菊粉', aka: ['inulin', '菊苣纤维'] },
    { name: '低聚果糖', aka: ['fructooligosaccharide', 'fos', '低聚半乳糖', '低聚异麦芽糖'] },
    { name: '叶黄素', aka: ['lutein', '叶黄素酯', '玉米黄质', 'zeaxanthin'] },
    { name: '葡萄籽提取物', aka: ['葡萄籽', '原花青素', 'opc', 'grapeseed', 'proanthocyanidin'] },
    { name: '大豆异黄酮', aka: ['soyisoflavone', '异黄酮', '染料木素', 'genistein'] },
    { name: '白藜芦醇', aka: ['resveratrol'] },
    { name: '牛磺酸', aka: ['taurine'] },
    { name: '左旋肉碱', aka: ['l肉碱', '肉碱', 'lcarnitine', '左旋肉碱酒石酸盐'] },
    { name: '肌酸', aka: ['creatine', '一水肌酸'] },
    { name: 'γ氨基丁酸', aka: ['gaba', 'gamma氨基丁酸', '氨基丁酸'] },
    { name: '乳矿物盐', aka: ['乳钙', 'milkmineral'] },
    { name: '接骨木莓', aka: ['接骨木', 'elderberry', '黑果腺肋花楸'] },
    { name: '针叶樱桃提取物', aka: ['针叶樱桃', '樱桃提取物', 'acerola'] },
    { name: '酵母提取物', aka: ['酵母', '安琪酵母', 'yeastextract', '啤酒酵母'] },
    { name: '透明质酸钠', aka: ['玻尿酸', '玻尿酸钠', 'hyaluronicacid', '玻璃酸钠'] },
    { name: '水飞蓟提取物', aka: ['水飞蓟', '乳蓟', 'silymarin', '水飞蓟素'] },
    { name: '人参提取物', aka: ['人参', '人参皂苷', 'ginseng', '西洋参', ' GinsengPanax'.trim().toLowerCase()] },
    { name: '枸杞提取物', aka: ['枸杞', '枸杞子', 'goji', 'wolfberry'] },
    { name: '灵芝提取物', aka: ['灵芝', '灵芝孢子粉', 'reishi', 'ganoderma'] },
    { name: '螺旋藻', aka: ['spirulina', '钝顶螺旋藻'] },
    { name: '雨生红球藻', aka: ['虾青素', 'astaxanthin', '红球藻'] },
    { name: '浓缩乳清蛋白', aka: ['乳清蛋白', 'wheyprotein', '浓缩牛奶蛋白'] },
    { name: '大豆蛋白', aka: ['soyprotein', '大豆分离蛋白'] },
    { name: '酪蛋白磷酸肽', aka: ['cpp', 'caseinphosphopeptide'] },
    { name: '麦芽糊精', aka: ['maltodextrin'] },
    { name: '微晶纤维素', aka: ['microcrystallinecellulose', 'mcc'] },
    { name: '硬脂酸镁', aka: ['magnesiumstearate'] },
    { name: '二氧化硅', aka: ['silicondioxide', 'silica'] }
  ];
  /* 预归一化键：仅留字母数字，小写 */
  function ocrKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  }
  /* 简易编辑距离（限短串，容量小可忽略性能） */
  function editDist(a, b) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (!la || !lb) return Math.max(la, lb);
    var prev = [], cur = [];
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur[0] = i;
      for (var j2 = 1; j2 <= lb; j2++) {
        cur[j2] = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + (a[i - 1] === b[j2 - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[lb];
  }
  /* 名称修复：命中别名/缩写/近形错字 → 标准原料名；未命中返回 null */
  function fixOcrName(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var k = ocrKey(s);
    if (!k) return null;
    /* 长含中文名且有实义的：先试精确/包含匹配 */
    for (var i = 0; i < OCR_FIX_DICT.length; i++) {
      var d = OCR_FIX_DICT[i];
      for (var j = 0; j < d.aka.length; j++) {
        var ak = ocrKey(d.aka[j]);
        if (!ak) continue;
        if (k === ak) return d.name;
        /* OCR 常把 0/O、1/l/I、5/S 混淆：键相同已覆盖；此处做近形容错（距离≤2 且长度≥4） */
        if (ak.length >= 4 && k.length >= 4 && Math.abs(ak.length - k.length) <= 2 && editDist(k, ak) <= 2) return d.name;
        /* 候选中完整包含别名（如 "维生素c(抗坏血酸钠)"）且别名足够长 */
        if (ak.length >= 3 && k.indexOf(ak) >= 0) return d.name;
      }
    }
    return null;
  }
  /* 乱码检测：英文串元音占比过低 / 辅音长串 / 无成对元音的高噪碎片 → 视为 OCR 乱码。
   * 样本校准：n1 截图乱码 "BETRERN(EEEWMYron" "BRETRITEITH(RAEMeon" 等虽含元音，
   * 但元音比 <0.45 且无常见单词形态，配合纠错词典未命中判定。 */
  function isGarbled(s) {
    var str = String(s || '').trim();
    if (!str) return false;
    if (/[\u4e00-\u9fa5]/.test(str)) return false;  /* 含中文按可读处理 */
    var letters = str.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 5) return false;
    if (fixOcrName(str)) return false;               /* 词典可纠错 → 不是乱码 */
    var vowels = (letters.match(/[aeiouyAEIOUY]/g) || []).length;
    var ratio = vowels / letters.length;
    if (ratio < 0.2) return true;
    if (/[b-df-hj-np-tv-z]{5,}/i.test(letters)) return true;   /* 5连辅音 */
    if (letters.length >= 8 && (ratio < 0.45 || /[b-df-hj-np-tv-z]{4,}/i.test(letters))) return true;
    return false;
  }

  /* 主解析入口 */
  function parseFormulaText(text) {
    var result = { rawText: String(text || ''), items: [], suppliers: [], prefix: '', netContent: '', warns: [] };
    var t = norm(result.rawText);
    if (!t) return result;

    /* 范围值取上限：200-400mg → 400mg */
    t = t.replace(RANGE_RE, function (m, a, b) { return b; });

    /* 供应商标注：由XX公司提供 */
    t = t.replace(SUPPLIER_RE, function (m, name, suffix) {
      result.suppliers.push((name + suffix).replace(/\s+/g, ''));
      return ' ';
    });
    t = t.replace(/\s*(?:提供|供应|生产)\s*/g, ' ');

    /* 净含量行（不是成分，单独记录）；吞掉整行剩余部分，避免 "(30粒)" 残留被误判 */
    var nm = t.match(NET_RE);
    if (nm) {
      result.netContent = nm[1] + nm[2];
      t = t.replace(NET_RE_LINE, ' ');
    }

    /* 按行处理；每行内按逗号/顿号/分号拆分 */
    var lines = t.split(/[\r\n]+/).map(norm).filter(Boolean);
    var excipientSection = false;

    lines.forEach(function (line) {
      if (EXCIPIENT_SECTION_RE.test(line)) {
        excipientSection = true;
      } else if (ACTIVE_SECTION_RE.test(line)) {
        excipientSection = false;
      }
      /* 前缀：每粒含 / 每100g含 */
      var pm = line.match(PREFIX_RE);
      if (pm) {
        var p = pm[0].replace(/[:：]?\s*$/, '').trim();
        if (!result.prefix) result.prefix = p;
        line = line.replace(PREFIX_RE, '');
      }
      if (EXCIPIENT_SECTION_RE.test(line)) {
        line = line.replace(EXCIPIENT_SECTION_RE, '');
        excipientSection = true;
      }
      var chunks = line.split(/[,;]/).map(norm).filter(Boolean);
      chunks.forEach(function (chunk) {
        /* 避免把 "每粒含" 残留当成分 */
        if (/^每[\d.]*(?:g|克|ml|毫升|粒|片|袋|颗)?含$/.test(chunk)) return;
        /* 行中出现的辅料/有效成分小节标记：影响其后成分块的类型 */
        var em = chunk.match(EXCIPIENT_SECTION_RE);
        if (em) {
          excipientSection = true;
          chunk = chunk.replace(EXCIPIENT_SECTION_RE, '');
        } else if (ACTIVE_SECTION_RE.test(chunk)) {
          excipientSection = false;
          chunk = chunk.replace(ACTIVE_SECTION_RE, '');
        }
        if (!chunk) return;
        var kindHint = excipientSection ? 'excipient' : 'active';
        var it = parseItem(chunk, kindHint);
        if (it) result.items.push(it);
      });
      /* 小节标记只对本行生效；跨行重置（下一行以内容判断） */
      excipientSection = false;
    });

    /* 占位符净化：名称为空的行剔除 */
    result.items = result.items.filter(function (it) { return it.name; });
    return result;
  }

  /* 供 UI 层使用：简单名称匹配原料库（模糊：完全相等或互相包含） */
  function matchMaterial(items, materials) {
    return items.map(function (it) {
      var hit = null;
      var name = it.name || '';
      for (var i = 0; i < materials.length; i++) {
        var m = materials[i];
        var mn = m.name || '';
        var inci = (m.inciName || '').toLowerCase();
        var nl = name.toLowerCase();
        if (mn === name) { hit = m; break; }
        if (mn.indexOf(name) >= 0 || name.indexOf(mn) >= 0) { hit = m; break; }
        if (inci && inci.indexOf(nl) >= 0) { hit = m; break; }
      }
      return Object.assign({}, it, { matchedMaterialId: hit ? hit.id : '' });
    });
  }

  global.WB = global.WB || {};
  global.WB.parse = {
    parseFormulaText: parseFormulaText,
    matchMaterial: matchMaterial,
    EXCIPIENT_KW: EXCIPIENT_KW,
    fixOcrName: fixOcrName,
    isGarbled: isGarbled,
    OCR_FIX_DICT: OCR_FIX_DICT
  };
})(typeof window !== 'undefined' ? window : globalThis);
