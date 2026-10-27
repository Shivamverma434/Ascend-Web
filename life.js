/* Ascend: the whole person. Life areas, health targets that fill themselves, habits with streaks, the people
   who matter, a weekly life-balance wheel and hobby connections (Google Calendar, Chess.com / Lichess, Goodreads).
   Uses globals from app.js, sync.js and health.js. */
'use strict';

Object.assign(ICONS, {
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7" r="1.1"/><circle cx="15" cy="7.5" r="1.1"/>',
  mind: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 5 3 3 0 0 0 3 4.5A3 3 0 0 0 12 19Z"/><path d="M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 5 3 3 0 0 1-3 4.5A3 3 0 0 1 12 19Z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5M8 7h7"/>',
  knight: '<path d="M6 20h12M8 17h8.5l-.8-5.2 1.8-2.8-3.5-4.5-2.8.8-4.7 4.6 1 2.1 2.8-.9Z"/>',
  balance: '<path d="M12 3 21 9.5 17.5 20h-11L3 9.5Z"/><path d="M12 7.5 16.5 11l-1.8 5.5H9.3L7.5 11Z"/>',
  cake: '<path d="M4 21h16v-7H4Z"/><path d="M4 17c2.7 1.5 5.3 1.5 8 0s5.3-1.5 8 0"/><path d="M12 14v-3M12 8.5v-.5"/>',
  habit: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>'
});

// ---------- Life areas ----------
const AREAS = [
  { id: 'study', label: 'Study & career', short: 'Study', icon: 'exams', color: '#5A3CF0' },
  { id: 'health', label: 'Health & fitness', short: 'Health', icon: 'heart', color: '#0E9AA7' },
  { id: 'mind', label: 'Mind & growth', short: 'Mind', icon: 'mind', color: '#7A8B00' },
  { id: 'hobbies', label: 'Hobbies & creativity', short: 'Hobbies', icon: 'palette', color: '#FF4F1F' },
  { id: 'people', label: 'Relationships', short: 'People', icon: 'people', color: '#D6247A' }
];
const areaOf = (g) => AREAS.find(a => a.id === (g.area || 'study')) || AREAS[0];

// More ways to track a goal. kind 'level' = a number you hold (sleep, VO2 max), not a season total.
for (const [k, areas] of Object.entries({ hours: ['study', 'mind', 'hobbies'], tasks: ['study', 'mind', 'hobbies', 'people', 'health'], km: ['health'], workouts: ['health'], anki: ['study', 'mind'], count: ['study', 'mind', 'hobbies', 'people', 'health'] })) METRICS[k].areas = areas;
Object.assign(METRICS, {
  habit: { label: 'Habit: times a week', unit: 'times', kind: 'habit', areas: ['health', 'mind', 'hobbies', 'people', 'study'], hint: 'Tick it off on Today, or let it tick itself from your data (below). Ascend counts your week and keeps your streak.' },
  calendar: { label: 'Time in Google Calendar', unit: 'h', areas: ['hobbies', 'mind', 'health', 'people', 'study'], hint: 'Counts hours of calendar events whose title contains your keyword, like "Guitar" or "Gym".' },
  books: { label: 'Books finished (Goodreads)', unit: 'books', areas: ['mind', 'hobbies'], hint: 'Counts books you mark as read on Goodreads. Add your Goodreads link in Settings › Hobby connections.' },
  chess: { label: 'Chess games played', unit: 'games', areas: ['hobbies', 'mind'], hint: 'Counts your games on Chess.com or Lichess. Add your username in Settings › Hobby connections.' },
  chessRating: { label: 'Chess rating', unit: 'rating', kind: 'level', dir: 1, areas: ['hobbies', 'mind'], hint: 'Your best current rating (rapid, blitz, bullet or daily).' },
  connect: { label: 'Times you connected with people', unit: 'catch-ups', areas: ['people'], hint: 'Counts every time you press "Connected" for someone on the People page.' },
  sleep: { label: 'Average sleep', unit: 'h', kind: 'level', dir: 1, areas: ['health'], hint: 'Your average over the last 4 weeks, from your watch. Fills itself in.' },
  sri: { label: 'Sleep consistency (SRI)', unit: 'SRI', kind: 'level', dir: 1, areas: ['health'], hint: 'How regular your bed and wake times are, 0 to 100. 80+ is the goal. Needs Health Connect on your phone.' },
  steps: { label: 'Daily steps', unit: 'steps', kind: 'level', dir: 1, areas: ['health'], hint: 'Your daily average over the last 4 weeks.' },
  rhr: { label: 'Resting heart rate', unit: 'bpm', kind: 'level', dir: -1, areas: ['health'], hint: 'Lower is fitter. Your average over the last 4 weeks.' },
  vo2: { label: 'VO₂ max', unit: 'ml/kg/min', kind: 'level', dir: 1, areas: ['health'], hint: 'Measured by your watch, or estimated from your resting heart rate.' },
  z2: { label: 'Easy cardio a week', unit: 'min', kind: 'level', dir: 1, areas: ['health'], hint: 'Minutes in heart-rate zones 1 to 3 per week, over the last 4 weeks. 150+ is the goal.' },
  hard: { label: 'Hard cardio a week', unit: 'min', kind: 'level', dir: 1, areas: ['health'], hint: 'Minutes in zones 4 and 5 per week, over the last 4 weeks. 75+ is the goal.' },
  strength: { label: 'Strength training a week', unit: 'min', kind: 'level', dir: 1, areas: ['health'], hint: 'Minutes of strength workouts per week, over the last 4 weeks. 60+ is the goal.' },
  age: { label: 'Ascend Age', unit: 'years', kind: 'level', dir: -1, areas: ['health'], hint: 'Your biological age from Healthspan. Aim below your real age.' },
  weight: { label: 'Body weight', unit: 'kg', kind: 'level', dir: -1, areas: ['health'], hint: 'Your latest weight from your watch or scale, or from Settings.' }
});
// Sensible starting targets when you pick a way to track
const METRIC_DEFAULTS = { habit: 3, calendar: 20, books: 3, chess: 40, chessRating: 1200, connect: 12, sleep: 7.5, sri: 80, steps: 8000, rhr: 60, vo2: 45, z2: 150, hard: 75, strength: 60, age: 24, weight: 70 };

const isLevel = (g) => (METRICS[g.metric] || {}).kind === 'level';
const levelDir = (g) => g.metric === 'weight' ? (Number(g.dir) || -1) : METRICS[g.metric].dir;
const lifeBody = () => memo('lifebody', () => bodyMetrics(addDays(todayStr(), -1), 28, 14));
function levelValue(g) {
  const m = ['sleep', 'sri', 'steps', 'rhr', 'vo2', 'z2', 'hard', 'strength'].includes(g.metric) ? lifeBody() : null;
  const r = (v, dp = 0) => v == null ? null : dp ? round1(v) : Math.round(v);
  switch (g.metric) {
    case 'sleep': return r(m.sleepH, 1);
    case 'sri': return r(m.sri);
    case 'steps': return r(m.steps);
    case 'rhr': return r(m.rhr);
    case 'vo2': return m.vo2;
    case 'z2': return r(m.z13);
    case 'hard': return r(m.z45);
    case 'strength': return r(m.strength);
    case 'age': { const a = ascendAge(); return a && a.bio != null ? a.bio : null; }
    case 'weight': { for (let i = 0; i < 30; i++) { const w = (wellnessOn(addDays(todayStr(), -i)) || {}).weight; if (w) return round1(w); } return Number(D.settings.weightKg) || null; }
    case 'chessRating': { const c = D.links && D.links.chess; return c && c.best ? c.best : null; }
  }
  return null;
}
function levelStatus(g) {
  const v = levelValue(g);
  if (v == null) return { key: 'new', label: 'Waiting for data', p: null, pct: 0 };
  const d = levelDir(g), t = Number(g.target) || 1;
  const met = d > 0 ? v >= t : v <= t;
  const gap = Math.abs(t - v) / t;
  const pct = clamp(d > 0 ? v / t : t / v, 0, 1) * 100;
  return met ? { key: 'on', label: 'Target met', p: v, pct } : gap <= 0.1 ? { key: 'adjust', label: 'Close', p: v, pct } : { key: 'off', label: 'Not yet', p: v, pct };
}

// ---------- Habits ----------
// D.habitLog[date][goalId] = { v: 1 }. One record per tick, so two devices ticking different habits never clash.
const habitTicked = (gid, d) => !!(D.habitLog && D.habitLog[d] && D.habitLog[d][gid]);
// A habit with a data source (sleep, workouts, Anki…) ticks itself; you can still tick it by hand
const habitDone = (gid, d) => habitTicked(gid, d) || (typeof habitAuto === 'function' && habitAuto(D.goals.find(g => g.id === gid), d));
function toggleHabit(gid, d = todayStr()) {
  D.habitLog = D.habitLog || {};
  const dayLog = D.habitLog[d] = D.habitLog[d] || {};
  const on = !dayLog[gid];
  if (on) dayLog[gid] = { v: 1 }; else delete dayLog[gid];
  if (!Object.keys(dayLog).length) delete D.habitLog[d];
  save();
  return on;
}
const habitTimes = (g) => clamp(Number(g.times) || 3, 1, 7);
const habitInWeek = (g, ws) => range(ws, addDays(ws, 6)).filter(x => habitDone(g.id, x)).length;
function habitStreak(g) {
  const times = habitTimes(g);
  if (times === 7) { let s = 0, d = todayStr(); if (!habitDone(g.id, d)) d = addDays(d, -1); while (habitDone(g.id, d) && s < 3650) { s++; d = addDays(d, -1); } return { n: s, unit: s === 1 ? 'day' : 'days' }; }
  let s = 0, ws = weekStart(todayStr());
  if (habitInWeek(g, ws) >= times) s++;
  ws = addDays(ws, -7);
  while (habitInWeek(g, ws) >= times && s < 520) { s++; ws = addDays(ws, -7); }
  return { n: s, unit: s === 1 ? 'week' : 'weeks' };
}
const habitCount = (g, from, until) => g.auto ? range(from, until < todayStr() ? until : todayStr()).filter(d => habitDone(g.id, d)).length : Object.entries(D.habitLog || {}).filter(([d, x]) => d >= from && d <= until && x[g.id]).length;
const habitGoals = () => activeGoals().filter(g => g.metric === 'habit');

// ---------- Counts from connections and people ----------
const inDays = (days, from, until) => sum(Object.entries(days || {}).filter(([d]) => d >= from && d <= until), ([, n]) => n);
const calendarHours = (g, from, until) => round1(inDays(((D.links && D.links.cal) || {})[g.id] && D.links.cal[g.id].days, from, until));
const chessGamesIn = (from, until) => inDays(D.links && D.links.chess && D.links.chess.days, from, until);
const booksIn = (from, until) => ((D.links && D.links.books && D.links.books.list) || []).filter(b => b.date >= from && b.date <= until).length;
const connectsIn = (from, until) => sum(D.people || [], p => (p.log || []).filter(d => d >= from && d <= until).length);

// Used by goalProgress / goalStatus in app.js
function lifeProgress(g, from, until) {
  switch (g.metric) {
    case 'habit': return habitCount(g, from, until);
    case 'calendar': return calendarHours(g, from, until);
    case 'books': return booksIn(from, until);
    case 'chess': return chessGamesIn(from, until);
    case 'connect': return connectsIn(from, until);
  }
  return 0;
}

// Goal cards for habits and health levels
function lifeGoalCard(g, i) {
  const a = areaOf(g);
  const head = (chip) => `<div class="g-top"><div class="swatch" style="background:${g.color}">${icon(a.icon, 'style="width:18px;height:18px"')}</div>
      <div class="grow"><h3>${esc(g.name)}</h3>${g.why ? `<p class="muted" style="font-size:12.5px">${esc(g.why)}</p>` : ''}</div>${chip}</div>`;
  const edit = `<button class="btn sm ghost" data-act="edit-goal" data-goal="${g.id}">${icon('edit')}Edit</button>`;
  if (g.metric === 'habit') {
    const times = habitTimes(g), ws = weekStart(todayStr()), wk = habitInWeek(g, ws), st = habitStreak(g), done = habitDone(g.id, todayStr());
    const str = habitStrength(g);
    return `<div class="goal" style="--i:${i}">${head(`<span class="chip ${wk >= times ? 'status-on' : ''}">${wk}/${times} this week</span>`)}
      <div class="h-strength"><span>Strength</span><i><b style="width:${str}%;background:${g.color}"></b></i><b>${str}%</b></div>
      <div class="habit-week">${range(ws, addDays(ws, 6)).map(d => `<button type="button" class="hd ${habitDone(g.id, d) ? 'on' : ''} ${!habitDone(g.id, d) && habitSkipped(g.id, d) ? 'skip' : ''} ${d === todayStr() ? 'today' : ''}" ${d <= todayStr() ? `data-act="habit-toggle" data-goal="${g.id}" data-d="${d}"` : 'disabled'} style="--c:${g.color}" title="${esc(shortDay(d))}">${'MTWTFSS'[(parseDay(d).getDay() + 6) % 7]}</button>`).join('')}</div>
      <p class="muted" style="font-size:12.5px">${st.n ? `${icon('flame', 'style="width:13px;height:13px;color:var(--ember);vertical-align:-2px"')} ${st.n} ${st.unit} in a row. ` : ''}${times === 7 ? 'Every day.' : `${times} times a week.`} ${esc(a.label)}.${g.auto ? ` Ticks itself: ${esc(habitAutoLabel(g).toLowerCase())}.` : ''}</p>
      <div class="g-actions"><button class="btn sm ${done ? '' : 'primary'}" data-act="habit-toggle" data-goal="${g.id}" data-d="${todayStr()}">${icon('check')}${done ? 'Done today' : 'Mark done today'}</button>${done ? '' : `<button class="btn sm ghost" data-act="habit-skip" data-goal="${g.id}" data-d="${todayStr()}">${habitSkipped(g.id, todayStr()) ? 'Undo skip' : 'Skip today'}</button>`}${edit}</div></div>`;
  }
  const s = levelStatus(g), unit = unitOf(g), d = levelDir(g);
  return `<div class="goal" style="--i:${i}">${head(`<span class="chip status-${s.key}">${s.label}</span>`)}
    <div><span class="g-num" ${s.p != null ? `data-count="${s.p}" data-fmt="dec"` : ''}>${s.p != null ? s.p : '–'}</span> <span class="muted">${d > 0 ? 'aiming for' : 'aiming for under'} ${g.target} ${esc(unit)}</span></div>
    <div class="progress-bar"><i style="width:${s.pct}%;background:${g.color}"></i></div>
    <p class="muted" style="font-size:12.5px">${esc(METRICS[g.metric].hint)}</p>
    <div class="g-actions">${g.metric === 'age' ? `<button class="btn sm" data-go="healthspan">${icon('heart')}Healthspan</button>` : ['sleep', 'sri', 'steps', 'rhr', 'vo2', 'z2', 'hard', 'strength'].includes(g.metric) ? `<button class="btn sm" data-go="fitness">${icon('fitness')}See the data</button>` : ''}${edit}</div></div>`;
}

// Today: habits to tick off
function habitsTodayCard() {
  const hs = habitGoals(); if (!hs.length) return '';
  const t = todayStr(), ws = weekStart(t);
  return `<section class="panel habits-card">
    <div class="panel-head"><h3>${icon('habit', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Habits</h3><span class="muted" style="font-size:12px">${hs.filter(g => habitDone(g.id, t)).length}/${hs.length} today</span></div>
    ${hs.map(g => { const done = habitDone(g.id, t), wk = habitInWeek(g, ws), times = habitTimes(g), st = habitStreak(g); return `<div class="target habit-row ${done ? 'done' : ''}"><button class="check" data-act="habit-toggle" data-goal="${g.id}" data-d="${t}" aria-label="Done today" style="--c:${g.color}">${icon('check', 'stroke-width="3"')}</button>
      <span class="grow">${esc(g.name)}${g.auto ? ` <span class="auto-tag" title="${esc(habitAutoLabel(g))}">auto</span>` : ''}${habitSkipped(g.id, t) && !done ? ' <span class="auto-tag skip">skipped</span>' : ''}</span>${done ? '' : `<button class="icon-btn" data-act="habit-skip" data-goal="${g.id}" data-d="${t}" title="${habitSkipped(g.id, t) ? 'Undo skip' : 'Skip today: does not break the streak'}">${icon('x')}</button>`}<span class="muted habit-meta" title="Habit strength">${habitStrength(g)}% · ${wk}/${times}${st.n ? ` · ${icon('flame', 'style="width:12px;height:12px;color:var(--ember);vertical-align:-1px"')}${st.n}` : ''}</span></div>`; }).join('')}
  </section>`;
}

// ---------- People ----------
// D.people: [{ id, name, every (days), last (date), log: [dates], birthday (YYYY-MM-DD, year optional), how, notes, color }]
const EVERY = [[3, 'Every few days'], [7, 'Every week'], [14, 'Every 2 weeks'], [30, 'Every month'], [90, 'Every 3 months']];
const PERSON_COLORS = ['#D6247A', '#5A3CF0', '#0E9AA7', '#FF4F1F', '#7A8B00'];
const sinceLast = (p) => p.last ? daysBetween(p.last, todayStr()) : null;
const overdueBy = (p) => p.last ? sinceLast(p) - (p.every || 14) : 0;
function nextBirthday(p) {
  if (!p.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthday)) return null;
  const t = todayStr(); let d = t.slice(0, 4) + p.birthday.slice(4);
  if (d < t) d = (Number(t.slice(0, 4)) + 1) + p.birthday.slice(4);
  return { date: d, days: daysBetween(t, d) };
}
function personConnected(id) {
  const p = (D.people || []).find(x => x.id === id); if (!p) return;
  const t = todayStr(); p.log = p.log || [];
  if (!p.log.includes(t)) p.log.push(t);
  p.log = p.log.slice(-60); p.last = t;
  save(); toast(`Nice. Logged your time with ${p.name}.`);
}
function peopleTodayCard() {
  const ps = D.people || []; if (!ps.length) return '';
  const due = ps.filter(p => overdueBy(p) >= 0 || !p.last).sort((a, b) => overdueBy(b) - overdueBy(a)).slice(0, 3);
  const bdays = ps.map(p => ({ p, b: nextBirthday(p) })).filter(x => x.b && x.b.days <= 7).sort((a, b) => a.b.days - b.b.days);
  if (!due.length && !bdays.length) return '';
  return `<section class="panel people-card">
    <div class="panel-head"><h3>${icon('people', 'style="width:16px;height:16px;color:#D6247A;vertical-align:-2px"')} Reach out</h3><button class="btn ghost sm" data-go="people">All people</button></div>
    ${bdays.map(({ p, b }) => `<div class="target"><span class="avatar sm" style="background:${p.color || '#D6247A'}">${icon('cake', 'style="width:14px;height:14px"')}</span><span class="grow"><b>${esc(p.name)}</b>'s birthday ${b.days === 0 ? 'is today' : b.days === 1 ? 'is tomorrow' : 'in ' + b.days + ' days'}</span></div>`).join('')}
    ${due.map(p => `<div class="target"><span class="avatar sm" style="background:${p.color || '#D6247A'}">${esc((p.name[0] || '?').toUpperCase())}</span><span class="grow"><b>${esc(p.name)}</b> <span class="muted" style="font-size:12.5px">${p.last ? `${sinceLast(p)} days since you connected` : 'not yet logged'}</span></span><button class="btn sm" data-act="person-connected" data-id="${p.id}">Connected</button></div>`).join('')}
  </section>`;
}
function viewPeople(tabs = '') {
  const ps = (D.people || []).slice().sort((a, b) => overdueBy(b) - overdueBy(a));
  const month = todayStr().slice(0, 7);
  const thisMonth = connectsIn(month + '-01', todayStr());
  return `
  <div class="view-head"><div><h1>Goals</h1><p class="sub">${ps.length ? `${ps.length} ${ps.length === 1 ? 'person who makes' : 'people who make'} you who you are · ${thisMonth} catch-up${thisMonth === 1 ? '' : 's'} this month` : 'The relationships that make a life. Ascend reminds you when it has been too long.'}</p></div>
    <div class="row wrap">${tabs}<button class="btn primary shine" data-act="person-new">${icon('plus')}Add person</button></div></div>
  ${ps.length ? `<div class="people-grid">${ps.map((p, i) => {
    const od = overdueBy(p), since = sinceLast(p), b = nextBirthday(p), every = p.every || 14;
    const frac = since == null ? 1 : clamp(since / every, 0, 1);
    const state = since == null ? 'new' : od > 0 ? 'off' : od > -Math.ceil(every * 0.25) ? 'adjust' : 'on';
    return `<div class="person" style="--i:${i};--pc:${p.color || '#D6247A'}">
      <div class="p-top"><div class="avatar p-ring" style="--f:${frac}">${esc((p.name[0] || '?').toUpperCase())}</div>
        <div class="grow"><h3>${esc(p.name)}</h3><p class="muted" style="font-size:12.5px">${esc((EVERY.find(e => e[0] === every) || [0, 'Every ' + every + ' days'])[1])}${p.how ? ' · ' + esc(p.how) : ''}</p></div>
        <span class="chip status-${state}">${since == null ? 'Not logged' : since === 0 ? 'Today' : od > 0 ? `${od}d overdue` : `${since}d ago`}</span></div>
      ${b ? `<p class="muted" style="font-size:12.5px">${icon('cake', 'style="width:13px;height:13px;vertical-align:-2px"')} Birthday ${b.days === 0 ? 'today' : `in ${b.days} days, ${dayName(b.date, { day: 'numeric', month: 'short' })}`}</p>` : ''}
      ${p.notes ? `<p class="p-notes">${esc(p.notes)}</p>` : ''}
      <div class="g-actions"><button class="btn sm ${since === 0 ? '' : 'primary'}" data-act="person-connected" data-id="${p.id}">${icon('check')}${since === 0 ? 'Connected today' : 'Connected'}</button><button class="btn sm ghost" data-act="person-edit" data-id="${p.id}">${icon('edit')}Edit</button></div>
    </div>`; }).join('')}</div>`
    : `<section class="panel empty"><div class="empty-art">${icon('people')}</div><h3>Who matters most?</h3><p>Family, your partner, close friends, a mentor. Add them with how often you want to connect, and Ascend nudges you before it has been too long.</p><button class="btn primary" data-act="person-new">${icon('plus')}Add someone</button></section>`}`;
}
function personModal(p = null) {
  const isNew = !p;
  p = p || { id: uid(), name: '', every: 14, last: '', log: [], birthday: '', how: '', notes: '', color: PERSON_COLORS[(D.people || []).length % PERSON_COLORS.length] };
  const m = modal(`<h2>${isNew ? 'Add someone' : 'Edit ' + esc(p.name)}</h2><p class="sub">Strong relationships are the best predictor of a long, happy life.</p>
    <form>
      <div class="field"><label>Name</label><input class="input" name="name" value="${esc(p.name)}" required maxlength="40" placeholder="Mum, Rahul, my sister"></div>
      <div class="row"><div class="field grow"><label>How often do you want to connect?</label><select class="input" name="every">${EVERY.map(([v, l]) => `<option value="${v}" ${p.every === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field grow"><label>How</label><input class="input" name="how" value="${esc(p.how || '')}" maxlength="40" placeholder="Call, coffee, a walk"></div></div>
      <div class="row"><div class="field grow"><label>Birthday (optional)</label><input class="input" type="date" name="birthday" value="${esc(p.birthday || '')}"></div>
        <div class="field grow"><label>Last connected</label><input class="input" type="date" name="last" value="${esc(p.last || '')}" max="${todayStr()}"></div></div>
      <div class="field"><label>Notes</label><input class="input" name="notes" value="${esc(p.notes || '')}" maxlength="140" placeholder="Ask about the new job, exam on the 12th"></div>
      <div class="modal-actions">${isNew ? '' : '<button type="button" class="btn ghost" data-local="remove" style="margin-right:auto;color:var(--off)">Remove</button>'}<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Add' : 'Save'}</button></div>
    </form>`);
  m.addEventListener('click', (e) => {
    if (e.target.closest('[data-local=remove]') && confirmInline(e.target.closest('[data-local=remove]'), 'Remove?')) { D.people = D.people.filter(x => x.id !== p.id); save(); closeModal(); go('people'); }
  });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    Object.assign(p, { name: String(fd.get('name')).trim(), every: Number(fd.get('every')) || 14, how: String(fd.get('how') || '').trim(), birthday: String(fd.get('birthday') || ''), notes: String(fd.get('notes') || '').trim() });
    const last = String(fd.get('last') || ''); if (last !== (p.last || '')) { p.last = last; if (last && !(p.log || []).includes(last)) (p.log = p.log || []).push(last); }
    D.people = D.people || []; if (isNew) D.people.push(p);
    save(); closeModal(); go('people'); if (isNew) burst();
  });
}

// ---------- Life balance ----------
// Radar wheel: this week filled, the week before dashed
function balanceWheel(cur, prev, size = 220) {
  const c = size / 2, R = size / 2 - 28, n = AREAS.length;
  const pt = (i, v) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * v / 10; return [c + r * Math.cos(ang), c + r * Math.sin(ang)]; };
  const poly = (vals) => AREAS.map((a, i) => pt(i, vals[a.id] || 0).map(x => x.toFixed(1)).join(',')).join(' ');
  const rings = [2.5, 5, 7.5, 10].map(v => `<polygon points="${poly(Object.fromEntries(AREAS.map(a => [a.id, v])))}" fill="none" stroke="var(--mist)" stroke-width="1"/>`).join('');
  const labels = AREAS.map((a, i) => { const [x, y] = pt(i, 12.4); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${a.color}">${a.short}</text>`; }).join('');
  return `<svg class="wheel" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${rings}
    ${prev ? `<polygon points="${poly(prev)}" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="4 4"/>` : ''}
    ${cur ? `<polygon class="wheel-shape" points="${poly(cur)}" fill="rgba(255,79,31,.18)" stroke="var(--ember)" stroke-width="2.5" stroke-linejoin="round"/>${AREAS.map((a, i) => { const [x, y] = pt(i, cur[a.id] || 0); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${a.color}"/>`; }).join('')}` : ''}
    ${labels}</svg>`;
}
// Scores itself from the last 7 days (see areaScores in flow.js); dashed is the 7 days before
function lifeBalancePanel() {
  const T = todayStr(), sc = areaScores(addDays(T, -6), T), cur = areaValues(sc), prev = areaValues(areaScores(addDays(T, -13), addDays(T, -7)));
  const goals = activeGoals();
  const scored = AREAS.filter(a => sc[a.id].score != null);
  const low = scored.slice().sort((a, b) => sc[a.id].score - sc[b.id].score)[0];
  return `<section class="panel life-panel">
    <div class="life-wheel">${balanceWheel(cur, prev)}
      <p class="muted" style="font-size:12px;text-align:center">Last 7 days, filled in from your data · dashed: the 7 days before</p></div>
    <div class="grow">
      <h3 style="margin-bottom:4px">${icon('balance', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Your whole life</h3>
      <p class="muted" style="font-size:13px;margin-bottom:12px">${low && sc[low.id].score <= 5 ? `${low.label} is lowest right now (${sc[low.id].score}/10). One small habit there lifts the whole wheel.` : 'Sleep, workouts, focus, Anki, journal, mood, people and your goals score each area automatically.'}</p>
      <div class="area-list">${AREAS.map(a => { const gs = goals.filter(g => (g.area || 'study') === a.id); const s = sc[a.id]; return `<button class="area-row ${UI.area === a.id ? 'on' : ''}" data-act="area-filter" data-area="${a.id}" style="--c:${a.color}"><span class="area-ic">${icon(a.icon)}</span><span class="grow"><b>${a.label}</b><span class="muted">${esc([...s.bits.slice(0, 3), gs.length ? `${gs.length} goal${gs.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'No data yet')}</span></span><span class="area-score">${s.score ?? '–'}</span></button>`; }).join('')}</div>
    </div>
  </section>`;
}

// ---------- Hobby connections: Chess.com / Lichess, Goodreads, Google Calendar ----------
const LINKS = { busy: false, error: '' };
async function webText(url, accept) {
  if (!bridge.web) throw new Error('Not available in this version');
  const r = await bridge.web(url, accept);
  if (r.error) throw new Error(r.error);
  if (r.status === 404) throw new Error('not found');
  if (r.status >= 400) throw new Error('error ' + r.status);
  return r.text;
}
const webJSON = async (url) => JSON.parse(await webText(url, 'application/json'));
const dateOf = (ms) => todayStr(new Date(ms));
async function fetchChess(site, user) {
  const u = encodeURIComponent(String(user).trim().toLowerCase());
  const days = {}; let best = 0;
  if (site === 'lichess') {
    const p = await webJSON(`https://lichess.org/api/user/${u}`);
    for (const k of ['bullet', 'blitz', 'rapid', 'classical', 'correspondence']) { const x = p.perfs && p.perfs[k]; if (x && x.games) best = Math.max(best, x.rating || 0); }
    const since = parseDay(addDays(todayStr(), -120)).getTime();
    const nd = await webText(`https://lichess.org/api/games/user/${u}?since=${since}&max=600&moves=false&tags=false&clocks=false&evals=false&opening=false`, 'application/x-ndjson');
    for (const line of nd.split('\n')) { if (!line.trim()) continue; try { const g = JSON.parse(line); const d = dateOf(g.lastMoveAt || g.createdAt); days[d] = (days[d] || 0) + 1; } catch {} }
  } else {
    const st = await webJSON(`https://api.chess.com/pub/player/${u}/stats`);
    for (const k of ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily']) if (st[k] && st[k].last) best = Math.max(best, st[k].last.rating || 0);
    const arch = await webJSON(`https://api.chess.com/pub/player/${u}/games/archives`);
    for (const url of (arch.archives || []).slice(-4)) { const mo = await webJSON(url); for (const g of mo.games || []) { const d = dateOf(g.end_time * 1000); days[d] = (days[d] || 0) + 1; } }
  }
  return { site, user, best: best || null, days, at: Date.now() };
}
function goodreadsId(link) { const m = String(link || '').match(/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/) || String(link || '').match(/^\s*(\d+)\s*$/); return m ? m[1] : ''; }
async function fetchBooks(link) {
  const id = goodreadsId(link); if (!id) throw new Error('Paste your Goodreads profile link, like goodreads.com/user/show/12345-name');
  const xml = await webText(`https://www.goodreads.com/review/list_rss/${id}?shelf=read&per_page=200`, 'application/rss+xml');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const list = [...doc.querySelectorAll('item')].map(it => {
    const txt = (sel) => (it.querySelector(sel) || {}).textContent || '';
    const when = txt('user_read_at') || txt('user_date_added') || txt('pubDate');
    const d = when ? new Date(when) : null;
    return { title: txt('title').trim(), author: txt('author_name').trim(), date: d && !isNaN(d) ? todayStr(d) : '' };
  }).filter(b => b.title && b.date);
  return { id, list: list.slice(0, 200), at: Date.now() };
}
async function fetchCalendarGoals() {
  const gs = activeGoals().filter(g => g.metric === 'calendar' && g.keyword);
  if (!gs.length || !gEnabled()) return null;
  const from = D.season.start, until = todayStr();
  const evs = await gCall('events', { from: parseDay(from).toISOString(), to: parseDay(addDays(until, 1)).toISOString() });
  const cal = {};
  for (const g of gs) {
    const kw = g.keyword.toLowerCase().trim(), days = {};
    for (const e of evs || []) {
      if (e.allDay || !String(e.title || '').toLowerCase().includes(kw)) continue;
      const h = (new Date(e.end) - new Date(e.start)) / 36e5; if (!(h > 0 && h <= 12)) continue;
      const d = todayStr(new Date(e.start)); days[d] = round1((days[d] || 0) + h);
    }
    cal[g.id] = { days, keyword: g.keyword, at: Date.now() };
  }
  return cal;
}
async function syncLinks(manual = false) {
  if (!D || LINKS.busy) return;
  const s = D.settings, jobs = [];
  if (s.chessUser) jobs.push(['chess', () => fetchChess(s.chessSite || 'chess.com', s.chessUser)]);
  if (s.goodreadsUrl && !window.ASCEND_WEB) jobs.push(['books', () => fetchBooks(s.goodreadsUrl)]);
  if (activeGoals().some(g => g.metric === 'calendar')) jobs.push(['cal', fetchCalendarGoals]);
  if (!jobs.length) { if (manual) toast('Nothing to sync yet. Add a username or a calendar goal first.'); return; }
  LINKS.busy = true; const errs = [];
  try {
    const next = { ...(D.links || {}) };
    for (const [k, fn] of jobs) {
      try { const r = await fn(); if (r) next[k] = r; }
      catch (e) { errs.push(({ chess: s.chessSite === 'lichess' ? 'Lichess' : 'Chess.com', books: 'Goodreads', cal: 'Calendar' })[k] + ': ' + (/not found/.test(e.message) ? 'username or link not found' : e.message)); }
    }
    D.links = next; LINKS.error = errs.join(' · '); save();
    if (['goals', 'settings', 'today'].includes(currentView) && !$('.scrim')) rerender();
    if (manual) toast(errs.length ? LINKS.error : 'Hobby connections are up to date');
  } finally { LINKS.busy = false; }
}
function lifeLinksPanel() {
  const s = D.settings, L = D.links || {};
  const c = L.chess, b = L.books;
  return `<section class="panel conn ${c || b ? 'on' : ''}">
    <div class="conn-head"><span class="conn-ic hobby">${icon('palette')}</span><div class="grow"><h3>Hobby connections</h3><p class="muted" style="font-size:12.5px">Goals that fill themselves from what you already do. Free, no passwords: public usernames only.</p></div>
      <button type="button" class="btn sm" data-act="links-sync">${icon('sync')}Sync now</button></div>
    <div class="row"><div class="field" style="width:140px"><label>Chess site</label><select class="input" name="chessSite"><option value="chess.com" ${s.chessSite !== 'lichess' ? 'selected' : ''}>Chess.com</option><option value="lichess" ${s.chessSite === 'lichess' ? 'selected' : ''}>Lichess</option></select></div>
      <div class="field grow"><label>Chess username</label><input class="input" name="chessUser" value="${esc(s.chessUser || '')}" placeholder="Leave empty if you don't play" autocomplete="off"></div></div>
    ${c ? `<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">${icon('knight', 'style="width:13px;height:13px;vertical-align:-2px"')} ${c.best ? 'Best rating ' + c.best + ' · ' : ''}${chessGamesIn(addDays(todayStr(), -29), todayStr())} games in the last 30 days · updated ${ago(c.at)}</p>` : ''}
    <div class="field"><label>Goodreads profile link</label><input class="input" name="goodreadsUrl" value="${esc(s.goodreadsUrl || '')}" placeholder="https://www.goodreads.com/user/show/12345-your-name" autocomplete="off">
      <span class="hint">Your "read" shelf must be public. ${window.ASCEND_WEB ? 'Goodreads is read on your laptop or phone and synced here.' : ''}</span></div>
    ${b ? `<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">${icon('book', 'style="width:13px;height:13px;vertical-align:-2px"')} ${b.list.length} books on your read shelf · latest: ${esc((b.list[0] || {}).title || '–')} · updated ${ago(b.at)}</p>` : ''}
    <p class="hint muted" style="font-size:12px">Google Calendar time: create a goal tracked by "Time in Google Calendar" with a keyword like Guitar or Gym. Events with that word in the title count, from every calendar you show in Google Calendar.</p>
    ${LINKS.error ? `<p style="font-size:12.5px;color:var(--off)">${esc(LINKS.error)}</p>` : ''}
  </section>`;
}

// ---------- Views, events, schedule ----------
VIEWS.people = viewPeople;
AFTER.people = (fresh) => { if (fresh) Motion.countUp($('#view')); };

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'habit-toggle': {
      const g = D.goals.find(x => x.id === a.dataset.goal), d = a.dataset.d || todayStr();
      if (g && !habitTicked(g.id, d) && habitAuto(g, d)) { toast(`Already done: ${habitAutoLabel(g).toLowerCase()}. It ticks itself.`); break; }
      const on = toggleHabit(a.dataset.goal, d); if (on) { burst(a); chime('start'); } rerender(); break;
    }
    case 'person-new': personModal(); break;
    case 'person-edit': personModal((D.people || []).find(p => p.id === a.dataset.id)); break;
    case 'person-connected': personConnected(a.dataset.id); burst(a); rerender(); break;
    case 'area-filter': UI.area = UI.area === a.dataset.area ? null : a.dataset.area; rerender(); break;
    case 'links-sync': a.classList.add('busy'); syncLinks(true).finally(() => a.classList.remove('busy')); break;
  }
});
setTimeout(() => syncLinks(), 12000);
setInterval(() => syncLinks(), 6 * 3600e3);
