/* Ascend: the daily loop, rebuilt on the evidence. Reminders tied to your own plan instead of generic nudges
   (if-then plans), a minimum and a stretch for "today is a win if", two reserve days a week, rest mode, habit
   strength that a single miss does not wipe out, skips, bounce-back credit, and a sleep kit that steps lights-out
   earlier only while the 08:00 wake anchor holds. Uses globals from app.js, health.js, life.js, flow.js, prep.js. */
'use strict';

// ---------- Reserve days and rest mode ----------
const RESERVE_PER_WEEK = 2;
const reservesUsed = (d = todayStr()) => { const ws = weekStart(d); return range(ws, addDays(ws, 6)).filter(x => D.reserve && D.reserve[x]).length; };
function toggleReserve(d = todayStr()) {
  D.reserve = D.reserve || {};
  if (D.reserve[d]) delete D.reserve[d];
  else if (reservesUsed(d) < RESERVE_PER_WEEK) D.reserve[d] = { v: 1 };
  else { toast(`Both reserve days are used this week.`); return; }
  save(); rerender();
}

// ---------- Habits: skips, strength, forgiving streaks ----------
const habitSkipped = (gid, d) => !!(D.habitSkip && D.habitSkip[d] && D.habitSkip[d][gid]) || offDay(d);
function toggleSkip(gid, d = todayStr()) {
  D.habitSkip = D.habitSkip || {};
  const day = D.habitSkip[d] = D.habitSkip[d] || {};
  if (day[gid]) delete day[gid]; else day[gid] = { v: 1 };
  if (!Object.keys(day).length) delete D.habitSkip[d];
  save(); rerender();
}
// Habit strength, the Loop Habit Tracker way: each day moves the score a little toward 1 (done) or 0 (missed), so one
// miss costs a few points instead of everything. Skipped days leave it unchanged. A daily habit loses half its
// strength after about 13 days without it.
function habitStrength(g) {
  return memo('hstr:' + g.id, () => {
    const T = todayStr(), times = habitTimes(g), freq = times / 7, m = 0.5 ** (Math.sqrt(freq) / 13);
    const logs = Object.keys(D.habitLog || {}).filter(d => D.habitLog[d][g.id]).sort();
    const start = [logs[0], D.season.start].filter(Boolean).sort()[0] || T;
    let s = 0;
    for (const d of range(start < addDays(T, -365) ? addDays(T, -365) : start, T)) {
      if (habitSkipped(g.id, d)) continue;
      const v = times === 7 ? (habitDone(g.id, d) ? 1 : 0) : Math.min(1, range(addDays(d, -6), d).filter(x => habitDone(g.id, x)).length / times);
      if (d === T && !v) continue; // today is not a miss until it is over
      s = s * m + v * (1 - m);
    }
    return Math.round(100 * s);
  });
}
// Streaks that forgive: skips and reserve days pause them, and one missed day a week between done days does not break
// the chain (missing once does not slow habit formation, Lally 2010)
habitStreak = function (g) {
  const times = habitTimes(g), T = todayStr();
  if (times === 7) {
    let s = 0, d = T, grace = 0;
    if (!habitDone(g.id, d)) d = addDays(d, -1);
    for (let i = 0; i < 3650; i++, d = addDays(d, -1), grace--) {
      if (habitDone(g.id, d)) { s++; continue; }
      if (habitSkipped(g.id, d)) continue;
      // The day before the miss, stepping over skips, must be done for the miss to be forgiven
      let p = addDays(d, -1); for (let k = 0; k < 7 && !habitDone(g.id, p) && habitSkipped(g.id, p); k++) p = addDays(p, -1);
      if (grace <= 0 && habitDone(g.id, p)) { grace = 7; continue; }
      break;
    }
    return { n: s, unit: s === 1 ? 'day' : 'days' };
  }
  const weekOk = (ws) => { const days = range(ws, addDays(ws, 6)); return days.filter(x => habitDone(g.id, x)).length + days.filter(x => !habitDone(g.id, x) && habitSkipped(g.id, x)).length >= times; };
  let s = 0, ws = weekStart(T);
  if (weekOk(ws)) s++;
  ws = addDays(ws, -7);
  while (weekOk(ws) && s < 520) { s++; ws = addDays(ws, -7); }
  return { n: s, unit: s === 1 ? 'week' : 'weeks' };
};
// Bounce-back credit: the first tick after a miss is the one that matters most
const toggleHabitPlain = toggleHabit;
toggleHabit = function (gid, d = todayStr()) {
  const on = toggleHabitPlain(gid, d);
  const g = D.goals.find(x => x.id === gid), y = addDays(d, -1);
  if (on && g && habitTimes(g) === 7 && !habitDone(gid, y) && !habitSkipped(gid, y)) setTimeout(() => toast('Bounce-back. Coming back after a miss is what builds the habit.'), 350);
  return on;
};

// ---------- Minimum and stretch ----------
function winLine(ci) {
  if (!ci || !(ci.win || ci.stretch)) return '';
  const chip = (k, label, text) => text ? `<button class="win-chip ${ci[k] ? 'on' : ''}" data-act="win-mark" data-k="${k}">${ci[k] ? '✓' : '○'} <b>${label}</b> ${esc(text)}</button>` : '';
  return `<div class="hero-wins">${chip('floorDone', 'Minimum:', ci.win)}${chip('stretchDone', 'Stretch:', ci.stretch)}</div>`;
}

// ---------- Reminders tied to your plan ----------
// At most 3 a day: the targets you gave a time, at that time, worded as the if-then you set in the check-in.
function planPrompts(d = todayStr()) {
  if (D.settings.nudgeMode !== 'plan' || offDay(d)) return [];
  return ((D.days[d] || {}).targets || []).filter(t => t.time && !t.done).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);
}
const planText = (t) => ({ title: t.cue ? `When ${t.cue}, you said you would: ${t.title}` : `${fmtHM(t.time)}. You planned: ${t.title}`, body: 'Start it now. The first 25 minutes is the hard part.' });
const buildNudgeFlow = buildNudge;
buildNudge = function (kind, force = false) {
  if (String(kind).startsWith('plan:')) {
    const t = ((D.days[todayStr()] || {}).targets || []).find(x => x.id === kind.slice(5));
    if (!t || t.done) return null;
    const p = planText(t);
    return { sound: D.settings.sound, kind, theme: 'energy', icon: 'target', eyebrow: `${fmtHM(t.time)} · your plan`, title: p.title, body: p.body, actions: [{ label: 'Start focus', view: 'focus', focusTask: t.title, focusGoal: t.goalId, primary: true }, { label: 'In 15 min', snooze: 15, kind }] };
  }
  if (kind === 'nudge' && (D.settings.nudgeMode === 'off' || offDay(todayStr())) && !force) return null;
  return buildNudgeFlow(kind, force);
};

// ---------- Sleep kit ----------
const caffeineCutoff = () => { const m = (hhmmMin(D.settings.bedTime || '00:30') - 528 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
// Mornings in the last 7 you were up by the wake anchor (15 minutes of grace), from Health Connect sleep
function wakeHeld() {
  const T = todayStr(), anchor = hhmmMin(D.settings.wakeTime || '08:00') + 15;
  const days = range(addDays(T, -6), T).map(wakeMin).filter(x => x != null);
  return { held: days.filter(w => w <= anchor).length, known: days.length };
}
// Lights-out moves 15 minutes earlier only when the wake anchor held on 5 of the last 7 days, at most once every 5 days
function bedStepReady() {
  const s = D.settings, cur = nightMin(hhmmMin(s.bedTime || '00:30')), goal = nightMin(hhmmMin(s.bedGoal || '00:00'));
  if (cur <= goal) return null;
  if (s.bedStepAt && daysBetween(s.bedStepAt, todayStr()) < 5) return null;
  const w = wakeHeld(); if (w.held < 5) return null;
  const next = Math.max(goal, cur - 15) % 1440;
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}
function sleepKitCard() {
  const s = D.settings, w = wakeHeld(), step = bedStepReady();
  const light = activeGoals().find(g => g.metric === 'habit' && /light/i.test(g.name));
  return `<section class="panel sleep-kit"><div class="panel-head"><h3>${icon('moon', 'style="width:16px;height:16px;color:#5A3CF0;vertical-align:-2px"')} Sleep</h3><span class="muted" style="font-size:12px">${w.known ? `woke by ${fmtHM(s.wakeTime || '08:00')} on ${w.held} of ${w.known} days` : 'wake times come from Health Connect'}</span></div>
    <div class="sk-row"><div><span>Wake anchor</span><b>${fmtHM(s.wakeTime || '08:00')}</b></div><div><span>Lights out</span><b>${fmtHM(s.bedTime || '00:30')}</b></div><div><span>Last coffee</span><b>${fmtHM(caffeineCutoff())}</b></div></div>
    <p style="font-size:12.5px;margin-top:8px">${typeof sleepPlanLine === "function" ? sleepPlanLine() : ""}</p>
    ${step ? `<div class="carry" style="margin-top:10px"><p><b>Anchor held ${w.held}/7.</b> Move lights-out 15 minutes earlier, to ${fmtHM(step)}?</p><button class="btn sm" data-act="bed-step" data-to="${step}">Move it</button></div>`
      : nightMin(hhmmMin(s.bedTime || '00:30')) > nightMin(hhmmMin(s.bedGoal || '00:00')) ? `<p class="muted" style="font-size:12px;margin-top:8px">Lights-out moves toward ${fmtHM(s.bedGoal || '00:00')} in 15-minute steps once you wake by ${fmtHM(s.wakeTime || '08:00')} on 5 of 7 days.</p>` : ''}
    ${light ? '' : `<button class="btn ghost sm" data-act="light-habit" style="margin-top:8px">${icon('sun')}Add a morning-light habit</button>`}</section>`;
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'reserve-day': if (D.reserve && D.reserve[todayStr()] || confirmInline(a, 'Use one?')) toggleReserve(); break;
    case 'habit-skip': toggleSkip(a.dataset.goal, a.dataset.d || todayStr()); break;
    case 'win-mark': { const ci = day(todayStr()).checkin; if (!ci) return; ci[a.dataset.k] = !ci[a.dataset.k]; save(); if (ci[a.dataset.k]) { burst(a); chime('done'); } rerender(); break; }
    case 'bed-step': D.settings.bedTime = a.dataset.to; D.settings.bedStepAt = todayStr(); save(); toast(`Lights out is now ${fmtHM(a.dataset.to)}. The reminder and coffee cut-off moved with it.`); rerender(); break;
    case 'light-habit': {
      D.goals.push({ id: uid(), name: 'Outdoor light within 30 min of waking', why: 'Morning light pulls your body clock earlier', area: 'health', metric: 'habit', times: 7, target: 7 * D.season.weeks, unit: '', color: '#E8930C', logs: [] });
      save(); toast('Added. Tick it on Today.'); rerender(); break;
    }
  }
});
