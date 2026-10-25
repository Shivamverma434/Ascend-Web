/* Ascend: Healthspan. A WHOOP-style biological "Ascend Age" and Pace of Aging, Recovery, Day Strain,
   a sleep coach, and what your habits do to your recovery. Data comes from intervals.icu, Health Connect
   (on the phone, synced to the laptop through Google) and what you log. Uses globals from app.js. */
'use strict';

const STRENGTH_HC = new Set([13, 70, 81]); // Health Connect: calisthenics, strength training, weightlifting
const BEHAVIORS = [
  ['caffeine', 'Caffeine after 2 pm', '☕'], ['alcohol', 'Alcohol', '🍷'], ['lateMeal', 'Late heavy meal', '🍽️'],
  ['screens', 'Screens in bed', '📱'], ['stress', 'Stressful day', '😣'], ['nap', 'Daytime nap', '😴'],
  ['breath', 'Meditation or breathwork', '🧘'], ['read', 'Read before bed', '📖'], ['sunlight', 'Morning sunlight', '🌅'], ['water', 'Drank enough water', '💧']
];

// ---------- Profile ----------
function ageYears(on = todayStr()) { const dob = D.settings.dob; if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null; return (parseDay(on) - parseDay(dob)) / (365.25 * 864e5); }
function hrMax() { const m = Number(D.settings.maxHr); if (m >= 120 && m <= 230) return m; const a = ageYears(); return a ? Math.round(208 - 0.7 * a) : 190; }
const recColor = (s) => s >= 67 ? '#2FA36B' : s >= 34 ? '#F2B33D' : '#E5484D';

// ---------- Health Connect (phone) ----------
const HCSYNC = { busy: false, error: '', status: null };
async function syncHealth(manual = false) {
  if (!D || !ASCEND_IS_MOBILE || !D.settings.hcOn || HCSYNC.busy || !bridge.health) return;
  HCSYNC.busy = true;
  try {
    const first = !(D.hc && D.hc.at);
    const span = first ? 90 : 21, from = addDays(todayStr(), -span);
    const r = await bridge.health.read({ days: span, hrMax: hrMax() });
    const hc = D.hc && D.hc.days ? JSON.parse(JSON.stringify(D.hc)) : { days: {}, sleep: [], exercise: [] };
    for (const k of Object.keys(hc.days)) if (k >= from) delete hc.days[k];
    Object.assign(hc.days, r.days || {});
    // Main sleep vs naps; total asleep time goes to the morning you woke up
    const seen = new Set();
    const sleep = [...(hc.sleep || []).filter(s => s.end.slice(0, 10) < from), ...(r.sleep || [])].filter(s => { const k = s.start + '|' + s.end; return !seen.has(k) && seen.add(k); }).map(s => {
      const sh = Number(s.start.slice(11, 13));
      return { ...s, nap: s.minutes < 180 && sh >= 9 && sh < 20 };
    });
    for (const day of Object.values(hc.days)) delete day.sleepSecs;
    for (const s of sleep) {
      if (s.nap) continue;
      const d = s.end.slice(0, 10); const day = hc.days[d] = hc.days[d] || {};
      day.sleepSecs = (day.sleepSecs || 0) + Math.max(0, s.minutes - (s.awake || 0)) * 60;
    }
    const keep = addDays(todayStr(), -200);
    hc.sleep = sleep.filter(s => s.end.slice(0, 10) >= keep);
    hc.exercise = [...(hc.exercise || []).filter(e => e.date < from), ...(r.exercise || [])].filter(e => e.date >= keep);
    for (const k of Object.keys(hc.days)) if (k < keep) delete hc.days[k];
    hc.at = Date.now(); D.hc = hc; HCSYNC.error = '';
    save();
    if (['health', 'fitness', 'today'].includes(currentView) && !$('.scrim')) rerender();
    if (manual) toast(`Health Connect: ${Object.keys(r.days || {}).length} days, ${(r.sleep || []).length} nights read`);
  } catch (e) { HCSYNC.error = e.message || String(e); if (manual) toast('Health Connect: ' + HCSYNC.error); }
  finally { HCSYNC.busy = false; }
}
// Health Connect is only on the Android app (not the laptop, not the iPad web app)
const hcHere = () => ASCEND_IS_MOBILE && !!bridge.health;
async function hcStatus() { try { HCSYNC.status = await bridge.health.status(); } catch (e) { HCSYNC.status = { error: e.message }; } return HCSYNC.status; }

// ---------- Daily numbers ----------
function zonesOn(date) {
  const h = D.hc && D.hc.days && D.hc.days[date];
  if (h && Array.isArray(h.z)) return { z: h.z.slice(0, 5).map(Number), known: true };
  const z = [0, 0, 0, 0, 0]; let known = false;
  const mx = hrMax();
  for (const w of workoutsOn(date)) {
    if (Array.isArray(w.zones) && w.zones.length) { known = true; w.zones.forEach((sec, i) => { z[Math.min(4, i)] += (sec || 0) / 60; }); continue; }
    if (w.avgHr) { known = true; const p = w.avgHr / mx; const i = p >= .9 ? 4 : p >= .8 ? 3 : p >= .7 ? 2 : p >= .6 ? 1 : 0; z[i] += w.minutes || 0; }
  }
  return { z, known };
}
// Day Strain, 0 to 21: heart-rate zone minutes (weighted 1 to 5) on a curve that gets harder to push up
function strainOn(date) {
  const { z, known } = zonesOn(date);
  let trimp = sum(z.map((m, i) => m * (i + 1)));
  const hasAllDay = !!(D.hc && D.hc.days && D.hc.days[date] && D.hc.days[date].z);
  for (const w of workoutsOn(date)) if (!w.avgHr && !(w.zones && w.zones.length) && !hasAllDay) trimp += (w.minutes || 0) * (w.effort || 3) * 0.9;
  if (!hasAllDay) { const st = (wellnessOn(date) || {}).steps; if (st) trimp += st / 1000 * 4; }
  if (!trimp && !known) return null;
  return round1(21 * (1 - Math.exp(-trimp / 190)));
}
function strainTarget(rec) { if (rec == null) return [10, 14]; return rec >= 67 ? [14, 18] : rec >= 34 ? [10, 14] : [4, 10]; }
// Sleep need for the night after `evening`: your base + extra after hard days + paying back recent debt
function sleepNeed(evening) {
  const base = Number(D.settings.sleepBase) || 7.5;
  const st = strainOn(evening) || 0;
  const debt = sum(range(addDays(evening, -6), evening).map(sleepHours).filter(x => x !== null), h => Math.max(0, base - h));
  return round1(base + Math.max(0, st - 10) * 0.07 + Math.min(1, debt * 0.12));
}
function sleepPerf(morning) { const h = sleepHours(morning); if (h === null) return null; return Math.min(100, Math.round(100 * h / sleepNeed(addDays(morning, -1)))); }
function wakeTime() {
  const ends = mainSleeps().slice(-7).map(s => Number(s.end.slice(11, 13)) * 60 + Number(s.end.slice(14, 16)));
  if (ends.length >= 3) return Math.round(mean(ends));
  const [h, m] = (D.settings.morningTime || '08:00').split(':').map(Number); return h * 60 + m - 30;
}
const hm = (mins) => { const d = new Date(); d.setHours(0, Math.round(((mins % 1440) + 1440) % 1440), 0, 0); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

// ---------- Ascend Age ----------
// Follows biological-age-research.md (WHOOP Healthspan style, PhenoAge-like maths). Each metric becomes a log hazard
// ratio against an expert-recommended target, from the published all-cause mortality studies. Correlated metrics are
// damped within their group so no habit counts twice. The total becomes years with the Gompertz law (mortality
// doubles about every 8 years). Biological Age uses up to 180 days of data, recent weeks counting more, and updates
// weekly. Pace of Aging compares your last 30 days with it. The tunable constants live in HS (horizon 2 keeps most
// people between 0x and 2x, as the spec suggests tuning it).
const HS = {
  b: Math.log(2) / 8, ageDays: 180, ageHalf: 60, paceDays: 30, horizon: 2, overlap: 0.4, gapClamp: 15, weeklyStep: 1,
  minNights: 21, nightWindow: 31, sleepOpt: 7.5, sriTarget: 80, rhrTarget: 60, z13Target: 150, z45Target: 75, strengthTarget: 60,
  stepsTarget: (age) => age >= 60 ? 7000 : 8000, ffmiTarget: (male) => male ? 18 : 15
};
// FRIEND registry treadmill VO2 max, 50th percentile for ages 25, 35 … 75
const VO2_P50 = { male: [48.0, 42.4, 37.8, 32.6, 28.2, 24.4], female: [37.6, 30.2, 26.7, 23.4, 20.0, 18.3] };
const interp = (x, pts) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };
const vo2Target = (age, male) => round1(interp(age, VO2_P50[male ? 'male' : 'female'].map((v, i) => [25 + 10 * i, v])));
// Log hazard ratio of each metric against its target: 0 at the target, above 0 is "older", below 0 "younger".
// Benefits stop where the evidence plateaus.
const LN = Math.log;
const HAZARD = {
  vo2: (v, t) => clamp(LN(0.86) * (v - t) / 3.5, -0.7, 0.7),                 // Kokkinos 2022: HR 0.86 per MET
  rhr: (r) => LN(1.09) * (clamp(r, 40, 100) - HS.rhrTarget) / 10,               // Zhang 2016: RR 1.09 per 10 bpm
  steps: (s, t) => { const x = (s - t) / t; return x < 0 ? -0.35 * Math.tanh(2 * x) : -0.05 * Math.tanh(x); }, // Paluch 2022: plateau
  sleepH: (h) => h < HS.sleepOpt ? LN(1.12) * Math.min((HS.sleepOpt - h) / 1.5, 1.5) : LN(1.30) * Math.min((h - HS.sleepOpt) / 1.5, 1.5) * 0.5, // Cappuccio 2010
  sri: (s) => LN(0.75) * clamp((s - HS.sriTarget) / 20, -2, 1),                // Windred 2024
  z13: (m) => Math.max(LN(0.61 / 0.69), LN(0.69) * (Math.log1p(m / HS.z13Target) / LN(2) - 1)), // Arem 2015: 31% at 150 min, 39% at 3-5x
  z45: (m) => Math.max(LN(0.61 / 0.69), LN(0.85) * (Math.log1p(m / HS.z45Target) / LN(2) - 1)),
  strength: (m) => LN(0.85) * (Math.min(m, 90) / HS.strengthTarget - 1) * (m <= 90 ? 1 : 0.8), // Momma 2022: J-shape
  lean: (f, t) => LN(1.30) * clamp((t - f) / 3, -0.5, 1.5)                     // low lean mass RR 1.30
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// Weighted mean of [value, weight] pairs after dropping implausible values and anything over 3 scaled MADs from the median
function robustMean(pairs, lo, hi, min = 7) {
  let p = pairs.filter(([v]) => v != null && isFinite(v) && v >= lo && v <= hi);
  if (p.length < min) return { v: null, n: p.length };
  const md = median(p.map(x => x[0])), mad = 1.4826 * median(p.map(x => Math.abs(x[0] - md)));
  if (mad > 0) p = p.filter(([v]) => Math.abs(v - md) <= 3 * mad);
  return { v: sum(p, x => x[0] * x[1]) / Math.max(1e-9, sum(p, x => x[1])), n: p.length };
}
const AGEMEMO = { at: 0, map: new Map() };
function memo(key, fn) {
  if (Date.now() - AGEMEMO.at > 4000) { AGEMEMO.at = Date.now(); AGEMEMO.map.clear(); }
  if (!AGEMEMO.map.has(key)) AGEMEMO.map.set(key, fn());
  return AGEMEMO.map.get(key);
}
// One entry per real sleep: Health Connect sometimes hands over the same session several times
function mainSleeps() {
  const seen = new Set();
  return ((D.hc && D.hc.sleep) || []).filter(s => { const k = s.start + '|' + s.end; if (s.nap || seen.has(k)) return false; seen.add(k); return true; });
}
// Minute-by-minute asleep map per calendar day, from every Health Connect sleep (naps included)
const sleepMap = () => memo('sleepmap', () => {
  const seen = new Set(), map = {};
  for (const s of (D.hc && D.hc.sleep) || []) {
    const k = s.start + '|' + s.end; if (seen.has(k)) continue; seen.add(k);
    for (let t = +new Date(s.start), e = +new Date(s.end); t < e; t += 6e4) { const d = new Date(t), day = todayStr(d); (map[day] = map[day] || new Uint8Array(1440))[d.getHours() * 60 + d.getMinutes()] = 1; }
  }
  return map;
});
// Sleep Regularity Index: the chance you are in the same state (asleep or awake) at the same minute 24 hours apart,
// scaled -100 to 100 (100 = perfectly regular). Only pairs of days that both have a recorded main sleep count, so a
// night the watch missed is not read as staying up.
function sriFor(ds, wt) {
  const map = sleepMap(), pairs = [], slept = memo('slept', () => new Set(mainSleeps().filter(s => s.minutes >= 180).map(s => s.end.slice(0, 10))));
  for (const d of ds) { const a = map[d], b = map[addDays(d, 1)]; if (!a || !b || !slept.has(d) || !slept.has(addDays(d, 1))) continue; let same = 0; for (let i = 0; i < 1440; i++) same += a[i] === b[i]; pairs.push([same / 1440, wt(d)]); }
  if (pairs.length < 7) return { v: null, n: pairs.length };
  return { v: -100 + 200 * sum(pairs, p => p[0] * p[1]) / sum(pairs, p => p[1]), n: pairs.length };
}
const vo2FromHr = (rhr) => 15.3 * hrMax() / rhr;
// Scales the heart-rate VO2 estimate to what your watch measures, and uses that one scale for every window, so a
// source that starts reporting VO2 max part-way through does not move you years overnight
const vo2Scale = () => memo('vo2scale', () => {
  const r = [];
  for (const d of new Set([...Object.keys(D.wellness), ...Object.keys((D.hc && D.hc.days) || {})])) {
    const v = (wellnessOn(d) || {}).vo2max; if (!(v >= 15 && v <= 90)) continue;
    const rhr = robustMean(range(addDays(d, -13), d).map(x => [(wellnessOn(x) || {}).restingHR, 1]), 30, 110, 3).v;
    if (rhr) r.push(v / vo2FromHr(rhr));
  }
  return r.length ? 1 + (median(r) - 1) * Math.min(1, r.length / 5) : 1;
});
// Fat-free mass index from Settings: lean mass (DXA), or body fat % with your latest weight
function ffmiOn(end) {
  const s = D.settings, h = Number(s.heightCm) / 100; if (!(h > 1.2 && h < 2.3)) return null;
  let lean = Number(s.leanKg);
  if (!(lean > 25 && lean < 130)) {
    const bf = Number(s.bodyFat); if (!(bf > 3 && bf < 60)) return null;
    let w = null; for (let i = 0; i < 180 && !w; i++) w = (wellnessOn(addDays(end, -i)) || {}).weight || null;
    w = w || Number(s.weightKg); if (!(w > 30 && w < 250)) return null;
    lean = w * (1 - bf / 100);
  }
  return lean / (h * h);
}
// Nights with at least 4 hours of sleep in the 31 days up to `end` (21 unlock Healthspan, like WHOOP)
const validNights = (end) => range(addDays(end, -(HS.nightWindow - 1)), end).filter(d => (sleepHours(d) || 0) >= 4).length;
function bodyMetrics(end = addDays(todayStr(), -1), days = HS.ageDays, half = HS.ageHalf) {
  const ds = range(addDays(end, -(days - 1)), end), endT = parseDay(end);
  const wt = (d) => 0.5 ** ((endT - parseDay(d)) / 864e5 / half);
  const well = (k) => ds.map(d => [(wellnessOn(d) || {})[k], wt(d)]);
  // Only days the watch or a log actually covered count, so windows that reach back before your data do not look lazy
  const covered = ds.filter(d => wellnessOn(d) || workoutsOn(d).length || (D.hc && D.hc.days && D.hc.days[d]));
  const wWeeks = Math.max(1e-9, sum(covered, wt)) / 7;
  const zs = covered.map(d => [zonesOn(d), wt(d)]), zKnown = zs.filter(([z]) => z.known).length;
  const hcStrength = (d) => sum(((D.hc && D.hc.exercise) || []).filter(e => e.date === d && STRENGTH_HC.has(e.type)), e => e.minutes);
  const strengthOn = (d) => sum(workoutsOn(d).filter(w => w.type === 'strength'), w => w.minutes) || hcStrength(d);
  const sl = robustMean(ds.map(d => [sleepHours(d), wt(d)]), 2, 14), rh = robustMean(well('restingHR'), 30, 110), st = robustMean(well('steps'), 1000, 60000);
  const measured = range(addDays(end, -89), end).map(d => (wellnessOn(d) || {}).vo2max).filter(v => v >= 15 && v <= 90);
  const est = rh.v ? vo2Scale() * vo2FromHr(rh.v) : null;
  const vo2 = measured.length ? (measured.length * median(measured) + (est ? 2 * est : 0)) / (measured.length + (est ? 2 : 0)) : est;
  return {
    sleepH: sl.v, sri: sriFor(ds, wt).v, rhr: rh.v, steps: st.v,
    z13: zKnown >= 7 ? sum(zs, ([z, w]) => w * (z.z[0] + z.z[1] + z.z[2])) / wWeeks : null,
    z45: zKnown >= 7 ? sum(zs, ([z, w]) => w * (z.z[3] + z.z[4])) / wWeeks : null,
    strength: covered.length >= 14 ? sum(covered, d => wt(d) * strengthOn(d)) / wWeeks : null,
    vo2: vo2 == null ? null : round1(vo2), vo2Est: !measured.length, ffmi: ffmiOn(end), age: ageYears(end), days: covered.length
  };
}
const METRIC_HELP = {
  vo2: ['One weekly interval session (4 × 4 min hard) raises VO₂ max faster than anything else.', 'Run or ride with your watch so it can estimate VO₂ max.'],
  rhr: ['Easy zone 2 cardio, good sleep and less alcohol bring it down within weeks.', 'Needs resting heart rate from intervals.icu or Health Connect.'],
  z13: ['Easy runs, brisk walks and cycling where you can still talk.', 'Needs heart-rate data from workouts or Health Connect.'],
  z45: ['Hard intervals or tempo runs, once or twice a week.', 'Needs heart-rate data from workouts or Health Connect.'],
  steps: ['A 20 minute walk after lunch adds about 2,500 steps.', 'Needs daily steps from your watch.'],
  sleepH: ['Same bedtime every night, room dark and cool, screens out 30 minutes before.', 'Needs sleep from your watch.'],
  sri: ['Keep bedtime and wake time within 30 minutes, weekends too.', 'Needs bed and wake times from Health Connect on your phone.'],
  strength: ['Two 30 minute full-body sessions a week.', 'Log strength workouts so they count.'],
  lean: ['Strength training and enough protein (about 1.6 g per kg) build lean mass.', 'Add your height and body fat % (smart scale) or lean mass (DXA scan) in Settings.']
};
const GROUPS = ['Cardio fitness', 'Sleep', 'Muscle'];
function ageFactors(m) {
  const male = D.settings.sex !== 'female', age = m.age || 30, vt = vo2Target(age, male), stT = HS.stepsTarget(age), ft = HS.ffmiTarget(male);
  const rows = [
    ['vo2', 0, m.vo2Est ? 'VO₂ max (estimated)' : 'VO₂ max', m.vo2, v => `${round1(v)}`, `${vt}+`, v => HAZARD.vo2(v, vt)],
    ['rhr', 0, 'Resting heart rate', m.rhr, v => `${Math.round(v)} bpm`, `${HS.rhrTarget} bpm or less`, HAZARD.rhr],
    ['z13', 0, 'Zone 1–3 minutes / week', m.z13, v => `${Math.round(v)} min`, `${HS.z13Target} min`, HAZARD.z13],
    ['z45', 0, 'Zone 4–5 minutes / week', m.z45, v => `${Math.round(v)} min`, `${HS.z45Target} min`, HAZARD.z45],
    ['steps', 0, 'Daily steps', m.steps, v => Math.round(v).toLocaleString(), stT.toLocaleString(), v => HAZARD.steps(v, stT)],
    ['sleepH', 1, 'Hours of sleep', m.sleepH, v => `${round1(v)} h`, '7 to 9 h', HAZARD.sleepH],
    ['sri', 1, 'Sleep consistency', m.sri, v => `SRI ${Math.round(v)}`, `SRI ${HS.sriTarget}+`, HAZARD.sri],
    ['strength', 2, 'Strength training / week', m.strength, v => `${Math.round(v)} min`, `${HS.strengthTarget} min`, HAZARD.strength],
    ['lean', 2, 'Lean body mass', m.ffmi, v => `FFMI ${round1(v)}`, `FFMI ${ft}+`, v => HAZARD.lean(v, ft)]
  ];
  const out = rows.map(([key, g, label, value, fmt, target, fn]) => ({ key, group: GROUPS[g], label, value, target, tip: METRIC_HELP[key][0], hint: METRIC_HELP[key][1],
    missing: value == null, display: value == null ? 'No data' : fmt(value), c: value == null ? 0 : fn(value) }));
  // Overlap: within each group the strongest metric counts in full, the others at 40%
  for (const g of GROUPS) {
    const gs = out.filter(x => x.group === g && !x.missing); if (!gs.length) continue;
    const top = gs.reduce((a, x) => Math.abs(x.c) > Math.abs(a.c) ? x : a);
    for (const x of gs) x.adj = x === top ? x.c : HS.overlap * x.c;
  }
  for (const x of out) { x.years = round1((x.adj || 0) / HS.b); x.atTarget = 0; }
  return out;
}
// Biological age gap for one window. Per-metric years always add up exactly to the gap.
function ageCalc(end, days = HS.ageDays, half = HS.ageHalf) {
  return memo(`calc|${end}|${days}|${half}`, () => {
    const m = bodyMetrics(end, days, half), f = ageFactors(m);
    if (f.filter(x => !x.missing).length < 3) return null;
    const raw = sum(f, x => x.years);
    if (Math.abs(raw) > HS.gapClamp) for (const x of f) x.years = round1(x.years * HS.gapClamp / Math.abs(raw));
    return { gap: round1(sum(f, x => x.years)), factors: f, metrics: m };
  });
}
// Like WHOOP, the age you see is recalculated once a week: it is the value as of last Sunday
function ageEnd(t = todayStr()) { const y = addDays(t, -1); return addDays(y, -parseDay(y).getDay()); }
const nextUpdate = () => addDays(ageEnd(), 8);
function firstDataDay() {
  const ds = [...Object.keys(D.wellness), ...D.workouts.map(w => w.date), ...Object.keys((D.hc && D.hc.days) || {})].filter(Boolean).sort();
  return ds[0] || todayStr();
}
// Weekly snapshots from the first week with enough data. The age moves at most 1 year a week.
function snapshots(end = ageEnd()) {
  return memo('snaps|' + end, () => {
    const out = []; let prev = null;
    let e = addDays(firstDataDay(), 27); e = addDays(e, (7 - parseDay(e).getDay()) % 7);
    for (; e <= end; e = addDays(e, 7)) {
      if (validNights(e) < HS.minNights) continue;
      const c = ageCalc(e); if (!c) continue;
      const gap = prev == null ? c.gap : round1(clamp(c.gap, prev - HS.weeklyStep, prev + HS.weeklyStep));
      out.push({ end: e, gap, calc: c }); prev = gap;
    }
    return out;
  });
}
function ascendAge(end = ageEnd()) {
  const sn = snapshots(end), s = sn[sn.length - 1];
  if (!s || s.end < addDays(end, -21)) return null;
  const m = s.calc.metrics, missing = s.calc.factors.filter(x => x.missing);
  const age = s.end === ageEnd() ? (ageYears() || m.age) : m.age;
  // ±1.8 years until there are 90 days of data, then narrower; wider for missing metrics and for under-25s
  const pm = round1((m.days < 90 ? 1.8 : 0.7 + 0.2 * missing.length) + (age && age < 25 ? 0.5 : 0));
  return { offset: s.gap, pending: round1(s.calc.gap - s.gap), age, bio: age ? round1(age + s.gap) : null, pm, end: s.end, factors: s.calc.factors, metrics: m, missing, completeness: round1((9 - missing.length) / 9 * 100) };
}
// Pace of Aging (spec method A): where your last 30 days point compared with your Biological Age.
// Pace = 1 + (30-day age gap − current age gap) / horizon, smoothed over 3 weeks, from −1× (best) to 3×.
function paceOfAging(end = ageEnd()) {
  const sn = snapshots(end), history = sn.slice(-26).map(s => [s.end, s.gap]);
  const recent = sn.slice(-3), raw = [];
  for (const s of recent) {
    if (validNights(s.end) < HS.minNights) continue;
    const c30 = ageCalc(s.end, HS.paceDays, Infinity); if (!c30) continue;
    raw.push({ p: 1 + (c30.gap - s.calc.gap) / HS.horizon, c30, s }); // against the full 180-day age, not the weekly-limited one
  }
  if (!raw.length || raw[raw.length - 1].s !== sn[sn.length - 1]) return { pace: null, weeks: sn.length, history };
  let ema = raw[0].p; for (const r of raw.slice(1)) ema = 0.5 * r.p + 0.5 * ema;
  const last = raw[raw.length - 1];
  const drivers = last.c30.factors.map(f => ({ label: f.label, slope: round1(f.years - (last.s.calc.factors.find(x => x.key === f.key) || {}).years || 0) }))
    .filter(d => Math.abs(d.slope) >= 0.2).sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope));
  return { pace: round1(clamp(ema, -1, 3)), weeks: sn.length, history, drivers, age30: last.c30.gap };
}

// ---------- What your habits do to recovery ----------
function behaviorInsights(days = 120) {
  const yes = {}, no = {};
  for (const d of range(addDays(todayStr(), -days), todayStr())) {
    const c = (D.days[d] || {}).checkin; if (!c || !Array.isArray(c.tags)) continue;
    const r = readiness(d); if (!r) continue;
    for (const [id] of BEHAVIORS) (c.tags.includes(id) ? (yes[id] = yes[id] || []) : (no[id] = no[id] || [])).push(r.score);
  }
  return BEHAVIORS.map(([id, label, em]) => ({ id, label, em, n: (yes[id] || []).length, effect: (yes[id] || []).length >= 3 && (no[id] || []).length >= 3 ? Math.round(mean(yes[id]) - mean(no[id])) : null }))
    .filter(x => x.effect !== null).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}
function behaviorChips(tags) {
  return `<div class="field"><label>Yesterday, did you…</label><div class="beh-chips">${BEHAVIORS.map(([id, label, em]) => `<button type="button" data-tag="${id}" class="${tags.includes(id) ? 'on' : ''}">${em} ${label}</button>`).join('')}</div><span class="hint">Over time Ascend shows which habits raise or lower your recovery.</span></div>`;
}

// ---------- Fitness: the three dials ----------
function dial(v, max, color, label, sub) {
  const C = 2 * Math.PI * 40, f = v == null ? 0 : clamp(v / max, 0, 1);
  return `<div class="dial"><div class="dial-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--mist-2)" stroke-width="9"/><circle class="dial-arc" cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" style="--c:${C}"/></svg>
    <b>${v == null ? '–' : `<span data-count="${v}" data-fmt="${max === 21 ? 'dec' : 'int'}">${v}</span>${max === 100 ? '<small>%</small>' : ''}`}</b></div><span class="dial-label">${label}</span><span class="dial-sub">${sub}</span></div>`;
}
function whoopRow(t = todayStr()) {
  const rd = readiness(t), st = strainOn(t), sp = sleepPerf(t);
  if (!rd && st == null && sp == null) return '';
  const [lo, hi] = strainTarget(rd && rd.score);
  const need = sleepNeed(t), bed = wakeTime() - need * 60 - 15;
  return `<section class="panel whoop">
    <div class="dials">${dial(sp, 100, '#7C8CF8', 'Sleep', sp == null ? 'no data' : `${sleepHours(t)}h of ${sleepNeed(addDays(t, -1))}h needed`)}${dial(rd ? rd.score : null, 100, rd ? recColor(rd.score) : 'var(--mist)', 'Recovery', rd ? rd.band.label : 'no data')}${dial(st, 21, '#3D8BFD', 'Strain', `target ${lo} to ${hi}`)}</div>
    <div class="coach-lines">
      <div>${icon('bolt')}<p><b>Strain coach:</b> ${st == null ? `Aim for ${lo} to ${hi} today.` : st < lo ? `You are at ${st}. ${rd && rd.score >= 67 ? 'You are recovered: push to' : 'A moderate session takes you to'} ${lo} to ${hi}.` : st > hi ? `You are at ${st}, above today's target. Ease off and recover.` : `${st} is right in today's ${lo} to ${hi} zone. Nice.`}</p></div>
      <div>${icon('moon')}<p><b>Sleep coach:</b> you need about <b>${need} h</b> tonight. In bed by <b>${hm(bed)}</b> to wake at ${hm(wakeTime())}.</p></div>
    </div>
  </section>`;
}

function paceDrivers(pc) {
  const up = (pc.drivers || []).filter(d => d.slope > 0).slice(0, 2), down = (pc.drivers || []).filter(d => d.slope < 0).slice(0, 2);
  if (pc.pace == null || (!up.length && !down.length)) return '';
  return `<p class="pace-why">${up.length ? `<span class="up">▲ ${up.map(d => esc(d.label)).join(', ')}</span>` : ''}${down.length ? `<span class="dn">▼ ${down.map(d => esc(d.label)).join(', ')}</span>` : ''}</p>`;
}
const fy = (y) => (y === 0 ? '0' : (y < 0 ? '−' : '+') + Math.abs(y)) + ' yrs';
const shortDate = (d) => parseDay(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

// ---------- Healthspan view ----------
function viewHealth() {
  const a = ascendAge(), pc = paceOfAging(), m = a ? a.metrics : bodyMetrics();
  const hasDob = !!ageYears(), nights = validNights(addDays(todayStr(), -1));
  const prev = a && snapshots().slice(-2, -1)[0];
  const wow = a && prev ? round1(a.offset - prev.gap) : null;
  const levers = a ? a.factors.filter(f => f.years >= 0.2).sort((x, y) => y.years - x.years).slice(0, 3) : [];
  const ins = behaviorInsights();
  const w7 = bodyMetrics(addDays(todayStr(), -1), 7, Infinity);
  const badges = [
    [w7.sleepH >= 7, '😴', '7 h+ sleep'], [w7.steps >= HS.stepsTarget(m.age || 30), '👟', `${HS.stepsTarget(m.age || 30) / 1000}k steps`], [w7.z13 >= 150, '❤️', '150 easy minutes'],
    [w7.z45 >= 75, '🔥', '75 hard minutes'], [w7.strength >= 60, '🏋️', 'Strength 60 min'], [a && a.offset < 0, '🧬', 'Younger than your age'], [wow !== null && wow < 0, '📉', 'Age down this week']
  ];
  const paceTxt = pc.pace == null ? 'Needs a full 30 days of data' : pc.pace < 1 ? 'Your last 30 days point younger' : pc.pace <= 1.5 ? 'Your last 30 days hold you about steady' : 'Your last 30 days point older';
  const hist = pc.history || [];
  const spark = hist.length >= 2 ? (() => { const ys = hist.map(p => p[1]); const lo = Math.min(...ys) - .3, hi = Math.max(...ys) + .3; const W = 220, H = 54; return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="${hist.map((p, i) => `${i ? 'L' : 'M'}${(i / (hist.length - 1) * W).toFixed(1)} ${(H - 4 - (p[1] - lo) / (hi - lo) * (H - 8)).toFixed(1)}`).join(' ')}" fill="none" stroke="#FFE08A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`; })() : '';
  const maxY = a ? Math.max(1, ...a.factors.map(f => Math.abs(f.years))) : 1;
  return `
  <div class="view-head"><div><h1>Healthspan</h1><p class="sub">Your biological age from up to 6 months of sleep, fitness and activity. Updated weekly · next update ${shortDate(nextUpdate())}.</p></div>
    ${ASCEND_IS_MOBILE && D.settings.hcOn ? `<button class="btn ghost" data-act="hc-sync">${icon('sync', 'class="' + (HCSYNC.busy ? 'spinning' : '') + '"')}Sync</button>` : ''}</div>
  ${!hasDob ? `<div class="carry"><p><b>Add your date of birth</b> to see your Ascend Age. Until then you see how many years your habits add or take away.</p><button class="btn sm" data-act="health-profile">Add it</button></div>` : ''}
  ${a ? `<section class="age-hero">
    <div class="age-main"><span class="eyebrow">Ascend Age</span><div class="age-num"><b data-count="${a.bio ?? Math.abs(a.offset)}" data-fmt="dec">${a.bio ?? Math.abs(a.offset)}</b>${a.bio == null ? '<small>years</small>' : ''}<small class="age-pm">±${a.pm}</small></div>
      <p>${a.offset < 0 ? `<b>${Math.abs(a.offset)} years younger</b> than` : a.offset > 0 ? `<b>${a.offset} years older</b> than` : 'Exactly'} ${hasDob ? `your age of ${Math.floor(a.age)}` : 'your age'}.</p>
      ${wow !== null ? `<span class="age-wow ${wow <= 0 ? 'good' : 'bad'}">${wow === 0 ? 'Same as last week' : `${wow < 0 ? '▼' : '▲'} ${Math.abs(wow)} year${Math.abs(wow) === 1 ? '' : 's'} since last week`}</span>` : ''}
      ${Math.abs(a.pending) >= 0.1 ? `<p class="age-pending">Moves at most 1 year a week: ${fy(a.pending)} still to come.</p>` : ''}</div>
    <div class="age-pace"><span class="eyebrow">Pace of Aging</span><div class="pace-gauge"><i style="left:${clamp((pc.pace ?? 1) + 1, 0, 4) / 4 * 100}%"></i></div><div class="pace-scale"><span>-1×</span><span>1×</span><span>3×</span></div>
      <b class="pace-num">${pc.pace == null ? '…' : pc.pace + '×'}</b><p>${paceTxt}</p>${paceDrivers(pc)}${spark}</div>
  </section>` : nights < HS.minNights ? `<section class="panel empty"><div class="empty-art">${icon('heart')}</div><h3>Wear your watch for 21 nights to unlock</h3><p class="muted">${nights} of 21 nights in the last month.</p><i class="f-bar" style="max-width:260px;margin:10px auto 0"><b style="width:${Math.round(100 * nights / 21)}%;background:var(--on)"></b></i></section>`
    : `<section class="panel empty"><div class="empty-art">${icon('heart')}</div><h3>Not enough data yet</h3><p class="muted">Ascend needs about 4 weeks with at least three of: sleep, resting heart rate, steps, heart-rate zones, VO₂ max. Connect intervals.icu, or Health Connect on your phone.</p></section>`}
  <div class="badges">${badges.map(([on, em, l]) => `<span class="badge ${on ? 'on' : ''}" title="${on ? 'Earned this week' : 'Not yet this week'}">${em} ${l}</span>`).join('')}</div>
  ${levers.length ? `<section class="panel levers"><div class="panel-head"><h3>Your biggest opportunity</h3><span class="muted" style="font-size:12px">Reach the target to take these years off</span></div>
    ${levers.map((f, i) => `<div class="lever" style="--i:${i}"><b class="lever-gain">−${f.years}<small>yrs</small></b><div><b>${f.label}: ${esc(f.display)} → ${esc(f.target)}</b><p>${esc(f.tip)}</p></div></div>`).join('')}</section>` : ''}
  ${a ? `<div class="factor-groups">${GROUPS.map(g => { const fs = a.factors.filter(f => f.group === g).sort((x, y) => x.missing - y.missing || Math.abs(y.years) - Math.abs(x.years)); return `<section class="panel"><div class="panel-head"><h3>${g}</h3><b class="${sum(fs, f => f.years) <= 0 ? 'good' : 'bad'} grp-total">${fy(round1(sum(fs, f => f.years)))}</b></div>
    ${fs.map(f => `<div class="factor ${f.missing ? 'missing' : ''}"><div class="row" style="justify-content:space-between"><span>${esc(f.label)}</span><b class="${f.missing ? 'muted' : f.years <= 0 ? 'good' : 'bad'}">${f.missing ? '–' : fy(f.years)}</b></div><div class="row" style="justify-content:space-between"><b class="f-val">${esc(f.display)}</b><span class="muted">target ${esc(f.target)}</span></div>${f.missing ? `<p class="muted" style="font-size:12px;margin-top:4px">${esc(f.hint)}${f.key === 'lean' ? ` <a href="#" data-act="health-profile">Add it</a>` : ''}</p>` : `<i class="f-bar"><b style="width:${clamp(100 * Math.abs(f.years) / maxY, 4, 100)}%;background:${f.years <= 0 ? 'var(--on)' : f.years < 1 ? 'var(--adjust)' : 'var(--off)'}"></b></i>`}</div>`).join('')}</section>`; }).join('')}</div>` : ''}
  <section class="panel"><div class="panel-head"><h3>What affects your recovery</h3><span class="muted" style="font-size:12px">From the habits you tick in your morning check-in</span></div>
    ${ins.length ? `<div class="ins">${ins.map(x => `<div class="ins-row"><span>${x.em} ${esc(x.label)}</span><i><b class="${x.effect >= 0 ? 'up' : 'down'}" style="width:${Math.min(50, Math.abs(x.effect) * 2)}%"></b></i><b class="${x.effect >= 0 ? 'good' : 'bad'}">${x.effect >= 0 ? '+' : ''}${x.effect}%</b></div>`).join('')}</div>` : `<p class="muted">Tick what you did yesterday in your morning check-in (alcohol, late caffeine, screens in bed…). After a few of each, Ascend shows how much each one moves your recovery.</p>`}
  </section>
  <p class="muted" style="font-size:12px;margin-top:14px">Data: ${[D.settings.intervalsKey ? 'intervals.icu' : '', D.hc && D.hc.at ? `Health Connect (${ago(D.hc.at)})` : '', 'your logs'].filter(Boolean).join(', ')}${a ? ` · ${a.metrics.days} days used · ${a.completeness}% of metrics` : ''}. ${m.vo2Est ? 'VO₂ max is estimated from resting and max heart rate. ' : ''}Each metric is weighed by published research on long-term health, and Biological Age moves slowly while Pace reacts to your last 30 days. Ascend Age is a wellness estimate inspired by WHOOP's Healthspan, not a medical test.</p>`;
}

function healthTodayCard() {
  const a = ascendAge(); if (!a) return '';
  return `<section class="panel age-card" data-go="health"><div class="row" style="justify-content:space-between"><h3>${icon('heart', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} Ascend Age</h3><b class="age-mini">${a.bio ?? (a.offset > 0 ? '+' : '') + a.offset}</b></div>
    <p class="muted" style="font-size:13px;margin-top:4px">${a.offset < 0 ? `${Math.abs(a.offset)} years younger than your age` : a.offset > 0 ? `${a.offset} years older than your age` : 'Right at your age'} · tap for your biggest opportunity</p></section>`;
}

// ---------- Settings ----------
function healthPanels() {
  const s = D.settings, st = HCSYNC.status;
  return `<section class="panel conn ${D.hc && D.hc.at ? 'on' : ''}" id="healthPanel">
    <div class="conn-head"><span class="conn-ic hc">${icon('heart')}</span><div class="grow"><h3>Healthspan profile and Health Connect</h3><p class="muted" style="font-size:12.5px">${hcHere() ? 'Reads sleep stages, heart rate, HRV, steps, workouts and VO₂ max that your watch app (Zepp, Fitbit, Samsung Health…) shares with Health Connect.' : `Health Connect works on your phone. ${D.hc && D.hc.at ? 'Last read on the phone ' + ago(D.hc.at) + ', synced here through Google.' : 'Turn it on in Ascend on your phone.'}`}</p></div>
      ${ASCEND_IS_MOBILE && s.hcOn ? `<button type="button" class="btn sm" data-act="hc-sync">${icon('sync')}Sync now</button>` : ''}</div>
    <div class="row"><div class="field grow"><label>Date of birth</label><input class="input" type="date" name="dob" value="${esc(s.dob || '')}" max="${todayStr()}"></div>
    <div class="field grow"><label>Sex (for fitness norms)</label><select class="input" name="sex"><option value="male" ${s.sex !== 'female' ? 'selected' : ''}>Male</option><option value="female" ${s.sex === 'female' ? 'selected' : ''}>Female</option></select></div></div>
    <div class="row"><div class="field grow"><label>Max heart rate (optional)</label><input class="input" type="number" name="maxHr" min="120" max="230" value="${esc(s.maxHr || '')}" placeholder="${hrMax()}"></div>
    <div class="field grow"><label>Your sleep need (hours)</label><input class="input" type="number" name="sleepBase" step="0.25" min="6" max="10" value="${esc(s.sleepBase || 7.5)}"></div></div>
    <div class="row"><div class="field grow"><label>Height (cm)</label><input class="input" type="number" name="heightCm" min="120" max="230" value="${esc(s.heightCm || '')}"></div>
    <div class="field grow"><label>Body fat % (smart scale)</label><input class="input" type="number" name="bodyFat" step="0.1" min="3" max="60" value="${esc(s.bodyFat || '')}"></div></div>
    <div class="row"><div class="field grow"><label>Lean mass kg (DXA, optional)</label><input class="input" type="number" name="leanKg" step="0.1" min="25" max="130" value="${esc(s.leanKg || '')}"></div>
    <div class="field grow"><label>Weight kg (if your watch has none)</label><input class="input" type="number" name="weightKg" step="0.1" min="30" max="250" value="${esc(s.weightKg || '')}"></div></div>
    <p class="hint muted" style="font-size:12px">Height with body fat % or lean mass gives the lean body mass metric in Healthspan.</p>
    ${hcHere() ? `<div class="row wrap">${st && st.available === false ? `<p class="muted" style="font-size:12.5px">${st.needsInstall ? 'Install or update the Health Connect app from the Play Store first.' : 'Health Connect is not available on this phone.'}</p>` : `<button type="button" class="btn ${s.hcOn ? '' : 'primary'} sm" data-act="hc-connect">${icon('heart')}${s.hcOn ? 'Check permissions' : 'Connect Health Connect'}</button>`}
      ${st && st.total ? `<span class="muted" style="font-size:12.5px">${st.granted}/${st.total} data types allowed</span>` : ''}${HCSYNC.error ? `<span style="font-size:12.5px;color:var(--off)">${esc(HCSYNC.error)}</span>` : ''}</div>
      <p class="hint muted" style="font-size:12px;margin-top:8px">In the Zepp app: Profile › Add accounts (or Health data) › Health Connect, and allow everything. Then connect here.</p>` : ''}
  </section>`;
}

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-tag]');
  if (tg && UI.ci) { UI.ci.tags = UI.ci.tags || []; const id = tg.dataset.tag; UI.ci.tags = UI.ci.tags.includes(id) ? UI.ci.tags.filter(x => x !== id) : [...UI.ci.tags, id]; tg.classList.toggle('on'); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'hc-sync': a.classList.add('busy'); await syncHealth(true); a.classList.remove('busy'); break;
    case 'hc-connect': {
      a.classList.add('busy');
      try {
        const st = await bridge.health.authorize(); HCSYNC.status = st;
        if (st.available && st.granted > 0) { D.settings.hcOn = true; save(); toast('Health Connect connected. Reading your data…'); await syncHealth(true); }
        else if (!st.available) toast(st.needsInstall ? 'Install Health Connect from the Play Store first' : 'Health Connect is not available on this phone');
        else toast('No data types were allowed. Try again and tick them all.');
      } catch (err) { toast('Health Connect: ' + (err.message || err)); }
      a.classList.remove('busy'); rerender(); break;
    }
    case 'health-profile': e.preventDefault(); go('settings'); setTimeout(() => { const p = $('#healthPanel'); if (p) { p.scrollIntoView({ block: 'center' }); p.classList.add('flash'); const f = $('[name=dob]', p); if (f) f.focus(); } }, 150); break;
  }
});

VIEWS.health = viewHealth;
AFTER.health = (fresh) => { if (fresh) Motion.countUp($('#view')); };
if (hcHere()) {
  setTimeout(async () => { if (D && D.settings.hcOn) { await hcStatus(); syncHealth(); } }, 5000);
  let lastHc = 0;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastHc > 30 * 60e3) { lastHc = Date.now(); syncHealth(); } });
  setInterval(() => syncHealth(), 60 * 60e3);
}
