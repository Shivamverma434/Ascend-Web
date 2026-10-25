/* Ascend: exam planner. Subjects and topics with spaced revision (1, 3, 7, 14 and 30 days after you
   learn a topic), a daily plan paced to the exam date, and a countdown. Uses globals from app.js. */
'use strict';

const REV_GAPS = [1, 3, 7, 14, 30];
const SUBJECT_COLORS = ['#FF6B4A', '#8B4C9E', '#0E9AA7', '#F2547D', '#E8930C', '#2FA36B', '#5A6FD8', '#B0487A'];

const activeExams = () => (D.exams || []).filter(e => !e.archived).sort((a, b) => a.date.localeCompare(b.date));
function nextExam() { const t = todayStr(); return activeExams().find(e => e.date >= t) || null; }
function examById(id) { return (D.exams || []).find(e => e.id === id); }
function allTopics(ex) { return ex.subjects.flatMap(s => s.topics.map(tp => ({ s, tp }))); }

// How well you knew a topic each time you studied it (the colours of a retrospective revision timetable)
const CONF = [
  { v: 1, label: 'No idea', c: '#FF4D4D', ink: '#fff' }, { v: 2, label: 'Shaky', c: '#FFA64D', ink: '#2B1D2E' }, { v: 3, label: 'Okay', c: '#FFE866', ink: '#2B1D2E' },
  { v: 4, label: 'Good', c: '#7EE07E', ink: '#2B1D2E' }, { v: 5, label: 'Nailed it', c: '#2FA84F', ink: '#fff' }
];
const sessionsOf = (tp) => tp.learned ? [tp.learned, ...(tp.revs || [])] : [];
const confOn = (tp, d) => (tp.conf || {})[d] || 3;
const lastConf = (tp) => { const s = sessionsOf(tp); return s.length ? confOn(tp, s[s.length - 1]) : 0; };

function topicState(tp, t = todayStr()) {
  if (!tp.learned) return { key: 'new', label: 'Not started' };
  const n = (tp.revs || []).length;
  const last = n ? tp.revs[n - 1] : tp.learned;
  const L = confOn(tp, last);
  if (n >= REV_GAPS.length && L >= 4) return { key: 'strong', label: 'Strong' };
  // Shaky topics come back sooner, confident ones later
  const base = n >= REV_GAPS.length ? 7 : REV_GAPS[n];
  const gap = L <= 1 ? 1 : L === 2 ? Math.max(1, Math.round(base / 2)) : L >= 5 ? Math.round(base * 1.5) : base;
  const due = addDays(last, gap);
  if (due <= t) return { key: 'due', label: daysBetween(due, t) ? `Revision ${n + 1}, ${daysBetween(due, t)}d overdue` : `Revision ${n + 1} due today`, due, over: daysBetween(due, t) };
  return { key: 'learned', label: `Next revision ${shortDay(due)}`, due };
}
const touchedOn = (tp, d) => tp.learned === d || (tp.revs || []).includes(d);

function examStats(ex) {
  const all = allTopics(ex);
  const st = all.map(x => topicState(x.tp).key);
  const n = all.length || 1;
  return { total: all.length, learned: st.filter(k => k !== 'new').length, strong: st.filter(k => k === 'strong').length, due: st.filter(k => k === 'due').length, pctLearned: Math.round(100 * st.filter(k => k !== 'new').length / n), daysLeft: Math.max(0, daysBetween(todayStr(), ex.date)) };
}

// Today's plan: every revision that is due, plus enough new topics to finish learning a week before the exam.
function examPlan(ex) {
  const t = todayStr();
  const all = allTopics(ex);
  const due = all.filter(x => topicState(x.tp).key === 'due').sort((a, b) => topicState(b.tp).over - topicState(a.tp).over).slice(0, 10);
  const fresh = all.filter(x => !x.tp.learned);
  const daysLeft = Math.max(1, daysBetween(t, ex.date));
  const learnDays = Math.max(1, daysLeft > 10 ? daysLeft - 7 : daysLeft);
  const learnedToday = all.filter(x => x.tp.learned === t).length;
  const perDay = Math.ceil((fresh.length + learnedToday) / learnDays);
  const quota = Math.max(0, perDay - learnedToday);
  // Round-robin across subjects, in the order you entered topics
  const queues = ex.subjects.map(s => s.topics.filter(tp => !tp.learned).map(tp => ({ s, tp })));
  const learn = [];
  for (let i = 0; learn.length < quota && queues.some(q => q.length); i++) { const q = queues[i % queues.length]; if (q.length) learn.push(q.shift()); }
  const doneToday = all.filter(x => touchedOn(x.tp, t));
  return { due, learn, perDay, doneToday };
}

function setTopic(tp, kind, on, d = todayStr(), level = 3) {
  tp.revs = tp.revs || []; tp.conf = tp.conf || {};
  if (kind === 'learn') tp.learned = on ? (tp.learned || d) : (tp.learned === d ? null : tp.learned);
  if (kind === 'rev') { if (on && !tp.revs.includes(d) && tp.learned !== d) tp.revs.push(d); if (!on) tp.revs = tp.revs.filter(x => x !== d); }
  if (on) tp.conf[d] = level; else if (!touchedOn(tp, d)) delete tp.conf[d];
  if (!tp.learned) { tp.revs = []; tp.conf = {}; }
}
// Learn it if new, otherwise count today as a revision (or re-rate today's session)
function studyTopic(tp, level) { setTopic(tp, tp.learned ? 'rev' : 'learn', true, todayStr(), level); }

function askConfidence(title, done) {
  const m = modal(`<h2>How well do you know it now?</h2><p class="sub">${esc(title)}</p>
    <div class="conf-pick">${CONF.map(c => `<button type="button" data-conf="${c.v}" style="--cc:${c.c};--ci:${c.ink}"><b>${c.v}</b>${c.label}</button>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Shaky topics come back sooner. Confident ones wait longer.</p>`);
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-conf]'); if (!b) return; closeModal(); done(Number(b.dataset.conf), b); });
}

// Ticking a target that came from the exam plan marks the topic too.
function examTargetToggled(tg) {
  const r = tg.examRef; if (!r) return;
  const ex = examById(r.exam); const s = ex && ex.subjects.find(x => x.id === r.subject); const tp = s && s.topics.find(x => x.id === r.topic);
  if (!tp) return;
  setTopic(tp, r.kind, tg.done);
  save();
}

// ---------- View ----------
function viewExams() {
  const exams = activeExams();
  if (!exams.length) return `
    <div class="view-head"><div><h1>Exams</h1><p class="sub">Add your exam, its subjects and topics. Ascend spaces your revision and paces new topics so you finish in time.</p></div></div>
    <section class="panel empty"><div class="empty-art">${icon('exams')}</div><h3>Plan your first exam</h3><p>Topics you learn come back for revision after 1, 3, 7, 14 and 30 days, the spacing that makes things stick.</p><button class="btn primary" data-act="exam-new">${icon('plus')}Add an exam</button></section>`;
  const ex = examById(UI.examId) && !examById(UI.examId).archived ? examById(UI.examId) : (nextExam() || exams[0]);
  UI.examId = ex.id;
  const st = examStats(ex);
  const plan = examPlan(ex);
  const row = (x, kind) => { const s = topicState(x.tp); return `<div class="target ex-row" data-ex="${ex.id}" data-sub="${x.s.id}" data-top="${x.tp.id}" data-kind="${kind}"><button class="check" data-act="exam-tick" aria-label="Mark done">${icon('check', 'stroke-width="3"')}</button><span class="t-title">${esc(x.tp.name)}</span><span class="t-meta"><span class="chip"><span class="dot" style="background:${x.s.color}"></span>${esc(x.s.name)}</span><span class="muted ex-when">${kind === 'rev' ? esc(s.label) : 'New'}</span></span></div>`; };
  const done = plan.doneToday;
  return `
  <div class="view-head"><div><h1>Exams</h1><p class="sub">${esc(thoughtFor('day', daySeed()))}</p></div>
    <div class="row">${exams.length > 1 ? `<select class="input" data-act="exam-pick" style="width:auto">${exams.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>` : ''}
      <div class="seg big-seg"><button data-extab="plan" class="${UI.exTab !== 'table' ? 'on' : ''}">Plan</button><button data-extab="table" class="${UI.exTab === 'table' ? 'on' : ''}">Timetable</button></div>
      <button class="btn ghost" data-act="exam-new">${icon('plus')}Exam</button></div></div>
  <section class="exam-hero">
    <div class="ex-count"><b data-count="${st.daysLeft}">${st.daysLeft}</b><span>day${st.daysLeft === 1 ? '' : 's'} to go</span></div>
    <div class="grow"><span class="eyebrow">${esc(dayName(ex.date))}</span><h2>${esc(ex.name)}</h2>
      <div class="ex-bars"><div><span>Learned</span><i><b style="width:${st.pctLearned}%"></b></i><em>${st.learned}/${st.total}</em></div><div><span>Strong</span><i><b style="width:${st.total ? Math.round(100 * st.strong / st.total) : 0}%;background:var(--gold)"></b></i><em>${st.strong}/${st.total}</em></div></div>
      <p class="ex-pace">${st.total ? (st.learned < st.total ? `Learn about <b>${plan.perDay}</b> new topic${plan.perDay === 1 ? '' : 's'} a day to finish ${st.daysLeft > 10 ? 'a week early, leaving time to revise' : 'in time'}.` : 'Every topic learned. Now it is all revision.') : 'Add subjects and topics to get a plan.'}</p></div>
    <button class="icon-btn" data-act="exam-edit" title="Edit exam">${icon('edit')}</button>
  </section>
  ${UI.exTab === 'table' ? timetableHTML(ex) : `
  <div class="grid g-main" style="margin-top:20px">
    <section class="panel">
      <div class="panel-head"><div><h2>Today's plan</h2><p class="muted">${plan.due.length} revision${plan.due.length === 1 ? '' : 's'} due · ${plan.learn.length} new · ${done.length} done today</p></div>
        ${plan.due.length + plan.learn.length ? `<button class="btn sm" data-act="exam-to-targets">${icon('plus')}Add to today's targets</button>` : ''}</div>
      ${plan.due.length ? `<h4 class="ex-h">Revise</h4><div class="target-list">${plan.due.map(x => row(x, 'rev')).join('')}</div>` : ''}
      ${plan.learn.length ? `<h4 class="ex-h">Learn</h4><div class="target-list">${plan.learn.map(x => row(x, 'learn')).join('')}</div>` : ''}
      ${!plan.due.length && !plan.learn.length ? `<div class="empty"><p>${st.total ? 'Nothing left for today. Rest, or get ahead by revising a weak subject.' : 'Add a subject with its topics to start.'}</p></div>` : ''}
      ${done.length ? `<h4 class="ex-h">Done today</h4><div class="ex-done">${done.map(x => `<span class="chip status-on">✓ ${esc(x.tp.name)}</span>`).join('')}</div>` : ''}
    </section>
    <section class="panel">
      <div class="panel-head"><h3>Subjects</h3><button class="btn sm" data-act="subject-new">${icon('plus')}Subject</button></div>
      <div class="ex-subjects">${ex.subjects.map(s => { const ts = s.topics.map(tp => topicState(tp).key); const n = ts.length || 1; return `<div class="ex-sub" data-sub="${s.id}">
        <div class="row" style="justify-content:space-between"><b><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</b><span class="row" style="gap:2px"><span class="muted" style="font-size:12px">${ts.filter(k => k !== 'new').length}/${ts.length}${ts.filter(k => k === 'due').length ? ` · <span style="color:var(--ember)">${ts.filter(k => k === 'due').length} due</span>` : ''}</span><button class="icon-btn" data-act="subject-edit" title="Edit subject">${icon('edit')}</button></span></div>
        <div class="ex-stack"><i style="width:${100 * ts.filter(k => k === 'strong').length / n}%;background:var(--gold)"></i><i style="width:${100 * ts.filter(k => k === 'learned').length / n}%;background:${s.color}"></i><i style="width:${100 * ts.filter(k => k === 'due').length / n}%;background:var(--ember)"></i></div>
        <div class="ex-topics">${s.topics.map(tp => { const k = topicState(tp); return `<button class="ex-topic ${k.key}" data-act="topic-open" data-top="${tp.id}" data-tip="${esc(tp.name + ' · ' + k.label)}">${esc(tp.name)}</button>`; }).join('')}</div>
      </div>`; }).join('') || '<p class="muted">No subjects yet.</p>'}</div>
      <div class="chart-legend" style="font-size:12px"><span><i class="lg new"></i>Not started</span><span><i class="lg learned"></i>Learned</span><span><i class="lg due"></i>Revision due</span><span><i class="lg strong"></i>Strong</span></div>
    </section>
  </div>`}`;
}

// ---------- Retrospective timetable: one row per topic, one coloured cell per study session ----------
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
function nextLabel(tp) {
  const k = topicState(tp);
  if (k.key === 'new') return { text: '', cls: '' };
  if (k.key === 'strong') return { text: 'Strong ✓', cls: 'strong' };
  if (k.key === 'due') return { text: k.over ? `Overdue ${k.over}d` : 'Today', cls: 'due' };
  return { text: parseDay(k.due).toLocaleDateString(undefined, { weekday: 'long' }) + (daysBetween(todayStr(), k.due) > 6 ? ' ' + ddmm(k.due) : ''), cls: 'later' };
}
function timetableHTML(ex) {
  const s = ex.subjects.find(x => x.id === UI.exSub) || ex.subjects[0];
  if (!s) return `<section class="panel" style="margin-top:20px"><div class="empty"><p>Add a subject to see its timetable.</p><button class="btn primary" data-act="subject-new">${icon('plus')}Subject</button></div></section>`;
  UI.exSub = s.id;
  const cols = Math.max(1, ...s.topics.map(tp => sessionsOf(tp).length));
  const cell = (tp, d) => { const c = CONF[confOn(tp, d) - 1]; return `<td class="tt-c" style="background:${c.c};color:${c.ink}" data-tip="${esc(shortDay(d) + ' · ' + c.label)}">${ddmm(d)}</td>`; };
  return `
  <section class="panel tt-panel" style="margin-top:20px">
    <div class="panel-head"><div class="seg tt-tabs">${ex.subjects.map(x => `<button data-exsub="${x.id}" class="${x.id === s.id ? 'on' : ''}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('')}</div>
      <div class="row">${ex.sheetUrl ? `<button class="btn ghost sm" data-act="sheet-open">${icon('external')}Open Sheet</button><button class="btn sm" data-act="sheet-sync">${icon('sync')}Sync Sheet</button>` : `<button class="btn sm" data-act="sheet-sync">${icon('google')}Create Google Sheet</button>`}</div></div>
    <div class="tt-scroll"><table class="tt">
      <thead><tr><th>Topic</th>${Array.from({ length: cols }, (_, i) => `<th>${i ? 'Rev ' + i : 'Learned'}</th>`).join('')}<th>Next</th></tr></thead>
      <tbody>${s.topics.map(tp => { const lc = lastConf(tp), c = lc ? CONF[lc - 1] : null, nx = nextLabel(tp), ss = sessionsOf(tp); return `<tr data-sub="${s.id}">
        <td class="tt-topic" data-act="topic-open" data-top="${tp.id}" style="${c ? `background:${c.c};color:${c.ink}` : ''}">${esc(tp.name)}</td>
        ${ss.map(d => cell(tp, d)).join('')}${'<td></td>'.repeat(cols - ss.length)}<td class="tt-next ${nx.cls}">${esc(nx.text)}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <div class="chart-legend" style="font-size:12px">${CONF.map(c => `<span><i class="lg" style="background:${c.c}"></i>${c.label}</span>`).join('')}<span class="muted">${ex.sheetAt ? 'Sheet synced ' + ago(ex.sheetAt) : 'Click a topic to rate it after you study'}</span></div>
  </section>`;
}

// ---------- Google Sheet: the same timetable, written by your own Google script ----------
const hexOr = (c) => c || '#ffffff';
function sheetPayload(ex) {
  const st = examStats(ex);
  const overview = [['Ascend revision timetable', ex.name], ['Exam date', ddmm(ex.date) + '/' + ex.date.slice(0, 4)], ['Days left', String(st.daysLeft)], ['Last updated', new Date().toLocaleString()], ['', ''], ['Subject', 'Topics', 'Learned', 'Strong', 'Revisions due']];
  const ovRows = overview.map(r => [...r, ...Array(5 - r.length).fill('')]);
  ex.subjects.forEach(s => { const ks = s.topics.map(tp => topicState(tp).key); ovRows.push([s.name, String(ks.length), String(ks.filter(k => k !== 'new').length), String(ks.filter(k => k === 'strong').length), String(ks.filter(k => k === 'due').length)]); });
  const tabs = [{ name: 'Overview', values: ovRows, colors: ovRows.map((r, i) => r.map(() => i === 5 ? '#FBEFE7' : '#ffffff')), tab: '#FF6B4A' }];
  const used = new Set(['Overview']);
  for (const s of ex.subjects) {
    let name = (s.name || 'Subject').replace(/[\[\]*?:\/\\]/g, ' ').slice(0, 90); while (used.has(name)) name += ' ·'; used.add(name);
    const cols = Math.max(1, ...s.topics.map(tp => sessionsOf(tp).length));
    const head = ['Topic', ...Array.from({ length: cols }, (_, i) => i ? 'Revision ' + i : 'Learned'), 'Next'];
    const values = [head], colors = [head.map(() => '#FBEFE7')];
    for (const tp of s.topics) {
      const ss = sessionsOf(tp), lc = lastConf(tp), nx = nextLabel(tp);
      values.push([tp.name, ...ss.map(d => ddmm(d) + '/' + d.slice(0, 4)), ...Array(cols - ss.length).fill(''), nx.text]);
      colors.push([lc ? CONF[lc - 1].c : '#ffffff', ...ss.map(d => CONF[confOn(tp, d) - 1].c), ...Array(cols - ss.length).fill('#ffffff'), nx.cls === 'due' ? '#FFE4DA' : '#ffffff']);
    }
    tabs.push({ name, values, colors: colors.map(r => r.map(hexOr)), tab: s.color });
  }
  return { id: ex.id, title: `Ascend · ${ex.name} revision`, tabs };
}
const sheetSig = (ex) => JSON.stringify([todayStr(), ex.name, ex.date, ex.subjects]);
async function syncSheet(ex, manual = false) {
  if (!gEnabled()) { if (manual) { toast('Connect Google in Settings first'); go('settings'); } return; }
  try {
    const r = await gCall('sheet.sync', { sheet: sheetPayload(ex) });
    ex.sheetUrl = r.url; ex.sheetAt = Date.now(); ex.sheet = true;
    D.sync.sheetSig = { ...(D.sync.sheetSig || {}), [ex.id]: sheetSig(ex) };
    save(); if (currentView === 'exams' && !$('.scrim')) go('exams', { keepScroll: true, soft: true });
    if (manual) toast('Google Sheet updated');
  } catch (e) {
    if (/Unknown action: sheet/i.test(e.message)) { if (manual) sheetUpdateModal(); }
    else if (/SpreadsheetApp|permission|authoriz/i.test(e.message)) { if (manual) sheetPermissionModal(); }
    else if (manual) toast(e.message);
  }
}
// Keep the Sheet in step: a minute after any change to an exam that has a Sheet
setInterval(() => { if (!D || !gEnabled()) return; for (const ex of activeExams()) if (ex.sheet && (D.sync.sheetSig || {})[ex.id] !== sheetSig(ex)) syncSheet(ex); }, 60e3);

function sheetPermissionModal() {
  const m = modal(`<h2>Allow your script to use Google Sheets</h2><p class="sub">Your script is up to date, but Google has not been given permission for Sheets yet. One minute, once.</p>
    <ol class="setup-steps">
      <li>Open <button type="button" class="btn sm" data-act="open-scripts">${icon('external')}script.google.com</button> and click your <b>Ascend bridge</b> project.</li>
      <li>If the function menu at the top of the editor has no <b>authorizeSheets</b>, paste the new script first (<button type="button" class="btn sm" data-act="copy-script">${icon('copy')}Copy it</button>, <kbd>Ctrl</kbd> <kbd>A</kbd>, <kbd>Ctrl</kbd> <kbd>V</kbd>, <kbd>Ctrl</kbd> <kbd>S</kbd>).</li>
      <li>Pick <b>authorizeSheets</b> in the function menu, then click <b>Run</b>.</li>
      <li>Choose <b>Review permissions</b> › your account › <b>Advanced</b> › <b>Go to Ascend bridge</b>. If you see tick boxes, tick <b>Google Sheets</b>, then <b>Allow</b>. No new deployment is needed.</li>
      <li><button type="button" class="btn dark sm" data-local="retry">I've done it, create my Sheet</button></li>
    </ol>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Later</button></div>`, 'wide');
  m.addEventListener('click', (e) => { if (e.target.closest('[data-local=retry]')) { closeModal(); const ex = examById(UI.examId); if (ex) syncSheet(ex, true); } });
}
function sheetUpdateModal() {
  const m = modal(`<h2>One step first: update your Google script</h2><p class="sub">Writing to Google Sheets needs the newest Ascend bridge. It is free and takes a minute.</p>
    <ol class="setup-steps">
      <li><button type="button" class="btn primary sm" data-act="copy-script">${icon('copy')}Copy the new script</button></li>
      <li>Open <button type="button" class="btn sm" data-act="open-scripts">${icon('external')}script.google.com</button> and click your <b>Ascend bridge</b> project.</li>
      <li>Select all the code (<kbd>Ctrl</kbd> <kbd>A</kbd>), paste (<kbd>Ctrl</kbd> <kbd>V</kbd>) and save (<kbd>Ctrl</kbd> <kbd>S</kbd>).</li>
      <li>Click <b>Deploy</b> › <b>Manage deployments</b> › pencil icon › Version: <b>New version</b> › <b>Deploy</b>. Your web app link stays the same.</li>
      <li>Give it permission for Sheets: in the toolbar at the top of the editor, pick <b>authorizeSheets</b> in the function menu and click <b>Run</b>. Choose <b>Review permissions</b> › your account › <b>Advanced</b> › <b>Go to Ascend bridge</b>, tick <b>Google Sheets</b> if you see tick boxes, then <b>Allow</b>.</li>
      <li><button type="button" class="btn dark sm" data-local="retry">I've done it, create my Sheet</button></li>
    </ol>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Later</button></div>`, 'wide');
  m.addEventListener('click', (e) => { if (e.target.closest('[data-local=retry]')) { closeModal(); const ex = examById(UI.examId); if (ex) syncSheet(ex, true); } });
}

// Small card for the Today screen
function examTodayCard() {
  const ex = nextExam(); if (!ex) return '';
  const st = examStats(ex), plan = examPlan(ex);
  return `<section class="panel ex-card" data-go="exams">
    <div class="row" style="justify-content:space-between"><h3>${icon('exams', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} ${esc(ex.name)}</h3><b class="ex-mini-count">${st.daysLeft}d</b></div>
    <p class="muted" style="font-size:13px;margin-top:4px">${plan.due.length || plan.learn.length ? `${plan.due.length} to revise, ${plan.learn.length} new today` : 'Today\'s exam plan is done'} · ${st.pctLearned}% learned</p>
    <div class="progress-bar thin" style="margin-top:8px"><i style="width:${st.pctLearned}%"></i></div>
  </section>`;
}

// ---------- Modals ----------
function examModal(ex = null) {
  const isNew = !ex;
  ex = ex || { id: uid(), name: '', date: addDays(todayStr(), 60), subjects: [] };
  const m = modal(`<h2>${isNew ? 'New exam' : 'Edit exam'}</h2><p class="sub">You can add subjects and topics next.</p>
    <form><div class="field"><label>Exam</label><input class="input" name="name" value="${esc(ex.name)}" required maxlength="60" placeholder="Pre-prof exams"></div>
    <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${ex.date}" required></div>
    <div class="modal-actions">${isNew ? '' : '<button type="button" class="btn ghost" data-local="archive" style="margin-right:auto;color:var(--off)">Archive</button>'}<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Create' : 'Save'}</button></div></form>`);
  m.addEventListener('click', (e) => { if (e.target.closest('[data-local=archive]')) { ex.archived = true; save(); closeModal(); UI.examId = null; go('exams'); } });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    ex.name = String(fd.get('name')).trim(); ex.date = fd.get('date');
    if (isNew) { D.exams.push(ex); UI.examId = ex.id; }
    save(); closeModal(); go('exams');
    if (isNew) setTimeout(() => subjectModal(ex), 350);
  });
}

function subjectModal(ex, s = null) {
  const isNew = !s;
  s = s || { id: uid(), name: '', color: SUBJECT_COLORS[ex.subjects.length % SUBJECT_COLORS.length], topics: [] };
  const m = modal(`<h2>${isNew ? 'Add a subject' : 'Edit ' + esc(s.name)}</h2><p class="sub">Paste topics one per line, for example the chapters of your PYQ list.</p>
    <form><div class="field"><label>Subject</label><input class="input" name="name" value="${esc(s.name)}" required maxlength="40" placeholder="Surgery"></div>
    <div class="field"><label>${isNew ? 'Topics' : 'Add more topics'}</label><textarea class="input" name="topics" rows="8" placeholder="GI bleed&#10;Thyroid swellings&#10;Hernia"></textarea>${isNew ? '' : `<span class="hint">${s.topics.length} topics already. New lines are added to the end.</span>`}</div>
    <div class="modal-actions">${isNew ? '' : '<button type="button" class="btn ghost" data-local="del" style="margin-right:auto;color:var(--off)">Delete subject</button>'}<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`, 'wide');
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-local=del]'); if (b && confirmInline(b, 'Delete?')) { ex.subjects = ex.subjects.filter(x => x !== s); save(); closeModal(); go('exams'); } });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    s.name = String(fd.get('name')).trim();
    const have = new Set(s.topics.map(t => t.name.toLowerCase()));
    String(fd.get('topics') || '').split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(l => l && l.length <= 120 && !have.has(l.toLowerCase())).forEach(name => { have.add(name.toLowerCase()); s.topics.push({ id: uid(), name, learned: null, revs: [] }); });
    if (isNew) ex.subjects.push(s);
    save(); closeModal(); go('exams', { keepScroll: true });
  });
}

function topicModal(ex, s, tp) {
  const k = topicState(tp);
  const m = modal(`<h2>${esc(tp.name)}</h2><p class="sub"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color}"></span> ${esc(s.name)} · ${esc(k.label)}</p>
    ${tp.learned ? `<p class="muted" style="font-size:13px;margin-bottom:14px">Learned ${shortDay(tp.learned)}${(tp.revs || []).length ? ` · revised ${tp.revs.map(d => shortDay(d)).join(', ')}` : ''}</p>` : ''}
    <label class="muted" style="font-size:13px;font-weight:600">${touchedOn(tp, todayStr()) ? 'Studied today. Change how well you know it:' : tp.learned ? 'Revised it today? How well do you know it now?' : 'Learned it today? How well do you know it?'}</label>
    <div class="conf-pick" style="margin:8px 0 14px">${CONF.map(c => `<button type="button" data-local="conf" data-conf="${c.v}" class="${touchedOn(tp, todayStr()) && confOn(tp, todayStr()) === c.v ? 'on' : ''}" style="--cc:${c.c};--ci:${c.ink}"><b>${c.v}</b>${c.label}</button>`).join('')}</div>
    <div class="row wrap">${tp.learned ? '<button class="btn ghost" data-local="reset">Start over</button>' : ''}${touchedOn(tp, todayStr()) ? '<button class="btn ghost" data-local="undo">Undo today</button>' : ''}<button class="btn ghost" data-local="del" style="color:var(--off)">Delete topic</button></div>
    <div class="field" style="margin-top:14px"><label>Name</label><input class="input" id="tpName" value="${esc(tp.name)}"></div>
    <div class="modal-actions"><button class="btn" data-local="save">Done</button></div>`);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-local]'); if (!b) return;
    const a = b.dataset.local;
    if (a === 'conf') { studyTopic(tp, Number(b.dataset.conf)); burst(b); }
    if (a === 'undo') { const d = todayStr(); setTopic(tp, tp.learned === d ? 'learn' : 'rev', false, d); }
    if (a === 'reset') { tp.learned = null; tp.revs = []; tp.conf = {}; }
    if (a === 'del') { if (!confirmInline(b, 'Delete?')) return; s.topics = s.topics.filter(x => x !== tp); }
    const nm = $('#tpName', m).value.trim(); if (nm && a !== 'del') tp.name = nm;
    save(); closeModal(); go('exams', { keepScroll: true, soft: true });
  });
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a || currentView !== 'exams' && !a.dataset.act.startsWith('exam-new')) return;
  const ex = examById(UI.examId);
  const sub = (el) => ex && ex.subjects.find(x => x.id === el.closest('[data-sub]').dataset.sub);
  switch (a.dataset.act) {
    case 'exam-new': examModal(); break;
    case 'exam-edit': examModal(ex); break;
    case 'subject-new': subjectModal(ex); break;
    case 'subject-edit': subjectModal(ex, sub(a)); break;
    case 'topic-open': { const s = sub(a); topicModal(ex, s, s.topics.find(x => x.id === a.dataset.top)); break; }
    case 'exam-tick': {
      const row = a.closest('[data-top]'); const s = sub(row); const tp = s.topics.find(x => x.id === row.dataset.top);
      askConfidence(`${s.name} · ${tp.name}`, (level) => {
        setTopic(tp, row.dataset.kind, true, todayStr(), level); save();
        row.classList.add('done', 'just-done'); burst(row.querySelector('.check')); chime('start');
        setTimeout(() => go('exams', { keepScroll: true, soft: true }), 650);
      });
      break;
    }
    case 'sheet-sync': a.classList.add('busy'); syncSheet(ex, true).finally(() => a.classList.remove('busy')); break;
    case 'sheet-open': if (ex.sheetUrl) bridge.openExternal(ex.sheetUrl); break;
    case 'exam-to-targets': {
      const plan = examPlan(ex); const dd = day(todayStr()); let n = 0;
      const have = new Set(dd.targets.filter(x => x.examRef).map(x => x.examRef.topic));
      for (const [list, kind] of [[plan.due, 'rev'], [plan.learn, 'learn']]) for (const x of list) {
        if (have.has(x.tp.id)) continue;
        const it = { id: uid(), title: `${kind === 'rev' ? 'Revise' : 'Learn'}: ${x.s.name} · ${x.tp.name}`, goalId: '', done: false, examRef: { exam: ex.id, subject: x.s.id, topic: x.tp.id, kind } };
        dd.targets.push(it); markDirty(it); n++;
      }
      save(); toast(n ? `${n} added to today's targets. Ticking them updates the plan.` : 'Already in today\'s targets');
      break;
    }
  }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-extab]'); if (t) { UI.exTab = t.dataset.extab; go('exams', { keepScroll: true, soft: true }); return; }
  const s = e.target.closest('[data-exsub]'); if (s) { UI.exSub = s.dataset.exsub; go('exams', { keepScroll: true, soft: true }); }
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-act=exam-pick]')) { UI.examId = e.target.value; go('exams'); } });

VIEWS.exams = viewExams;
AFTER.exams = (fresh) => { if (fresh) Motion.countUp($('#view')); };
