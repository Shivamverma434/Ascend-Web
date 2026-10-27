/* Ascend: what PG exams actually score. QBank blocks (questions, correct, minutes) with a daily target that follows
   your 1.5x rule, grand tests scored the NEET PG and INICET way, a mistake log that re-tests each error until it
   sticks, "QBank first" topic states, and confidence checked against accuracy. Uses globals from app.js, exams.js,
   life.js and flow.js. */
'use strict';

// ---------- QBank ----------
const qbOn = (d) => (D.qbank || []).filter(q => q.date === d);
const qbSum = (list) => ({ n: sum(list, q => Number(q.n) || 0), c: sum(list, q => Number(q.c) || 0), min: sum(list, q => Number(q.min) || 0), g: sum(list, q => Number(q.g) || 0) });
const qbIn = (from, to) => qbSum((D.qbank || []).filter(q => q.date >= from && q.date <= to));
const pctOf = (s) => s.n ? Math.round(100 * s.c / s.n) : null;
const qbTopic = (tpId) => qbSum((D.qbank || []).filter(q => q.top === tpId && !q.re));
const hasQb = (tpId) => (D.qbank || []).some(q => q.top === tpId);
const resting = (d) => !!(D.settings.restUntil && d <= D.settings.restUntil);
const offDay = (d) => !!(D.reserve && D.reserve[d]) || resting(d);

// Daily target. Your rule: miss a day and the next day asks for 1.5x. Reserve days and rest mode do not count as misses.
function qbTarget(d = todayStr()) {
  const base = Number(D.settings.qbankDaily) || 0;
  if (!base || offDay(d)) return { n: 0, boosted: false };
  const y = addDays(d, -1);
  const started = (D.qbank || []).some(q => q.date <= y);
  const missed = started && !offDay(y) && qbSum(qbOn(y)).n < base;
  return { n: missed ? Math.round(base * 1.5) : base, boosted: missed };
}

// Exam timing: 54 s a question in INICET (200 in 3 h), about 70 s in NEET PG sections
const SEC_BUDGET = 54;

function qbankModal(pre = {}) {
  const exams = activeExams();
  if (!exams.length) { toast('Add your exam and its subjects first'); go('exams'); return; }
  let ex = examById(pre.exam) || examById(UI.examId) || nextExam() || exams[0];
  const subOpts = (e, sel) => `<option value="">Mixed subjects</option>` + e.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const topOpts = (e, sid, sel) => { const s = e.subjects.find(x => x.id === sid); return `<option value="">Whole subject or mixed</option>` + (s ? s.topics.map(tp => `<option value="${tp.id}" ${tp.id === sel ? 'selected' : ''}>${esc(tp.name)}${hasQb(tp.id) ? '' : ' (new)'}</option>`).join('') : ''); };
  const a = D.activeSession, mins = pre.min || (a ? Math.round(sessionElapsed(a) / 60) : '');
  const m = modal(`<h2>Log a QBank block</h2><p class="sub">Three numbers. Ascend works out accuracy, speed and your weakest topics.</p>
    <form>
      ${exams.length > 1 ? `<div class="field"><label>Exam</label><select class="input" name="exam">${exams.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>` : ''}
      <div class="row"><div class="field grow"><label>Subject</label><select class="input" name="sub">${subOpts(ex, pre.sub)}</select></div>
        <div class="field grow"><label>Topic</label><select class="input" name="top">${topOpts(ex, pre.sub, pre.top)}</select></div></div>
      <div class="row"><div class="field grow"><label>Questions</label><input class="input" type="number" name="n" min="1" max="500" required value="${esc(pre.n || '')}" placeholder="40"></div>
        <div class="field grow"><label>Correct</label><input class="input" type="number" name="c" min="0" max="500" required placeholder="29"></div>
        <div class="field grow"><label>Minutes</label><input class="input" type="number" name="min" min="0" max="600" value="${esc(mins)}" placeholder="40"></div></div>
      <div class="row"><div class="field grow"><label>Guessed (optional)</label><input class="input" type="number" name="g" min="0" max="500" placeholder="5"></div>
        <label class="row toggle-row grow" style="align-self:flex-end;margin-bottom:12px"><input type="checkbox" name="re"> Reattempt, not first time</label></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${icon('check')}Log it</button></div>
    </form>`);
  const f = $('form', m);
  f.addEventListener('change', (e) => {
    if (e.target.name === 'exam') { ex = examById(e.target.value); f.elements.sub.innerHTML = subOpts(ex, ''); f.elements.top.innerHTML = topOpts(ex, '', ''); }
    if (e.target.name === 'sub') f.elements.top.innerHTML = topOpts(ex, e.target.value, '');
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(f);
    const n = Number(fd.get('n')), c = Math.min(n, Number(fd.get('c')) || 0);
    const s = ex.subjects.find(x => x.id === fd.get('sub')), tp = s && s.topics.find(x => x.id === fd.get('top'));
    const q = { id: uid(), date: todayStr(), exam: ex.id, sub: s ? s.id : '', top: tp ? tp.id : '', subName: s ? s.name : 'Mixed', topName: tp ? tp.name : '', n, c, min: Number(fd.get('min')) || 0, g: Number(fd.get('g')) || 0, re: fd.get('re') === 'on' };
    D.qbank.push(q); save(); closeModal();
    const tg = qbTarget(), done = qbSum(qbOn(todayStr())).n;
    toast(`${n} questions, ${Math.round(100 * c / n)}% correct${tg.n ? ` · ${done}/${tg.n} today` : ''}`);
    if (tg.n && done >= tg.n && done - n < tg.n) setTimeout(() => { confetti(100); chime('done'); }, 300);
    rerender();
  });
}

// Topics by weakness: low first-attempt accuracy, enough questions to mean something
function topicRows(ex) {
  const rows = [];
  for (const s of ex.subjects) for (const tp of s.topics) { const q = qbTopic(tp.id); if (q.n) rows.push({ s, tp, q, acc: pctOf(q), conf: lastConf(tp) }); }
  return rows;
}
function subjectRows(ex) {
  return ex.subjects.map(s => { const list = (D.qbank || []).filter(q => q.sub === s.id && !q.re); const q = qbSum(list); return { s, q, acc: pctOf(q), last: list.map(x => x.date).sort().pop() || '' }; });
}

function qbankTab(ex) {
  const T = todayStr(), tg = qbTarget(T), today = qbSum(qbOn(T)), w = qbIn(addDays(T, -6), T), mo = qbIn(addDays(T, -29), T);
  const spq = mo.n && mo.min ? Math.round(60 * mo.min / mo.n) : null;
  const subs = subjectRows(ex), tops = topicRows(ex);
  const tried = subs.filter(r => r.q.n >= 10).sort((a, b) => a.acc - b.acc), untouched = subs.filter(r => !r.q.n);
  const weak = tops.filter(r => r.q.n >= 10).sort((a, b) => a.acc - b.acc).slice(0, 8);
  const over = tops.filter(r => r.q.n >= 10 && r.conf >= 4 && r.acc < 60), under = tops.filter(r => r.q.n >= 10 && r.conf && r.conf <= 2 && r.acc >= 75);
  const days = range(addDays(T, -13), T).map(d => { const s = qbSum(qbOn(d)); return { label: parseDay(d).getDate() + '', value: s.n, tip: `${shortDay(d)}: ${s.n} questions${s.n ? `, ${pctOf(s)}%` : ''}` }; });
  const recent = (D.qbank || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const tile = (v, label, cls = '') => `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`;
  return `
  <div class="stat-row" style="margin-top:20px">
    ${tile(`${today.n}${tg.n ? `<small>/${tg.n}</small>` : ''}`, tg.boosted ? 'today · 1.5x after a missed day' : tg.n ? 'questions today' : 'questions today · set a daily target', 'accent')}
    ${tile(`${w.n}${w.n ? ` <small>${pctOf(w)}%</small>` : ''}`, 'last 7 days')}
    ${tile(`${mo.n}${mo.n ? ` <small>${pctOf(mo)}%</small>` : ''}`, 'last 30 days')}
    ${tile(spq ? `${spq}s` : '–', `per question · INICET allows ${SEC_BUDGET}s`, spq && spq > SEC_BUDGET ? 'warn' : '')}
  </div>
  <div class="grid g-main" style="margin-top:18px">
    <div class="grid" style="align-content:start">
      <section class="panel"><div class="panel-head"><h3>Questions a day</h3><div class="row" style="gap:6px"><button class="btn sm ghost" data-act="qb-target">${icon('edit')}Daily target${D.settings.qbankDaily ? `: ${D.settings.qbankDaily}` : ''}</button><button class="btn sm primary" data-act="qb-log">${icon('plus')}Log block</button></div></div>
        ${barChart(days, { color: '#5A3CF0', height: 130, fmt: (v) => String(Math.round(v)) })}</section>
      <section class="panel"><div class="panel-head"><h3>Subjects, weakest first</h3><span class="muted" style="font-size:12px">first attempts only</span></div>
        ${tried.length ? `<div class="qb-table">${tried.map(r => `<div class="qb-row"><span class="dot" style="background:${r.s.color}"></span><b class="grow">${esc(r.s.name)}</b><span class="muted">${r.q.n} Qs · ${shortDay(r.last)}</span><i class="qb-bar"><b style="width:${r.acc}%;background:${r.acc >= 70 ? 'var(--on)' : r.acc >= 55 ? 'var(--adjust)' : 'var(--off)'}"></b></i><b class="qb-acc">${r.acc}%</b></div>`).join('')}</div>` : '<p class="muted">Log at least 10 questions in a subject to rank it.</p>'}
        ${untouched.length ? `<p class="muted" style="font-size:12.5px;margin-top:10px">No questions yet (unknown, not weak): ${untouched.map(r => esc(r.s.name)).join(', ')}</p>` : ''}</section>
    </div>
    <div class="grid" style="align-content:start">
      <section class="panel"><div class="panel-head"><h3>Weakest topics</h3><span class="muted" style="font-size:12px">10+ questions</span></div>
        ${weak.length ? weak.map(r => `<div class="qb-row"><span class="grow">${esc(r.tp.name)} <span class="muted" style="font-size:12px">${esc(r.s.name)} · ${r.q.n} Qs</span></span><b class="qb-acc" style="color:${r.acc >= 70 ? 'var(--on)' : r.acc >= 55 ? '#A86400' : 'var(--off)'}">${r.acc}%</b></div>`).join('') : '<p class="muted">Pick a topic when you log a block and the weak ones show up here.</p>'}</section>
      <section class="panel"><div class="panel-head"><h3>Confidence vs accuracy</h3></div>
        ${over.length || under.length ? `${over.map(r => `<div class="qb-row"><span class="chip status-off">Overconfident</span><span class="grow">${esc(r.tp.name)}</span><span class="muted">felt ${CONF[r.conf - 1].label.toLowerCase()}, scored ${r.acc}%</span></div>`).join('')}${under.map(r => `<div class="qb-row"><span class="chip status-on">Better than you think</span><span class="grow">${esc(r.tp.name)}</span><span class="muted">felt ${CONF[r.conf - 1].label.toLowerCase()}, scored ${r.acc}%</span></div>`).join('')}<p class="muted" style="font-size:12px;margin-top:8px">Revise overconfident topics first: feeling sure is not the same as knowing.</p>`
          : '<p class="muted">Compares how well you rated a topic with how you score on it. Shows up once topics have 10+ questions and a rating.</p>'}</section>
      <section class="panel"><div class="panel-head"><h3>Recent blocks</h3></div>
        ${recent.length ? recent.map(q => `<div class="qb-row"><span class="grow">${esc(q.topName || q.subName)}${q.topName ? ` <span class="muted" style="font-size:12px">${esc(q.subName)}</span>` : ''}${q.re ? ' <span class="chip">reattempt</span>' : ''}</span><span class="muted">${shortDay(q.date)} · ${q.c}/${q.n}${q.min ? ` · ${q.min}m` : ''}</span><button class="icon-btn" data-act="qb-del" data-id="${q.id}" title="Remove">${icon('trash')}</button></div>`).join('') : '<p class="muted">Your QBank blocks will show here.</p>'}</section>
    </div>
  </div>`;
}

// ---------- Grand tests ----------
const GT_KINDS = { neet: { label: 'NEET PG', right: 4, wrong: -1, q: 180 }, inicet: { label: 'INICET', right: 1, wrong: -1 / 3, q: 200 }, other: { label: 'Other', right: 1, wrong: 0, q: 0 } };
const gtScore = (t) => { const k = GT_KINDS[t.kind] || GT_KINDS.other; return round1(t.correct * k.right + t.wrong * k.wrong); };
const gtMax = (t) => { const k = GT_KINDS[t.kind] || GT_KINDS.other; return (t.correct + t.wrong + t.skipped) * k.right; };
function gtModal() {
  const m = modal(`<h2>Log a grand test</h2><p class="sub">Ascend scores it the exam's way and books a review block for today.</p>
    <form>
      <div class="row"><div class="field grow"><label>Test</label><input class="input" name="name" required maxlength="60" placeholder="Marrow GT 12"></div>
        <div class="field"><label>Marking</label><select class="input" name="kind">${Object.entries(GT_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field grow"><label>Correct</label><input class="input" type="number" name="correct" min="0" required></div>
        <div class="field grow"><label>Wrong</label><input class="input" type="number" name="wrong" min="0" required></div>
        <div class="field grow"><label>Skipped</label><input class="input" type="number" name="skipped" min="0" value="0"></div></div>
      <div class="row"><div class="field grow"><label>Guessed (optional)</label><input class="input" type="number" name="guessed" min="0"></div>
        <div class="field grow"><label>Guesses right</label><input class="input" type="number" name="guessRight" min="0"></div>
        <div class="field grow"><label>All-India rank</label><input class="input" type="number" name="rank" min="1"></div></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${icon('check')}Log test</button></div>
    </form>`);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target), num = (k) => Number(fd.get(k)) || 0;
    const t = { id: uid(), date: todayStr(), name: String(fd.get('name')).trim(), kind: fd.get('kind'), correct: num('correct'), wrong: num('wrong'), skipped: num('skipped'), guessed: num('guessed'), guessRight: num('guessRight'), rank: num('rank') || null };
    D.gts.push(t);
    // Rankers spend about 2 hours reviewing every 50 questions: book it while the test is fresh
    const q = t.correct + t.wrong + t.skipped, hrs = Math.max(1, Math.round(q / 50 * 2));
    const it = { id: uid(), title: `Review ${t.name}: every wrong, guessed and skipped question (about ${hrs}h)`, goalId: '', done: false };
    day(todayStr()).targets.push(it); markDirty(it);
    save(); closeModal(); toast(`Scored ${gtScore(t)}/${gtMax(t)}. Review block added to today.`); rerender();
  });
}
function gtChart(list) {
  if (list.length < 2) return '';
  const W = 520, H = 120, ys = list.map(t => 100 * gtScore(t) / Math.max(1, gtMax(t))), lo = Math.min(...ys) - 5, hi = Math.max(...ys) + 5;
  const pt = (i) => [(i / (list.length - 1) * (W - 20) + 10).toFixed(1), (H - 10 - (ys[i] - lo) / (hi - lo) * (H - 20)).toFixed(1)];
  return `<svg class="gt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${ys.map((_, i) => (i ? 'L' : 'M') + pt(i).join(' ')).join(' ')}" fill="none" stroke="var(--violet)" stroke-width="2.5" stroke-linejoin="round"/>${ys.map((y, i) => `<circle cx="${pt(i)[0]}" cy="${pt(i)[1]}" r="4" fill="var(--violet)"><title>${esc(list[i].name)}: ${Math.round(y)}%</title></circle>`).join('')}</svg>`;
}

// ---------- Mistake log: each error comes back until you get it right three times in a row ----------
const ERROR_TYPES = ['Did not know it', 'Forgot it', 'Mixed up two things', 'Misread the question', 'Silly slip', 'Guessed blind', 'Calculation error', 'Misread an image'];
const MK_GAPS = [1, 3, 7, 14, 30];
const mkDue = (T = todayStr()) => (D.mistakes || []).filter(x => !x.done && x.due <= T);
function mistakeModal(pre = {}) {
  const ex = examById(UI.examId) || nextExam() || activeExams()[0];
  const m = modal(`<h2>Log a mistake</h2><p class="sub">It comes back tomorrow, then after 3, 7, 14 and 30 days until you get it right three times running.</p>
    <form>
      <div class="field"><label>What was it about?</label><input class="input" name="note" required maxlength="160" placeholder="Rule of 2 in Meckel's diverticulum vs the rule of 9s"></div>
      <div class="row"><div class="field grow"><label>Why you got it wrong</label><select class="input" name="type">${ERROR_TYPES.map((t, i) => `<option value="${i}">${t}</option>`).join('')}</select></div>
        ${ex ? `<div class="field grow"><label>Subject</label><select class="input" name="sub"><option value="">None</option>${ex.subjects.map(s => `<option value="${s.id}" ${s.id === pre.sub ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}</div>
      <div class="field"><label>The lesson, in one line</label><input class="input" name="lesson" maxlength="200" placeholder="Read the last line of the stem first"></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${icon('check')}Save</button></div>
    </form>`);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target), s = ex && ex.subjects.find(x => x.id === fd.get('sub'));
    D.mistakes.push({ id: uid(), date: todayStr(), note: String(fd.get('note')).trim(), type: Number(fd.get('type')) || 0, lesson: String(fd.get('lesson') || '').trim(), sub: s ? s.id : '', subName: s ? s.name : '', due: addDays(todayStr(), 1), k: 0, reviews: [] });
    save(); closeModal(); toast('Saved. It comes back tomorrow.'); rerender();
  });
}
function reviewMistake(id, ok) {
  const x = (D.mistakes || []).find(m => m.id === id); if (!x) return;
  x.reviews = [...(x.reviews || []), { d: todayStr(), ok }];
  x.k = ok ? (x.k || 0) + 1 : 0;
  if (x.k >= 3) { x.done = true; toast('Retired: right three times in a row.'); }
  else x.due = addDays(todayStr(), ok ? MK_GAPS[Math.min(x.k, MK_GAPS.length - 1)] : 1);
  save(); rerender();
}

function testsTab() {
  const gts = (D.gts || []).slice().sort((a, b) => a.date.localeCompare(b.date)), last = gts[gts.length - 1];
  const due = mkDue(), open = (D.mistakes || []).filter(x => !x.done);
  const byType = ERROR_TYPES.map((t, i) => ({ t, n: (D.mistakes || []).filter(x => x.type === i).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const guess = gts.filter(t => t.guessed), gAcc = guess.length ? Math.round(100 * sum(guess, t => t.guessRight) / Math.max(1, sum(guess, t => t.guessed))) : null;
  return `
  <div class="grid g-main" style="margin-top:20px">
    <div class="grid" style="align-content:start">
      <section class="panel"><div class="panel-head"><h3>Grand tests</h3><button class="btn sm primary" data-act="gt-log">${icon('plus')}Log test</button></div>
        ${gts.length ? `${gtChart(gts)}
        <div class="qb-table">${gts.slice().reverse().slice(0, 12).map(t => `<div class="qb-row"><b class="grow">${esc(t.name)} <span class="muted" style="font-size:12px;font-weight:500">${shortDay(t.date)} · ${GT_KINDS[t.kind] ? GT_KINDS[t.kind].label : ''}</span></b><span class="muted">${t.correct}✓ ${t.wrong}✗ ${t.skipped} skipped${t.rank ? ` · AIR ${t.rank.toLocaleString()}` : ''}</span><b class="qb-acc">${gtScore(t)}<small>/${gtMax(t)}</small></b><button class="icon-btn" data-act="gt-del" data-id="${t.id}" title="Remove">${icon('trash')}</button></div>`).join('')}</div>
        ${gAcc !== null ? `<p class="muted" style="font-size:12.5px;margin-top:10px">Your guesses are right ${gAcc}% of the time. A blind guess is worth +0.25 marks in NEET PG and nothing in INICET, so in INICET only guess after ruling out an option.</p>` : ''}`
          : '<p class="muted">Log each grand test: score, rank and how many you guessed. Rankers in 2025 wrote one every 10 to 15 days and reviewed it the same day.</p>'}</section>
    </div>
    <div class="grid" style="align-content:start">
      <section class="panel"><div class="panel-head"><h3>Mistakes to re-test${due.length ? ` · ${due.length} due` : ''}</h3><button class="btn sm" data-act="mk-log">${icon('plus')}Mistake</button></div>
        ${due.length ? due.slice(0, 12).map(x => `<div class="mk-row"><div class="grow"><b>${esc(x.note)}</b>${x.lesson ? `<p class="muted" style="font-size:12.5px">Lesson: ${esc(x.lesson)}</p>` : ''}<span class="muted" style="font-size:11.5px">${esc(ERROR_TYPES[x.type] || '')}${x.subName ? ' · ' + esc(x.subName) : ''} · right ${x.k || 0} of 3</span></div>
          <div class="row" style="gap:6px"><button class="btn sm" data-act="mk-ok" data-id="${x.id}">${icon('check')}Got it</button><button class="btn sm ghost" data-act="mk-miss" data-id="${x.id}">Missed</button></div></div>`).join('')
          : `<p class="muted">${open.length ? `Nothing due today. ${open.length} mistake${open.length === 1 ? '' : 's'} waiting for their next test.` : 'Log the questions you get wrong. Each one comes back until you get it right three times running.'}</p>`}</section>
      ${byType.length ? `<section class="panel"><div class="panel-head"><h3>Why you lose marks</h3></div>${byType.map(x => `<div class="qb-row"><span class="grow">${x.t}</span><i class="qb-bar"><b style="width:${100 * x.n / byType[0].n}%;background:var(--violet)"></b></i><b class="qb-acc">${x.n}</b></div>`).join('')}</section>` : ''}
    </div>
  </div>`;
}

// ---------- Today ----------
function qbankTodayCard() {
  const T = todayStr(), tg = qbTarget(T), s = qbSum(qbOn(T)), due = mkDue(T).length;
  if (!tg.n && !s.n && !(D.qbank || []).length && !due) return '';
  return `<section class="panel qb-card"><div class="panel-head"><h3>${icon('exams', 'style="width:16px;height:16px;color:#5A3CF0;vertical-align:-2px"')} QBank</h3><button class="btn sm primary" data-act="qb-log">${icon('plus')}Log</button></div>
    <div class="row" style="gap:10px;align-items:baseline"><b class="qb-big">${s.n}${tg.n ? `<small>/${tg.n}</small>` : ''}</b><span class="muted" style="font-size:13px">${s.n ? `${pctOf(s)}% correct today` : 'questions today'}${tg.boosted ? ' · 1.5x after a missed day' : ''}</span></div>
    ${tg.n ? `<div class="progress-bar thin" style="margin-top:8px"><i style="width:${Math.min(100, 100 * s.n / tg.n)}%;background:#5A3CF0"></i></div>` : ''}
    ${due ? `<button class="btn ghost sm" data-act="mk-open" style="margin-top:8px">${due} mistake${due === 1 ? '' : 's'} to re-test</button>` : ''}</section>`;
}

// ---------- Goals, habits and life areas ----------
Object.assign(METRICS, {
  questions: { label: 'QBank questions', unit: 'questions', areas: ['study'], hint: 'Counts every question you log in Exams › QBank. What PG exams score is questions, not hours.' },
  gts: { label: 'Grand tests', unit: 'tests', areas: ['study'], hint: 'Counts the grand tests you log in Exams › Tests.' }
});
Object.assign(METRIC_DEFAULTS, { questions: 3000, gts: 6 });
const lifeProgressPlain = lifeProgress;
lifeProgress = function (g, from, until) {
  if (g.metric === 'questions') return qbIn(from, until).n;
  if (g.metric === 'gts') return (D.gts || []).filter(t => t.date >= from && t.date <= until).length;
  return lifeProgressPlain(g, from, until);
};
HABIT_AUTO.qbank = { label: 'QBank questions at least', input: 'n', unit: 'questions', def: 40, test: (d, g) => qbSum(qbOn(d)).n >= (Number(g.autoN) || 40) };

// "QBank first, never read notes cold": warn when a new topic is marked learned with no questions on it
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-act=exam-tick]') && e.target.closest('[data-kind=learn]');
  if (row && !hasQb(row.dataset.top)) setTimeout(() => toast('QBank first: do questions on this topic before reading notes.'), 50);
}, true);

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'qb-log': qbankModal(); break;
    case 'qb-topic': { closeModal(); setTimeout(() => qbankModal({ exam: a.dataset.ex, sub: a.dataset.subj, top: a.dataset.top }), 200); break; }
    case 'qb-del': if (confirmInline(a, 'Remove?')) { D.qbank = D.qbank.filter(q => q.id !== a.dataset.id); save(); rerender(); } break;
    case 'qb-target': {
      const m = modal(`<h2>Daily QBank target</h2><p class="sub">Miss it and tomorrow asks for 1.5x. Reserve days and rest mode do not count as misses.</p>
        <form><div class="field"><label>Questions a day</label><input class="input" type="number" name="n" min="0" max="1000" value="${Number(D.settings.qbankDaily) || ''}" placeholder="60"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
      $('form', m).addEventListener('submit', (ev) => { ev.preventDefault(); D.settings.qbankDaily = Number(new FormData(ev.target).get('n')) || 0; save(); closeModal(); rerender(); });
      break;
    }
    case 'gt-log': gtModal(); break;
    case 'gt-del': if (confirmInline(a, 'Remove?')) { D.gts = D.gts.filter(t => t.id !== a.dataset.id); save(); rerender(); } break;
    case 'mk-log': mistakeModal(); break;
    case 'mk-ok': reviewMistake(a.dataset.id, true); break;
    case 'mk-miss': reviewMistake(a.dataset.id, false); break;
    case 'mk-open': UI.exTab = 'tests'; go('exams'); break;
  }
});
