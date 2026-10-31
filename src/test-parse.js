/* ============================================================
 * test-parse.js — 配方文本解析引擎单元测试
 * 运行：node test-parse.js
 * ============================================================ */
'use strict';
var path = require('path');
var fs = require('fs');
var vm = require('vm');

var src = fs.readFileSync(path.join(__dirname, 'parse.js'), 'utf8');
var sandbox = { module: {}, console: console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
var P = sandbox.WB.parse;

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  if (a === b) { pass++; }
  else { fail++; console.error('  ✗ FAIL: ' + msg + ' 期望=' + JSON.stringify(b) + ' 实际=' + JSON.stringify(a)); }
}

console.log('== parse.js 单元测试 ==');

/* 1. 基础：每粒含 + 顿号拆分 */
var r = P.parseFormulaText('每粒含：维生素C 200mg、维生素E 50mg、锌 10mg');
eq(r.items.length, 3, '基础行解析 3 项');
eq(r.items[0].name, '维生素C', '名称1');
eq(r.items[0].amount, 200, '用量1');
eq(r.items[0].unit, 'mg', '单位1');
eq(r.prefix, '每粒含', '前缀识别');

/* 2. 分号分隔 + 每粒/粒 单位 + 辅料行 */
r = P.parseFormulaText('VC 200mg/粒；B2 50mg/粒；辅料：淀粉、硬脂酸镁');
eq(r.items.length, 4, '分号+辅料 4 项');
eq(r.items[0].unit, 'mg', 'VC单位');
ok(r.items[0].note.indexOf('每粒') >= 0, '每粒备注');
eq(r.items[2].kind, 'excipient', '淀粉为辅料');
eq(r.items[3].kind, 'excipient', '硬脂酸镁为辅料');

/* 3. 每100g含 */
r = P.parseFormulaText('每100g含：蛋白质 20g、钙 800mg、维生素D3 5μg');
eq(r.prefix, '每100g含', '100g前缀');
eq(r.items[2].unit, 'μg', 'μg单位');

/* 4. 括号注释 */
r = P.parseFormulaText('维生素C（抗坏血酸）500mg');
eq(r.items[0].name, '维生素C', '括号名称');
eq(r.items[0].note, '抗坏血酸', '括号别称');

/* 5. 百分比 */
r = P.parseFormulaText('VC 20%');
eq(r.items[0].amount, 20, '百分比数值');
eq(r.items[0].unit, '%', '百分比单位');

/* 6. 供应商 */
r = P.parseFormulaText('每粒含：维生素C 200mg。由石药集团提供');
ok(r.suppliers.length === 1 && r.suppliers[0].indexOf('石药') >= 0, '供应商识别');

/* 7. 净含量不混入成分 */
r = P.parseFormulaText('净含量：60g。每粒含：维生素C 200mg');
eq(r.netContent, '60g', '净含量');
eq(r.items.length, 1, '净含量不占成分行');

/* 8. 范围值取上限 */
r = P.parseFormulaText('维生素A 200-400μg');
eq(r.items[0].amount, 400, '范围取上限');

/* 9. IU 单位 */
r = P.parseFormulaText('维生素D3 200IU');
eq(r.items[0].unit, 'IU', 'IU单位');

/* 10. 纯辅料行无数值 */
r = P.parseFormulaText('辅料：淀粉');
eq(r.items[0].kind, 'excipient', '辅料行类型');
eq(r.items[0].amount, null, '辅料无用量');

/* 11. 空输入 */
r = P.parseFormulaText('');
eq(r.items.length, 0, '空输入');

/* 12. 多行文本 */
r = P.parseFormulaText('每粒含：\n维生素C 200mg\n维生素E 50mg\n辅料：淀粉');
eq(r.items.length, 3, '多行 3 项');

/* 13. 匹配原料库 */
var mats = [{ id: 'm1', name: '维生素C（包膜）', inciName: 'Ascorbic Acid' }, { id: 'm2', name: '牛磺酸' }];
var items = P.matchMaterial([{ name: '维生素C' }, { name: '牛磺酸' }], mats);
eq(items[0].matchedMaterialId, 'm1', '模糊匹配-包含');
eq(items[1].matchedMaterialId, 'm2', '精确匹配');

console.log('\n测试结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
