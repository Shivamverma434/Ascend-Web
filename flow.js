/* Ascend: fewer tabs, more that fills itself in. Health and Healthspan share a tab, People sits inside Goals and the
   weekly review inside Journal. Habits tick themselves from sleep, workouts, Anki and the rest; life areas score
   themselves every week; insights link sleep, training, mood and focus; a bedtime nudge; restore from a backup.
   Uses globals from app.js, datasync.js, health.js and life.js. */
'use strict';

// ---------- Tabs inside tabs ----------
const subTabs = (key, opts, cur) => `<div class="seg big-seg">${opts.map(([id, label]) => `<button type="button" data-subtab="${key}:${id}" class="${cur === id ? 'on' : ''}">${label}</button>`).join('')}</div>`;
VIEWS.health = () => {
  const t = UI.htab === 'span' ? 'span' : 'train';
  const tabs = subTabs('htab', [['train', 'Training'], ['span', 'Healthspan']], t);
  return t === 'span' ? viewHealth(tabs) : viewFitness(tabs);
};
VIEWS.goals = () => {
  const t = UI.gtab === 'people' ? 'people' : 'goals';
  const tabs = subTabs('gtab', [['goals', 'Goals'], ['people', 'People']], t);
  return t === 'people' ? viewPeople(tabs) : viewGoals(tabs);
};
for (const k of ['fitness', 'review', 'people']) delete VIEWS[k];
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-subtab]'); if (!b) return;
  const [k, v] = b.dataset.subtab.split(':'); UI[k] = v; go(currentView);
});
// The tab bar always opens a tab's main page; Journal opens on the weekly review when it is due
document.addEventListener('click', (e) => {
  const b = e.target.closest('#nav [data-go]'); if (!b) return;
  const due = !reviewedThisWeek() && new Date().getDay() === Number(D.settings.weeklyDay);
  Object.assign(UI, { htab: 'train', gtab: 'goals', jtab: due ? 'review' : 'write', reviewEdit: false });
}, true);

// ---------- Sleep times (Health Connect) ----------
const clockMin = (iso) => Number(String(iso).slice(11, 13)) * 60 + Number(String(iso).slice(14, 16));
const hhmmMin = (s) => { const [h, m] = String(s || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
// Evening and after-midnight times on one line: 23:30 is 1410, 00:30 is 1470
const nightMin = (m) => m < 12 * 60 ? m + 1440 : m;
// The main sleep you woke up from on a given morning
const sleepEnding = (d) => memo('sleepEnd', () => {
  const map = {};
  for (const s of mainSleeps()) { if (s.minutes < 180) continue; const k = s.end.slice(0, 10); if (!map[k] || s.minutes > map[k].minutes) map[k] = s; }
  return map;
})[d] || null;
const bedMin = (d) => { const s = sleepEnding(d); return s ? nightMin(clockMin(s.start)) : null; };
const wakeMin = (d) => { const s = sleepEnding(d); return s ? clockMin(s.end) : null; };
const moodOn = (d) => ((D.days[d] || {}).checkin || {}).mood || (D.journal[d] || {}).mood || null;
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

// ---------- Health Connect workouts (Hevy, Zepp, Samsung…) ----------
// Exercise types from Health Connect's ExerciseSessionRecord
const HC_TYPES = { 56: 'run', 57: 'run', 79: 'walk', 37: 'walk', 8: 'cycling', 9: 'cycling', 73: 'swim', 74: 'swim', 70: 'strength', 81: 'strength', 13: 'strength', 83: 'yoga', 48: 'yoga', 71: 'yoga', 36: 'hiit', 25: 'hiit', 54: 'hiit' };
const startMs = (w) => w.at ? +new Date(w.at) : null;
// The same session recorded twice: within 30 minutes, or same type that day when one has no start time
function sameSession(a, b) {
  if (a.date !== b.date) return false;
  const x = startMs(a), y = startMs(b);
  return x && y ? Math.abs(x - y) < 30 * 60e3 : a.type === b.type;
}
// intervals.icu and your own logs win over Health Connect, which knows less about each session
function dedupeWorkouts() {
  const own = D.workouts.filter(w => w.source !== 'hc'), n = D.workouts.length;
  D.workouts = D.workouts.filter(w => w.source !== 'hc' || !own.some(o => sameSession(o, w)));
  return n - D.workouts.length;
}
function importHcWorkouts() {
  let added = 0;
  for (const e of (D.hc && D.hc.exercise) || []) {
    if (!e.date || !(e.minutes >= 5)) continue;
    const id = 'hc-' + String(e.start || e.date).replace(/\D/g, '');
    if (D.tomb && D.tomb['w:' + id]) continue; // you removed it
    const w = { date: e.date, at: e.start || '', type: HC_TYPES[e.type] || 'other', name: e.title || '', minutes: e.minutes };
    const cur = D.workouts.find(x => x.id === id);
    if (cur) { if (cur.minutes !== w.minutes || cur.type !== w.type || cur.name !== w.name) Object.assign(cur, w); continue; }
    if (D.workouts.some(o => o.source !== 'hc' && sameSession(o, w))) continue;
    D.workouts.push({ id, source: 'hc', distance: 0, effort: 0, notes: '', ...w }); added++;
  }
  dedupeWorkouts();
  return added;
}

// ---------- Habits that tick themselves ----------
const HABIT_AUTO = {
  wake: { label: 'Woke up by', input: 'time', def: '08:00', test: (d, g) => { const w = wakeMin(d); return w != null && w <= hhmmMin(g.autoTime || '08:00'); }, needs: 'Health Connect sleep' },
  bed: { label: 'Asleep by (the night before)', input: 'time', def: '00:30', test: (d, g) => { const b = bedMin(d); return b != null && b <= nightMin(hhmmMin(g.autoTime || '00:30')); }, needs: 'Health Connect sleep' },
  sleep: { label: 'Slept at least', input: 'n', unit: 'hours', def: 7, test: (d, g) => (sleepHours(d) || 0) >= (Number(g.autoN) || 7) },
  workout: { label: 'Any workout', test: (d) => workoutsOn(d).length > 0 },
  strength: { label: 'Gym or strength session', test: (d) => workoutsOn(d).some(w => w.type === 'strength') },
  run: { label: 'A run', test: (d) => workoutsOn(d).some(w => w.type === 'run') },
  steps: { label: 'Steps at least', input: 'n', unit: 'steps', def: 8000, test: (d, g) => ((wellnessOn(d) || {}).steps || 0) >= (Number(g.autoN) || 8000) },
  focus: { label: 'Focused at least', input: 'n', unit: 'minutes', def: 60, test: (d, g) => focusMinOn(d) >= (Number(g.autoN) || 60) },
  anki: { label: 'Did Anki reviews', test: (d) => !!(D.anki && D.anki.days && D.anki.days[d]) },
  journal: { label: 'Wrote in the journal', test: (d) => !!(D.journal[d] && D.journal[d].saved) },
  checkin: { label: 'Did the morning check-in', test: (d) => !!(D.days[d] && D.days[d].checkin) },
  people: { label: 'Connected with someone', test: (d) => connectsIn(d, d) > 0 }
};
function habitAuto(g, d) {
  const a = g && g.auto && HABIT_AUTO[g.auto];
  return !!(a && d <= todayStr() && a.test(d, g));
}
function habitAutoLabel(g) {
  const a = HABIT_AUTO[g.auto]; if (!a) return '';
  if (a.input === 'time') return `${a.label} ${fmtHM(g.autoTime || a.def)}`;
  if (a.input === 'n') return `${a.label} ${Number(g.autoN || a.def).toLocaleString()} ${a.unit}`;
  return a.label;
}
// Goal form: "Ticks itself when…" for habits
function habitAutoFields(g) {
  const a = HABIT_AUTO[g.auto] || {};
  return `<div class="field" id="autoField"><label>Ticks itself when</label><div class="row">
    <select class="input grow" name="auto"><option value="">I tick it myself</option>${Object.entries(HABIT_AUTO).map(([k, v]) => `<option value="${k}" ${g.auto === k ? 'selected' : ''}>${v.label}${v.needs ? ` (${v.needs})` : ''}</option>`).join('')}</select>
    <input class="input" name="autoTime" type="time" value="${esc(g.autoTime || a.def || '08:00')}" style="width:120px;${a.input === 'time' ? '' : 'display:none'}">
    <input class="input" name="autoN" type="number" min="0" step="any" value="${esc(g.autoN || a.def || '')}" style="width:110px;${a.input === 'n' ? '' : 'display:none'}"></div>
    <span class="hint">From your watch, workouts, Anki and journal. You can still tick it by hand on days the data misses.</span></div>`;
}
function wireHabitAuto(m) {
  const sel = $('[name=auto]', m); if (!sel) return;
  sel.addEventListener('change', () => {
    const a = HABIT_AUTO[sel.value] || {};
    const t = $('[name=autoTime]', m), n = $('[name=autoN]', m);
    t.style.display = a.input === 'time' ? '' : 'none'; n.style.display = a.input === 'n' ? '' : 'none';
    if (a.input === 'time') t.value = a.def; if (a.input === 'n') n.value = a.def;
  });
}
function readHabitAuto(g, fd) {
  g.auto = String(fd.get('auto') || '');
  const a = HABIT_AUTO[g.auto] || {};
  g.autoTime = a.input === 'time' ? String(fd.get('autoTime') || a.def) : '';
  g.autoN = a.input === 'n' ? Number(fd.get('autoN')) || a.def : '';
}

// ---------- Life areas that score themselves ----------
// Each area gets 0 to 10 for a stretch of days, from what already happened: goals and habits in that area, plus
// sleep, wake-time consistency, training and steps (Health), focus and Anki (Study), journal and mood (Mind), and
// keeping in touch (Relationships). Hobbies are scored from your hobby goals and habits.
function goalSignal(g, from, to, n) {
  if (g.metric === 'habit') return range(from, to).filter(d => habitDone(g.id, d)).length / (habitTimes(g) * n / 7);
  if (isLevel(g)) { const s = levelStatus(g); return s.p == null ? null : s.pct / 100; }
  const expect = goalTarget(g) / (D.season.weeks * 7) * n;
  return expect ? goalProgress(g, to, from) / expect : null;
}
function areaScores(from, to) {
  const T = todayStr(); if (to > T) to = T;
  const days = range(from, to), n = days.length || 1, out = {};
  for (const a of AREAS) out[a.id] = { sig: [], bits: [] };
  const add = (a, v, bit) => { if (v == null || !isFinite(v)) return; out[a].sig.push(clamp(v, 0, 1)); if (bit) out[a].bits.push(bit); };
  for (const g of activeGoals()) add(g.area || 'study', goalSignal(g, from, to, n), null);
  // Study
  const fh = sum(days, focusMinOn) / 60;
  const weekly = sum(activeGoals().filter(g => (g.area || 'study') === 'study' && g.metric === 'hours'), g => g.target / D.season.weeks) || 20;
  add('study', fh / (weekly * n / 7), `${round1(fh)}h focus`);
  if (D.anki && D.anki.days) { const ad = days.filter(d => D.anki.days[d]).length; add('study', ad / n, `Anki ${ad}/${n} days`); }
  // Questions count most: they are what PG exams score
  const qb = typeof qbIn === 'function' ? qbIn(from, to) : { n: 0 }, qDaily = Number(D.settings.qbankDaily) || 0;
  if (qDaily || qb.n) { add('study', qDaily ? qb.n / (qDaily * n) : 1, `${qb.n} questions${qb.n ? `, ${pctOf(qb)}%` : ''}`); if (qb.n >= 20) add('study', (pctOf(qb) - 40) / 40, null); }
  // Health
  const sl = days.map(sleepHours).filter(x => x != null);
  if (sl.length >= 3) { const h = mean(sl); add('health', (h - 5) / 2.5, `${round1(h)}h sleep`); }
  const wk = days.map(wakeMin).filter(x => x != null);
  if (wk.length >= 4) { const sd = stdev(wk); add('health', 1 - (sd - 20) / 70, `wake ±${Math.round(sd)} min`); }
  const wd = days.filter(d => workoutsOn(d).length).length;
  add('health', wd / (4 * n / 7), `${wd} workout day${wd === 1 ? '' : 's'}`);
  const st = days.map(d => (wellnessOn(d) || {}).steps).filter(Boolean);
  if (st.length >= 3) { const s = mean(st); add('health', s / 8000, `${round1(s / 1000)}k steps`); }
  // Mind
  const jd = days.filter(d => D.journal[d] && D.journal[d].saved).length;
  add('mind', jd / (5 * n / 7), `${jd} journal day${jd === 1 ? '' : 's'}`);
  const md = days.map(moodOn).filter(Boolean);
  if (md.length >= 2) { const m = mean(md); add('mind', (m - 1) / 4, `mood ${round1(m)}/5`); }
  // Relationships
  const ps = D.people || [];
  if (ps.length) {
    const ok = ps.filter(p => p.last && daysBetween(p.last, to) <= (p.every || 14)).length;
    add('people', ok / ps.length, `${ok}/${ps.length} in touch`);
    const c = connectsIn(from, to); add('people', c / (2 * n / 7), `${c} catch-up${c === 1 ? '' : 's'}`);
  }
  for (const a of AREAS) { const o = out[a.id]; o.score = o.sig.length ? Math.round(10 * mean(o.sig)) : null; }
  if (out.hobbies.score == null) out.hobbies.bits.push('add a hobby habit to score it');
  return out;
}
const areaValues = (sc) => Object.fromEntries(AREAS.map(a => [a.id, sc[a.id].score ?? 0]));
function lifeBalanceMini(from, to) {
  const cur = areaScores(from, to), prev = areaScores(addDays(from, -7), addDays(to, -7));
  return `<section class="panel life-mini"><div class="panel-head"><h3>${icon('balance', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Life balance</h3><span class="muted" style="font-size:12px">automatic</span></div>
    <div class="life-mini-body">${balanceWheel(areaValues(cur), areaValues(prev), 170)}
    <div class="area-list">${AREAS.map(a => `<div class="area-mini" style="--c:${a.color}"><b>${a.short}</b><span class="area-score">${cur[a.id].score ?? '–'}</span><span class="muted">${esc(cur[a.id].bits.slice(0, 2).join(' · '))}</span></div>`).join('')}</div></div></section>`;
}

// ---------- Insights: what your own data says ----------
// Two-sided p-value for Welch's t, through a normal approximation of the t distribution (good enough to rank)
function welchP(A, B) {
  const ma = mean(A), mb = mean(B), va = sum(A, x => (x - ma) ** 2) / (A.length - 1), vb = sum(B, x => (x - mb) ** 2) / (B.length - 1);
  const se = Math.sqrt(va / A.length + vb / B.length); if (!se) return ma === mb ? 1 : 0;
  const t = Math.abs(ma - mb) / se, df = (va / A.length + vb / B.length) ** 2 / ((va / A.length) ** 2 / (A.length - 1) + (vb / B.length) ** 2 / (B.length - 1));
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
  const p = (x) => { const k = 1 / (1 + 0.2316419 * x); return 0.3989423 * Math.exp(-x * x / 2) * k * (0.3193815 + k * (-0.3565638 + k * (1.781478 + k * (-1.821256 + k * 1.330274)))); };
  return 2 * p(z);
}
// Comparisons across your own days, built to be trusted: at least 5 days on each side, the number of days shown,
// the gap in real units, and a confidence label after a false-discovery correction (Benjamini-Hochberg) across every
// comparison tried. Recomputed weekly on data up to last Sunday, so the list does not jump around day to day.
function insights(back = 90) {
  const end = addDays(weekStart(todayStr()), -1), bedT = nightMin(hhmmMin(D.settings.bedTime || '00:30'));
  // Focus counts only on days you used the timer, QBank accuracy only on days with 20+ questions
  const days = range(addDays(end, -back + 1), end).map(d => { const q = typeof qbSum === 'function' ? qbSum(qbOn(d)) : { n: 0 }; return { d, sleep: sleepHours(d), focus: focusMinOn(d) || null, qacc: q.n >= 20 ? 100 * q.c / q.n : null, mood: moodOn(d), energy: ((D.days[d] || {}).checkin || {}).energy || null, gym: workoutsOn(d).length > 0, steps: (wellnessOn(d) || {}).steps || null, bed: bedMin(d) }; });
  const tests = [];
  const test = (a, b, get, make) => {
    const A = days.filter(a).map(get).filter(v => v != null), B = days.filter(b).map(get).filter(v => v != null);
    if (A.length < 5 || B.length < 5) return;
    const r = make(mean(A), mean(B)); if (r) tests.push({ ...r, na: A.length, nb: B.length, p: welchP(A, B) });
  };
  const pct = (x, y) => y > 0 ? Math.round(100 * (x - y) / y) : null;
  const focusLine = (cond, icn) => (x, y) => { const p = pct(x, y); if (p == null || Math.abs(p) < 10 || Math.min(x, y) < 15) return null; return { icon: icn, size: Math.abs(p), text: `You focus ${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} ${cond} (${fmtMin(x)} vs ${fmtMin(y)}).` }; };
  const pointsLine = (what, cond, icn) => (x, y) => { const dlt = round1(x - y); if (Math.abs(dlt) < 0.3) return null; return { icon: icn, size: Math.abs(dlt) * 25, text: `Your ${what} is ${Math.abs(dlt)} points ${dlt > 0 ? 'higher' : 'lower'} ${cond} (${round1(x)} vs ${round1(y)} out of 5).` }; };
  const accLine = (cond, icn) => (x, y) => { const dlt = Math.round(x - y); if (Math.abs(dlt) < 4) return null; return { icon: icn, size: Math.abs(dlt) * 3, text: `Your QBank accuracy is ${Math.abs(dlt)} points ${dlt > 0 ? 'higher' : 'lower'} ${cond} (${Math.round(x)}% vs ${Math.round(y)}%).` }; };
  const longSleep = x => x.sleep != null && x.sleep >= 7, shortSleep = x => x.sleep != null && x.sleep < 6.5;
  test(longSleep, shortSleep, x => x.focus, focusLine('after nights of 7h+ sleep than after nights under 6.5h', 'moon'));
  test(longSleep, shortSleep, x => x.qacc, accLine('after nights of 7h+ sleep than after nights under 6.5h', 'moon'));
  test(longSleep, shortSleep, x => x.mood, pointsLine('mood', 'after 7h+ sleep than after under 6.5h', 'moon'));
  test(longSleep, shortSleep, x => x.energy, pointsLine('morning energy', 'after 7h+ sleep than after under 6.5h', 'bolt'));
  test(x => x.bed != null && x.bed <= bedT, x => x.bed != null && x.bed > bedT + 60, x => x.focus, focusLine(`after asleep by ${fmtHM(D.settings.bedTime || '00:30')} than after asleep an hour or more later`, 'moon'));
  test(x => x.bed != null && x.bed <= bedT, x => x.bed != null && x.bed > bedT + 60, x => x.qacc, accLine(`after asleep by ${fmtHM(D.settings.bedTime || '00:30')} than after asleep an hour later`, 'moon'));
  test(x => x.gym, x => !x.gym, x => x.mood, pointsLine('mood', 'on days you train', 'run'));
  test(x => x.gym, x => !x.gym, x => x.focus, focusLine('on days you train', 'run'));
  test(x => x.steps >= 8000, x => x.steps != null && x.steps < 5000, x => x.mood, pointsLine('mood', 'on 8k+ step days than under 5k', 'walk'));
  // Benjamini-Hochberg: adjust each p for how many comparisons were tried, then keep the ones that survive
  const m = Math.max(1, tests.length), byP = tests.slice().sort((a, b) => a.p - b.p);
  let run = 1;
  for (let i = byP.length - 1; i >= 0; i--) { run = Math.min(run, byP[i].p * m / (i + 1)); byP[i].q = run; }
  return tests.filter(t => t.q < 0.2).map(t => ({ ...t, conf: t.q < 0.05 ? 'High' : 'Medium' })).sort((a, b) => (a.conf === b.conf ? b.size - a.size : a.conf === 'High' ? -1 : 1));
}
function insightsPanel() {
  const ins = memo('insights', () => insights());
  return `<section class="panel"><div class="panel-head"><h3>${icon('bolt', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px"')} What your data says</h3><span class="muted" style="font-size:12px">90 days to last Sunday</span></div>
    ${ins.length ? ins.slice(0, 5).map((x, i) => `<div class="tip-row" style="--i:${i}"><span class="tip-ic">${icon(x.icon)}</span><div><p>${esc(x.text)}</p><span class="muted" style="font-size:11.5px"><span class="conf-tag ${x.conf.toLowerCase()}">${x.conf} confidence</span> · ${x.na} vs ${x.nb} days · a pattern in your days, not proof of cause</span></div></div>`).join('')
      : '<p class="muted">Nothing clear yet. Ascend only shows a pattern with at least 5 days on each side that holds up after correcting for every comparison it tried. Updated every Monday.</p>'}</section>`;
}
function insightTodayCard() {
  const x = memo('insights', () => insights())[0]; if (!x) return '';
  return `<section class="panel insight-card" data-go="review"><h3>${icon('bolt', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px"')} Insight <span class="conf-tag ${x.conf.toLowerCase()}">${x.conf}</span></h3><p style="font-size:13.5px;margin-top:4px">${esc(x.text)}</p></section>`;
}

// ---------- Bedtime ----------
// The nudge before lights out, for the night that starts on date d (00:30 lights out = the next calendar day)
function bedtimeAt(d) {
  const L = hhmmMin(D.settings.bedTime || '00:30'), lead = Number(D.settings.bedLead ?? 30);
  const x = parseDay(L < 12 * 60 ? addDays(d, 1) : d); x.setHours(0, L - lead, 0, 0);
  return x;
}
function bedtimeText() {
  const s = D.settings, last = sleepHours(todayStr()), lead = Number(s.bedLead ?? 30);
  return { title: `Lights out at ${fmtHM(s.bedTime || '00:30')}. Start winding down.`, body: `Screens away now: ${lead} minutes to lights out.${last ? ` Last night: ${last}h.` : ''}` };
}
const buildNudgePlain = buildNudge;
buildNudge = function (kind, force = false) {
  if (kind !== 'bedtime') return buildNudgePlain(kind, force);
  const w = range(addDays(todayStr(), -6), todayStr()).map(sleepHours).filter(x => x != null), t = bedtimeText();
  return { sound: D.settings.sound, kind, theme: 'journal', icon: 'moon', eyebrow: 'Bedtime', title: t.title, body: t.body, stat: w.length ? round1(mean(w)) + 'h' : '', statLabel: w.length ? 'avg sleep, 7 nights' : '', actions: [{ label: 'Going to bed', primary: true }, { label: 'In 15 min', snooze: 15, kind: 'bedtime' }] };
};

// ---------- Backups ----------
const backupLabel = (b) => b.name.includes('before-restore') ? `Just before your last restore (${ago(b.at)})` : dayName(b.name.slice(7, 17), { weekday: 'short', day: 'numeric', month: 'short' });
function backupPanel() {
  if (!bridge.backups) return '';
  return `<section class="panel conn"><div class="conn-head"><span class="conn-ic hobby">${icon('folder')}</span><div class="grow"><h3>Backups</h3><p class="muted" style="font-size:12.5px">Ascend keeps a copy of your data from each day on this ${ASCEND_IS_MOBILE ? (window.ASCEND_WEB ? 'iPad' : 'phone') : 'laptop'}. Restoring puts everything back as it was that day, on every device.</p></div></div>
    <div id="backupList" class="backup-list"><div class="skeleton"></div></div></section>`;
}
async function loadBackups() {
  const el = $('#backupList'); if (!el) return;
  let list = [];
  try { list = await bridge.backups.list(); } catch {}
  el.innerHTML = list.length ? list.map(b => `<div class="backup-row"><span class="grow"><b>${esc(backupLabel(b))}</b><span class="muted"> · ${Math.max(1, Math.round(b.size / 1024))} KB</span></span><button type="button" class="btn sm" data-act="backup-restore" data-name="${esc(b.name)}">Restore</button></div>`).join('')
    : '<p class="muted" style="font-size:13px">No backups yet. The first one is made today.</p>';
}
async function restoreBackup(name) {
  const b = await bridge.backups.read(name);
  if (!b || !b.settings) { toast('That backup could not be read'); return; }
  if (typeof cloudSync === 'function' && gEnabled()) { try { await cloudSync(); } catch {} } // so the restore also undoes other devices' later changes
  await bridge.backups.keep(JSON.parse(JSON.stringify(D)));                                   // your undo
  const cur = D, nb = migrate(JSON.parse(JSON.stringify(b)));
  for (const k of LOCAL_ONLY) nb[k] = cur[k];
  // A backup never blanks something you set up since, like Google, intervals.icu or Notion
  for (const [k, v] of Object.entries(cur.settings)) if (k !== '_u' && k !== '_f' && (nb.settings[k] === '' || nb.settings[k] == null) && v !== '' && v != null) nb.settings[k] = v;
  for (const k of DEVICE_KEYS) nb.settings[k] = cur.settings[k];
  nb.tomb = { ...(cur.tomb || {}) };
  for (const [k] of recordList(nb)) delete nb.tomb[k];
  D = nb; save();
  go('settings'); toast('Restored. Your other devices pick it up on their next sync.');
}
const _afterSettings = AFTER.settings;
AFTER.settings = async (fresh) => { await _afterSettings(fresh); loadBackups(); };
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act=backup-restore]'); if (!a) return;
  if (!confirmInline(a, 'Replace today\'s data?')) return;
  a.disabled = true; await restoreBackup(a.dataset.name);
});
