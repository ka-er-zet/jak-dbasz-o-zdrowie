const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8000';
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait briefly for dynamic rendering and click Start if present to render the survey
    await new Promise(res => setTimeout(res, 500));
    try {
      const hasStart = await page.$('#start');
      if (hasStart) {
        console.log('Clicking Start button to render the survey...');
        await page.click('#start');
        // wait for the form or fieldset to appear inside #app
        await page.waitForSelector('#app fieldset, #app input, #app .form', { timeout: 3000 });
        // small extra wait to ensure event handlers run
        await new Promise(res => setTimeout(res, 300));
      }
    } catch (e) {
      console.warn('Start click or wait failed (continuing):', e.message || e);
    }

    // Inject axe-core
    const axePath = require.resolve('axe-core/axe.min.js');
    const axeSource = fs.readFileSync(axePath, 'utf8');
    await page.evaluate(axeSource + '\n//# sourceURL=axe.min.js');

    console.log('Running axe...');
    const results = await page.evaluate(async () => {
      return await axe.run(document);
    });

    const outPath = path.resolve(process.cwd(), 'axe-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log('Axe results written to', outPath);
    console.log('Summary:');
    console.log('Violations:', results.violations.length);
    results.violations.forEach(v => {
      console.log('- ' + v.id + ': ' + v.help + ' (impact: ' + v.impact + ')');
      v.nodes.slice(0,3).forEach(n => console.log('   •', n.target.join(', ')));
      if (v.nodes.length > 3) console.log('   ...', v.nodes.length - 3, 'more nodes');
    });

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    await browser.close();
    process.exit(2);
  }
})();
