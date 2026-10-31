/* ============================================================
 * store.js — 数据层
 * 统一状态管理 + localStorage 持久化 + 备份导入导出 + 草稿 + 编号生成
 * ============================================================ */
(function (global) {
  'use strict';
  var calc = global.WB.calc;

  var LS_DATA = 'wb_oem_v2_data';
  var LS_DRAFT = 'wb_oem_v2_draft';

  /* ---------- ID / 编号 ---------- */
  function genId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  /* 报价编号：前缀 + 日期格式 + 3位流水，如 BK202608-001 */
  function nextQuoteNo(settings) {
    var s = settings || state.settings;
    var d = new Date();
    var ymd = s.quoteNoDateFmt === 'YYYYMMDD'
      ? '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      : '' + d.getFullYear() + pad2(d.getMonth() + 1);
    var prefix = s.quoteNoPrefix || 'BK';
    var year = String(d.getFullYear());
    var maxSeq = 0;
    state.data.quotes.forEach(function (q) {
      var m = q.quoteNo && q.quoteNo.match(new RegExp('^' + prefix + year + '\\d{4,6}-(\\d+)$'));
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    });
    var seq = String(maxSeq + 1);
    while (seq.length < 3) seq = '0' + seq;
    return prefix + year + ymd.slice(4) + '-' + seq;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- 默认种子数据 ---------- */
  function seedDosages() {
    var now = new Date().toISOString();
    function df(name, lossM, lossP, lossProd, fee, levels, fields, defaults) {
      return {
        id: genId('df'), name: name, enabled: true,
        defaultLossRate: { material: lossM, packaging: lossP, production: lossProd },
        processLevels: levels,
        customFields: fields,
        defaults: defaults || {},
        createdAt: now, updatedAt: now
      };
    }
    return [
      df('胶囊', 4, 1, 2, 0.05, [{ level: '人工', fee: 0.05 }, { level: '半自动', fee: 0.09 }], [
        { key: 'capsuleSpec', label: '胶囊规格', type: 'select', options: ['0#(0.5g)', '1#(0.42g)', '2#(0.35g)', '植物胶囊'], required: false, placeholder: '选填' },
        { key: 'coating', label: '包衣工艺', type: 'select', options: ['无', '肠溶包衣', '缓释包衣'], required: false }
      ], { weight: 0.5, count: 60, net: '30g', box: '12瓶/箱' }),
      df('软胶囊', 5, 1, 2, 0.08, [{ level: '人工', fee: 0.08 }, { level: '半自动', fee: 0.14 }], [
        { key: 'shell', label: '囊壳材质', type: 'select', options: ['明胶', '植物胶(羟丙甲纤维素)', '鱼胶'], required: true, placeholder: '必填' },
        { key: 'shellColor', label: '囊壳颜色', type: 'text', required: false, placeholder: '如：琥珀色' }
      ], { weight: 0.8, count: 60, net: '48g', box: '12瓶/箱' }),
      df('软糖', 5, 1, 3, 0.08, [{ level: '人工', fee: 0.08 }, { level: '半自动', fee: 0.12 }], [
        { key: 'gummyType', label: '软糖类型', type: 'select', options: ['明胶软糖', '果胶软糖', '淀粉软糖'], required: true },
        { key: 'sugarFree', label: '无糖配方', type: 'select', options: ['否', '是(代糖)'], required: false }
      ], { weight: 3, count: 60, net: '180g', box: '12瓶/箱' }),
      df('片剂', 3, 1, 2, 0.03, [{ level: '人工', fee: 0.03 }, { level: '半自动', fee: 0.07 }], [
        { key: 'tabletType', label: '片型', type: 'select', options: ['素片', '薄膜包衣片', '肠溶片', '泡腾片'], required: true },
        { key: 'hardness', label: '硬度要求', type: 'text', required: false, placeholder: '如：≥8kg' }
      ], { weight: 0.6, count: 60, net: '36g', box: '12瓶/箱' }),
      df('粉剂', 6, 1, 3, 0.10, [{ level: '人工', fee: 0.10 }, { level: '半自动', fee: 0.16 }], [
        { key: 'brewing', label: '冲调方式', type: 'select', options: ['温水冲调', '冷水冲调', '直饮', '混入食品'], required: true },
        { key: 'particle', label: '目数要求', type: 'text', required: false, placeholder: '如：80目' }
      ], { weight: 2, count: 30, net: '60g', box: '30袋/盒' }),
      df('固体饮料', 8, 1, 3, 0.15, [{ level: '人工', fee: 0.15 }, { level: '半自动', fee: 0.22 }], [
        { key: 'packForm', label: '包装形式', type: 'select', options: ['条状袋', '罐装', '棒状', '单杯'], required: true },
        { key: 'flavor', label: '口味', type: 'text', required: false, placeholder: '如：草莓味' }
      ], { weight: 2, count: 30, net: '60g', box: '30袋/盒' }),
      df('口服液', 5, 1, 3, 0.12, [{ level: '人工', fee: 0.12 }, { level: '半自动', fee: 0.18 }], [
        { key: 'bottleType', label: '瓶型', type: 'select', options: ['玻璃瓶', 'PP瓶', '铝瓶'], required: true },
        { key: 'bottleVol', label: '瓶容量(ml)', type: 'number', required: false, unit: 'ml' }
      ], { weight: 10, count: 10, net: '100ml', box: '12瓶/箱' })
    ];
  }

  function seedMaterials() {
    var now = new Date().toISOString();
    var day = 86400000;
    function dateOffset(days) { return new Date(Date.now() + days * day).toISOString().slice(0, 10); }
    function mat(name, opts) {
      opts = opts || {};
      return {
        id: genId('mat'), name: name, inciName: opts.inciName || '', casNo: opts.casNo || '',
        grade: opts.grade || '食品级', defaultUnit: opts.defaultUnit || 'kg', moq: opts.moq || 1,
        category: opts.category || '其他',
        suppliers: opts.suppliers || [],
        priceHistory: opts.priceHistory || [],
        warnLow: opts.warnLow, warnHigh: opts.warnHigh,
        createdAt: now, updatedAt: now
      };
    }
    return [
      mat('维生素C（包膜）', {
        inciName: 'Ascorbic Acid', casNo: '50-81-7', grade: '食品级', category: '维生素', moq: 500,
        suppliers: [
          { id: genId('sup'), supplierName: '石药维生', contact: '王经理', price: 85.5, currency: 'CNY', quoteDate: dateOffset(-10), validUntil: dateOffset(80), moq: 5000, leadTime: '15天', taxIncluded: true, shippingIncluded: true, source: 'manual', isDefault: true },
          { id: genId('sup'), supplierName: '新和成', contact: '李工', price: 88, currency: 'CNY', quoteDate: dateOffset(-5), validUntil: dateOffset(60), moq: 3000, leadTime: '12天', taxIncluded: true, shippingIncluded: false, source: 'manual' }
        ],
        priceHistory: [
          { date: dateOffset(-120), price: 95, supplier: '石药维生' }, { date: dateOffset(-80), price: 92, supplier: '新和成' },
          { date: dateOffset(-40), price: 88, supplier: '石药维生' }, { date: dateOffset(-10), price: 85.5, supplier: '石药维生' }
        ],
        warnLow: 80, warnHigh: 95
      }),
      mat('牛磺酸', {
        inciName: 'Taurine', casNo: '107-35-7', grade: '食品级', category: '氨基酸', moq: 1000,
        suppliers: [
          { id: genId('sup'), supplierName: '永安药业', contact: '陈总', price: 96, currency: 'CNY', quoteDate: dateOffset(-3), validUntil: dateOffset(90), moq: 2000, leadTime: '10天', taxIncluded: true, shippingIncluded: true, source: 'manual', isDefault: true },
          { id: genId('sup'), supplierName: '潜江永安', contact: '', price: 88, currency: 'CNY', quoteDate: dateOffset(-20), validUntil: dateOffset(70), moq: 5000, leadTime: '14天', taxIncluded: false, shippingIncluded: true, source: 'paste' }
        ],
        priceHistory: [
          { date: dateOffset(-150), price: 78, supplier: '永安药业' }, { date: dateOffset(-100), price: 84, supplier: '永安药业' },
          { date: dateOffset(-50), price: 88, supplier: '潜江永安' }, { date: dateOffset(-3), price: 96, supplier: '永安药业' }
        ],
        warnLow: 82, warnHigh: 95
      }),
      mat('益生菌BB-12（冻干粉）', {
        inciName: 'Bifidobacterium BB-12', grade: '医药级', category: '益生菌', moq: 10,
        suppliers: [
          { id: genId('sup'), supplierName: '科汉森', contact: '张工', price: 1200, currency: 'CNY', quoteDate: dateOffset(-160), validUntil: dateOffset(-15), moq: 10, leadTime: '30天', taxIncluded: true, shippingIncluded: true, source: 'manual', isDefault: true }
        ],
        priceHistory: [{ date: dateOffset(-160), price: 1200, supplier: '科汉森' }, { date: dateOffset(-300), price: 1250, supplier: '科汉森' }],
        warnLow: 1100, warnHigh: 1350
      }),
      mat('鱼油（DHA 30%）', {
        inciName: 'Fish Oil DHA30', casNo: '8016-13-5', grade: '食品级', category: '油脂', moq: 200,
        suppliers: [
          { id: genId('sup'), supplierName: 'Rimfrost(挪威)', contact: 'Olsen', price: 6.5, currency: 'USD', quoteDate: dateOffset(-8), validUntil: dateOffset(50), moq: 500, leadTime: '45天', taxIncluded: false, shippingIncluded: false, source: 'api', isDefault: true },
          { id: genId('sup'), supplierName: '国货深海', contact: '', price: 52, currency: 'CNY', quoteDate: dateOffset(-15), validUntil: dateOffset(75), moq: 300, leadTime: '20天', taxIncluded: true, shippingIncluded: true, source: 'manual' }
        ],
        priceHistory: [{ date: dateOffset(-90), price: 7.2, supplier: 'Rimfrost' }, { date: dateOffset(-8), price: 6.5, supplier: 'Rimfrost' }],
        warnLow: 5.8, warnHigh: 7.5
      }),
      mat('低聚果糖FOS', {
        inciName: 'Fructo-Oligosaccharide', grade: '食品级', category: '糖类', moq: 500,
        suppliers: [
          { id: genId('sup'), supplierName: '保龄宝', contact: '', price: 18.5, currency: 'CNY', quoteDate: dateOffset(-12), validUntil: dateOffset(100), moq: 1000, leadTime: '7天', taxIncluded: true, shippingIncluded: true, source: 'manual', isDefault: true }
        ],
        priceHistory: [{ date: dateOffset(-90), price: 20, supplier: '保龄宝' }, { date: dateOffset(-12), price: 18.5, supplier: '保龄宝' }],
        warnLow: 17, warnHigh: 22
      })
    ];
  }

  function seedPackaging() {
    var now = new Date().toISOString();
    function pk(name, type, spec, price, moq, supplier, printFee, moldFee, lossRate) {
      return {
        id: genId('pk'), name: name, type: type, spec: spec, price: price, moq: moq,
        supplier: supplier, printFee: printFee || 0, moldFee: moldFee || 0, lossRate: lossRate === undefined ? 1 : lossRate,
        note: '', createdAt: now, updatedAt: now
      };
    }
    return [
      pk('HDPE瓶 150ml', '瓶身', '150ml 白色', 0.85, 5000, '恒昌塑业', 0, 20000, 1),
      pk('旋盖 28mm', '瓶盖', '28mm 白色', 0.12, 10000, '恒昌塑业', 0, 5000, 1),
      pk('彩盒 三折页', '彩盒', '250g白卡 覆膜', 0.65, 3000, '华美印刷', 0.15, 15000, 2),
      pk('不干胶标签 40×60', '标签', '铜版纸 亮面', 0.08, 5000, '华美印刷', 0.02, 8000, 1),
      pk('铝箔袋 8×12cm', '其他', '三边封 加厚', 0.18, 8000, '联创包装', 0, 6000, 2),
      pk('玻璃瓶 30ml', '瓶身', '棕色避光', 1.35, 5000, '晶华玻璃', 0, 35000, 2)
    ];
  }

  function seedFormulas() {
    var now = new Date().toISOString();
    function f(name, dosageName, weight, count, mats, opts) {
      opts = opts || {};
      return {
        id: genId('form'), name: name, dosageFormId: opts.dosageFormId || '',
        dosageName: dosageName, type: opts.type || '常规',
        weight: weight, count: count,
        net: opts.net || (weight * count).toFixed(0) + 'g', box: opts.box || '12瓶/箱',
        mats: mats, // [{name, ratio}]
        packs: opts.packs || [{ name: 'HDPE瓶 150ml', num: 1 }],
        craftNote: opts.craftNote || '', testNote: opts.testNote || '',
        craftPremium: opts.craftPremium || 0,
        version: 1, versions: [{ version: 1, note: '初始版本', updatedAt: now }],
        createdAt: now, updatedAt: now
      };
    }
    return [
      f('儿童维C软糖', '软糖', 3, 60, [
        { name: '维生素C（包膜）', ratio: 6 }, { name: '低聚果糖FOS', ratio: 45 }, { name: '牛磺酸', ratio: 1 }
      ], { type: '常规', net: '180g', box: '12瓶/箱', craftNote: '果胶软糖，草莓味', testNote: 'SGS常规4项' }),
      f('益生菌固体饮料DGDA', '固体饮料', 2, 30, [
        { name: '益生菌BB-12（冻干粉）', ratio: 2 }, { name: '低聚果糖FOS', ratio: 70 }
      ], { type: '定制', net: '60g', box: '30袋/盒', craftNote: '冻干菌粉，冷水冲调', testNote: 'DGDA注册+活菌数检测', craftPremium: 8 }),
      f('鱼油软胶囊', '软胶囊', 0.8, 120, [
        { name: '鱼油（DHA 30%）', ratio: 75 }, { name: '维生素C（包膜）', ratio: 2 }
      ], { type: '常规', net: '96g', box: '24瓶/箱', craftNote: '明胶囊壳，琥珀色', testNote: 'DHA含量检测' })
    ];
  }

  function seedQuotes() {
    var now = new Date().toISOString();
    var d = new Date();
    function q(no, name, customer, status, amount, daysAgo, follow) {
      return {
        id: genId('q'), quoteNo: no, status: status, projectName: name, customer: customer,
        dosageFormId: '', params: {}, formulaId: '', formulaVersion: 1,
        materials: [], packaging: [], moqTiers: [3000, 5000, 10000],
        biz: {}, result: null,
        followUps: follow || [],
        amount: amount, createdAt: new Date(d.getTime() - daysAgo * 86400000).toISOString(),
        updatedAt: now
      };
    }
    return [
      q('BK202607-001', '儿童维C软糖·内贸', '华东客户A·商贸', 'ordered', 6.82, 40, [{ id: genId('f'), date: new Date(d.getTime() - 30 * 86400000).toISOString(), note: '客户已下首批订单 6000 瓶', nextDate: '' }]),
      q('BK202607-002', '益生菌固体饮料DGDA', '华南客户B·进出口', 'confirmed', 9.15, 25, [{ id: genId('f'), date: new Date(d.getTime() - 20 * 86400000).toISOString(), note: '客户确认报价，等DGDA注册通过后下单', nextDate: new Date(d.getTime() + 10 * 86400000).toISOString() }]),
      q('BK202608-001', '鱼油软胶囊·贴牌', '华东客户C·健康', 'quoted', 12.40, 5, [{ id: genId('f'), date: new Date(d.getTime() - 4 * 86400000).toISOString(), note: '已发正式报价单，客户比价中', nextDate: new Date(d.getTime() + 5 * 86400000).toISOString() }]),
      q('BK202608-002', '维生素C泡腾片·定制', '华北客户D·科技', 'lost', 8.90, 12, [{ id: genId('f'), date: new Date(d.getTime() - 8 * 86400000).toISOString(), note: '价格偏高流失，下次降本后回访', nextDate: '' }])
    ];
  }

  function seedSettings() {
    return {
      taxRate: 13, profitRate: 30, lowProfitLine: 15, adminRate: 0,
      quoteNoPrefix: 'BK', quoteNoDateFmt: 'YYYYMM',
      defaultLadder: '1000,3000,5000,10000', autoSaveSec: 30,
      fx: { CNY: 1, USD: 7.1, EUR: 7.7, HKD: 0.91, JPY: 0.048, GBP: 9.0 },
      /* V12：原料自动分类规则（null=内置默认规则；保存用户规则后为数组） */
      catRules: null,
      /* V12：AI 识别增强（可选；未配置/无网自动回退本地解析） */
      aiEnabled: false, aiEndpoint: '', aiKey: '', aiModel: '',
      /* v3 新增：报价单模板 & OCR 预留 API */
      ocrApiUrl: '',
      pdfTemplate: {
        logo: '', company: '', contact: '', phone: '', address: '',
        notes: '1. 本报价含税/运费以双方确认为准；\n2. 报价有效期 15 天；\n3. 起订量及包装以合同为准。',
        footer: '内部核算参考件 · 仅供业务使用'
      }
    };
  }

  /* ---------- 元数据（识别历史/快照/最近使用/UI状态） ---------- */
  function defaultMeta() {
    return {
      recognizeHistory: [],   // 最近10次识别记录 [{id,sourceType,rawText,items,createdAt}]
      snapshots: [],          // 一键报价参数快照 [{id,t,name,summary,calc}]
      recent: { quotes: [], formulas: [], dosages: [] },
      ui: { bizCollapsed: true, packExpanded: true, matsCollapsed: false, packsCollapsed: false }
    };
  }
  function pushRecognHistory(rec) {
    state.meta.recognizeHistory.unshift(rec);
    if (state.meta.recognizeHistory.length > 10) state.meta.recognizeHistory.length = 10;
  }
  function pushSnapshot(snap) {
    state.meta.snapshots.unshift(snap);
    if (state.meta.snapshots.length > 20) state.meta.snapshots.length = 20;
  }
  function pushRecent(type, id) {
    var list = state.meta.recent[type] || (state.meta.recent[type] = []);
    list = list.filter(function (x) { return x !== id; });
    list.unshift(id);
    if (list.length > 5) list.length = 5;
    state.meta.recent[type] = list;
  }
  /* V14 根因修复：「最近使用 · 报价」回填。
   * 旧版只在「当次存档动作」时写入 recent.quotes，老档 / 升级用户 / 已有存档的会话
   * 该列表始终为空 —— 于是出现「存档页明明有记录，核算台最近使用却显示暂无」的割裂。
   * 加载时若报价最近列表为空而报价存档非空，按时间倒序回填最近 5 条，保证入口有内容可用。 */
  function backfillRecent() {
    if (!state.meta || !state.meta.recent) return;
    var rec = state.meta.recent;
    if (!rec.quotes || !rec.quotes.length) {
      var list = ((state.data && state.data.quotes) || []).slice();
      list.sort(function (a, b) {
        var ta = (a && (a.updatedAt || a.createdAt)) || '';
        var tb = (b && (b.updatedAt || b.createdAt)) || '';
        return tb < ta ? -1 : tb > ta ? 1 : 0;   /* 时间倒序：最近存档在前 */
      });
      rec.quotes = list.slice(0, 5).map(function (q) { return q.id; }).filter(Boolean);
    }
    /* 清理已失效引用（报价被删除后不应残留空 chip） */
    ['quotes', 'formulas', 'dosages'].forEach(function (k) {
      if (!rec[k] || !rec[k].length) return;
      var lookup = k === 'quotes' ? quoteById : k === 'formulas' ? formulaById : dosageById;
      rec[k] = rec[k].filter(function (id) { return !!lookup(id); });
    });
  }

  /* ---------- 状态与持久化 ---------- */
  var state = {
    data: null,           // {dosageForms, materials, packaging, formulas, quotes}
    settings: null,
    calc: null,           // 核算台草稿
    compare: [],          // 方案对比 [calc snapshot]
    meta: null,           // 元数据：识别历史 / 快照 / 最近使用 / UI 折叠状态
    view: 'calc',
    dirty: false
  };

  function defaultCalc() {
    return {
      name: '', customer: '', date: new Date().toISOString().slice(0, 10),
      formulaId: '', formulaVersion: '',
      dosageFormId: '', params: {},
      weight: '', count: '', net: '', box: '', project: '', ftype: '常规', reg: '内贸', note: '',
      moq: 5000, factoryMoq: 3000, ladder: '', taxInc: 'extax', tax: 13, profit: 30,
      admin: 0, processFee: 0, premium: 0, testFee: 0, freight: 0, fx: 1,
      lossRates: { material: 5, packaging: 1, production: 2 },
      mats: [], packs: []
    };
  }

  function blankData() {
    return { dosageForms: [], materials: [], packaging: [], formulas: [], quotes: [] };
  }

  function normalize(d) {
    d = d || {};
    d.dosageForms = d.dosageForms || [];
    d.materials = d.materials || [];
    d.packaging = d.packaging || [];
    d.formulas = d.formulas || [];
    d.quotes = d.quotes || [];
    /* v3：标签系统默认空数组 */
    (d.materials || []).forEach(function (m) { if (!m.tags) m.tags = []; });
    (d.formulas || []).forEach(function (f) { if (!f.tags) f.tags = []; });
    (d.quotes || []).forEach(function (q) { if (!q.tags) q.tags = []; });
    return d;
  }

  function mergeMeta(saved) {
    var d = defaultMeta();
    if (saved && typeof saved === 'object') {
      d.recognizeHistory = saved.recognizeHistory || [];
      d.snapshots = saved.snapshots || [];
      d.recent = Object.assign({ quotes: [], formulas: [], dosages: [] }, saved.recent || {});
      d.ui = Object.assign(defaultMeta().ui, saved.ui || {});
    }
    return d;
  }

  function load() {
    var saved = null, raw = null;
    try { raw = localStorage.getItem(LS_DATA); } catch (e) {}
    if (raw) {
      try {
        saved = JSON.parse(raw);
        if (saved && saved.__seed) saved = null; // 标记为示例库时重灌
      } catch (e) { saved = null; }
    }
    if (saved && saved.settings) {
      state.data = normalize(saved.data);
      state.settings = Object.assign(seedSettings(), saved.settings || {});
      state.meta = mergeMeta(saved.meta);
      state.compare = saved.compare || [];
    } else {
      state.data = normalize(blankData());
      state.data.dosageForms = seedDosages();
      state.data.materials = seedMaterials();
      state.data.packaging = seedPackaging();
      state.data.formulas = seedFormulas();
      state.data.quotes = seedQuotes();
      state.settings = seedSettings();
      state.meta = defaultMeta();
      persist();
    }
    if (!state.calc) state.calc = defaultCalc();
    /* V13：旧档「工艺档位」字段归一化——processLevel 文本按 0 处理，不报错 */
    if (state.calc.processLevel !== undefined) { delete state.calc.processLevel; }
    if (typeof state.calc.processFee !== 'number' || !isFinite(state.calc.processFee)) state.calc.processFee = 0;
    /* V14：用已有存档回填「最近使用 · 报价」，修复「有存档却显示暂无」 */
    backfillRecent();
  }

  function persist() {
    state.dirty = true;
    try {
      localStorage.setItem(LS_DATA, JSON.stringify({ data: state.data, settings: state.settings, meta: state.meta, compare: state.compare }));
    } catch (e) {
      toast('存储失败：' + e.message, 'err');
    }
  }

  /* ---------- 草稿 ---------- */
  function saveDraft() {
    try { localStorage.setItem(LS_DRAFT, JSON.stringify({ calc: state.calc, t: Date.now() })); } catch (e) {}
  }
  function restoreDraft() {
    try {
      var raw = localStorage.getItem(LS_DRAFT);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.calc) return false;
      var age = Date.now() - (d.t || 0);
      if (age > 30 * 86400000) return false; // 30天前的草稿不恢复
      state.calc = Object.assign(defaultCalc(), d.calc);
      /* V13：旧草稿档位文本归一化为 processFee 数值（按 0 处理） */
      if (state.calc.processLevel !== undefined) { delete state.calc.processLevel; }
      if (typeof state.calc.processFee !== 'number' || !isFinite(state.calc.processFee)) state.calc.processFee = 0;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 备份导入导出 ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'oem-quote-workbench-v3', version: 3, exportedAt: new Date().toISOString(),
      data: state.data, settings: state.settings, meta: state.meta, compare: state.compare
    }, null, 2);
  }
  function importJson(json) {
    var o = JSON.parse(json);
    if (!o || (o.app !== 'oem-quote-workbench-v2' && o.app !== 'oem-quote-workbench-v3' && !o.data)) throw new Error('不是有效的备份文件');
    state.data = normalize(o.data);
    state.settings = Object.assign(seedSettings(), o.settings || {});
    state.meta = mergeMeta(o.meta);
    state.compare = o.compare || [];
    state.data.dosageForms = (state.data.dosageForms && state.data.dosageForms.length)
      ? state.data.dosageForms : seedDosages();
    persist();
    return true;
  }
  function resetAll() {
    state.data = normalize(blankData());
    state.data.dosageForms = seedDosages();
    state.data.materials = seedMaterials();
    state.data.packaging = seedPackaging();
    state.data.formulas = seedFormulas();
    state.data.quotes = seedQuotes();
    state.settings = seedSettings();
    state.meta = defaultMeta();
    state.compare = [];
    persist();
  }

  /* ---------- 查询辅助 ---------- */
  function dosageById(id) {
    for (var i = 0; i < state.data.dosageForms.length; i++) if (state.data.dosageForms[i].id === id) return state.data.dosageForms[i];
    return null;
  }
  function dosageByName(name) {
    for (var i = 0; i < state.data.dosageForms.length; i++) if (state.data.dosageForms[i].name === name) return state.data.dosageForms[i];
    return null;
  }
  function materialById(id) {
    for (var i = 0; i < state.data.materials.length; i++) if (state.data.materials[i].id === id) return state.data.materials[i];
    return null;
  }
  function materialByName(name) {
    for (var i = 0; i < state.data.materials.length; i++) if (state.data.materials[i].name === name) return state.data.materials[i];
    return null;
  }
  function packagingById(id) {
    for (var i = 0; i < state.data.packaging.length; i++) if (state.data.packaging[i].id === id) return state.data.packaging[i];
    return null;
  }
  function packagingByName(name) {
    for (var i = 0; i < state.data.packaging.length; i++) if (state.data.packaging[i].name === name) return state.data.packaging[i];
    return null;
  }
  function formulaById(id) {
    for (var i = 0; i < state.data.formulas.length; i++) if (state.data.formulas[i].id === id) return state.data.formulas[i];
    return null;
  }
  function quoteById(id) {
    for (var i = 0; i < state.data.quotes.length; i++) if (state.data.quotes[i].id === id) return state.data.quotes[i];
    return null;
  }
  /* 某原料的默认供应商价（含汇率换算为CNY） */
  function defaultSupplierPrice(mat) {
    if (!mat || !mat.suppliers || !mat.suppliers.length) return null;
    var best = null, bestCny = Infinity;
    mat.suppliers.forEach(function (s) {
      var st = calc.priceStatus(s);
      if (st === 'expired') return;
      var rate = (state.settings.fx && state.settings.fx[s.currency]) || 1;
      var cny = calc.num(s.price) * rate;
      if (cny < bestCny) { bestCny = cny; best = s; }
    });
    return best;
  }

  /* ---------- 订阅通知（简单 pub/sub，UI 变更刷新） ---------- */
  var subs = [];
  function subscribe(fn) { subs.push(fn); }
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  global.WB = global.WB || {};
  global.WB.store = {
    state: state, LS_DATA: LS_DATA, LS_DRAFT: LS_DRAFT,
    genId: genId, nextQuoteNo: nextQuoteNo,
    load: load, persist: persist, saveDraft: saveDraft, restoreDraft: restoreDraft,
    exportJson: exportJson, importJson: importJson, resetAll: resetAll,
    defaultCalc: defaultCalc,
    defaultMeta: defaultMeta,
    pushRecognHistory: pushRecognHistory, pushSnapshot: pushSnapshot, pushRecent: pushRecent,
    backfillRecent: backfillRecent,
    dosageById: dosageById, dosageByName: dosageByName,
    materialById: materialById, materialByName: materialByName,
    packagingById: packagingById, packagingByName: packagingByName, formulaById: formulaById, quoteById: quoteById,
    defaultSupplierPrice: defaultSupplierPrice,
    subscribe: subscribe, emit: emit
  };
})(typeof window !== 'undefined' ? window : globalThis);
