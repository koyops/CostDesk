/* ============================================================
 * run-all.js — 一键跑全部 11 套回归测试（共 821 项）
 *
 * 用法（在 src/ 目录）：
 *   node run-all.js
 *
 * 注意：测试加载的是构建产物（上一级的 CostDesk.html），
 *      所以改完源码要先 `node build.js` 再跑测试，否则跑的还是旧代码。
 * ============================================================ */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['test-calc.js', 27, '核算引擎（成本构成/含量/税费/利润率）'],
  ['test-parse.js', 27, '解析引擎（多格式报价行/单位换算）'],
  ['test-smoke.js', 186, '冒烟（结构契约/关键 DOM/交互链路）'],
  ['test-v7.js', 43, 'V7 特性回归'],
  ['test-v8.js', 95, 'V8 特性回归'],
  ['test-v10.js', 55, 'V10 特性回归'],
  ['test-v11.js', 102, 'V11 特性回归'],
  ['test-v12.js', 108, 'V12 特性回归'],
  ['test-v13.js', 64, 'V13 特性回归'],
  ['test-v14.js', 114, 'V14 门禁']
];

let passed = 0, failed = 0, crash = 0;

console.log('CostDesk 回归测试');
console.log('='.repeat(64));

for (const [file, approx, desc] of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: __dirname,
    encoding: 'utf8'
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const title = ' ' + file.replace('test-', '').replace('.js', '').toUpperCase();
  if (m) {
    const p = +m[1], f = +m[2];
    passed += p; failed += f;
    const mark = f === 0 ? '✓' : '✗';
    console.log(
      mark + ' ' + title.padEnd(10) + String(p).padStart(4) + ' passed  ' +
      String(f).padStart(2) + ' failed   ' + desc
    );
  } else {
    crash++;
    console.log('! ' + title.padEnd(10) + '  CRASH   ' + desc);
    const tail = out.trim().split('\n').slice(-3).join(' | ');
    if (tail) console.log('    ' + tail.slice(0, 160));
  }
}

console.log('='.repeat(64));
console.log(
  '合计: ' + (passed + failed + crash) + ' 项 → ' +
  passed + ' 通过 / ' + failed + ' 失败' + (crash ? ' / ' + crash + ' 套件崩溃' : '')
);

if (failed || crash) {
  console.log('\n提示：测试跑的是构建产物。改完源码请先 `node build.js`。');
  process.exit(1);
}
console.log('全绿。');
process.exit(0);
