/* V14 桌宠造型预览：把 ui-pet.js 的 catSvg 渲染成 PNG，肉眼对照 cat.png 验收。
 * 用法：node dev/render-cat.js  → 输出 dev/out/*.png */
const fs = require('fs');
const path = require('path');

global.WB = { store: {}, ui: { $: () => null, $$: () => [], esc: (s) => String(s) }, calc: {} };
require(path.join(__dirname, '..', 'src', 'ui-pet.js'));

const P = global.WB.pet;
const { Resvg } = require('@resvg/resvg-js');

const MOODS = ['idle', 'happy', 'excited', 'curious', 'sleep', 'upset'];
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

/* 模拟 styles.css 中由 .mood-* / .pet-body 控制的显隐（resvg 不跑页面 CSS，
 * 这里用属性等价替换，保证预览与实际渲染一致） */
function applyMood(svg, mood) {
  /* 默认可见：eb（睁眼）、mo-idle（ω 嘴）；其余情绪件默认 opacity:0 */
  const hide = ['mq', 'an-sweat', 'mh', 'lid', 'mo-happy', 'mo-sad'];
  const show = [];
  if (mood === 'happy') { show.push('mh', 'mo-happy'); hide.push('eb', 'mo-idle'); }
  else if (mood === 'upset') { show.push('mo-sad', 'an-sweat'); hide.push('mo-idle'); }
  else if (mood === 'curious') { show.push('mq'); }
  else if (mood === 'sleep') { show.push('lid'); hide.push('eb'); }
  show.forEach((c) => { const i = hide.indexOf(c); if (i >= 0) hide.splice(i, 1); });
  hide.forEach((c) => { svg = svg.replace(new RegExp('class="' + c + '"', 'g'), 'class="' + c + '" opacity="0"'); });
  return svg;
}

function cell(svg, x, y, label) {
  return `<svg x="${x}" y="${y}" width="220" height="220" viewBox="0 0 200 200" overflow="visible">${svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>` +
    `<text x="${x + 110}" y="${y + 226}" font-size="13" text-anchor="middle" fill="#334155" font-family="sans-serif">${label}</text>`;
}

function sheet(cells, cols, title) {
  const rows = Math.ceil(cells.length / cols);
  const W = cols * 220 + 20, H = rows * 240 + 40;
  let body = '';
  cells.forEach((c, i) => {
    const cx = 10 + (i % cols) * 220, cy = 34 + Math.floor(i / cols) * 240;
    body += cell(c.svg, cx, cy, c.label);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#F7F4EF"/>
    <text x="${W / 2}" y="22" font-size="15" text-anchor="middle" fill="#0F172A" font-family="sans-serif" font-weight="700">${title}</text>
    ${body}</svg>`;
}

function render(svgStr, file, width) {
  const r = new Resvg(svgStr, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } });
  fs.writeFileSync(path.join(outDir, file), r.render().asPng());
  console.log('wrote', file);
}

/* 1) 三体型（idle） */
render(sheet([1, 2, 3].map((st) => ({
  svg: applyMood(P._catSvg(st, 'idle'), 'idle'),
  label: ['幼猫 stage1 (0.55x)', '成猫 stage2 (1.0x)', '大橘 stage3 (1.45x)'][st - 1]
})), 3, 'V14 招财橘猫 · 三体型'), 'stages.png', 760);

/* 2) 六情绪（成猫） */
render(sheet(MOODS.map((m) => ({ svg: applyMood(P._catSvg(2, m), m), label: m })), 3, 'V14 招财橘猫 · 六情绪（CSS 类驱动，各情绪已按 CSS 规则显隐）'), 'moods.png', 760);

/* 3) 单只放大细看（成猫） */
render(applyMood(P._catSvg(2, 'idle'), 'idle'), 'main-2x.png', 900);

/* 4) 幼猫放大细看 */
render(applyMood(P._catSvg(1, 'idle'), 'idle'), 'small-2x.png', 600);

/* 5) 大橘放大细看 */
render(applyMood(P._catSvg(3, 'idle'), 'idle'), 'big-2x.png', 1100);

render(applyMood(P._catSvg(2, 'idle'), 'idle'), 'huge.png', 1800);

/* 6) 在 150x170 容器 + 200x200 viewBox 的真实裁切下（模拟 app 实际显示） */
render(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
  <rect width="480" height="300" fill="#EEF2F7"/>
  ${[1, 2, 3].map((st, i) => `<g transform="translate(${20 + i * 150},40)">
     <rect width="150" height="170" fill="#fff" stroke="#CBD5E1" stroke-dasharray="3 3"/>
     <svg x="0" y="0" width="150" height="170" viewBox="0 0 200 200">${P._catSvg(st, 'idle').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
   </g>`).join('')}
  <text x="240" y="240" font-size="13" text-anchor="middle" fill="#334155" font-family="sans-serif">真实容器 150x170 / viewBox 200x200（默认 overflow:hidden 裁切，看是否被切）</text>
</svg>`, 'clip-check.png', 720);
