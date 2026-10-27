/* Ascend: every number Health Connect can give, with nothing to type. Weight, body fat, lean mass and height fill
   your profile by themselves; calories, distance, floors, water, SpO2, breathing rate, blood pressure, glucose and
   temperature show up under Health when an app on your phone records them. Uses globals from app.js and health.js. */
'use strict';

// Latest value of a daily Health Connect field within `days`
function latestMetric(key, days = 365) {
  for (let i = 0; i < days; i++) { const d = addDays(todayStr(), -i), v = (wellnessOn(d) || {})[key]; if (v != null && v !== '') return { v, d }; }
  return null;
}
const avgMetric = (key, days, end = todayStr()) => { const xs = range(addDays(end, -(days - 1)), end).map(d => (wellnessOn(d) || {})[key]).filter(v => v != null); return xs.length ? mean(xs) : null; };

// Your profile follows your scale and watch: height, weight, body fat and lean mass update whenever they change
function autoProfile() {
  const s = D.settings, set = {};
  const h = latestMetric('heightCm', 3650), w = latestMetric('weight', 60), f = latestMetric('fat', 120), l = latestMetric('lean', 120);
  if (h && h.v > 120 && h.v < 230) set.heightCm = String(h.v);
  if (w && w.v > 30 && w.v < 250) set.weightKg = String(w.v);
  if (f && f.v > 3 && f.v < 60) set.bodyFat = String(f.v);
  if (l && l.v > 25 && l.v < 130) set.leanKg = String(l.v);
  let changed = false;
  for (const [k, v] of Object.entries(set)) if (String(s[k] || '') !== v) { s[k] = v; changed = true; }
  if (changed) save();
  return changed;
}

// Weight trend: a 10% exponential moving average (The Hacker's Diet), so one salty dinner does not read as fat gain
function weightTrend(days = 90) {
  const T = todayStr(), pts = [];
  let ema = null;
  for (const d of range(addDays(T, -(days - 1)), T)) {
    const w = (wellnessOn(d) || {}).weight;
    if (w) { ema = ema == null ? w : ema + 0.1 * (w - ema); pts.push([d, w, round1(ema)]); }
  }
  if (pts.length < 2) return pts.length ? { pts, now: pts[0][2], weekly: null } : null;
  const last = pts[pts.length - 1], back = pts.filter(p => p[0] <= addDays(last[0], -14)).pop() || pts[0];
  const span = Math.max(1, daysBetween(back[0], last[0]));
  return { pts, now: last[2], weekly: round1((last[2] - back[2]) * 7 / span) };
}

function spark(values, color = 'var(--ember)', W = 160, H = 36) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), r = hi - lo || 1;
  return `<svg class="mini-spark" viewBox="0 0 ${W} ${H}"><path d="${values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1) * W).toFixed(1)} ${(H - 3 - (v - lo) / r * (H - 6)).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

// Health › Training: body and vitals, only the ones some app actually records
function vitalsPanel() {
  const T = todayStr(), wt = weightTrend(), tiles = [];
  const tile = (label, value, sub = '', extra = '') => tiles.push(`<div class="vital"><span>${label}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}${extra}</div>`);
  if (wt) tile('Weight trend', `${wt.now} kg`, wt.weekly == null ? '' : `${wt.weekly > 0 ? '+' : ''}${wt.weekly} kg a week`, spark(wt.pts.map(p => p[2])));
  const f = latestMetric('fat', 120); if (f) tile('Body fat', `${f.v}%`, shortDay(f.d));
  const l = latestMetric('lean', 120); if (l) tile('Lean mass', `${l.v} kg`, shortDay(l.d));
  const bmr = latestMetric('bmr', 60); if (bmr) tile('Basal burn', `${bmr.v} kcal`, 'a day at rest');
  const act = avgMetric('activeKcal', 7); if (act != null) tile('Active calories', `${Math.round(act)} kcal`, '7-day average');
  const tot = avgMetric('totalKcal', 7); if (tot != null) tile('Total burn', `${Math.round(tot)} kcal`, '7-day average');
  const km = avgMetric('km', 7); if (km != null) tile('Distance', `${round1(km)} km`, 'a day, 7-day average');
  const fl = avgMetric('floors', 7); if (fl != null) tile('Floors', `${Math.round(fl)}`, 'a day, 7-day average');
  const wa = (wellnessOn(T) || {}).waterL; if (wa != null || avgMetric('waterL', 7) != null) tile('Water', `${round1(wa || 0)} L`, `today · ${round1(avgMetric('waterL', 7) || 0)} L average`);
  // Overnight readings, against your own 30-day normal
  const vs = (key, unit, dp = 1) => { const now = latestMetric(key, 3), base = avgMetric(key, 30, addDays(T, -3)); if (!now) return null; const dlt = base != null ? round1(now.v - base) : null; return { v: `${dp ? round1(now.v) : Math.round(now.v)}${unit}`, sub: dlt == null ? shortDay(now.d) : dlt === 0 ? 'same as your normal' : `${dlt > 0 ? '+' : ''}${dlt} vs your normal`, dlt }; };
  const sp = vs('spo2', '%'); if (sp) tile('Blood oxygen', sp.v, sp.sub);
  const rr = vs('resp', '/min'); if (rr) tile('Breathing rate', rr.v, rr.sub, rr.dlt >= 1.5 ? '<i class="vital-flag">higher than usual</i>' : '');
  const tc = vs('tempC', '°C'); if (tc) tile('Temperature', tc.v, tc.sub);
  const bp = latestMetric('sys', 60); if (bp) { const dia = (wellnessOn(bp.d) || {}).dia; tile('Blood pressure', `${bp.v}/${dia || '–'}`, shortDay(bp.d)); }
  const gl = latestMetric('glucose', 30); if (gl) tile('Glucose', `${gl.v} mg/dL`, shortDay(gl.d));
  if (!tiles.length) return '';
  return `<section class="panel vitals" style="margin-top:18px"><div class="panel-head"><h3>${icon('pulse', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} Body and vitals</h3><span class="muted" style="font-size:12px">from Health Connect, nothing to type</span></div>
    <div class="vital-grid">${tiles.join('')}</div></section>`;
}

const healthHubWithBody = VIEWS.health;
VIEWS.health = () => healthHubWithBody() + (UI.htab === 'span' ? '' : vitalsPanel());
HABIT_AUTO.water = { label: 'Drank at least', input: 'n', unit: 'litres', def: 2.5, test: (d, g) => ((wellnessOn(d) || {}).waterL || 0) >= (Number(g.autoN) || 2.5) };
HABIT_AUTO.floors = { label: 'Climbed at least', input: 'n', unit: 'floors', def: 10, test: (d, g) => ((wellnessOn(d) || {}).floors || 0) >= (Number(g.autoN) || 10) };

// After an update that reads new kinds of data, ask once on Today to allow them in Health Connect
function hcMoreCard() {
  const st = HCSYNC.status;
  if (!hcHere() || !D.settings.hcOn || !st || !(st.total > st.granted) || D.settings.hcAskedFor === st.total) return '';
  return `<section class="panel hc-more"><h3>${icon('heart', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} More from Health Connect</h3>
    <p class="muted" style="font-size:13px;margin:4px 0 10px">Ascend can now read ${st.total - st.granted} more kinds of data, such as body fat, meals and protein, calories, distance, water, blood oxygen and breathing rate. Allow them once and they fill in by themselves.</p>
    <div class="row" style="gap:8px"><button class="btn sm primary" data-act="hc-connect">Allow in Health Connect</button><button class="btn sm ghost" data-act="hc-more-later">Not now</button></div></section>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-act=hc-more-later]')) { D.settings.hcAskedFor = HCSYNC.status.total; save(); rerender(); } });
