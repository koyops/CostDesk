/* test-calc.js — 计算引擎单元测试（纯函数，node 直接运行） */
'use strict';
const path = require('path');
require(path.join(__dirname, 'calc.js'));
const C = globalThis.WB.calc;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = Number(actual.toFixed(6)), e = Number(expected.toFixed(6));
  if (Math.abs(a - e) < 1e-6) { pass++; }
  else { fail++; console.error('FAIL:', label, 'expected', e, 'got', a); }
}
function ok(cond, label) {
  if (cond) pass++; else { fail++; console.error('FAIL:', label); }
}

/* ---- 基础核算 ---- */
const base = {
  materials: [
    { name: 'A', ratio: 50, price: 100 },  // 100g×50%×100/1000 = 5
    { name: 'B', ratio: 30, price: 200 }   // 100g×30%×200/1000 = 6
  ],
  packaging: [
    { name: '瓶', num: 1, unitPrice: 0.8, lossRate: 1, printFee: 0.1, moldFee: 10000, moq: 10000 }
  ],
  grams: 100,           // 单份克重
  lossRates: { material: 10, packaging: 1, production: 2 },
  processFee: 0.05, adminRate: 0, premiumRate: 0,
  testFee: 0.01, freight: 0,
  profitRate: 30, taxRate: 13, taxInc: 'extax',
  moq: 10000
};
const r = C.computeQuote(base);
eq(r.matRaw, 11, 'matRaw = 5+6');
eq(r.matTotal, 11 * 1.10, 'matTotal 含10%损耗');
/* 包材: (0.8*1.01 + 0.1 + 10000/10000) * 1 * 1.02 = (0.808+0.1+1)*1.02 = 1.908*1.02 = 1.94616 */
eq(r.packTotal, (0.8 * 1.01 + 0.1 + 1) * 1.02, 'packTotal 含损耗+开模分摊');
eq(r.fees, 0.05 + 0.01, 'fees = 加工+检测');
eq(r.unitCost, r.matTotal + r.packTotal + 0.05 + 0.01, 'unitCost 汇总');
eq(r.upTax, r.unitCost * 1.3, 'upTax 不含税报价');
eq(r.inTax, r.upTax * 1.13, 'inTax 含税报价');
eq(r.profitRate, (r.upTax - r.unitCost) / r.upTax * 100, 'profitRate');
eq(r.totalCost, r.unitCost * 10000, 'totalCost');

/* ---- 管理费与溢价 ---- */
const r2 = C.computeQuote(Object.assign({}, base, {
  adminRate: 10, premiumRate: 5
}));
eq(r2.adminFee, (r2.matTotal + r2.packTotal + 0.05) * 0.10, 'adminFee');
eq(r2.premium, (r2.matTotal + r2.packTotal + 0.05) * 0.05, 'premium');
eq(r2.unitCost, r2.matTotal + r2.packTotal + 0.05 + r2.adminFee + r2.premium + 0.01, 'unitCost with admin+premium');

/* ---- 未绑价阻塞 ---- */
const r3 = C.computeQuote(Object.assign({}, base, {
  materials: [{ name: 'X', ratio: 10, price: undefined }]
}));
ok(r3.blocked.length === 1, '未绑价 → blocked');
ok(r3.mats[0].cost === null, '未绑价 → cost null');

/* ---- MOQ 阶梯重算（开模费分摊随档位变化） ---- */
const tiers = C.computeTiers(base, [5000, 10000]);
ok(tiers.length === 2, '两个档位');
/* 5000档: 包材 = (0.8*1.01+0.1+10000/5000)*1.02 = (0.908+2)*1.02 = 2.96416 */
eq(tiers[0].r.packTotal, (0.8 * 1.01 + 0.1 + 2) * 1.02, '5000档开模费分摊');
eq(tiers[1].r.packTotal, (0.8 * 1.01 + 0.1 + 1) * 1.02, '10000档开模费分摊');
ok(tiers[0].r.unitCost > tiers[1].r.unitCost, 'MOQ 越小成本越高（开模费分摊）');

/* ---- 低利润预警 ---- */
const r4 = C.computeQuote(Object.assign({}, base, { profitRate: 10, lowProfitLine: 15 }));
ok(r4.warns.some(w => w.indexOf('利润率') >= 0), '低利润预警触发');

/* ---- 最优供应商选择 ---- */
const suppliers = [
  { id: '1', price: 100, currency: 'CNY', validUntil: '2099-01-01' },
  { id: '2', price: 6.5, currency: 'USD', validUntil: '2099-01-01' },   // 6.5*7.1=46.15 最低
  { id: '3', price: 90, currency: 'CNY', validUntil: '2000-01-01' }     // 过期排除
];
const best = C.bestSupplier(suppliers, { CNY: 1, USD: 7.1 });
ok(best && best.id === '2', '最优价 = 外币最低换算价');

/* ---- 价格状态 ---- */
ok(C.priceStatus({ validUntil: '2000-01-01' }) === 'expired', '过期判定');
ok(C.priceStatus({ validUntil: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }) === 'expiring', '7天内到期');
ok(C.priceStatus({ validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }) === 'ok', '正常');
ok(C.priceStatus({}) === 'ok', '无有效期 → ok');

/* ---- 格式化 ---- */
ok(C.fmt(1234.5) === '1,234.50', '千分位: ' + C.fmt(1234.5));
ok(C.money(88.5) === '¥88.50', 'money: ' + C.money(88.5));
ok(C.num('') === 0 && C.num('12.5') === 12.5 && C.num(null, 5) === 5, 'num 工具');

console.log('\n测试结果:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
