/* Ascend: keeps the laptop and the phone in step.
   Both devices merge record by record through a JSON file in the person's own Google Drive,
   read and written by their Apps Script. Each record carries an update time (_u); deletions leave a tombstone.
   Uses globals from app.js and sync.js. */
'use strict';

const DEVICE_KEYS = ['launchAtLogin', 'ankiOn', 'hcOn'];                    // settings that stay on one device
const LOCAL_ONLY = ['activeSession', 'syncQueue', 'sync', 'dismissedCarry']; // never leave the device
const TRANSIENT = ['dirty', 'rev', 'syncError'];          // per-device Google Tasks bookkeeping
const CLOUD = { busy: false, error: '', lastOk: 0, needsUpdate: false, dirty: false };
let stampCache = null;
let cloudTimer = null;

function recordList(d) {
  const out = [];
  (d.goals || []).forEach(g => out.push(['g:' + g.id, g]));
  (d.sessions || []).forEach(s => out.push(['s:' + s.id, s]));
  (d.workouts || []).forEach(w => out.push(['w:' + w.id, w]));
  (d.coach || []).forEach(n => out.push(['n:' + n.id, n]));
  (d.exams || []).forEach(x => out.push(['x:' + x.id, x]));
  if (d.anki) out.push(['anki', d.anki]);
  if (d.hc) out.push(['hc', d.hc]);
  for (const [date, dd] of Object.entries(d.days || {})) {
    (dd.targets || []).forEach(t => { t._d = date; out.push(['t:' + t.id, t]); });
    if (dd.checkin) out.push(['c:' + date, dd.checkin]);
  }
  for (const [date, j] of Object.entries(d.journal || {})) out.push(['j:' + date, j]);
  for (const [date, r] of Object.entries(d.reviews || {})) out.push(['r:' + date, r]);
  if (d.settings) out.push(['settings', d.settings]);
  if (d.season) out.push(['season', d.season]);
  return out;
}

function sig(key, o) {
  const c = { ...o }; delete c._u; delete c._f;
  TRANSIENT.forEach(f => delete c[f]);
  if (key === 'settings') DEVICE_KEYS.forEach(f => delete c[f]);
  if (key.startsWith('r:') && Array.isArray(c.priorities)) c.priorities = c.priorities.map(p => { const q = { ...p }; TRANSIENT.forEach(f => delete q[f]); return q; });
  return JSON.stringify(c);
}

function primeStamps(d) {
  stampCache = new Map();
  for (const [k, o] of recordList(d)) stampCache.set(k, sig(k, o));
}

// Called on every save: anything that changed gets a fresh update time; anything removed gets a tombstone.
function stampAll(d) {
  if (!stampCache) { primeStamps(d); return false; }
  const now = Date.now(); const seen = new Set(); let changed = false;
  for (const [k, o] of recordList(d)) {
    seen.add(k);
    const s = sig(k, o);
    if (stampCache.get(k) !== s) { if (k === 'settings') stampFields(o, stampCache.get(k), now); o._u = now; stampCache.set(k, s); changed = true; }
  }
  for (const k of [...stampCache.keys()]) if (!seen.has(k)) { d.tomb = d.tomb || {}; d.tomb[k] = now; stampCache.delete(k); changed = true; }
  if (changed) { CLOUD.dirty = true; scheduleCloud(); }
  return changed;
}

// Settings carry an edit time per field (_f), so changing one setting on one device never resets the others.
function stampFields(o, prevSig, now) {
  const prev = prevSig ? JSON.parse(prevSig) : null; if (!prev) return;
  o._f = { ...(o._f || {}) };
  for (const f of new Set([...Object.keys(prev), ...Object.keys(o)])) {
    if (f === '_u' || f === '_f' || DEVICE_KEYS.includes(f)) continue;
    if (JSON.stringify(prev[f]) !== JSON.stringify(o[f])) o._f[f] = now;
  }
}
// Field by field, the newest edit wins. A record from an older version (no _f) counts every field as edited
// when the record was; in a record that tracks fields, a field without a time has not been edited since.
function mergeSettings(a, b) {
  if (!a || !b) return a || b;
  const fa = a._f || {}, fb = b._f || {}, out = { ...a, _f: { ...fa } };
  const when = (o, fs, f) => fs[f] || (o._f ? 0 : o._u || 0);
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === '_u' || f === '_f') continue;
    const ta = when(a, fa, f), tb = when(b, fb, f);
    if (tb > ta) { out[f] = b[f]; if (fb[f]) out._f[f] = fb[f]; }
  }
  out._u = Math.max(a._u || 0, b._u || 0);
  return out;
}

function mergeData(L, Rraw) {
  const R = migrate(Rraw);
  const now = Date.now();
  const tomb = { ...(R.tomb || {}) };
  for (const [k, v] of Object.entries(L.tomb || {})) tomb[k] = Math.max(v, tomb[k] || 0);
  const lm = new Map(recordList(L)), rm = new Map(recordList(R));
  const win = new Map();
  let changed = false, needPush = false;
  for (const k of new Set([...lm.keys(), ...rm.keys()])) {
    const a = lm.get(k), b = rm.get(k);
    if (k === 'settings') {
      const w = mergeSettings(a, b), same = (x) => x && sig(k, x) === sig(k, w) && JSON.stringify(x._f || {}) === JSON.stringify(w._f || {});
      if (!same(a)) changed = true;
      if (!same(b)) needPush = true;
      win.set(k, w); continue;
    }
    let w = !b ? a : !a ? b : ((b._u || 0) > (a._u || 0) ? b : a);
    if (tomb[k] && tomb[k] >= (w._u || 0)) { if (a) changed = true; if (b) needPush = true; continue; }
    if (w === b) {
      w = { ...b };
      for (const f of TRANSIENT) { if (a && a[f] !== undefined) w[f] = a[f]; else delete w[f]; }
      if (!a || sig(k, a) !== sig(k, b)) changed = true;
    } else if (!b || sig(k, b) !== sig(k, w) || (b._u || 0) !== (w._u || 0)) needPush = true;
    win.set(k, w);
  }
  if (JSON.stringify(Object.keys(tomb).sort()) !== JSON.stringify(Object.keys(R.tomb || {}).sort())) needPush = true;

  const ordered = (prefix, la, ra) => { const res = [], seen = new Set(); for (const x of [...(la || []), ...(ra || [])]) { const k = prefix + x.id; if (seen.has(k)) continue; seen.add(k); if (win.has(k)) res.push(win.get(k)); } return res; };
  const out = { ...L, tomb };
  out.goals = ordered('g:', L.goals, R.goals);
  out.sessions = ordered('s:', L.sessions, R.sessions).sort((x, y) => String(x.start).localeCompare(String(y.start)));
  out.workouts = ordered('w:', L.workouts, R.workouts).sort((x, y) => String(x.date + (x.at || '')).localeCompare(String(y.date + (y.at || ''))));
  out.coach = ordered('n:', L.coach, R.coach);
  out.exams = ordered('x:', L.exams, R.exams);
  out.anki = win.get('anki') || null;
  out.hc = win.get('hc') || null;

  // Days: targets go to the day their winning version says; check-ins per date
  const dates = new Set([...Object.keys(L.days || {}), ...Object.keys(R.days || {})]);
  out.days = {};
  const dayOf = (date) => (out.days[date] = out.days[date] || { targets: [] });
  dates.forEach(dayOf);
  const placed = new Set();
  for (const src of [L, R]) for (const dd of Object.values(src.days || {})) for (const t of dd.targets || []) {
    const k = 't:' + t.id; if (placed.has(k) || !win.has(k)) continue;
    placed.add(k); const w = win.get(k); dayOf(w._d).targets.push(w);
  }
  for (const date of dates) { const c = win.get('c:' + date); if (c) dayOf(date).checkin = c; }
  // Two devices can import the same Google task before they sync: keep one
  const byTask = new Map();
  for (const [date, dd] of Object.entries(out.days)) for (const t of [...dd.targets]) {
    if (!t.taskId) continue;
    const prev = byTask.get(t.taskId);
    if (!prev) { byTask.set(t.taskId, { t, date }); continue; }
    const loser = (t.fromGoogle && !prev.t.fromGoogle) ? { t, date } : (prev.t.fromGoogle && !t.fromGoogle) ? prev : ((t._u || 0) < (prev.t._u || 0) ? { t, date } : prev);
    out.days[loser.date].targets = out.days[loser.date].targets.filter(x => x !== loser.t);
    tomb['t:' + loser.t.id] = now; changed = true; needPush = true;
    if (loser === prev) byTask.set(t.taskId, { t, date });
  }

  out.journal = {}; out.reviews = {};
  for (const date of new Set([...Object.keys(L.journal || {}), ...Object.keys(R.journal || {})])) { const j = win.get('j:' + date); if (j) out.journal[date] = j; }
  for (const date of new Set([...Object.keys(L.reviews || {}), ...Object.keys(R.reviews || {})])) { const r = win.get('r:' + date); if (r) out.reviews[date] = r; }
  out.wellness = { ...(R.wellness || {}), ...(L.wellness || {}) };
  if (Object.keys(R.wellness || {}).some(k => !(L.wellness || {})[k])) changed = true;
  if (Object.keys(L.wellness || {}).some(k => !(R.wellness || {})[k])) needPush = true;
  const st = win.get('settings') || L.settings;
  out.settings = { ...st }; DEVICE_KEYS.forEach(k => { out.settings[k] = L.settings[k]; });
  out.season = win.get('season') || L.season;
  LOCAL_ONLY.forEach(k => { out[k] = L[k]; });
  return { data: out, changed, needPush };
}

function cloudPayload(d) {
  const c = { ...d }; LOCAL_ONLY.forEach(k => delete c[k]);
  return c;
}

function scheduleCloud(ms = 15000) {
  if (!gEnabled() || CLOUD.needsUpdate) return;
  clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudSync(), ms);
}

async function cloudSync(attempt = 0) {
  if (!gEnabled()) return false;
  if (CLOUD.busy) { CLOUD.again = true; return false; }
  CLOUD.busy = true; CLOUD.again = false; setSyncStatus();
  let changedUI = false;
  try {
    stampAll(D);
    const g = await gCall('data.get', { since: D.sync.cloudRev || 0 });
    let rev = g.rev;
    if (!g.same && g.data) {
      const res = mergeData(D, g.data);
      D = res.data; primeStamps(D);
      if (res.needPush) CLOUD.dirty = true;
      changedUI = res.changed;
    } else if (!g.same && !g.data) CLOUD.dirty = true; // nothing in the cloud yet
    if (CLOUD.dirty) {
      const p = await gCall('data.put', { baseRev: rev, data: cloudPayload(D) });
      if (p.conflict) {
        D.sync.cloudRev = -1; CLOUD.busy = false;
        if (attempt < 3) return cloudSync(attempt + 1);
        throw new Error('Another device kept saving at the same moment. Will retry.');
      }
      rev = p.rev; CLOUD.dirty = false;
    }
    D.sync.cloudRev = rev; CLOUD.lastOk = Date.now(); CLOUD.error = ''; CLOUD.needsUpdate = false;
    bridge.save(D);
  } catch (e) {
    if (/Unknown action: data/.test(e.message)) { CLOUD.needsUpdate = true; CLOUD.error = 'Update your Google script to sync with your phone'; }
    else CLOUD.error = e.message;
  } finally {
    CLOUD.busy = false; setSyncStatus();
  }
  if (changedUI) refreshAfterSync();
  if (CLOUD.again) { CLOUD.again = false; setTimeout(() => cloudSync(), 300); }
  return changedUI;
}

function refreshAfterSync() {
  const typing = document.activeElement && document.activeElement.matches('input,textarea,select');
  if (document.querySelector('.scrim') || typing) { setTimeout(refreshAfterSync, 4000); return; }
  rerender();
  if (typeof onCloudMerged === 'function') onCloudMerged();
}

// Pairing code: lets a phone use the same Google connection (and so the same data)
function pairingCode() {
  if (!gEnabled()) return '';
  const json = JSON.stringify({ u: D.settings.googleUrl, k: D.settings.googleKey });
  return 'ASCEND1.' + btoa(unescape(encodeURIComponent(json)));
}
function readPairingCode(code) {
  const m = String(code || '').trim().match(/ASCEND1\.([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error('That is not an Ascend pairing code. Copy it again from Settings on your laptop.');
  const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  if (!o.u || !o.k) throw new Error('The pairing code is incomplete.');
  return o;
}

// Settings when pairing: the side edited last goes first, then anything it left at the default but the other side changed.
function pairedSettings(remote, local) {
  const def = defaults().settings, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const [first, second] = (local._u || 0) > (remote._u || 0) ? [local, remote] : [remote, local];
  const out = { ...first };
  for (const [k, v] of Object.entries(second)) if (k !== '_u' && k !== '_f' && same(first[k], def[k]) && !same(v, def[k])) out[k] = v;
  DEVICE_KEYS.forEach(k => { out[k] = local[k]; });
  return out;
}

// Phone pairing: merge this phone's data with the laptop's, record by record, so nothing on either side is lost.
async function pairWith(code) {
  const o = readPairingCode(code);
  const prev = { url: D.settings.googleUrl, key: D.settings.googleKey };
  D.settings.googleUrl = o.u; D.settings.googleKey = o.k;
  let g;
  try { g = await gCall('data.get', { since: 0 }); }
  catch (e) { D.settings.googleUrl = prev.url; D.settings.googleKey = prev.key; if (/Unknown action: data/.test(e.message)) throw new Error('Your Google script needs the update first. On the laptop, open Settings › Your phone and follow the steps.'); throw e; }
  const local = D;
  if (g.data) {
    // The laptop's copy goes first, so a record neither side has edited since syncing keeps the laptop's version.
    const remote = migrate(g.data);
    D = mergeData(remote, local).data;
    LOCAL_ONLY.forEach(k => { D[k] = local[k] !== undefined ? local[k] : defaults()[k]; });
    D.settings = pairedSettings(remote.settings, local.settings);
  }
  D.settings.googleUrl = o.u; D.settings.googleKey = o.k; D.settings.onboarded = true;
  // The combined settings are what every device should now have, field by field
  const now = Date.now(); D.settings._u = now; D.settings._f = {};
  for (const k of Object.keys(D.settings)) if (k !== '_u' && k !== '_f' && !DEVICE_KEYS.includes(k)) D.settings._f[k] = now;
  D.sync = { ...(D.sync || {}), cloudRev: g.rev };
  primeStamps(D); CLOUD.dirty = true; CLOUD.needsUpdate = false;
  // Targets made on the phone before pairing are not in Google Tasks yet
  if (D.settings.googleTasks) syncItems().filter(x => x.due >= todayStr() && !x.item.taskId).forEach(x => markDirty(x.item));
  await bridge.save(D);
  await cloudSync();
  return D;
}
