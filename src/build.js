#!/usr/bin/env node
/* build.js — 将 src/ 模块化源码合并为单文件 HTML（零依赖、双击即用） */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.join(SRC, '..', 'CostDesk.html');

const JS_ORDER = ['calc.js', 'parse.js', 'classify.js', 'store.js', 'ui-common.js', 'ui-recognize.js', 'ui-calc.js', 'ui-libs.js', 'ui-quotes.js', 'petframes.js', 'ui-pet.js', 'app.js'];

function read(f) { return fs.readFileSync(path.join(SRC, f), 'utf8'); }

let html = read('index.html');
const css = read('styles.css');
const js = JS_ORDER.map(f => {
  const code = read(f);
  /* 安全检查：内联脚本中不能出现 </script> 字面量 */
  if (/<\/script>/i.test(code)) {
    throw new Error(f + ' 含有 </script> 字面量，会破坏内联结构');
  }
  return '/* ===== src/' + f + ' ===== */\n' + code;
}).join('\n\n');

html = html.replace('/*__CSS__*/', () => css);
html = html.replace('/*__JS__*/', () => js);

fs.writeFileSync(OUT, html, 'utf8');
console.log('built:', OUT, (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');

/* 附带语法校验 */
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!m) { console.error('FAIL: script block not found'); process.exit(1); }
fs.writeFileSync(path.join(SRC, '_bundle_check.js'), m[1]);
console.log('bundle js length:', m[1].length);
