const surveyUrl = 'pytania.json';

const el = (sel) => document.querySelector(sel);

let survey = null;
let answers = {};
let currentSectionIdx = 0;
// when true, the next renderSection should skip performing scrollIntoView/scrollTo
let skipScrollNext = false;
// when true, the next renderSection should perform a simple scroll-to-top of the document
let forceTopScroll = false;
// track current sub-section index for sections that have sub_sections
const subSectionIdxBySection = {};

function loadSurvey() {
  return fetch(surveyUrl).then(r => r.json()).then(data => {
    survey = data;
    el('#survey-title').textContent = survey.title || 'Ankieta';
      // do not show description until a section is rendered; intro note will be shown under section 0
      el('#survey-desc').textContent = '';
    // don't render sections yet; wait for user to press Start
    const startBtn = el('#start');
    if (startBtn) startBtn.disabled = false;
  });
}

function clearApp() {
  el('#app').innerHTML = '';
}

function renderSection(idx) {
  if (!survey) return;
  clearApp();
  const section = survey.sections[idx];
  if (!section) return;

  const container = document.createElement('section');
    // group heading and its helper note(s) using <hgroup>
    const hgroup = document.createElement('hgroup');
    const h = document.createElement('h2');
    h.textContent = section.title || '';
    hgroup.appendChild(h);

    // section subtitle (if present) belongs to the heading group
    if (section.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'secondary';
      sub.textContent = section.subtitle;
      hgroup.appendChild(sub);
    }

    // section-level note (preferred). If missing and this is section 0, fall back to survey.intro.note
    // section-level note: for sections with sub_sections we'll render the note
    // below the subsection heading so the order is: section title, subsection
    // numbering+title, then the section note (per request). For non-chunked
    // sections include the note in the heading group as before.
    if (!section.sub_sections || !section.sub_sections.length) {
      if (section.note) {
        const note = document.createElement('p');
        note.className = 'secondary';
        note.textContent = section.note;
        hgroup.appendChild(note);
      } else if (idx === 0 && survey && survey.intro && survey.intro.note) {
        const note = document.createElement('p');
        note.className = 'secondary';
        note.textContent = survey.intro.note;
        hgroup.appendChild(note);
      }
    }

    container.appendChild(hgroup);

    // Create an inline Prev button above the heading (per design request)
    const inlinePrev = document.createElement('button');
    inlinePrev.type = 'button';
    inlinePrev.className = 'inline-prev ghost';
    inlinePrev.setAttribute('aria-label', 'Poprzednie pytania');
    inlinePrev.innerHTML = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.5 1.5L4 8l7.5 6.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Poprzednie pytania</span>';
    inlinePrev.addEventListener('click', () => {
      // when user clicks Prev, we want to move without performing the smooth scroll
      skipScrollNext = true;
      const sec = survey.sections[currentSectionIdx];
      // if current section has sub_sections and we're not at the first sub, go back one sub
      if (sec && sec.sub_sections && sec.sub_sections.length) {
        const currentSub = subSectionIdxBySection[sec.id] ?? 0;
        if (currentSub > 0) {
          subSectionIdxBySection[sec.id] = currentSub - 1;
          renderSection(currentSectionIdx);
          return;
        }
      }
      // otherwise go to previous top-level section; if that has sub_sections, jump to its last sub
      if (currentSectionIdx > 0) {
        currentSectionIdx--;
        const prevSec = survey.sections[currentSectionIdx];
        if (prevSec && prevSec.sub_sections && prevSec.sub_sections.length) {
          subSectionIdxBySection[prevSec.id] = prevSec.sub_sections.length - 1;
        }
        renderSection(currentSectionIdx);
      }
    });
    // hide on first top-level section and first sub-section
    const initialSub = subSectionIdxBySection[section.id] ?? 0;
    inlinePrev.style.display = (currentSectionIdx === 0 && initialSub === 0) ? 'none' : '';
    container.insertBefore(inlinePrev, hgroup);

  // subtitle already added to hgroup when present

  // If the section has sub_sections, render only the current sub-section (chunked view)
  if (section.sub_sections && section.sub_sections.length) {
    const currentSub = subSectionIdxBySection[section.id] ?? 0;
    const sub = section.sub_sections[currentSub];
    // render subsection header (title only) and then the section note
    const subh = document.createElement('h3');
    subh.textContent = sub.title;
    container.appendChild(subh);
    // after the subsection header, show the section note (if any)
    if (section.note) {
      const note = document.createElement('p');
      note.className = 'secondary';
      note.textContent = section.note;
      container.appendChild(note);
      // insert a horizontal rule after the note and before the questions
      const sep = document.createElement('hr');
      sep.style.margin = '12px 0';
      container.appendChild(sep);
    } else {
      // no note: insert separator immediately after subsection title
      const sep = document.createElement('hr');
      sep.style.margin = '12px 0';
      container.appendChild(sep);
    }

  // render questions for this sub-section based on section.type
    if (section.type === 'matrix_frequency') {
      sub.questions.forEach(q => container.appendChild(renderMatrixQuestion(q, section)));
    } else if (section.type === 'matrix_binary_score') {
      sub.questions.forEach(q => container.appendChild(renderBinaryQuestion(q, section)));
    } else {
      sub.questions.forEach(q => container.appendChild(renderTextQuestion(q)));
    }
  } else {
    // no sub_sections — render normally
    // add separator before first question
    const sep = document.createElement('hr');
    sep.style.margin = '12px 0';
    container.appendChild(sep);
    if (section.type === 'single_choice_radio') {
      section.questions.forEach(q => container.appendChild(renderSingleChoice(q)));
    } else {
      // fallback: render questions as text inputs
      section.questions && section.questions.forEach(q => container.appendChild(renderTextQuestion(q)));
    }
  }

  el('#app').appendChild(container);
  // create per-section navigation at the bottom of the section with Next left-aligned
  const sectionNav = document.createElement('nav');
  sectionNav.className = 'actions';
  sectionNav.style.justifyContent = 'flex-start';
  // Next button (left-aligned)
  const secNext = document.createElement('button');
  secNext.type = 'button';
  secNext.className = 'outline';
  // label will reflect whether this is the last section
  secNext.textContent = (currentSectionIdx >= survey.sections.length - 1) ? 'Zobacz wyniki' : 'Dalej';
  // keep Next enabled so it can trigger the summary on the last section
  secNext.disabled = false;
  secNext.addEventListener('click', () => {
    // If section has sub_sections, validate only this chunk first
    if (section.sub_sections && section.sub_sections.length) {
      const currentSub = subSectionIdxBySection[section.id] ?? 0;
      const ok = validateSubSection(currentSectionIdx, currentSub);
      if (!ok) {
        const firstHelper = container.querySelector('small:not([hidden])');
        if (firstHelper) {
          const qid = firstHelper.id.replace('_helper', '');
          const inputs = document.getElementsByName(qid);
          if (inputs && inputs.length) inputs[0].focus();
        }
        return;
      }
      // advance within sub_sections if available
      if (currentSub < section.sub_sections.length - 1) {
        subSectionIdxBySection[section.id] = currentSub + 1;
        renderSection(currentSectionIdx);
        return;
      }
      // otherwise fall through to advance to next section
    } else {
      // validate entire section before advancing
      const ok = validateSection(currentSectionIdx);
      if (!ok) {
        const firstHelper = container.querySelector('small:not([hidden])');
        if (firstHelper) {
          const qid = firstHelper.id.replace('_helper', '');
          const inputs = document.getElementsByName(qid);
          if (inputs && inputs.length) inputs[0].focus();
        }
        return;
      }
    }
    if (currentSectionIdx < survey.sections.length - 1) {
      // reset any sub-section index for this section so when revisiting it starts at 0
      if (section.sub_sections && section.sub_sections.length) subSectionIdxBySection[section.id] = 0;
      currentSectionIdx++;
      // ensure we scroll to top for a consistent experience when moving to a different top-level section
      forceTopScroll = true;
      renderSection(currentSectionIdx);
    }
    else {
      // last section -> show summary view built from survey structure and collected answers
      renderSummary();
    }
  });
  sectionNav.appendChild(secNext);
  container.appendChild(sectionNav);
  updateNav();

  // After rendering, scroll the newly-rendered container into view (smooth) and focus
  // If skipScrollNext is set (due to Prev), skip the scrolling but still set focus. Reset the flag after.
  if (!skipScrollNext) {
    // Scroll to the top of the newly-rendered container (section) so the heading is visible.
    try {
      // detect fixed/sticky headers to offset the scroll target
      let headerOffset = 0;
      try {
        const fixedCandidates = Array.from(document.querySelectorAll('body *')).filter(el => {
          const s = window.getComputedStyle(el);
          return (s.position === 'fixed' || s.position === 'sticky') && Math.abs(el.getBoundingClientRect().top) < 4 && el.getBoundingClientRect().height > 0;
        });
        if (fixedCandidates.length) {
          headerOffset = fixedCandidates.reduce((max, el) => Math.max(max, el.getBoundingClientRect().height || 0), 0);
        }
      } catch (he) { headerOffset = 0; }

      const targetY = Math.max(0, container.getBoundingClientRect().top + window.scrollY - headerOffset - 8); // small gap
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    } catch (e) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (ee) { try { window.scrollTo(0,0); } catch (eee) {} }
    }
    // clear any force flag
    forceTopScroll = false;
  } else {
    // Prev requested skip: reset the flag and do not perform any scrolling
    skipScrollNext = false;
  }
  // focus first legend if present, otherwise first input/select/textarea
  const firstLegend = container.querySelector('legend');
  if (firstLegend) {
    firstLegend.setAttribute('tabindex', '-1');
    // use preventScroll when available so focusing doesn't cancel the smooth scroll animation
    try {
      firstLegend.focus({ preventScroll: true });
    } catch (e) {
      // fallback for older browsers
      firstLegend.focus();
    }
  } else {
    const firstControl = container.querySelector('input, select, textarea, button');
    if (firstControl) {
      try {
        firstControl.focus({ preventScroll: true });
      } catch (e) {
        firstControl.focus();
      }
    }
  }
}

function renderSingleChoice(q) {
  const wrap = document.createElement('div');
  wrap.className = 'form';
  if (q.gender_specific) wrap.dataset.genderOnly = q.gender_specific;

  // group inputs into a fieldset so radios are stacked vertically and Pico's
  // selector (fieldset[aria-invalid=true] + small) will match. Use a legend
  // to label the group (avoids orphaned label warning).
  const group = document.createElement('fieldset');
  group.id = `${q.id}_group`;
  // mirror gender-specific marker on the group so validation logic can find it
  if (q.gender_specific) group.dataset.genderOnly = q.gender_specific;
  if (q.gender_specific) group.setAttribute('data-gender-only', q.gender_specific);
  const legend = document.createElement('legend');
  legend.textContent = q.text;
  group.appendChild(legend);

  q.options.forEach((opt, i) => {
  const id = `${q.id}_${i}`;
  const div = document.createElement('div');
  // keep each option on its own line
  div.style.display = 'block';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = q.id;
    input.id = id;
  // prefer explicit option.value when provided (e.g. gender: "female"/"male"),
  // otherwise fall back to numeric score or the option text
  input.value = opt.value ?? opt.score ?? opt.text;
    if (q.required) input.setAttribute('aria-describedby', `${q.id}_helper`);
    // initialize checked state from stored answers (so Prev restores selections)
    try {
      const saved = answers[q.id];
      if (typeof saved !== 'undefined' && String(saved) === String(input.value)) input.checked = true;
    } catch (e) {}
    input.addEventListener('change', () => { answers[q.id] = input.value; clearHelper(q.id); });
    // if this is the gender selector, trigger filtering immediately when changed
    if (q.id === 'gender') {
      input.addEventListener('change', () => {
        // normalize stored value (use the input.value directly)
        answers[q.id] = input.value;
        console.debug('gender change event:', { id: input.id, value: input.value, checked: input.checked });
        try { applyGenderFilter(); } catch (e) { console.error('applyGenderFilter error', e); }
      });
    }
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = opt.text;
    div.appendChild(input);
    div.appendChild(lab);
    group.appendChild(div);
  });

  wrap.appendChild(group);
  if (q.required) wrap.appendChild(renderHelper(q));
  return wrap;
}

function renderHelper(question) {
  const id = `${question.id}_helper`;
  const small = document.createElement('small');
  small.id = id;
  small.hidden = true;
  // use Pico's native helper styling (no custom class); keep ARIA alerts
  small.setAttribute('role', 'alert');
  small.setAttribute('aria-live', 'assertive');
  small.textContent = question.validation_message || 'To pole jest wymagane';
  return small;
}

function clearHelper(questionId) {
  const helper = document.getElementById(`${questionId}_helper`);
  if (helper) helper.hidden = true;
  const inputs = document.getElementsByName(questionId);
  if (inputs && inputs.length) {
    for (const inp of inputs) inp.removeAttribute('aria-invalid');
  }
  const group = document.getElementById(`${questionId}_group`);
  if (group) {
    group.removeAttribute('aria-invalid');
    const inner = group.querySelectorAll('input, select, textarea');
    if (inner && inner.length) inner.forEach(i => i.removeAttribute('aria-invalid'));
  }
}

function validateSection(idx) {
  const section = survey.sections[idx];
  if (!section) return true;
  // collect questions (handle both flat questions and sub_sections) into a new array to avoid mutating original
  const questions = [];
  if (section.questions && section.questions.length) questions.push(...section.questions);
  if (section.sub_sections && section.sub_sections.length) {
    section.sub_sections.forEach(sub => { if (sub.questions && sub.questions.length) questions.push(...sub.questions); });
  }

  let ok = true;
  for (const q of questions) {
    // skip questions that are gender-specific and not relevant for the selected gender
    const groupEl = document.getElementById(`${q.id}_group`);
    const selectedGender = (typeof getSelectedGender === 'function') ? getSelectedGender() : 'all';
    if (groupEl && groupEl.dataset.genderOnly && selectedGender !== 'all' && groupEl.dataset.genderOnly !== selectedGender) {
      // ensure helper is hidden and inputs are not marked invalid
      const helper = document.getElementById(`${q.id}_helper`);
      if (helper) helper.hidden = true;
      if (groupEl) {
        groupEl.removeAttribute('aria-invalid');
        const inner = groupEl.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.removeAttribute('aria-invalid'));
      }
      continue;
    }
    if (!q.required) continue;
    const inputs = document.getElementsByName(q.id);
    let answered = false;
    if (inputs && inputs.length) {
      for (const inp of inputs) {
        const t = (inp.type || '').toLowerCase();
        if (t === 'radio' || t === 'checkbox') {
          if (inp.checked) { answered = true; break; }
          continue; // un-checked radio/checkbox is not answered
        }
        // other inputs (text, textarea, select) count by having a non-empty value
        if (inp.value && String(inp.value).trim() !== '') { answered = true; break; }
      }
    }
    if (!answered) {
      ok = false;
      const helper = document.getElementById(`${q.id}_helper`);
      if (helper) helper.hidden = false;
      // mark the group container as invalid so Pico's selector matches (e.g. .grid[aria-invalid=true] + small)
      const group = document.getElementById(`${q.id}_group`);
      if (group) {
        group.setAttribute('aria-invalid', 'true');
        // also mark contained inputs as aria-invalid for assistive tech
        const inner = group.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.setAttribute('aria-invalid', 'true'));
      } else if (inputs && inputs.length) {
        for (const inp of inputs) inp.setAttribute('aria-invalid', 'true');
      }
    } else {
      // clear aria-invalid on group if answered
      const group = document.getElementById(`${q.id}_group`);
      if (group) {
        group.removeAttribute('aria-invalid');
        const inner = group.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.removeAttribute('aria-invalid'));
      }
    }
  }
  return ok;
}

// Validate only a specific sub-section (chunk) inside a section
function validateSubSection(sectionIdx, subIdx) {
  const section = survey.sections[sectionIdx];
  if (!section || !section.sub_sections || !section.sub_sections[subIdx]) return true;
  const sub = section.sub_sections[subIdx];
  let ok = true;
  for (const q of sub.questions) {
    // skip gender-specific questions that are not relevant
    const groupEl = document.getElementById(`${q.id}_group`);
    const selectedGender = (typeof getSelectedGender === 'function') ? getSelectedGender() : 'all';
    if (groupEl && groupEl.dataset.genderOnly && selectedGender !== 'all' && groupEl.dataset.genderOnly !== selectedGender) {
      const helper = document.getElementById(`${q.id}_helper`);
      if (helper) helper.hidden = true;
      if (groupEl) {
        groupEl.removeAttribute('aria-invalid');
        const inner = groupEl.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.removeAttribute('aria-invalid'));
      }
      continue;
    }
    if (!q.required) continue;
    const inputs = document.getElementsByName(q.id);
    let answered = false;
    if (inputs && inputs.length) {
      for (const inp of inputs) {
        const t = (inp.type || '').toLowerCase();
        if (t === 'radio' || t === 'checkbox') {
          if (inp.checked) { answered = true; break; }
          continue;
        }
        if (inp.value && String(inp.value).trim() !== '') { answered = true; break; }
      }
    }
    if (!answered) {
      ok = false;
      const helper = document.getElementById(`${q.id}_helper`);
      if (helper) helper.hidden = false;
      const group = document.getElementById(`${q.id}_group`);
      if (group) {
        group.setAttribute('aria-invalid', 'true');
        const inner = group.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.setAttribute('aria-invalid', 'true'));
      } else if (inputs && inputs.length) {
        for (const inp of inputs) inp.setAttribute('aria-invalid', 'true');
      }
    } else {
      const group = document.getElementById(`${q.id}_group`);
      if (group) {
        group.removeAttribute('aria-invalid');
        const inner = group.querySelectorAll('input, select, textarea');
        if (inner && inner.length) inner.forEach(i => i.removeAttribute('aria-invalid'));
      }
    }
  }
  return ok;
}

function renderMatrixQuestion(q, section) {
  const wrap = document.createElement('div');
  wrap.className = 'form';
  if (q.gender_specific) wrap.dataset.genderOnly = q.gender_specific;
  if (q.gender_specific) wrap.setAttribute('data-gender-only', q.gender_specific);
  // use a fieldset + legend to label the radio group for accessibility
  const group = document.createElement('fieldset');
  group.id = `${q.id}_group`;
  if (q.gender_specific) group.dataset.genderOnly = q.gender_specific;
  if (q.gender_specific) group.setAttribute('data-gender-only', q.gender_specific);
  const legend = document.createElement('legend');
  legend.textContent = q.text;
  group.appendChild(legend);

  const scale = section.frequency_scale || [];
  // Render each scale option vertically (one per line), using full text (no abbreviations)
  scale.forEach((s, i) => {
    const id = `${q.id}_${i}`;
    const optionWrap = document.createElement('div');
    // keep each option on its own line to match other radio groups
    optionWrap.style.display = 'block';

    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = q.id;
    rb.id = id;
    rb.value = s.score ?? i;
    if (q.required) rb.setAttribute('aria-describedby', `${q.id}_helper`);
    // initialize checked state from stored answers (numbers for matrix)
    try {
      const saved = answers[q.id];
      if (typeof saved !== 'undefined' && Number(saved) === Number(rb.value)) rb.checked = true;
    } catch (e) {}
    rb.addEventListener('change', () => { answers[q.id] = Number(rb.value); clearHelper(q.id); });

    const lab = document.createElement('label');
    lab.htmlFor = id;
    // use full text for the option label per request
    lab.textContent = s.text;

    optionWrap.appendChild(rb);
    optionWrap.appendChild(lab);
    group.appendChild(optionWrap);
  });
  wrap.appendChild(group);
  // helper for required
  if (q.required) wrap.appendChild(renderHelper(q));
  return wrap;
}

function renderBinaryQuestion(q, section) {
  const wrap = document.createElement('div');
  wrap.className = 'form';
  // use a fieldset + legend for group labeling (accessibility)
  const group = document.createElement('fieldset');
  group.id = `${q.id}_group`;
  if (q.gender_specific) group.dataset.genderOnly = q.gender_specific;
  if (q.gender_specific) group.setAttribute('data-gender-only', q.gender_specific);
  const legend = document.createElement('legend');
  legend.textContent = q.text;
  group.appendChild(legend);
  const id = `${q.id}_x`;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.name = q.id;
  cb.id = id;
  if (q.required) cb.setAttribute('aria-describedby', `${q.id}_helper`);
  // initialize checked state from stored answers
  try {
    const saved = answers[q.id];
    if (typeof saved !== 'undefined') cb.checked = Number(saved) > 0;
  } catch (e) {}
  cb.addEventListener('change', () => { answers[q.id] = cb.checked ? (section.binary_scale?.positive?.score ?? 1) : 0; clearHelper(q.id); });
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = section.binary_scale?.positive?.text || 'TAK';
  group.appendChild(cb);
  group.appendChild(lab);
  wrap.appendChild(group);
  if (q.required) wrap.appendChild(renderHelper(q));
  return wrap;
}

function renderTextQuestion(q) {
  const wrap = document.createElement('div');
  wrap.className = 'form';
  const label = document.createElement('label');
  label.textContent = q.text;
  label.htmlFor = q.id;
  wrap.appendChild(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = q.id;
  input.name = q.id;
  if (q.gender_specific) {
    wrap.dataset.genderOnly = q.gender_specific;
    // also mirror to the group-level container for consistency with other types
    // For text inputs there is no fieldset, so we use the wrapper itself
    wrap.setAttribute('data-gender-only', q.gender_specific);
  }
  if (q.required) input.setAttribute('aria-describedby', `${q.id}_helper`);
  // initialize value from stored answers
  try { if (typeof answers[q.id] !== 'undefined') input.value = answers[q.id]; } catch (e) {}
  input.addEventListener('input', () => { answers[q.id] = input.value; clearHelper(q.id); });
  wrap.appendChild(input);
  // place helper immediately after the input so Pico's adjacent-sibling selector applies
  if (q.required) wrap.appendChild(renderHelper(q));
  return wrap;
}

function updateNav() {
  // global nav is not used; per-section nav is added to each rendered section
  const nav = el('#nav-actions');
  if (nav) nav.style.display = 'none';
}

// Render a summary view using the survey structure and collected `answers`.
function renderSummary() {
  clearApp();
  const container = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = 'Wyniki';
  container.appendChild(h);

  // back button to return
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'inline-prev ghost';
  backBtn.setAttribute('aria-label', 'Wróć do ankiety');
  backBtn.innerHTML = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.5 1.5L4 8l7.5 6.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Wróć do ankiety</span>';
  backBtn.addEventListener('click', () => { renderSection(Math.max(0, survey.sections.length - 1)); });
  container.appendChild(backBtn);

  const selectedGender = (typeof getSelectedGender === 'function') ? getSelectedGender() : 'all';

  // helpers
  function findQuestion(qid) {
    for (const sec of survey.sections) {
      if (sec.questions) for (const q of sec.questions) if (q.id === qid) return q;
      if (sec.sub_sections) for (const sub of sec.sub_sections) for (const q of sub.questions) if (q.id === qid) return q;
    }
    return null;
  }
  function getOptionTextFor(q) {
    if (!q || !q.options) return null;
    const saved = answers[q.id];
    if (typeof saved === 'undefined') return null;
    for (const opt of q.options) {
      if (opt.value !== undefined && String(opt.value) === String(saved)) return opt.text;
      if (opt.score !== undefined && String(opt.score) === String(saved)) return opt.text;
      if (opt.text !== undefined && String(opt.text) === String(saved)) return opt.text;
    }
    return null;
  }
  function getOptionScoreFor(q) {
    if (!q || !q.options) return null;
    const saved = answers[q.id];
    if (typeof saved === 'undefined') return null;
    // if the saved value equals an explicit option.value, try to return opt.score
    for (const opt of q.options) {
      if (opt.value !== undefined && String(opt.value) === String(saved)) return (opt.score ?? null);
      if (opt.score !== undefined && String(opt.score) === String(saved)) return opt.score;
      if (opt.text !== undefined && String(opt.text) === String(saved)) return (opt.score ?? null);
    }
    // maybe saved is already a number
    const n = Number(saved);
    if (!Number.isNaN(n)) return n;
    return null;
  }

  // Polish pluralization for 'punkt'
  function pluralPoints(n) {
    // expect n as number
    if (n === 1) return `${n} punkt`;
    return `${n} punkty`;
  }

  // Build a list of subsections (only subsections) with averages (0..3)
  const subsections = [];
  for (const sec of survey.sections) {
    if (!sec.sub_sections || !sec.sub_sections.length) continue;
    for (const sub of sec.sub_sections) {
      const questions = (sub.questions || []).filter(q => !(q.gender_specific && selectedGender !== 'all' && q.gender_specific !== selectedGender));
      let obtained = 0;
      let answeredCount = 0;
      const topItems = [];
      for (const q of questions) {
        const val = Number(answers[q.id] ?? 0);
        if (!Number.isNaN(val)) {
          obtained += val;
          if (String(answers[q.id]) !== 'undefined' && String(answers[q.id]) !== '0') answeredCount++;
        }
        if (Number(val) === 3) topItems.push(q.text);
      }
      const count = questions.length;
      const avg = count ? (obtained / count) : 0; // average in 0..3
      subsections.push({ id: sub.id, title: sub.title, count, obtained, avg, answeredCount, topItems, questions });
    }
  }

  // declared self-assessment (q1) as numeric score and text
  const declaredQ = findQuestion('q1');
  const declaredText = declaredQ ? (getOptionTextFor(declaredQ) || (answers.q1 ?? 'Brak odpowiedzi')) : (answers.q1 ?? 'Brak odpowiedzi');
  let declaredScore = null;
  if (declaredQ) declaredScore = getOptionScoreFor(declaredQ);
  if (declaredScore === null || typeof declaredScore === 'undefined') {
    // try to coerce answers.q1 to number
    const maybe = Number(answers.q1);
    declaredScore = (!Number.isNaN(maybe)) ? maybe : 0;
  }
  // clamp to 0..3
  declaredScore = Math.max(0, Math.min(3, Number(declaredScore || 0)));

  // Top profile card
  const profileCard = document.createElement('div');
  profileCard.className = 'card';
  profileCard.style.marginTop = '12px';
  const profileTitle = document.createElement('h3');
  profileTitle.textContent = 'Profil dbałości o zdrowie';
  profileCard.appendChild(profileTitle);

  // declared value display + bar (0..3)
  // show declaration text above its bar
  const declBlock = document.createElement('div');
  declBlock.style.display = 'flex';
  declBlock.style.flexDirection = 'column';
  declBlock.style.gap = '8px';
  declBlock.style.marginTop = '8px';
  const declLabel = document.createElement('div');
  declLabel.style.fontWeight = '700';
  const declNumText = (typeof declaredScore === 'number') ? pluralPoints(Math.round(declaredScore)) : 'Brak odpowiedzi';
  declLabel.innerHTML = `Deklaracja: ${declaredText} (${declNumText})`;
  declBlock.appendChild(declLabel);
  // bar container
  const declBarWrap = document.createElement('div');
  declBarWrap.style.position = 'relative';
  declBarWrap.style.flex = '1 1 auto';
  declBarWrap.style.height = '14px';
  declBarWrap.style.background = 'var(--surface-level-100, #eee)';
  declBarWrap.style.borderRadius = '8px';
  declBarWrap.style.overflow = 'hidden';
  const declFill = document.createElement('div');
  declFill.style.height = '100%';
  declFill.style.width = `${(declaredScore / 3) * 100}%`;
  // use same blue as progress bars (CSS var configured)
  declFill.style.background = 'linear-gradient(90deg,var(--app-progress-blue), var(--app-progress-blue))';
  // rounded fill
  declFill.style.borderRadius = '8px';
  declFill.style.transition = 'width .5s ease';
  declBarWrap.appendChild(declFill);
  // add declaration vertical marker so it aligns with other markers
  const declMarker = document.createElement('div');
  const declMarkerLeft = (declaredScore / 3) * 100;
  // allow the marker to be fully visible even if it sticks out above the bar
  declBarWrap.style.overflow = 'visible';
  declMarker.style.position = 'absolute';
  declMarker.style.left = `${declMarkerLeft}%`;
  // place marker slightly above the bar and make it more visible
  declMarker.style.top = '-8px';
  declMarker.style.width = '4px';
  declMarker.style.height = '28px';
  declMarker.style.background = 'var(--app-progress-blue, #2b6cff)';
  declMarker.style.borderRadius = '2px';
  declMarker.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
  declMarker.style.transform = 'translateX(-50%)';
  declMarker.style.zIndex = '10';
  declMarker.title = `Deklaracja: ${declaredScore.toFixed(2)} / 3`;
  declBarWrap.appendChild(declMarker);
  // numeric marker (right side)
  const declNum = document.createElement('div');
  declNum.style.textAlign = 'right';
  declNum.style.fontWeight = '700';
  declNum.textContent = `${declaredScore.toFixed(2)} / 3`;
  // place numeric value above the bar (so it's not beside it)
  declNum.style.marginTop = '4px';
  declNum.style.marginBottom = '6px';
  declBlock.appendChild(declNum);
  // place bar in a row (bar only) so numeric is above
  const declRow = document.createElement('div');
  declRow.style.display = 'flex';
  declRow.style.alignItems = 'center';
  declRow.style.gap = '12px';
  // ensure the bar grows horizontally
  declBarWrap.style.flex = '1 1 auto';
  declBarWrap.style.minWidth = '0';
  declRow.appendChild(declBarWrap);
  declBlock.appendChild(declRow);

  // answered count removed from profile card per user request

  // small list of subsections with mini progress and declaration marker
  const subList = document.createElement('div');
  subList.style.display = 'flex';
  subList.style.flexDirection = 'column';
  subList.style.gap = '8px';
  subList.style.marginTop = '12px';
  // colors: use CSS variables defined in styles.css
  const fillColor = 'var(--app-progress-blue)';
  const fillBg = 'var(--surface-level-100, #eee)';
  const markerColor = 'var(--app-progress-blue)';
  subsections.forEach(ss => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.alignItems = 'center';
    const ttl = document.createElement('div'); ttl.style.fontWeight = '600'; ttl.textContent = ss.title;
    const val = document.createElement('div'); val.style.fontWeight = '700'; val.textContent = `${ss.avg.toFixed(2)} / 3`;
    titleRow.appendChild(ttl); titleRow.appendChild(val);
    row.appendChild(titleRow);

    const barWrap = document.createElement('div');
    barWrap.style.position = 'relative';
    barWrap.style.height = '12px';
    barWrap.style.background = fillBg;
    barWrap.style.borderRadius = '8px';
    barWrap.style.overflow = 'hidden';
    barWrap.style.marginTop = '6px';
  const fill = document.createElement('div');
  const pct = (ss.avg / 3) * 100;
  fill.style.width = `${pct}%`;
  fill.style.height = '100%';
  fill.style.borderRadius = '8px';
  fill.style.transition = 'width .5s ease, background .3s ease';
  // color based on comparison to declaredScore: green >, red <, blue ==
  const blue = 'var(--app-progress-blue)';
  const green = 'var(--app-good)';
  const red = 'var(--app-bad)';
  let barColor = blue;
  // treat equal or greater than declaration as good (green)
  if (ss.avg >= declaredScore) barColor = green;
  else if (ss.avg < declaredScore) barColor = red;
  fill.style.background = barColor;
    barWrap.appendChild(fill);
  // declaration marker (vertical line) — styled to match the main declaration marker
  const marker = document.createElement('div');
  const markerLeft = (declaredScore / 3) * 100;
  marker.style.position = 'absolute';
  marker.style.left = `${markerLeft}%`;
  marker.style.top = '-8px';
  marker.style.width = '4px';
  marker.style.height = '28px';
  marker.style.background = markerColor;
  marker.style.borderRadius = '2px';
  marker.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
  marker.style.transform = 'translateX(-50%)';
  marker.style.zIndex = '9';
  marker.title = `Deklaracja: ${declaredScore.toFixed(2)} / 3`;
  // allow markers to overflow the mini bar for visibility
  barWrap.style.overflow = 'visible';
  barWrap.appendChild(marker);

    row.appendChild(barWrap);
    subList.appendChild(row);
  });
  profileCard.appendChild(declBlock);
  profileCard.appendChild(subList);
  container.appendChild(profileCard);

  // Detailed cards per subsection — stacked vertically (one per row)
  const grid = document.createElement('div');
  grid.style.display = 'flex';
  grid.style.flexDirection = 'column';
  grid.style.gap = '12px';
  grid.style.marginTop = '12px';
  for (const s of subsections) {
    const c = document.createElement('div');
    c.className = 'card';

    // title as h3
    const t = document.createElement('h3');
    t.textContent = s.title;
    c.appendChild(t);
    // move answered count just under the title
    const answered = document.createElement('div');
    answered.style.marginTop = '8px';
    answered.style.color = 'var(--muted)';
    answered.textContent = `Odpowiedzi udzielone: ${s.answeredCount} / ${s.count}`;
    c.appendChild(answered);

    // show obtained sum and maximum possible points for the subsection
    const maxScore = (s.count || 0) * 3;
    const info = document.createElement('div');
    info.style.marginTop = '8px';
    info.innerHTML = `<div>Liczba pkt (suma): <b>${s.obtained}</b> / <b>${maxScore}</b></div>`;
    c.appendChild(info);

    // progress: use obtained/max as progress bar
    const progWrap = document.createElement('div');
    progWrap.style.marginTop = '8px';
    const prog = document.createElement('progress');
    prog.max = maxScore || 1;
    prog.value = s.obtained;
  // color the native progress in detailed cards always blue (do not apply comparison logic here)
  const blue = 'linear-gradient(90deg,var(--app-progress-blue), #2b6cff)';
  prog.style.setProperty('--progress-fill', blue);
    progWrap.appendChild(prog);
    c.appendChild(progWrap);

    // Utrzymaj zachowania: items with score === 3
    if (s.topItems && s.topItems.length) {
      const badgeWrap = document.createElement('div');
      badgeWrap.style.marginTop = '8px';
      const badge = document.createElement('span'); badge.className = 'badge badge--green'; badge.textContent = 'Utrzymaj zachowania:';
      badgeWrap.appendChild(badge);
      const ul = document.createElement('ul');
      s.topItems.forEach(txt => { const li = document.createElement('li'); li.textContent = txt; ul.appendChild(li); });
      badgeWrap.appendChild(ul);
      c.appendChild(badgeWrap);
    }

    // check for 0 items
    const zeroItems = [];
    const maybeItems = [];
    for (const q of s.questions || []) {
      const raw = answers[q.id];
      const val = (typeof raw === 'undefined') ? null : Number(raw);
      // for section_vi_substance_abuse treat undefined as 0 (not selected)
      if (val === 0 || (s.id === 'section_vi_substance_abuse' && typeof raw === 'undefined')) zeroItems.push(q.text);
      else if (val === 1 || val === 2) maybeItems.push(q.text);
    }
    if (zeroItems.length) {
      const block = document.createElement('div'); block.style.marginTop = '8px';
      const badge = document.createElement('span'); badge.className = 'badge badge--red'; badge.textContent = 'Warto zacząć:';
      block.appendChild(badge);
      const ul = document.createElement('ul'); zeroItems.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      block.appendChild(ul);
      c.appendChild(block);
    } else if (maybeItems.length) {
      const block = document.createElement('div'); block.style.marginTop = '8px';
      const badge = document.createElement('span'); badge.className = 'badge badge--orange'; badge.textContent = 'Warto poprawić:';
      block.appendChild(badge);
      const ul = document.createElement('ul'); maybeItems.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      block.appendChild(ul);
      c.appendChild(block);
    }

    grid.appendChild(c);
  }

  // Special handling for section_vi_substance_abuse: show red badge with list of
  // items that are 'never or almost never' (value 0 or unanswered) OR show orange
  // badge 'Popraw' and a list of items with intermediate scores (1 or 2).
  // Assumption: if the subsection has only binary answers (TAK=3 / NIE=0), then
  // the orange list will look across all subsections for items with score 1 or 2
  // (since within the binary subsection such values don't exist).
  container.appendChild(grid);

  el('#app').appendChild(container);
}

function initControls() {
  // Global prev/next removed — navigation is rendered per section now.

  // start button: render the first section (section 0 now can be gender)
  const startBtn = el('#start');
  if (startBtn) startBtn.addEventListener('click', () => {
      const intro = el('#intro-grid');
      if (intro) intro.style.display = 'none';
      currentSectionIdx = 0;
      renderSection(currentSectionIdx);
  });

  // initialize theme toggle and wire button here so it always attaches
  initTheme();
  const themeCheckbox = el('#theme-toggle');
  if (themeCheckbox) {
    // set initial checked state is handled by initTheme, but ensure aria reflects it
    themeCheckbox.setAttribute('aria-checked', themeCheckbox.checked ? 'true' : 'false');
    themeCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      themeCheckbox.setAttribute('aria-checked', isChecked ? 'true' : 'false');
      // use Pico recommended data-theme on <html>
      setTheme(isChecked ? 'dark' : 'light');
      localStorage.setItem('theme', isChecked ? 'dark' : 'light');
    });
  }
}

// top-level helper so renderSection override can call it
function getSelectedGender() {
  // Prefer a stored answer (persisted when the user selects gender) so the
  // selected gender remains available after navigating away from the demographics
  // section (when the radio inputs have been removed from the DOM).
  if (answers && answers.gender) return answers.gender;
  const r = document.querySelector('input[name="gender"]:checked');
  return r ? r.value : 'all';
}

// apply gender-based hiding for any elements that carry data-gender-only
function applyGenderFilter() {
  const gender = (typeof getSelectedGender === 'function') ? getSelectedGender() : 'all';
  console.debug('applyGenderFilter() selectedGender=', gender);
  // make all visible first
  document.querySelectorAll('[data-gender-only]').forEach(n => n.removeAttribute('hidden'));
  if (gender !== 'all') {
    document.querySelectorAll('[data-gender-only]').forEach(n => {
      const match = (n.dataset.genderOnly === gender);
      if (!match) {
        n.setAttribute('hidden', '');
        console.debug('hiding gender-specific element', { id: n.id || null, dataset: n.dataset.genderOnly });
      } else {
        console.debug('showing gender-specific element', { id: n.id || null, dataset: n.dataset.genderOnly });
      }
    });
  }
}

function computeScore() {
  let total = 0;
  for (const k in answers) {
    const v = answers[k];
    if (typeof v === 'number') total += v;
  }
  return total;
}

// Hook into renderSection to handle gender-specific hiding after creating inputs
const originalRenderSection = renderSection;
renderSection = function(idx) {
  originalRenderSection(idx);
  // ensure gender filtering is applied after the section is rendered
  applyGenderFilter();
};

// small enhancement: when rendering questions that have gender_specific, mark them
// We need to patch renderMatrixQuestion/renderBinaryQuestion/renderSingleChoice to add data attributes when necessary

// To keep patch small, after loading survey we scan for gender_specific flags and wrap affected elements
function markGenderSpecificElements() {
  // run once after render
}

window.addEventListener('DOMContentLoaded', () => {
  initControls();
  loadSurvey().catch(err => {
    console.error(err);
    el('#survey-title').textContent = 'Błąd ładowania ankiety';
  });
});

// Export small debug bridge to window so DevTools console can access helpers when
// the script is loaded as a module (module scope doesn't expose these by default).
try {
  window.__debug = {
    getSelectedGender: () => getSelectedGender(),
    applyGenderFilter: () => applyGenderFilter(),
    answers: () => answers
  };
} catch (e) {}

// Theme toggle: apply saved preference or system preference
function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = saved ? (saved === 'dark') : prefersDark;
  setTheme(useDark ? 'dark' : 'light');
  const btn = el('#theme-toggle');
  if (btn) btn.setAttribute('aria-checked', useDark ? 'true' : 'false');
  // make sure the checkbox reflects the applied theme
  syncThemeToggle();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' ? false : true;
  setTheme(isDark ? 'dark' : 'light');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const btn = el('#theme-toggle');
  if (btn) btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
}

// set Pico-style theme on <html> by applying data-theme attribute
function setTheme(name) {
  try {
    if (name === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      // explicitly set light so behavior is deterministic
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {
    // fallback: do nothing
    console.warn('Failed to set theme:', e);
  }
  // keep the visible toggle in sync
  syncThemeToggle();
}

// Ensure toggle UI reflects the applied theme
function syncThemeToggle() {
  const cb = el('#theme-toggle');
  if (!cb) return;
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark';
  cb.checked = isDark;
  cb.setAttribute('aria-checked', isDark ? 'true' : 'false');
}



// Note: theme toggle is wired inside initControls() to ensure proper initialization
