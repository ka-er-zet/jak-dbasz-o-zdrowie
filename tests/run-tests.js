const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const survey = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'pytania.json'), 'utf8'));
const URL = 'http://localhost:5000';

async function startPage(page) {
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#start', { visible: true });
}

async function pause(page, ms) {
  if (page.waitForTimeout) return page.waitForTimeout(ms);
  return new Promise(r => setTimeout(r, ms));
}

async function clickStart(page) {
  await page.click('#start');
  await pause(page, 100);
}

async function clickNext(page) {
  // click a Next button using several fallbacks (current section, global nav, #next)
  await page.evaluate(() => {
    const selectors = [
      'main > section:last-of-type .actions button.outline',
      'section .actions button.outline',
      'nav.actions button.outline',
      '#next'
    ];
    let clicked = false;
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) { btn.click(); clicked = true; break; }
    }
    if (!clicked) {
      const main = document.querySelector('main');
      console.warn('clickNext: no next button found; main snapshot length:', main ? main.innerHTML.length : 0);
    }
  });
  await pause(page, 200);
}

async function toSummary(page) {
  // click next until we see 'Wyniki' heading
  for (let i = 0; i < 200; i++) {
    const isSummary = await page.$eval('#app', a => !!a && !!a.querySelector('h2') && a.querySelector('h2').textContent.trim() === 'Wyniki');
    if (isSummary) return;
    await clickNext(page);
  }
  throw new Error('Failed to reach summary');
}

async function setAnswer(page, qid, val) {
  // attempt to find inputs for qid and set them
  return await page.evaluate(({ qid, val }) => {
    const els = Array.from(document.getElementsByName(qid));
    if (!els || !els.length) return false;
    // pick first element type
    const el = els[0];
    const t = (el.type || '').toLowerCase();
    if (t === 'radio') {
      // find radio with matching value
      const target = els.find(e => e.value === String(val));
      if (target) { target.click(); return true; }
      // fallback: pick numeric match
      const n = Number(val);
      const target2 = els.find(e => Number(e.value) === n);
      if (target2) { target2.click(); return true; }
      return false;
    }
    if (t === 'checkbox') {
      const should = !!val;
      if (el.checked !== should) el.click();
      return true;
    }
    // text input
    if (t === 'text' || t === 'textarea') {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }, { qid, val });
}

async function fillAnswersDuringFlow(page, answersMap) {
  // after start, iterate over sections and set answers when inputs are visible
  for (let step = 0; step < 200; step++) {
    // set any visible inputs that we have answers for
    await page.evaluate((answersMap) => {
      for (const [qid, val] of Object.entries(answersMap)) {
        const els = Array.from(document.getElementsByName(qid || '___noname'));
        if (!els || !els.length) continue;
        // only act on visible ones
        const visible = els.some(e => !!(e.offsetParent));
        if (!visible) continue;
        const t = (els[0].type || '').toLowerCase();
        if (t === 'radio') {
          const target = els.find(e => e.value === String(val));
          if (target) target.click();
          else {
            const n = Number(val);
            const target2 = els.find(e => Number(e.value) === n);
            if (target2) target2.click();
          }
        } else if (t === 'checkbox') {
          const should = !!val;
          if (els[0].checked !== should) els[0].click();
        } else if (t === 'text') {
          els[0].value = String(val);
          els[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, answersMap);
    // click next unless we're at summary
    const isSummary = await page.$eval('main', m => !!m.querySelector('h2') && m.querySelector('h2').textContent.trim() === 'Wyniki');
    if (isSummary) break;
    await clickNext(page);
  }
}

async function readSubsectionCard(page, subTitle) {
  // find card with h3 matching subTitle
  return await page.evaluate((subTitle) => {
    const cards = Array.from(document.querySelectorAll('.card'));
    for (const c of cards) {
      const h3 = c.querySelector('h3');
      if (h3 && h3.textContent.trim() === subTitle) {
        const answeredLine = Array.from(c.querySelectorAll('div')).map(d => d.textContent).find(t => t && t.includes('Odpowiedzi udzielone'));
        const counts = answeredLine ? answeredLine.match(/(\d+) \/ (\d+)/) : null;
        const obtainedLine = Array.from(c.querySelectorAll('div')).map(d => d.innerText).find(t => t && t.includes('Liczba pkt'));
        const obtainedMatch = obtainedLine ? obtainedLine.match(/<b>(\d+)<\/b> \/ <b>(\d+)<\/b>/) : null;
        // simpler: parse plain text
        const answeredText = answeredLine ? answeredLine.trim() : null;
        const infoText = obtainedLine ? obtainedLine.trim() : null;
        // also collect zero/maybe items
        const redBadge = c.querySelector('.badge--red');
        const orangeBadge = c.querySelector('.badge--orange');
        const zeroItems = redBadge ? Array.from(c.querySelectorAll('ul li')).map(li => li.textContent.trim()) : [];
        const maybeItems = orangeBadge ? Array.from(c.querySelectorAll('ul li')).map(li => li.textContent.trim()) : [];
        // get progress value if present
        const pv = c.querySelector('.progress-value');
        const progressVal = pv ? pv.textContent.trim() : null;
        return { answeredText, infoText, zeroItems, maybeItems, progressVal, html: c.innerHTML };
      }
    }
    return null;
  }, subTitle);
}

async function readProfileSubAvg(page, subTitle) {
  return await page.evaluate((subTitle) => {
    const rows = Array.from(document.querySelectorAll('.profile-sublist > div'));
    for (const r of rows) {
      const ttl = r.querySelector('div');
      if (ttl && ttl.textContent.trim() === subTitle) {
        const pv = r.querySelector('.progress-value');
        return pv ? pv.textContent.trim() : null;
      }
    }
    // fallback: search by title text
    const titles = Array.from(document.querySelectorAll('.profile-sublist div')).filter(d=>d.textContent && d.textContent.trim()===subTitle);
    if (titles.length) {
      const parent = titles[0].parentElement;
      const pv = parent.querySelector('.progress-value');
      return pv ? pv.textContent.trim() : null;
    }
    return null;
  }, subTitle);
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  // forward browser page console logs to the test runner
  page.on('console', msg => { try { console.log('PAGE LOG:', msg.type(), msg.text()); } catch (e) {} });
  page.on('pageerror', err => console.log('PAGE ERROR:', err && err.message));

  const results = {};

  // Test A
  try {
    await startPage(page);
    await clickStart(page);
    // set gender to female to ensure female-only questions included (after the demographics section is rendered)
    await setAnswer(page, 'gender', 'female');
    await pause(page, 100);
    // define selections for a subset of "1. Żywienie"
    const answersA = { 'q1': 2, 'i_q1': 0, 'i_q2': 0, 'i_q4': 2, 'i_q5': 3, 'i_q6': 1 };
    await fillAnswersDuringFlow(page, answersA);
    await toSummary(page);
    const card = await readSubsectionCard(page, '1. Żywienie');
    // verify answered count now includes zero values
    const summaryNote = await page.evaluate(() => document.querySelector('main section p.secondary')?.textContent?.includes('suma punktów') || false);
    results.testA = { answersA, card, summaryNote, passed: card && card.answeredText && card.answeredText.includes('5 / 16') };
  } catch (e) {
    results.testA = { error: String(e) };
  }

  // Test B: omit some and compare avg calculations
  try {
    await startPage(page);
    await clickStart(page);
    await setAnswer(page, 'gender', 'female');
    await pause(page, 100);
    const answersB = { 'q1': 3, 'i_q1': 3, 'i_q2': 2 /* omit others */ };
    await fillAnswersDuringFlow(page, answersB);
    await toSummary(page);
    const card = await readSubsectionCard(page, '1. Żywienie');
    const profileAvg = await readProfileSubAvg(page, '1. Żywienie');
    results.testB = { answersB, card, profileAvg };
  } catch (e) {
    results.testB = { error: String(e) };
  }

  // Test C: mixed types — check q1 (single choice) counted in UI
  try {
    await startPage(page);
    await clickStart(page);
    await setAnswer(page, 'gender', 'female');
    await pause(page, 100);
    // set declared q1 and one matrix question, then navigate the flow
    await fillAnswersDuringFlow(page, { 'q1': 3, 'i_q1': 3 });
    await toSummary(page);
    // read profile declared label
    const declared = await page.evaluate(() => {
      const lbl = Array.from(document.querySelectorAll('.card h3')).find(h => h.textContent.trim() === 'Profil dbałości o zdrowie');
      if (!lbl) return null;
      const declLabel = lbl.parentElement.querySelector('div div');
      return declLabel ? declLabel.textContent.trim() : null;
    });
    results.testC = { declared };
  } catch (e) {
    results.testC = { error: String(e) };
  }

  // Test D: special case subsection_vi_substance_abuse when unanswered
  try {
    await startPage(page);
    await clickStart(page);
    await setAnswer(page, 'gender', 'female');
    await pause(page, 100);
    // answer required q1 so the flow can proceed, but do not answer the substance abuse items
    await fillAnswersDuringFlow(page, { 'q1': 3 });
    await toSummary(page);
    const card = await readSubsectionCard(page, '7. Nieużywanie substancji psychoaktywnych');
    results.testD = { card };
  } catch (e) {
    results.testD = { error: String(e) };
  }

  // Test E: fill everything with max values
  try {
    await startPage(page);
    await clickStart(page);
    await setAnswer(page, 'gender', 'female');
    await pause(page, 100);
    // Build answers map: for each question in survey, choose max
    const answersE = {};
    for (const sec of survey.sections) {
      if (sec.questions) {
        for (const q of sec.questions) {
          if (q.options && q.options.length) {
            // pick option with max score
            let max = null;
            for (const o of q.options) { if (o.score !== undefined) { if (max === null || o.score > max) max = o.score; } }
            answersE[q.id] = (max === null) ? (q.options[0].value ?? q.options[0].score ?? 0) : max;
          } else if (sec.type === 'matrix_frequency') {
            // unlikely at top-level, skip
          } else if (q.gender_specific) {
            // still set if relevant later when visible
            answersE[q.id] = 'test';
          }
        }
      }
      if (sec.sub_sections) {
        for (const sub of sec.sub_sections) {
          for (const q of sub.questions) {
            if (sec.type === 'matrix_frequency') {
              // choose highest frequency score
              const scale = sec.frequency_scale || [];
              const highest = scale.reduce((acc, s) => (s.score > (acc ?? -Infinity) ? s.score : acc), null);
              answersE[q.id] = highest ?? 3;
            } else if (sec.type === 'matrix_binary_score') {
              // choose positive
              answersE[q.id] = sec.binary_scale?.positive?.score ?? 3;
            } else if (q.options && q.options.length) {
              let max = null; for (const o of q.options) { if (o.score !== undefined) { if (max === null || o.score > max) max = o.score; } }
              answersE[q.id] = (max === null) ? (q.options[0].value ?? q.options[0].score ?? 0) : max;
            }
          }
        }
      }
    }
    // apply answers as we navigate
    await fillAnswersDuringFlow(page, answersE);
    await toSummary(page);
    // read a few subsections to ensure sums equal count*3 (or equal expected)
    const subsectionsToCheck = [ '1. Żywienie', '2. Aktywność fizyczna', '3. Sen, odpoczynek i zdrowie psychiczne' ];
    const checks = {};
    for (const st of subsectionsToCheck) {
      const c = await readSubsectionCard(page, st);
      checks[st] = c;
    }
    results.testE = { checks };
  } catch (e) {
    results.testE = { error: String(e) };
  }

  // Test F: required enforcement — all questions are required except section III
  try {
    await startPage(page);
    await clickStart(page);
    // answer only q1 and gender, skip most others
    await fillAnswersDuringFlow(page, { 'q1': 3, 'gender': 'female' });
    // try to reach summary — should fail because required questions remain
    let reached = true;
    try { await toSummary(page); } catch (err) { reached = false; }
    // helper should be visible for missing required question
    const helperVisible = await page.evaluate(() => !!document.querySelector('small[role="alert"]:not([hidden])'));
    results.testF = { reached, helperVisible };
  } catch (e) {
    results.testF = { error: String(e) };
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(0);
})();
