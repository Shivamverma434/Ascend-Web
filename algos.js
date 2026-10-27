/* Ascend: health algorithms from the research, all automatic. A log-HRV 7-day band, resting HR from sleeping heart
   rate with a median baseline, sleep need from an 8.4 h prior with a 14-night weighted debt and the ceiling your sleep
   window allows, training load from intervals.icu fitness and fatigue plus session effort for lifting, an overnight
   strain watch adapted from NightSignal, max heart rate from your own hard efforts, sleep continuity, social jetlag,
   running efficiency and race prediction, adaptive maintenance calories, normalized FFMI and a PhenoAge lab age.
   None of it is a diagnosis. Uses globals from app.js, health.js, flow.js, prep.js, body.js and metrics.js. */
'use strict';

const ALG = { hrvK: 0.75, hrvBase: 60, needPrior: 8.4, debtR: 0.872, rhrHigh: 4 };
const medianOf = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const sdOf = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a, x => (x - m) ** 2) / (a.length - 1)); };

// ---------- 1. HRV: ln(RMSSD), 7-night mean against a 60-night personal band (AIS guidelines; Plews) ----------
function hrvBand(date = todayStr()) {
  return memo('hrv:' + date, () => {
    const ln = (d) => { const v = (wellnessOn(d) || {}).hrv; return v > 0 ? Math.log(v) : null; };
    const last7 = range(addDays(date, -6), date).map(ln).filter(v => v != null);
    const base = range(addDays(date, -6 - ALG.hrvBase), addDays(date, -7)).map(ln).filter(v => v != null);
    if (last7.length < 3 || base.length < 14) return { state: 'calibrating', n7: last7.length, nb: base.length };
    const m7 = mean(last7), mu = mean(base), sd = sdOf(base) || 0.05;
    const lo = mu - ALG.hrvK * sd, hi = mu + ALG.hrvK * sd, today = ln(date);
    const z = today != null ? (today - mu) / sd : (m7 - mu) / sd;
    const cv = 100 * sdOf(last7) / m7;
    return { state: m7 < lo ? 'low' : m7 > hi ? 'high' : 'normal', m7, mu, sd, lo, hi, z, cv, ms7: Math.round(Math.exp(m7)), msBase: Math.round(Math.exp(mu)) };
  });
}

// ---------- 2. Resting HR: median heart rate while asleep, median and MAD baseline (NightSignal, Alavi 2022) ----------
// Falls back to Health Connect's resting HR when the watch gives too little overnight heart rate
function nightRhr(d) { const s = sleepEnding(d); if (s && s.hrMed) return { v: s.hrMed, src: 'sleep' }; const r = (wellnessOn(d) || {}).restingHR; return r ? { v: r, src: 'rest' } : null; }
function rhrBaseline(date = todayStr()) {
  return memo('rhr:' + date, () => {
    const prev = range(addDays(date, -60), addDays(date, -1)).map(nightRhr).filter(Boolean);
    const sleepN = prev.filter(x => x.src === 'sleep').length, src = sleepN >= 7 ? 'sleep' : 'rest';
    const vals = prev.filter(x => x.src === src).map(x => x.v).slice(-60);
    if (vals.length < 7) return null;
    const base = medianOf(vals), spread = Math.max(1, 1.4826 * medianOf(vals.map(v => Math.abs(v - base))));
    return { base, spread, src, n: vals.length };
  });
}
function rhrToday(date = todayStr()) {
  const b = rhrBaseline(date), n = nightRhr(date); if (!b || !n) return null;
  const v = n.src === b.src ? n.v : null; if (v == null) return null;
  return { v, base: b.base, z: (v - b.base) / b.spread, dlt: v - b.base, src: b.src };
}

// ---------- 3. Sleep need and 14-night weighted debt (Kitamura 2016 prior; Rise-style weights) ----------
const naps = (d) => sum(((D.hc && D.hc.sleep) || []).filter(s => s.nap && s.end.slice(0, 10) === d), s => Math.max(0, s.minutes - (s.awake || 0))) / 60;
const totalSleep = (d) => { const h = sleepHours(d); return h == null ? null : h + naps(d); };
function personalNeed() {
  return memo('need', () => {
    const typed = Number(D.settings.sleepBase);
    const prior = typed && typed !== 7.5 ? typed : ALG.needPrior;
    // Nights you slept in (woke over an hour past your usual wake time), minus the first night of each run (rebound)
    const T = todayStr(), wakes = range(addDays(T, -90), T).map(wakeMin).filter(v => v != null);
    const anchor = wakes.length >= 14 ? medianOf(wakes) : hhmmMin(D.settings.wakeTime || '08:00');
    const free = [];
    for (const d of range(addDays(T, -90), T)) { const w = wakeMin(d), prevW = wakeMin(addDays(d, -1)); if (w != null && w > anchor + 60 && prevW != null && prevW > anchor + 60) { const h = sleepHours(d); if (h) free.push(h); } }
    const n = free.length, need = n ? (7 * prior + n * medianOf(free)) / (7 + n) : prior;
    return { need: round1(clamp(need, 6.5, 10)), prior, n };
  });
}
sleepNeed = function () { return personalNeed().need; };
sleepDebt = function (date = todayStr()) {
  const need = personalNeed().need; let num = 0, den = 0;
  for (let i = 0; i < 14; i++) { const t = totalSleep(addDays(date, -i)); if (t == null) continue; const w = ALG.debtR ** i; num += w * Math.max(need - t, -2); den += w; }
  if (!den) return 0;
  return round1(Math.max(0, 14 * num / den));
};
// The most sleep your planned window allows: hours in bed times your typical sleep efficiency
function sleepCeiling() {
  const s = D.settings, bed = nightMin(hhmmMin(s.bedTime || '00:30')), wake = hhmmMin(s.wakeTime || '08:00') + 1440;
  const eff = medianOf(mainSleeps().slice(-14).filter(x => x.minutes >= 180).map(x => (x.minutes - (x.awake || 0)) / x.minutes)) || 0.87;
  return { inBed: round1((wake - bed) / 60), eff, hours: round1((wake - bed) / 60 * eff) };
}

// ---------- 4. Load: intervals.icu fitness and fatigue, plus session effort x minutes for lifting (Haddad 2017) ----------
const liftLoad = (d) => sum(workoutsOn(d).filter(w => w.type === 'strength' && w.rpe), w => w.rpe * (w.minutes || 0));
function formOn(d) { const w = wellnessOn(d) || {}; return w.ctl > 0 && w.atl != null ? Math.round(100 * (w.ctl - w.atl) / w.ctl) : null; }
const unratedLift = () => { const T = todayStr(); return [T, addDays(T, -1)].flatMap(workoutsOn).filter(w => w.type === 'strength' && !w.rpe && (w.minutes || 0) >= 15).pop() || null; };

// ---------- Readiness, rebuilt on 1 to 4 ----------
readiness = function (date = todayStr()) {
  const w = wellnessOn(date) || {}, c = (D.days[date] || {}).checkin || {}, parts = [];
  const sh = totalSleep(date), need = personalNeed().need;
  if (sh !== null || w.sleepScore) {
    const r = sh !== null ? clamp((sh / need - 0.5) / 0.5, 0, 1) * 100 : null;
    const v = Math.round(r !== null && w.sleepScore ? (r + w.sleepScore) / 2 : r !== null ? r : w.sleepScore);
    parts.push({ key: 'sleep', label: 'Sleep', v, w: .35, note: sh !== null ? `${round1(sh)}h of ${need}h needed` : `score ${w.sleepScore}` });
  }
  const hb = hrvBand(date);
  if (hb.state !== 'calibrating') {
    let v = clamp(50 + 20 * hb.z, 0, 100); if (hb.state === 'low') v = Math.min(v, 45);
    parts.push({ key: 'hrv', label: 'HRV', v: Math.round(v), w: .25, note: `7-night ${hb.ms7} ms, normal ${Math.round(Math.exp(hb.lo))} to ${Math.round(Math.exp(hb.hi))}`, delta: Math.round(100 * (Math.exp(hb.m7 - hb.mu) - 1)), state: hb.state });
  }
  const rh = rhrToday(date);
  if (rh) parts.push({ key: 'rhr', label: 'Resting HR', v: Math.round(clamp(60 - 12 * rh.z, 0, 100)), w: .15, note: `${rh.v} bpm ${rh.src === 'sleep' ? 'asleep' : 'resting'} vs ${Math.round(rh.base)} usual`, delta: round1(rh.dlt) });
  const y = addDays(date, -1), ys = strainOn(y) || 0, yl = liftLoad(y), form = formOn(y);
  if (ys || yl || form != null) {
    let v = form != null ? clamp(75 + form, 20, 95) : 85;
    v -= Math.max(0, ys - 10) * 3 + Math.min(20, yl / 30);
    parts.push({ key: 'load', label: 'Training load', v: Math.round(clamp(v, 0, 100)), w: .15, note: [form != null ? `form ${form > 0 ? '+' : ''}${form}%` : '', ys ? `yesterday strain ${ys}` : '', yl ? `lifting ${yl} AU` : ''].filter(Boolean).join(' · ') });
  }
  if (c.energy) parts.push({ key: 'feel', label: 'How you feel', v: (c.energy - 1) * 25, w: .1, note: `energy ${c.energy}/5` });
  if (!parts.some(p => p.key === 'sleep' || p.key === 'hrv')) return null;
  const score = Math.round(sum(parts, p => p.v * p.w) / sum(parts, p => p.w));
  const band = score >= 67 ? { key: 'push', label: 'Primed', color: '#2FA36B', advice: 'Your body is ready. A good day for your hardest session.' }
    : score >= 50 ? { key: 'steady', label: 'Steady', color: '#D9A21B', advice: 'Normal training is fine. Keep intensity moderate.' }
    : score >= 34 ? { key: 'easy', label: 'Take it easy', color: '#F0A030', advice: 'Go light: an easy run, a walk or mobility work.' }
    : { key: 'rest', label: 'Recover', color: '#E5484D', advice: 'Recovery day. Rest, walk, stretch and sleep early.' };
  return { score, band, parts };
};

// ---------- 5. Overnight strain watch (adapted from NightSignal; never names an illness) ----------
function strainWatch(date = todayStr()) {
  return memo('watch:' + date, () => {
    let run = 0;
    for (let i = 0; i < 14; i++) {
      const d = addDays(date, -i), b = rhrBaseline(d), n = nightRhr(d);
      if (!b || !n || n.src !== b.src) { if (i === 0) return null; break; }
      if (n.v >= b.base + ALG.rhrHigh) run++; else break;
    }
    if (!run) return { level: 'green' };
    const T = date, co = [];
    const hb = hrvBand(T); if (hb.state === 'low') co.push('HRV below your normal band');
    const rz = (k, lim) => { const now = (wellnessOn(T) || {})[k], xs = range(addDays(T, -30), addDays(T, -3)).map(d => (wellnessOn(d) || {})[k]).filter(v => v != null); if (now == null || xs.length < 7) return false; return (now - mean(xs)) / (sdOf(xs) || 1) > lim; };
    if (rz('resp', 2)) co.push('breathing rate up');
    const t = (wellnessOn(T) || {}).tempC, tb = medianOf(range(addDays(T, -30), addDays(T, -3)).map(d => (wellnessOn(d) || {}).tempC).filter(v => v != null));
    if (t != null && tb != null && t - tb > 0.5) co.push('temperature up');
    const y = addDays(T, -1), tags = (((D.days[T] || {}).checkin || {}).tags || []);
    const why = [(strainOn(y) || 0) >= 14 ? 'a hard day yesterday' : '', tags.includes('alcohol') ? 'alcohol' : '', tags.includes('stress') ? 'a stressful day' : ''].filter(Boolean);
    const rh = rhrToday(T);
    return { level: run >= 2 ? 'red' : 'yellow', run, co, why, dlt: rh ? Math.round(rh.dlt) : null };
  });
}
function strainWatchCard() {
  const s = strainWatch(); if (!s || s.level === 'green') return '';
  return `<section class="panel watch-card ${s.level}"><h3>${icon('heart', 'style="width:16px;height:16px;vertical-align:-2px"')} ${s.level === 'red' ? 'Your body shows signs of strain' : 'Overnight heart rate is up'}</h3>
    <p style="font-size:13px;margin-top:4px">Sleeping heart rate ${s.dlt != null ? `${s.dlt} bpm above` : 'above'} your normal ${s.run} night${s.run === 1 ? '' : 's'} running${s.co.length ? `, with ${s.co.join(' and ')}` : ''}. ${s.why.length ? `Likely from ${s.why.join(' or ')}. ` : ''}${s.level === 'red' ? 'Consider easier training and an early night.' : 'One night is often noise. Ascend checks again tomorrow.'}</p>
    <p class="muted" style="font-size:11.5px;margin-top:4px">A pattern in your own data, not a diagnosis. Stress, alcohol and hard training trigger it too.</p></section>`;
}
// Replaces the old one-night "resting HR up" and acute:chronic tips
const fitnessTipsPlain = fitnessSuggestions;
fitnessSuggestions = function (date = todayStr()) {
  const out = fitnessTipsPlain(date).filter(t => !/^Resting HR up|^You ramped up fast|^HRV .* below your usual|sleep debt this week/.test(t.title));
  const r = readiness(date); if (!r) return out;
  const P = Object.fromEntries(r.parts.map(p => [p.key, p]));
  if (P.hrv && P.hrv.state === 'low') out.splice(1, 0, { icon: 'pulse', color: 'var(--adjust)', title: 'HRV below your normal band this week', text: 'Your 7-night HRV is under your usual range. Keep hard sessions for when it is back inside.' });
  const debt = sleepDebt(date), c = sleepCeiling(), need = personalNeed().need;
  if (debt >= 3) out.splice(1, 0, { icon: 'bed', color: 'var(--violet)', title: `${debt}h sleep debt over 2 weeks`, text: c.hours < need ? `Your ${fmtHM(D.settings.bedTime || '00:30')} to ${fmtHM(D.settings.wakeTime || '08:00')} window allows about ${c.hours}h of sleep, under the ${need}h you need. Only an earlier lights-out closes it.` : 'Pay it back with earlier nights, not lie-ins. Keep the wake time fixed.' });
  return out.slice(0, 5);
};

// ---------- 6. Max heart rate from your own hard efforts ----------
// Highest daily peak over a year, trusted only if another day came within 3 bpm (rejects optical spikes)
function observedHrMax() {
  return memo('hrmax', () => {
    const T = todayStr(), peaks = [];
    for (const d of range(addDays(T, -365), T)) { const p = (wellnessOn(d) || {}).hrPeak; if (p >= 140 && p <= 230) peaks.push(p); }
    for (const w of D.workouts) if (w.maxHr >= 140 && w.maxHr <= 230 && w.date >= addDays(T, -365)) peaks.push(w.maxHr);
    peaks.sort((a, b) => b - a);
    return peaks.length >= 2 && peaks[0] - peaks[1] <= 3 ? peaks[0] : peaks.length >= 2 ? peaks[1] : null;
  });
}
hrMax = function () {
  const m = Number(D.settings.maxHr); if (m >= 120 && m <= 230) return m;
  const a = ageYears(), tanaka = a ? Math.round(208 - 0.7 * a) : 190, o = observedHrMax();
  return o && o > tanaka ? o : tanaka;
};

// ---------- 13 and 14. Sleep continuity and social jetlag ----------
function sleepContinuity() {
  const ss = mainSleeps().filter(s => s.minutes >= 180).slice(-14); if (!ss.length) return null;
  const last = ss[ss.length - 1], eff = (s) => 100 * (s.minutes - (s.awake || 0)) / s.minutes;
  return { eff: Math.round(eff(last)), waso: last.awake || 0, eff14: Math.round(medianOf(ss.map(eff))), waso14: Math.round(medianOf(ss.map(s => s.awake || 0))) };
}
// Mid-sleep on free mornings (Sunday, reserve days) vs work mornings, with 24-hour wrap-around means
function socialJetlag() {
  const T = todayStr(), work = [], free = [];
  for (const d of range(addDays(T, -27), T)) {
    const s = sleepEnding(d); if (!s) continue;
    const mid = (+new Date(s.start) + +new Date(s.end)) / 2, dt = new Date(mid), m = dt.getHours() * 60 + dt.getMinutes();
    (parseDay(d).getDay() === 0 || (D.reserve && D.reserve[d]) ? free : work).push(m);
  }
  if (free.length < 2 || work.length < 5) return null;
  const circ = (xs) => { const a = xs.map(m => m / 1440 * 2 * Math.PI); return ((Math.atan2(mean(a.map(Math.sin)), mean(a.map(Math.cos))) / (2 * Math.PI) * 1440) + 1440) % 1440; };
  const mf = circ(free), mw = circ(work); let gap = Math.abs(mf - mw); if (gap > 720) gap = 1440 - gap;
  return { minutes: Math.round(gap), free: free.length, work: work.length, mf, mw };
}
const clock = (m) => fmtHM(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
function sleepScience() {
  const p = personalNeed(), c = sleepCeiling(), debt = sleepDebt(), cont = sleepContinuity(), sj = socialJetlag(), hb = hrvBand(), rh = rhrToday(), mx = observedHrMax();
  const row = (label, value, sub = '') => `<div class="vital"><span>${label}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  return `<section class="panel" style="margin-top:18px"><div class="panel-head"><h3>${icon('moon', 'style="width:16px;height:16px;color:#5A3CF0;vertical-align:-2px"')} Sleep and recovery, worked out</h3><span class="muted" style="font-size:12px">updated from your data</span></div>
    <div class="vital-grid">
      ${row('Sleep need', `${p.need} h`, p.n ? `from ${p.n} sleep-in nights` : 'starting from 8.4 h, the lab average for young men')}
      ${row('Your window allows', `${c.hours} h`, `${c.inBed} h in bed at ${Math.round(c.eff * 100)}% efficiency`)}
      ${row('Sleep debt', `${debt} h`, '14 nights, recent ones count more, naps count')}
      ${cont ? row('Sleep efficiency', `${cont.eff}%`, `awake ${cont.waso} min · 2-week ${cont.eff14}%`) : ''}
      ${sj ? row('Social jetlag', `${sj.minutes} min`, sj.minutes <= 30 ? 'weekday and Sunday sleep line up' : `Sunday mid-sleep ${clock(sj.mf)} vs ${clock(sj.mw)}`) : ''}
      ${hb.state === 'calibrating' ? row('HRV band', 'calibrating', `${hb.nb} of 14 nights`) : row('HRV, 7 nights', `${hb.ms7} ms`, `normal ${Math.round(Math.exp(hb.lo))} to ${Math.round(Math.exp(hb.hi))} · ${hb.state === 'low' ? 'below' : hb.state === 'high' ? 'above' : 'inside'}`)}
      ${rh ? row(rh.src === 'sleep' ? 'Sleeping heart rate' : 'Resting heart rate', `${rh.v} bpm`, `usual ${Math.round(rh.base)}`) : ''}
      ${row('Max heart rate', `${hrMax()} bpm`, Number(D.settings.maxHr) ? 'set by you' : mx && mx > hrMax() - 1 ? 'seen in your hard efforts' : 'age formula until a hard effort shows more')}
    </div>
    ${c.hours < p.need ? `<p class="spike">Your window gives about ${c.hours} h of sleep against a need of about ${p.need} h. Keep the wake time and bring lights-out earlier; a later wake breaks the anchor.</p>` : ''}</section>`;
}

// ---------- 7 and 8. Running: efficiency factor and race prediction ----------
const vdotOf = (m, min) => { const v = m / min, vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v, f = 0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min); return vo2 / f; };
function timeForVdot(vdot, m) { let lo = m / 400, hi = m / 80; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdotOf(m, mid) > vdot) lo = mid; else hi = mid; } return (lo + hi) / 2; }
const hms = (min) => { const s = Math.round(min * 60), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
function runScience() {
  const T = todayStr(), mx = hrMax();
  const runs = D.workouts.filter(w => w.type === 'run' && w.distance >= 2 && w.minutes >= 10);
  const ef = (w) => w.avgHr ? (w.distance * 1000 / w.minutes) / w.avgHr : null;
  const easy = runs.filter(w => w.avgHr && w.avgHr < 0.78 * mx);
  const recent = easy.filter(w => w.date > addDays(T, -42)).map(ef), before = easy.filter(w => w.date <= addDays(T, -42) && w.date > addDays(T, -84)).map(ef);
  const efNow = recent.length >= 3 ? medianOf(recent) : null, efBefore = before.length >= 3 ? medianOf(before) : null;
  // Best effort of 3 km or more in 90 days: the highest VDOT (easy runs under-predict, so the best one is used)
  const efforts = runs.filter(w => w.date > addDays(T, -90) && w.distance >= 5).map(w => ({ w, vdot: vdotOf(w.distance * 1000, w.minutes), hard: !w.avgHr || w.avgHr >= 0.8 * mx })).sort((a, b) => b.vdot - a.vdot);
  const best = efforts.find(x => x.hard) || efforts[0];
  if (!efNow && !best) return '';
  const half = best ? timeForVdot(best.vdot, 21097.5) : null, riegel = best ? best.w.minutes * (21.0975 / best.w.distance) ** 1.06 : null;
  const longest4 = Math.max(0, ...runs.filter(w => w.date > addDays(T, -28)).map(w => w.distance));
  return `<section class="panel" style="margin-top:18px"><div class="panel-head"><h3>${icon('run', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Half marathon fitness</h3><span class="muted" style="font-size:12px">from your runs</span></div>
    <div class="vital-grid">
      ${best ? `<div class="vital"><span>Half marathon estimate</span><b>${hms(half)}</b><em>VDOT ${round1(best.vdot)} from ${best.w.distance} km on ${shortDay(best.w.date)} · Riegel ${hms(riegel)}${best.hard ? '' : ' · from an easy run, so likely slow'}</em></div>` : ''}
      ${efNow ? `<div class="vital"><span>Aerobic efficiency</span><b>${efNow.toFixed(2)}</b><em>${efBefore ? `${efNow >= efBefore ? 'up' : 'down'} ${Math.abs(Math.round(100 * (efNow / efBefore - 1)))}% vs 6 weeks before` : 'metres a minute per heartbeat, easy runs'}</em></div>` : ''}
      <div class="vital"><span>Longest run, 4 weeks</span><b>${longest4} km</b><em>${longest4 >= 16 ? 'in the 16 to 19 km range for a half' : 'build toward 16 to 19 km before race day'}</em></div>
    </div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Predictions use your best recent effort and are well calibrated for the half, not for a marathon. Aerobic efficiency counts only easy runs (under 78% of max HR); rising means fitter at the same effort.</p></section>`;
}

// ---------- 10 and 11. Maintenance calories, normalized FFMI ----------
// Weight trend: daily values (gaps filled by straight lines), 10% EMA, and a least-squares slope
weightTrend = function (days = 90) {
  const T = todayStr(), raw = range(addDays(T, -(days - 1)), T).map(d => [d, (wellnessOn(d) || {}).weight || null]);
  const known = raw.filter(x => x[1]); if (!known.length) return null;
  const filled = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i][0] < known[0][0]) continue;
    if (raw[i][1]) { filled.push(raw[i]); continue; }
    const next = known.find(k => k[0] > raw[i][0]); if (!next) break;
    const prev = filled[filled.length - 1], f = daysBetween(prev[0], raw[i][0]) / daysBetween(prev[0], next[0]);
    filled.push([raw[i][0], prev[1] + f * (next[1] - prev[1])]);
  }
  let ema = null; const pts = filled.map(([d, w]) => { ema = ema == null ? w : ema + 0.1 * (w - ema); return [d, w, round1(ema)]; });
  const slope = (n) => { const p = pts.slice(-n); if (p.length < 8) return null; const xs = p.map((_, i) => i), ys = p.map(x => x[2]), mx = mean(xs), my = mean(ys); return sum(xs, (x, i) => (x - mx) * (ys[i] - my)) / sum(xs, x => (x - mx) ** 2); };
  const s28 = slope(28);
  return { pts, now: pts[pts.length - 1][2], weekly: s28 == null ? null : round1(s28 * 7), slope28: s28, n: known.length };
};
function rmr() {
  const w = Number(D.settings.weightKg), h = Number(D.settings.heightCm), a = ageYears();
  if (!(w > 30 && h > 120 && a)) return null;
  return Math.round(10 * w + 6.25 * h - 5 * a + (D.settings.sex === 'female' ? -161 : 5)); // Mifflin-St Jeor
}
function maintenance() {
  const T = todayStr(), from = addDays(T, -27), base = rmr(); if (!base) return null;
  const prior = Math.round(base * 1.55);
  const kcalOn = (d) => { const m = ((D.hc && D.hc.meals) || []).filter(x => x.date === d); return m.length ? sum(m, x => x.kcal || 0) : null; };
  const days = range(from, addDays(T, -1)), logged = days.map(kcalOn).filter(v => v != null && v > 800);
  const wt = weightTrend(60);
  const enough = logged.length >= 16 && wt && wt.n >= 8 && wt.slope28 != null;
  if (!enough) return { prior, rmr: base, n: logged.length, ready: false };
  const dW = wt.slope28 * 28, rho = dW < 0 ? 7700 : 0.6 * 9440 + 0.4 * 1816;
  const data = mean(logged) - rho * dW / 28, n = logged.length;
  return { prior, rmr: base, n, ready: true, tdee: Math.round((14 * prior + n * data) / (14 + n)), intake: Math.round(mean(logged)) };
}
function ffmiNow() {
  const h = Number(D.settings.heightCm) / 100; if (!(h > 1.2)) return null;
  const leanVals = range(addDays(todayStr(), -60), todayStr()).map(d => (wellnessOn(d) || {}).lean).filter(Boolean);
  let lean = leanVals.length ? mean(leanVals.slice(-5)) : Number(D.settings.leanKg);
  if (!(lean > 25)) { const wt = weightTrend(), bf = Number(D.settings.bodyFat); if (!wt || !(bf > 3)) return null; lean = wt.now * (1 - bf / 100); }
  const f = lean / (h * h);
  return { ffmi: round1(f), norm: round1(f + 6.1 * (1.8 - h)), lean: round1(lean) };
}
function bodyScience() {
  const m = maintenance(), f = ffmiNow(); if (!m && !f) return '';
  return `<section class="panel" style="margin-top:18px"><div class="panel-head"><h3>${icon('dumbbell', 'style="width:16px;height:16px;color:#0E9AA7;vertical-align:-2px"')} Energy and muscle</h3></div>
    <div class="vital-grid">
      ${m ? `<div class="vital"><span>Maintenance calories</span><b>${m.ready ? m.tdee : '~' + m.prior} kcal</b><em>${m.ready ? `from ${m.n} days of food logs and your weight trend (you ate ${m.intake})` : `estimate from your size; logs ${m.n} of 16 days needed to personalise`}</em></div>
      <div class="vital"><span>Resting burn</span><b>${m.rmr} kcal</b><em>Mifflin-St Jeor, ±10%</em></div>` : ''}
      ${f ? `<div class="vital"><span>FFMI</span><b>${f.ffmi}</b><em>normalized ${f.norm} · lean ${f.lean} kg</em></div>` : ''}
    </div></section>`;
}

// ---------- 12. PhenoAge lab age (Levine 2018; BioAge package coefficients) ----------
const PHENO = [
  ['alb', /albumin/i, 'Albumin', 'g/dL'], ['cre', /creatinine/i, 'Creatinine', 'mg/dL'], ['glu', /glucose/i, 'Glucose (fasting)', 'mg/dL'],
  ['crp', /crp|c-reactive/i, 'CRP', 'mg/L'], ['lym', /lymph/i, 'Lymphocytes %', '%'], ['mcv', /^mcv/i, 'MCV', 'fL'],
  ['rdw', /rdw/i, 'RDW', '%'], ['alp', /alp\b|alkaline/i, 'ALP', 'U/L'], ['wbc', /wbc|white/i, 'WBC', '10^3/µL']
];
const toUnits = { alb: (v, u) => /g\/l/i.test(u) && !/dl/i.test(u) ? v : v * 10, cre: (v, u) => /mol/i.test(u) ? v : v * 88.4, glu: (v, u) => /mmol/i.test(u) ? v : v / 18.016, crp: (v, u) => Math.max(0.01, /mg\/dl/i.test(u) ? v : v / 10), wbc: (v) => v > 300 ? v / 1000 : v };
function phenoAge() {
  const by = labMarkers(), got = {};
  for (const [k, re] of PHENO) { const name = Object.keys(by).find(n => re.test(n) && !/a1c/i.test(n)); if (name) { const l = by[name][by[name].length - 1]; got[k] = { v: l.value, u: l.unit || '', d: l.date }; } }
  const missing = PHENO.filter(([k]) => !got[k]).map(p => p[2]);
  if (missing.length) return { missing };
  const dates = Object.values(got).map(x => x.d).sort();
  if (daysBetween(dates[0], dates[dates.length - 1]) > 14) return { missing: [], apart: true };
  const age = ageYears(dates[dates.length - 1]); if (!age) return { missing: ['your date of birth (Healthspan profile)'] };
  const x = (k) => (toUnits[k] || ((v) => v))(Number(got[k].v), got[k].u);
  if (x('crp') > 1) return { missing: [], crpHigh: true }; // CRP over 10 mg/L: an acute illness skews the result
  const xb = -19.90667 - 0.03359355 * x('alb') + 0.009506491 * x('cre') + 0.1953192 * x('glu') + 0.09536762 * Math.log(x('crp')) - 0.01199984 * x('lym') + 0.02676401 * x('mcv') + 0.3306156 * x('rdw') + 0.001868778 * x('alp') + 0.05542406 * x('wbc') + 0.08035356 * age;
  const M = 1 - Math.exp(-1.51714 * Math.exp(xb) / 0.007692696), pa = Math.log(-0.0055305 * Math.log(1 - M)) / 0.090165 + 141.50225;
  return { age: round1(pa), real: round1(age), gap: round1(pa - age), date: dates[dates.length - 1] };
}
function phenoCard() {
  const p = phenoAge();
  return `<section class="panel" style="margin-top:18px"><div class="panel-head"><h3>${icon('pulse', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} Lab age (PhenoAge)</h3></div>
    ${p.age != null ? `<div class="row" style="gap:12px;align-items:baseline"><b class="qb-big">${p.gap > 0 ? '+' : ''}${p.gap}</b><span class="muted">years vs your age, from your ${shortDay(p.date)} labs (PhenoAge ${p.age})</span></div>
      <p class="muted" style="font-size:12px;margin-top:6px">Built on adults mostly much older than you, so at 24 it reads young by design. Watch the change between draws, not the number.</p>`
      : p.crpHigh ? '<p class="muted">CRP was over 10 mg/L on that draw, which usually means a short-term illness. Lab age waits for a calmer draw.</p>'
      : p.apart ? '<p class="muted">The nine markers need to come from one blood draw (within 14 days). Add them from the same report.</p>'
      : `<p class="muted" style="font-size:13px">Needs nine routine markers from one draw. Missing: ${p.missing.map(esc).join(', ')}. A CBC with differential plus a basic metabolic panel, albumin, ALP and CRP covers them.</p>`}</section>`;
}
LAB_PRESETS.push(...PHENO.filter(([, re]) => !LAB_PRESETS.some(([n]) => re.test(n))).map(p => [p[2], p[3]]));

// ---------- Session effort for lifting: one tap ----------
function liftRateCard() {
  const w = unratedLift(); if (!w) return '';
  return `<section class="panel lift-rate"><h3>${icon('dumbbell', 'style="width:16px;height:16px;color:#5A3CF0;vertical-align:-2px"')} How hard was ${w.date === todayStr() ? "today's" : "yesterday's"} lift?</h3>
    <p class="muted" style="font-size:12px;margin:2px 0 8px">${esc(w.name || 'Strength')} · ${w.minutes} min. 0 is rest, 10 is maximal. Counts your lifting load, which heart rate misses.</p>
    <div class="seg wide pain-seg">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" data-act="lift-rpe" data-id="${w.id}" data-v="${v}">${v}</button>`).join('')}</div></section>`;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act=lift-rpe]'); if (!a) return;
  const w = D.workouts.find(x => x.id === a.dataset.id); if (!w) return;
  w.rpe = Number(a.dataset.v); save(); toast(`Logged: ${w.rpe * w.minutes} load units.`); rerender();
});

// ---------- Where it shows ----------
const healthHubAlg = VIEWS.health;
VIEWS.health = () => healthHubAlg() + (UI.htab === 'span' ? phenoCard() : sleepScience() + runScience() + bodyScience());
