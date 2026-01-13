const fs = require('fs');
const path = require('path');
const survey = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'pytania.json'), 'utf8'));

function computeSubsections(answers) {
  const subsections = [];
  for (const sec of survey.sections) {
    if (!sec.sub_sections || !sec.sub_sections.length) continue;
    for (const sub of sec.sub_sections) {
      const questions = (sub.questions || []).filter(q => !(q.gender_specific && answers.gender && answers.gender !== q.gender_specific));
      let obtained = 0;
      let answeredCount = 0;
      const topItems = [];
      for (const q of questions) {
        const raw = answers[q.id];
        const val = Number(raw ?? 0);
        if (!Number.isNaN(val)) {
          obtained += val;
          if (typeof raw !== 'undefined') answeredCount++;
        }
        if (Number(val) === 3) topItems.push(q.text);
      }
      const count = questions.length;
      const avg = count ? (obtained / count) : 0;
      subsections.push({ id: sub.id, title: sub.title, count, obtained, avg, answeredCount, topItems, questions });
    }
  }
  return subsections;
}

function runTests() {
  const results = {};

  // Test A: zeros should count as answered
  const answersA = { gender: 'female', 'i_q1': 0, 'i_q2': 0, 'i_q4': 2, 'i_q5': 3, 'i_q6': 1 };
  const subsA = computeSubsections(answersA);
  const sNutrition = subsA.find(s => s.id === 'section_i_nutrition');
  // after fix, zeros should be counted as answered
  results.testA = { answersA, count: sNutrition.count, obtained: sNutrition.obtained, answeredCount: sNutrition.answeredCount, avg: sNutrition.avg, passed: sNutrition.answeredCount === 5 };


  // Test B: skipped questions affect avg (avg = sum / total) vs avg_answered
  const answersB = { gender: 'female', 'i_q1': 3, 'i_q2': 2 }; // skip rest
  const subsB = computeSubsections(answersB);
  const sB = subsB.find(s => s.id === 'section_i_nutrition');
  const answered = sB.answeredCount;
  const avg_total = sB.avg; // current logic
  const avg_answered = answered ? (sB.obtained / answered) : null;
  results.testB = { answersB, count: sB.count, obtained: sB.obtained, answered, avg_total, avg_answered };

  // Test C: mixed types - single choice q1 stored as string "3" should be counted in declaredScore logic
  const answersC = { gender: 'female', 'q1': '3', 'i_q1': 3 };
  const subsC = computeSubsections(answersC);
  const declaredQ = (() => {
    // mimic getOptionScoreFor + declaredScore logic
    const q = survey.sections.find(s=>s.id==='self_assessment_q1').questions.find(q=>q.id==='q1');
    // getOptionScoreFor
    const saved = answersC.q1;
    let score = null;
    for (const opt of q.options) {
      if (opt.value !== undefined && String(opt.value) === String(saved)) score = (opt.score ?? null);
      if (opt.score !== undefined && String(opt.score) === String(saved)) score = opt.score;
    }
    if (score === null || typeof score === 'undefined') {
      const maybe = Number(answersC.q1);
      score = (!Number.isNaN(maybe)) ? maybe : 0;
    }
    score = Math.max(0, Math.min(3, Number(score || 0)));
    return { saved, score };
  })();
  results.testC = { answersC, declaredQ };

  // Test D: subsection_vi_substance_abuse when unanswered
  const answersD = { gender: 'female' };
  const subsD = computeSubsections(answersD);
  const sD = subsD.find(s => s.id === 'section_vi_substance_abuse');
  // zeroItems detection in UI considers val === 0 or (s.id === 'section_vi_substance_abuse' && typeof raw === 'undefined')
  const zeroItems = [];
  const maybeItems = [];
  for (const q of sD.questions) {
    const raw = answersD[q.id];
    const val = (typeof raw === 'undefined') ? null : Number(raw);
    if (val === 0 || (sD.id === 'section_vi_substance_abuse' && typeof raw === 'undefined')) zeroItems.push(q.text);
    else if (val === 1 || val === 2) maybeItems.push(q.text);
  }
  results.testD = { sD: { count: sD.count, obtained: sD.obtained, answeredCount: sD.answeredCount }, zeroItems, maybeItems };

  // Test E: fill entire survey with max values
  const answersE = { gender: 'female' };
  for (const sec of survey.sections) {
    if (sec.questions) for (const q of sec.questions) {
      if (q.options && q.options.length) {
        let max = null; for (const o of q.options) if (o.score !== undefined) { if (max === null || o.score > max) max = o.score; }
        answersE[q.id] = (max === null) ? (q.options[0].value ?? q.options[0].score ?? 0) : max;
      }
    }
    if (sec.sub_sections) for (const sub of sec.sub_sections) for (const q of sub.questions) {
      if (sec.type === 'matrix_frequency') {
        const scale = sec.frequency_scale || [];
        const highest = scale.reduce((acc, s) => (s.score > (acc ?? -Infinity) ? s.score : acc), null);
        answersE[q.id] = highest ?? 3;
      } else if (sec.type === 'matrix_binary_score') {
        answersE[q.id] = sec.binary_scale?.positive?.score ?? 3;
      } else if (q.options && q.options.length) {
        let max = null; for (const o of q.options) if (o.score !== undefined) { if (max === null || o.score > max) max = o.score; }
        answersE[q.id] = (max === null) ? (q.options[0].value ?? q.options[0].score ?? 0) : max;
      }
    }
  }
  const subsE = computeSubsections(answersE);
  const checks = subsE.map(s => ({ id: s.id, count: s.count, obtained: s.obtained, expected: s.count * 3 }));
  results.testE = { checks };

  console.log(JSON.stringify(results, null, 2));
}

runTests();
