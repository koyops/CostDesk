/* 诊断 3：完全复刻 test-v10 的成功存档路径，逐环节打印 */
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

  console.log('seed quotes =', st.data.quotes.length, ' seed materials =', st.data.materials.length);

  /* 先选剂型（带出克重/粒数），再搭原料 */
  const dosageSel = d.getElementById('f-dosage');
  const capDosage = st.data.dosageForms.filter(x => x.name === '胶囊')[0] || st.data.dosageForms[0];
  st.calc.weight = ''; st.calc.count = '';
  dosageSel.value = capDosage.id;
  dosageSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  console.log('剂型 =', capDosage.name, '| weight =', d.getElementById('f-weight').value, '| count =', d.getElementById('f-count').value);

  const mats = st.data.materials || [];
  const ma = mats[0], mb = mats[1] || mats[0];
  if (ma && (!ma.suppliers || !ma.suppliers.length)) ma.suppliers = [{ id: S.genId('sup'), supplierName: '供应商A', price: 30, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '', isDefault: true }];
  if (mb && ma !== mb && (!mb.suppliers || !mb.suppliers.length)) mb.suppliers = [{ id: S.genId('sup'), supplierName: '供应商B', price: 12, currency: 'CNY', quoteDate: '2026-08-01', source: 'manual', validUntil: '', isDefault: true }];
  st.calc.mats.push({ id: 'v10m1', materialId: ma.id, name: ma.name, ratio: 60, supplierId: (ma.suppliers[0] || {}).id || '', supplierName: (ma.suppliers[0] || {}).supplierName || '', price: 30, currency: 'CNY', isTemp: false, altHint: '' });
  st.calc.mats.push({ id: 'v10m2', materialId: mb.id, name: mb.name, ratio: 40, supplierId: (mb.suppliers[0] || {}).id || '', supplierName: (mb.suppliers[0] || {}).supplierName || '', price: 12, currency: 'CNY', isTemp: false, altHint: '' });
  d.getElementById('f-name').value = '诊断·方案C';
  WB.calcView.renderMatLines();
  WB.calcView.readCalc();
  const okRun = WB.calcView.runQuote();
  console.log('runQuote 返回 =', okRun, ' | resultState =', d.getElementById('resultState').textContent);
  const errBox = d.querySelector('#resultBody .rc-err');
  if (errBox) console.log('校验错误 =', errBox.textContent.slice(0, 200));

  const n0 = st.data.quotes.length;
  WB.calcView.saveQuote();
  await sleep(30);
  console.log('quotes:', n0, '->', st.data.quotes.length);
  console.log('recent.quotes =', JSON.stringify(st.meta.recent.quotes));
  console.log('recent.dosages =', JSON.stringify(st.meta.recent.dosages));

  console.log('\n-- 未刷新前 recentBody --');
  console.log('display =', JSON.stringify(d.getElementById('recentBody').style.display));
  console.log('html =', JSON.stringify(d.getElementById('recentBody').innerHTML).slice(0, 260));

  console.log('\n-- 用户点开最近使用 --');
  d.getElementById('recentToggle').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(40);
  console.log('display =', JSON.stringify(d.getElementById('recentBody').style.display));
  console.log('text =', JSON.stringify(d.getElementById('recentBody').textContent).slice(0, 300));
  console.log('chip =', d.querySelectorAll('#recentBody .chip').length);
  console.log('errs =', errs.slice(0, 3));
  process.exit(0);
})();
