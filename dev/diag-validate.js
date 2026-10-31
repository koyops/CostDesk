/* 诊断 B1：必填校验显眼化（红框 + 红点 + toast「还差 XX」+ 点击跳转聚焦） */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'oem-quote-workbench-v3.html'), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  vc.on('jsdomError', (e) => errs.push('jsdomError: ' + e.message));
  const dom = new JSDOM(html, {
    url: 'http://localhost/oem-v3.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.print = () => {}; w.scrollTo = () => {}; }
  });
  const w = dom.window, d = w.document, WB = w.WB, S = WB.store, st = S.state;
  await sleep(220);

  /* --- 场景 1：什么都不填，直接一键报价 --- */
  d.getElementById('f-name').value = '';
  st.calc.dosageFormId = '';
  d.getElementById('f-weight').value = '';
  d.getElementById('f-count').value = '';
  d.getElementById('f-moq').value = '';
  WB.calcView.readCalc();
  const ok1 = WB.calcView.runQuote();
  console.log('runQuote =', ok1);
  const toasts = Array.prototype.map.call(d.querySelectorAll('#toastRoot .toast'), t => t.textContent);
  console.log('toast =', JSON.stringify(toasts));
  console.log('toast 可点击 =', Array.prototype.some.call(d.querySelectorAll('#toastRoot .toast'), t => t.className.indexOf('toast-act') >= 0));

  const invalids = Array.prototype.map.call(d.querySelectorAll('.field.invalid'), f => {
    const inp = f.querySelector('input,select,textarea');
    return (inp && inp.id) || f.getAttribute('data-cf') || '(no-id)';
  });
  console.log('红框字段 =', JSON.stringify(invalids));
  console.log('红点数 =', d.querySelectorAll('.req-dot').length);
  console.log('错误条目可点击 =', d.querySelectorAll('#resultBody .err-jump').length);

  /* 点击 toast → 应聚焦第一个缺失字段 */
  const toastEl = d.querySelector('#toastRoot .toast-act');
  if (toastEl) { toastEl.dispatchEvent(new w.Event('click', { bubbles: true })); await sleep(200); }
  console.log('点击 toast 后 activeElement =', (d.activeElement && (d.activeElement.id || d.activeElement.tagName)) || 'none');

  /* --- 场景 2：选剂型但必填自定义字段留空（模拟「软糖类型为必填」） --- */
  const st2 = st;
  let dg = st2.data.dosageForms.filter(x => (x.customFields || []).some(f => f.required))[0];
  if (!dg) {
    dg = st2.data.dosageForms[0];
    dg.customFields = (dg.customFields || []).concat([{ key: 'gummyType', label: '软糖类型', type: 'text', required: true, placeholder: '' }]);
  }
  d.getElementById('f-dosage').value = '';
  d.getElementById('f-dosage').value = dg.id;
  d.getElementById('f-dosage').dispatchEvent(new w.Event('change', { bubbles: true }));
  const reqField = (dg.customFields || []).filter(f => f.required)[0];
  if (reqField) {
    const box = d.querySelector('#dosageFields [data-cf="' + reqField.key + '"]');
    if (box) { const i = box.querySelector('input,select,textarea'); if (i) i.value = ''; }
    st2.calc.params[reqField.key] = '';
  }
  d.getElementById('f-weight').value = '3';
  d.getElementById('f-count').value = '60';
  d.getElementById('f-moq').value = '5000';
  d.getElementById('f-name').value = '校验测试·方案';
  WB.calcView.readCalc();
  const ok2 = WB.calcView.runQuote();
  console.log('\n[场景2] runQuote =', ok2);
  console.log('toast =', JSON.stringify(Array.prototype.map.call(d.querySelectorAll('#toastRoot .toast'), t => t.textContent)));
  console.log('红框字段 =', JSON.stringify(Array.prototype.map.call(d.querySelectorAll('#dosageFields .field.invalid'), f => f.getAttribute('data-cf'))));
  console.log('该字段红点 =', d.querySelectorAll('#dosageFields .field.invalid .req-dot').length);

  /* 点击第二个 toast（若有）验证跳转 */
  const t2 = d.querySelectorAll('#toastRoot .toast-act');
  if (t2.length) { t2[t2.length - 1].dispatchEvent(new w.Event('click', { bubbles: true })); await sleep(220); }
  console.log('点击后 activeElement =', (d.activeElement && (d.activeElement.id || d.activeElement.tagName + '.' + d.activeElement.className)) || 'none');

  console.log('\nerrs =', errs.slice(0, 4));
  process.exit(0);
})();
