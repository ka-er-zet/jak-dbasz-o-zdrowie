const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('http://localhost:5000', { waitUntil: 'networkidle2' });
  await p.waitForSelector('#start', { visible: true });
  await p.click('#start');
  await new Promise(r => setTimeout(r, 300));
  for (let i = 0; i < 12; i++) {
    const nextSelectors = [
      'main > section:last-of-type .actions button.outline',
      'section .actions button.outline',
      'nav.actions button.outline',
      '#next'
    ];
    const found = [];
    for (const s of nextSelectors) {
      const ok = await p.evaluate(sel => !!document.querySelector(sel), s);
      found.push({ sel: s, exists: ok });
    }
    const legends = await p.evaluate(() => Array.from(document.querySelectorAll('legend, h2, h3, label')).filter(el => (el.offsetParent !== null)).slice(0, 10).map(e => e.textContent.trim()));
    console.log('iter', i, 'nexts', found, 'visibleLabels', legends.slice(0, 6));
    // try click
    let clicked = false;
    for (const s of nextSelectors) {
      const ok = await p.evaluate(sel => !!document.querySelector(sel), s);
      if (ok) {
        await p.evaluate(sel => document.querySelector(sel).click(), s);
        clicked = true; break;
      }
    }
    if (!clicked) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const appHtml = await p.evaluate(() => document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 1000) : null);
  console.log('APP HTML SNAPSHOT', appHtml);
  await b.close();
})();
