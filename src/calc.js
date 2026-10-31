/* ============================================================
 * calc.js — 成本核算引擎（纯函数，无 DOM 依赖，可单元测试）
 * 所有公式集中于此，设置页的「公式树」基于本文件常量渲染
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 数值工具 ---------- */
  function num(v, def) {
    if (v === null || v === undefined || v === '') return (def === undefined ? 0 : def);
    var n = Number(v);
    return isNaN(n) ? (def === undefined ? 0 : def) : n;
  }
  function fmt(n, min, max) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    min = min === undefined ? 2 : min; max = max === undefined ? 4 : max;
    return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: min, maximumFractionDigits: max });
  }
  function money(n, min, max) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return '¥' + fmt(n, min, max);
  }
  function pct(n) { return fmt(n, 1, 2) + '%'; }

  /* ---------- 成本核算（核心） ----------
   * input: {
   *   materials: [{ name, ratio(%), price(元/kg，已含汇率), lossRate(原料损耗%) }]
   *   packaging: [{ name, num(每瓶用量), unitPrice(元), lossRate(包材损耗%), printFee, moldFee(元/一次性), moq(分摊MOQ) }]
   *   grams: 单份克重 = 单粒克重 × 每瓶数量
   *   lossRates: { material(%), packaging(%), production(%) }
   *   processFee: 加工费(元/份)
   *   adminRate: 管理费率(%)
   *   premiumRate: 定制溢价(%)
   *   testFee / freight: 元/份
   *   profitRate: 目标利润率(%)
   *   taxRate: 增值税率(%)
   *   taxInc: 'extax'|'intax'
   *   moq: 订单量
   * }
   * 返回 result 对象（含阶梯重算所需全部中间量）
   */
  function computeQuote(input) {
    var c = {
      materials: input.materials || [],
      packaging: input.packaging || [],
      grams: Math.max(0, num(input.grams)),
      lossRates: {
        material: Math.max(0, num(input.lossRates && input.lossRates.material)),
        packaging: Math.max(0, num(input.lossRates && input.lossRates.packaging)),
        production: Math.max(0, num(input.lossRates && input.lossRates.production))
      },
      processFee: Math.max(0, num(input.processFee)),
      adminRate: Math.max(0, num(input.adminRate)),
      premiumRate: Math.max(0, num(input.premiumRate)),
      testFee: Math.max(0, num(input.testFee)),
      freight: Math.max(0, num(input.freight)),
      profitRate: Math.max(0, num(input.profitRate)),
      taxRate: Math.max(0, num(input.taxRate)),
      taxInc: input.taxInc === 'intax' ? 'intax' : 'extax',
      moq: Math.max(1, num(input.moq, 1))
    };
    var r = {
      moq: c.moq, blocked: [], warns: [],
      mats: [], packs: [],
      matRaw: 0,          // 原料成本（未含损耗）
      matTotal: 0,        // 原料成本（含原料损耗）
      packTotal: 0,       // 包材成本（含包材损耗+生产损耗）
      fees: 0, adminFee: 0, premium: 0,
      unitCost: 0, upTax: 0, inTax: 0, profitRate: 0,
      totalCost: 0, totalUpTax: 0, totalInTax: 0,
      hasData: c.materials.length > 0 || c.packaging.length > 0
    };
    var i, m;

    /* 原料：单款成本 = 含量% × 单份克重g × 单价(元/kg) ÷ 1000 */
    for (i = 0; i < c.materials.length; i++) {
      m = c.materials[i];
      var ratio = Math.max(0, num(m.ratio));
      var line = {
        name: m.name || '(未命名)',
        ratio: ratio,
        price: m.price,
        lossRate: m.lossRate === undefined ? c.lossRates.material : Math.max(0, num(m.lossRate)),
        cost: null, blocked: null
      };
      if (!m.price && m.price !== 0) {
        line.blocked = (m.name || '原料') + '：未绑定供应商采购价，无法核算';
        r.blocked.push(line.blocked);
      } else if (m.price < 0) {
        line.blocked = (m.name || '原料') + '：价格为负';
        r.blocked.push(line.blocked);
      } else {
        line.cost = c.grams * ratio / 100 * m.price / 1000;
        r.matRaw += line.cost;
      }
      r.mats.push(line);
    }
    r.matTotal = r.matRaw * (1 + c.lossRates.material / 100);

    /* 包材：单份成本 = (单价×(1+包材损耗%) + 印刷费 + 开模费÷MOQ) × 每瓶用量 × (1+生产损耗%) */
    for (i = 0; i < c.packaging.length; i++) {
      m = c.packaging[i];
      var num_ = Math.max(0, num(m.num));
      var pl = {
        name: m.name || '(未命名)',
        num: num_,
        unit: null, cost: null, blocked: null
      };
      if (!m.unitPrice && m.unitPrice !== 0) {
        pl.blocked = (m.name || '包材') + '：未填写单价';
        r.blocked.push(pl.blocked);
      } else {
        var lossP = m.lossRate === undefined ? c.lossRates.packaging : Math.max(0, num(m.lossRate));
        var unit = (num(m.unitPrice) * (1 + lossP / 100) + num(m.printFee) + num(m.moldFee) / c.moq) * (1 + c.lossRates.production / 100);
        pl.unit = unit;
        pl.cost = unit * num_;
        r.packTotal += pl.cost;
      }
      r.packs.push(pl);
    }

    /* 费用与溢价 */
    r.fees = c.processFee + c.testFee + c.freight;
    r.adminFee = (r.matTotal + r.packTotal + c.processFee) * c.adminRate / 100;
    r.premium = (r.matTotal + r.packTotal + c.processFee) * c.premiumRate / 100;

    /* 汇总与报价 */
    r.unitCost = r.matTotal + r.packTotal + c.processFee + r.adminFee + r.premium + c.testFee + c.freight;
    r.upTax = r.unitCost * (1 + c.profitRate / 100);
    r.inTax = r.upTax * (1 + c.taxRate / 100);
    r.profitRate = r.upTax > 0 ? (r.upTax - r.unitCost) / r.upTax * 100 : 0;
    r.totalCost = r.unitCost * c.moq;
    r.totalUpTax = r.upTax * c.moq;
    r.totalInTax = r.inTax * c.moq;

    /* 警示：利润率过低 / MOQ 过小 */
    if (r.profitRate > 0 && r.profitRate < (input.lowProfitLine === undefined ? 15 : num(input.lowProfitLine))) {
      r.warns.push('实际利润率 ' + fmt(r.profitRate, 1, 2) + '% 低于预警线 ' + fmt(input.lowProfitLine === undefined ? 15 : input.lowProfitLine, 1, 1) + '%，建议提高目标利润率或压缩成本');
    }
    return r;
  }

  /* MOQ 阶梯重算：每个档位独立重算（开模费按档位量分摊） */
  function computeTiers(base, tiers, lowProfitLine) {
    var list = [];
    var seen = {};
    var i;
    for (i = 0; i < tiers.length; i++) {
      var t = Math.round(num(tiers[i]));
      if (t <= 0 || seen[t]) continue;
      seen[t] = true;
      var r = computeQuote({
        materials: base.materials, packaging: base.packaging,
        grams: base.grams, lossRates: base.lossRates,
        processFee: base.processFee, adminRate: base.adminRate, premiumRate: base.premiumRate,
        testFee: base.testFee, freight: base.freight,
        profitRate: base.profitRate, taxRate: base.taxRate, taxInc: base.taxInc,
        moq: t, lowProfitLine: lowProfitLine
      });
      list.push({ moq: t, r: r });
    }
    /* 首档固定为当前订单 MOQ，若不在阶梯中则前置 */
    var cur = Math.round(num(base.moq));
    if (cur > 0 && !seen[cur]) {
      var rc = computeQuote({
        materials: base.materials, packaging: base.packaging,
        grams: base.grams, lossRates: base.lossRates,
        processFee: base.processFee, adminRate: base.adminRate, premiumRate: base.premiumRate,
        testFee: base.testFee, freight: base.freight,
        profitRate: base.profitRate, taxRate: base.taxRate, taxInc: base.taxInc,
        moq: cur, lowProfitLine: lowProfitLine
      });
      list.unshift({ moq: cur, r: rc, current: true });
    } else if (seen[cur]) {
      list.forEach(function (x) { if (x.moq === cur) x.current = true; });
    }
    return list;
  }

  /* 供应商最优价选择：返回某原料当前最低价（未过期）的供应商 */
  function bestSupplier(suppliers, currencyRates) {
    var best = null, bestCny = Infinity, i;
    for (i = 0; i < suppliers.length; i++) {
      var s = suppliers[i];
      if (!s) continue;
      if (s.validUntil && new Date(s.validUntil).getTime() < Date.now() - 86400000) continue; // 过期排除
      var rate = (currencyRates && currencyRates[s.currency]) || 1;
      var cny = num(s.price) * rate;
      if (cny < bestCny) { bestCny = cny; best = s; }
    }
    return best;
  }

  /* 过期判定：有效期截止 < 今天（含当天视为临期） */
  function priceStatus(s) {
    if (!s || !s.validUntil) return 'ok';
    var d = new Date(s.validUntil); d.setHours(23, 59, 59, 999);
    var now = Date.now();
    if (d.getTime() < now) return 'expired';
    if (d.getTime() - now < 7 * 86400000) return 'expiring';
    return 'ok';
  }

  /* 汇率配置：内置常用币种，用户可改 */
  var FX_DEFAULTS = { CNY: 1, USD: 7.1, EUR: 7.7, HKD: 0.91, JPY: 0.048, GBP: 9.0 };

  /* 用量反推：按配方含量 + 规格 + 生产量，反算各原料投料量（考虑损耗）
   * mats: [{name, ratio(%)}]；gramsPerUnit: 单粒克重g；count: 每瓶数量；
   * bottles: 生产瓶数；lossRate: 原料损耗% */
  function backCalc(mats, gramsPerUnit, count, bottles, lossRate) {
    var grams = Math.max(0, num(gramsPerUnit)) * Math.max(0, num(count));
    var totalGrams = grams * Math.max(0, num(bottles)) * (1 + Math.max(0, num(lossRate)) / 100);
    var rows = (mats || []).map(function (m) {
      var ratio = Math.max(0, num(m.ratio));
      return {
        name: m.name || '(未命名)', ratio: ratio,
        gramsPerUnit: grams * ratio / 100,
        inputGrams: totalGrams * ratio / 100,
        inputKg: totalGrams * ratio / 100 / 1000
      };
    });
    var totalKg = rows.reduce(function (a, r) { return a + r.inputKg; }, 0);
    return { grams: grams, totalGrams: totalGrams, rows: rows, totalKg: totalKg };
  }

  /* 同客户历史报价统计：quotes 中该客户且已报价以上的记录 → {count, avgUnit, avgTotal} */
  function customerHistory(quotes, customer) {
    var list = (quotes || []).filter(function (q) {
      return q.customer && customer && q.customer === customer && q.result && q.result.unitCost > 0;
    });
    if (!list.length) return null;
    var sumUnit = 0, sumTotal = 0;
    list.forEach(function (q) {
      sumUnit += num(q.result.unitCost);
      var t = q.biz && q.biz.taxInc === 'intax' ? q.result.totalInTax : q.result.totalUpTax;
      sumTotal += num(t);
    });
    return {
      count: list.length,
      avgUnit: sumUnit / list.length,
      avgTotal: sumTotal / list.length,
      last: list[0]
    };
  }

  global.WB = global.WB || {};
  global.WB.calc = {
    num: num, fmt: fmt, money: money, pct: pct,
    computeQuote: computeQuote,
    computeTiers: computeTiers,
    bestSupplier: bestSupplier,
    priceStatus: priceStatus,
    backCalc: backCalc,
    customerHistory: customerHistory,
    FX_DEFAULTS: FX_DEFAULTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
