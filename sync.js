/* Ascend: sync with Google (Tasks + Calendar through the person's own Apps Script) and intervals.icu.
   Uses globals from app.js (D, bridge, save, todayStr, addDays, parseDay, uid, day, round1, toast, rerender, currentView). */
'use strict';

// ---------- The Apps Script the person pastes into script.google.com ----------
function appsScriptSource(key) {
  return `// Ascend Google bridge
// Lets the Ascend app on your computer sync targets with Google Tasks and Google Calendar.
// It runs inside your own Google account. Only Ascend (which knows the secret key below) can use it.
var SECRET = '${key}';

function doGet() {
  return out_({ ok: true, hello: 'Ascend bridge is running. Paste this web app URL into Ascend.' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Bad request' }); }
  if (!body || body.key !== SECRET) return out_({ ok: false, error: 'Wrong key. Copy the setup script from Ascend again.' });
  try { return out_({ ok: true, result: handle_(body) }); }
  catch (err) { return out_({ ok: false, error: String(err && err.message ? err.message : err) }); }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(b) {
  switch (b.action) {
    case 'ping': return { version: 4, email: Session.getEffectiveUser().getEmail(), list: !!listId_(), calendar: CalendarApp.getDefaultCalendar().getName() };
    case 'data.get': return dataGet_(b.since);
    case 'data.put': return dataPut_(b.baseRev, b.data);
    case 'health.export': return healthExport_(b.days);
    case 'health.done': return healthDone_(b.upTo);
    case 'events': return events_(b.from, b.to);
    case 'tasks.pull': return pullTasks_();
    case 'tasks.upsert': return upsertTask_(b.task);
    case 'tasks.delete': return deleteTask_(b.id);
    case 'cal.upsert': return upsertEvent_(b.event);
    case 'cal.delete': return deleteEvent_(b.id);
    case 'cal.recurring': return recurring_(b.items || []);
    case 'sheet.sync': return sheetSync_(b.sheet);
    case 'batch':
      return (b.ops || []).map(function (op) {
        try { return { ok: true, result: handle_(op) }; }
        catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
      });
  }
  throw new Error('Unknown action: ' + b.action);
}

// ----- Shared data for the laptop and phone: Ascend/ascend-sync.json in your Drive -----
function dataFile_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ASCEND_DATA');
  if (id) { try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var folders = DriveApp.getRootFolder().getFoldersByName('Ascend');
  var folder = folders.hasNext() ? folders.next() : DriveApp.getRootFolder().createFolder('Ascend');
  var files = folder.getFilesByName('ascend-sync.json');
  var file = files.hasNext() ? files.next() : folder.createFile('ascend-sync.json', '', 'application/json');
  props.setProperty('ASCEND_DATA', file.getId());
  return file;
}

function dataGet_(since) {
  var rev = Number(PropertiesService.getScriptProperties().getProperty('DATA_REV') || 0);
  if (since && Number(since) === rev) return { rev: rev, same: true };
  if (!rev) return { rev: 0, data: null };
  var text = dataFile_().getBlob().getDataAsString();
  return { rev: rev, data: text ? JSON.parse(text) : null };
}

function dataPut_(baseRev, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var rev = Number(props.getProperty('DATA_REV') || 0);
    if (Number(baseRev) !== rev) return { conflict: true, rev: rev };
    dataFile_().setContent(JSON.stringify(data));
    rev++;
    props.setProperty('DATA_REV', String(rev));
    return { rev: rev };
  } finally { lock.releaseLock(); }
}

// ----- Apple Health: a Shortcut on your iPad fetches finished days and logs them in the Health app -----
// Only days the phone has fully read are sent, and each day once: the Shortcut calls health.done when it has logged them.
function healthExport_(days) {
  var text = dataFile_().getBlob().getDataAsString(), d = text ? JSON.parse(text) : {};
  var tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var hc = d.hc || {}, hcDays = hc.days || {}, well = d.wellness || {};
  var end = hc.at ? Utilities.formatDate(new Date(hc.at), tz, 'yyyy-MM-dd') : today;
  if (end > today) end = today;
  var done = PropertiesService.getScriptProperties().getProperty('HEALTH_DONE') || '';
  var first = shiftDay_(end, -Math.min(Math.max(Number(days) || 14, 1), 60));
  if (done >= first) first = shiftDay_(done, 1);
  var out = { steps: [], restingHR: [], weight: [], vo2max: [], sleep: [], upTo: '' };
  function add(list, a, b, at, digits) {
    var v = a != null ? Number(a) : b != null ? Number(b) : NaN;
    if (v > 0) list.push({ date: at, value: Math.round(v * digits) / digits });
  }
  for (var day = first; day < end; day = shiftDay_(day, 1)) {
    var w = well[day] || {}, h = hcDays[day] || {}, at = day + ' 12:00';
    add(out.steps, w.steps, h.steps, at, 1);
    add(out.restingHR, w.restingHR, h.rhr, at, 1);
    add(out.weight, w.weight, h.weight, at, 10);
    add(out.vo2max, w.vo2max, h.vo2, at, 10);
    out.upTo = day;
  }
  (hc.sleep || []).forEach(function (s) {
    var woke = String(s.end).slice(0, 10);
    if (s.nap || woke < first || woke >= end) return;
    out.sleep.push({ start: String(s.start).slice(0, 16).replace('T', ' '), end: String(s.end).slice(0, 16).replace('T', ' ') });
  });
  return out;
}

function healthDone_(upTo) {
  var props = PropertiesService.getScriptProperties(), done = props.getProperty('HEALTH_DONE') || '';
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(upTo || '') && upTo > done) { done = upTo; props.setProperty('HEALTH_DONE', done); }
  return { done: done };
}

function shiftDay_(day, n) {
  var t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// ----- Google Sheets: your revision timetable, one tab per subject -----
// Run this once from the editor (pick authorizeSheets, click Run) so Google asks for Sheets permission.
function authorizeSheets() {
  var ss = SpreadsheetApp.create('Ascend permission check');
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  Logger.log('Sheets access is allowed. You can close this.');
}

function sheetSync_(p) {
  var props = PropertiesService.getScriptProperties();
  var key = 'SHEET_' + p.id, id = props.getProperty(key), ss = null;
  if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(p.title);
    props.setProperty(key, ss.getId());
    try { var fs = DriveApp.getRootFolder().getFoldersByName('Ascend'); if (fs.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(fs.next()); } catch (e) {}
  } else if (ss.getName() !== p.title) ss.rename(p.title);
  var keep = {};
  p.tabs.forEach(function (t, i) {
    keep[t.name] = true;
    var sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name, i);
    sh.clear();
    var rows = t.values.length, cols = t.values[0].length;
    sh.getRange(1, 1, rows, cols).setNumberFormat('@').setValues(t.values).setBackgrounds(t.colors).setVerticalAlignment('middle');
    sh.getRange(1, 1, 1, cols).setFontWeight('bold');
    sh.setFrozenRows(1); sh.setFrozenColumns(1);
    sh.setColumnWidth(1, 260);
    if (t.tab) sh.setTabColor(t.tab);
  });
  ss.getSheets().forEach(function (sh) { if (!keep[sh.getName()] && ss.getSheets().length > 1) ss.deleteSheet(sh); });
  return { url: ss.getUrl() };
}

// ----- Google Tasks: a list called "Ascend" -----
function listId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ASCEND_LIST');
  if (id) { try { Tasks.Tasklists.get(id); return id; } catch (e) {} }
  var lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  var found = null;
  for (var i = 0; i < lists.length; i++) if (lists[i].title === 'Ascend') found = lists[i];
  if (!found) found = Tasks.Tasklists.insert({ title: 'Ascend' });
  props.setProperty('ASCEND_LIST', found.id);
  return found.id;
}

function pullTasks_() {
  var id = listId_(), out = [], token = null, guard = 0;
  do {
    var opts = { showCompleted: true, showHidden: true, showDeleted: true, maxResults: 100 };
    if (token) opts.pageToken = token;
    var r = Tasks.Tasks.list(id, opts);
    (r.items || []).forEach(function (t) {
      out.push({ id: t.id, title: t.title || '', notes: t.notes || '', status: t.status, due: t.due ? String(t.due).slice(0, 10) : '', updated: t.updated, deleted: !!t.deleted });
    });
    token = r.nextPageToken; guard++;
  } while (token && guard < 10);
  return out;
}

function upsertTask_(t) {
  var list = listId_();
  var res = { title: t.title, notes: t.notes || '', status: t.done ? 'completed' : 'needsAction' };
  if (t.due) res.due = t.due + 'T00:00:00.000Z';
  if (!t.done) res.completed = null;
  var saved = null;
  if (t.id) { try { saved = Tasks.Tasks.patch(res, list, t.id); } catch (e) { saved = null; } }
  if (!saved) saved = Tasks.Tasks.insert(res, list);
  return { id: saved.id, updated: saved.updated };
}

function deleteTask_(id) {
  try { Tasks.Tasks.remove(listId_(), id); } catch (e) {}
  return true;
}

// ----- Google Calendar -----
function events_(from, to) {
  var start = new Date(from), end = new Date(to), out = [];
  CalendarApp.getAllCalendars().forEach(function (c) {
    try { if (c.isHidden() || !c.isSelected()) return; } catch (e) {}
    c.getEvents(start, end).forEach(function (e) {
      out.push({ id: e.getId(), title: e.getTitle() || 'Busy', start: e.getStartTime().toISOString(), end: e.getEndTime().toISOString(),
        allDay: e.isAllDayEvent(), location: e.getLocation() || '', ascend: e.getTag('ascend') === '1', calendar: c.getName() });
    });
  });
  out.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return out;
}

function upsertEvent_(ev) {
  var start = new Date(ev.start), end = new Date(ev.end), e = null;
  if (ev.id) { try { e = CalendarApp.getEventById(ev.id); } catch (x) { e = null; } }
  if (e) {
    e.setTitle(ev.title); e.setTime(start, end);
    if (ev.description) e.setDescription(ev.description);
  } else {
    e = CalendarApp.getDefaultCalendar().createEvent(ev.title, start, end, { description: ev.description || '' });
    e.setTag('ascend', '1');
    try { e.setColor(CalendarApp.EventColor.ORANGE); } catch (x) {}
  }
  return { id: e.getId() };
}

function deleteEvent_(id) {
  try { var e = CalendarApp.getEventById(id); if (e) e.deleteEvent(); } catch (x) {}
  return true;
}

// Repeating events for the morning check-in and weekly review
function recurring_(items) {
  var props = PropertiesService.getScriptProperties(), cal = CalendarApp.getDefaultCalendar(), out = {};
  items.forEach(function (it) {
    var old = props.getProperty('SERIES_' + it.key);
    if (old) {
      try { var s = cal.getEventSeriesById(old); if (s) s.deleteEventSeries(); } catch (x) {}
      props.deleteProperty('SERIES_' + it.key);
    }
    if (it.remove) return;
    var start = new Date(it.start), end = new Date(start.getTime() + (it.minutes || 15) * 60000);
    var rec = CalendarApp.newRecurrence();
    if (it.rule === 'weekly') rec.addWeeklyRule().onlyOnWeekday(CalendarApp.Weekday[it.weekday]);
    else rec.addDailyRule();
    var series = cal.createEventSeries(it.title, start, end, rec, { description: it.description || 'Added by Ascend' });
    series.setTag('ascend', '1');
    try { series.setColor(CalendarApp.EventColor.ORANGE); } catch (x) {}
    props.setProperty('SERIES_' + it.key, series.getId());
    out[it.key] = series.getId();
  });
  return out;
}
`;
}

// ---------- Google sync engine ----------
const GSYNC = { busy: false, error: '', email: '', lastOk: 0 };
const gEnabled = () => !!(D.settings.googleUrl && D.settings.googleKey);

async function gCall(action, payload = {}) {
  const r = await bridge.google(D.settings.googleUrl, { key: D.settings.googleKey, action, ...payload });
  if (!r || !r.ok) throw new Error((r && r.error) || 'No reply from Google');
  return r.result;
}

// Everything that mirrors to Google Tasks: daily targets and weekly priorities.
function syncItems() {
  const out = [];
  for (const [date, dd] of Object.entries(D.days)) for (const t of dd.targets) out.push({ item: t, due: date, list: dd.targets });
  for (const [date, rv] of Object.entries(D.reviews || {})) for (const p of (rv.priorities || [])) out.push({ item: p, due: addDays(date, 7), weekly: true, list: rv.priorities });
  return out;
}

function markDirty(item) { item.dirty = true; item.rev = (item.rev || 0) + 1; scheduleFlush(); }
function queueRemoteDelete(item) {
  if (item.taskId) D.syncQueue.push({ action: 'tasks.delete', id: item.taskId });
  if (item.eventId) D.syncQueue.push({ action: 'cal.delete', id: item.eventId });
  scheduleFlush();
}

let flushTimer = null;
function scheduleFlush(ms = 1500) {
  if (!gEnabled()) return;
  clearTimeout(flushTimer); flushTimer = setTimeout(flushGoogle, ms);
}

function eventTimes(due, t) {
  const st = parseDay(due); const [h, m] = t.time.split(':').map(Number); st.setHours(h, m, 0, 0);
  return { start: st.toISOString(), end: new Date(+st + (Number(t.dur) || 50) * 60e3).toISOString() };
}

async function flushGoogle() {
  if (!gEnabled()) return;
  if (GSYNC.busy) { scheduleFlush(2000); return; }
  const s = D.settings;
  const floor = addDays(todayStr(), -14);
  const dirty = syncItems().filter(x => x.item.dirty && x.due >= floor);
  const deletes = D.syncQueue.splice(0);
  if (!dirty.length && !deletes.length) return;
  const ops = deletes.slice(); const plan = [];
  for (const x of dirty) {
    const t = x.item; const g = D.goals.find(gg => gg.id === t.goalId);
    const notes = [x.weekly ? 'Weekly priority' : '', g ? 'Goal: ' + g.name : '', 'From Ascend'].filter(Boolean).join(' · ');
    if (s.googleTasks) { ops.push({ action: 'tasks.upsert', task: { id: t.taskId || '', title: t.title, notes, due: x.due, done: !!t.done } }); plan.push({ x, kind: 'task', rev: t.rev }); }
    if (s.googleCalendar && t.time && !x.weekly) {
      ops.push({ action: 'cal.upsert', event: { id: t.eventId || '', title: (t.done ? '✓ ' : '') + t.title, ...eventTimes(x.due, t), description: 'Ascend target' + (g ? ' · Goal: ' + g.name : '') } });
      plan.push({ x, kind: 'event', rev: t.rev });
    } else if (t.eventId) { ops.push({ action: 'cal.delete', id: t.eventId }); plan.push({ x, kind: 'event-del', rev: t.rev }); }
    if (!plan.some(p => p.x === x)) plan.push({ x, kind: 'none', rev: t.rev });
  }
  GSYNC.busy = true; setSyncStatus();
  try {
    const realOps = ops.length ? ops : [{ action: 'ping' }];
    const results = await gCall('batch', { ops: realOps });
    let i = deletes.length; const failed = new Set();
    for (const p of plan) {
      if (p.kind === 'none') continue;
      const r = results[i++];
      if (!r || !r.ok) { failed.add(p.x.item); p.x.item.syncError = (r && r.error) || 'failed'; continue; }
      if (p.kind === 'task') { p.x.item.taskId = r.result.id; p.x.item.remoteUpdated = r.result.updated; }
      if (p.kind === 'event') p.x.item.eventId = r.result.id;
      if (p.kind === 'event-del') p.x.item.eventId = '';
    }
    for (const p of plan) if (!failed.has(p.x.item) && p.x.item.rev === p.rev) { p.x.item.dirty = false; delete p.x.item.syncError; }
    GSYNC.error = failed.size ? `${failed.size} item(s) could not sync` : ''; GSYNC.lastOk = Date.now();
  } catch (e) {
    D.syncQueue.unshift(...deletes); GSYNC.error = e.message;
  } finally {
    GSYNC.busy = false; save(); setSyncStatus();
    if (syncItems().some(x => x.item.dirty && x.due >= floor && !x.item.syncError)) scheduleFlush(3000);
  }
}

// Pull changes made on the phone: ticks, renames, date moves, new tasks, deletions.
async function pullGoogle(manual = false) {
  if (!gEnabled() || !D.settings.googleTasks) return 0;
  if (GSYNC.busy) return 0;
  GSYNC.busy = true; setSyncStatus();
  let changed = 0;
  try {
    const remote = await gCall('tasks.pull');
    const byId = new Map(); syncItems().forEach(x => { if (x.item.taskId) byId.set(x.item.taskId, x); });
    const t0 = todayStr();
    for (const r of remote) {
      const x = byId.get(r.id);
      if (x) {
        if (x.item.dirty || r.updated === x.item.remoteUpdated) continue;
        x.item.remoteUpdated = r.updated;
        if (r.deleted) { if (x.item.eventId) D.syncQueue.push({ action: 'cal.delete', id: x.item.eventId }); x.list.splice(x.list.indexOf(x.item), 1); changed++; scheduleFlush(); continue; }
        const done = r.status === 'completed';
        if (done !== !!x.item.done) { x.item.done = done; x.item.doneAt = done ? new Date().toISOString() : null; changed++; if (x.item.time) { x.item.remoteUpdated = r.updated; markDirty(x.item); } }
        if (r.title && r.title !== x.item.title) { x.item.title = r.title; changed++; }
        if (!x.weekly && r.due && r.due !== x.due && r.due >= addDays(t0, -1)) {
          x.list.splice(x.list.indexOf(x.item), 1); day(r.due).targets.push(x.item); changed++;
          if (x.item.time) markDirty(x.item); // move the calendar block too
        }
      } else if (!r.deleted && r.status !== 'completed' && r.title) {
        // A task added on the phone: bring it in. Overdue or undated tasks land on today.
        const due = r.due && r.due >= t0 ? r.due : t0;
        if (r.due && r.due < addDays(t0, -7)) continue;
        const item = { id: uid(), title: r.title, goalId: '', done: false, taskId: r.id, remoteUpdated: r.updated, fromGoogle: true };
        day(due).targets.push(item); changed++;
        if (r.due !== due) markDirty(item);
      }
    }
    GSYNC.error = ''; GSYNC.lastOk = Date.now();
  } catch (e) { GSYNC.error = e.message; if (manual) throw e; }
  finally { GSYNC.busy = false; setSyncStatus(); }
  if (changed) { save(); if (['today', 'review'].includes(currentView) && !document.querySelector('.scrim')) rerender(); }
  return changed;
}

async function googleEvents(date) {
  const st = parseDay(date), en = parseDay(addDays(date, 1));
  return gCall('events', { from: st.toISOString(), to: en.toISOString() });
}

async function setupRecurringEvents(remove = false) {
  const s = D.settings;
  const next = (weekday, hhmm) => { // next occurrence of a weekday (0 Sun) at a time; weekday null = tomorrow-or-today
    const d = new Date(); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0);
    if (weekday === null) { if (d < new Date()) d.setDate(d.getDate() + 1); return d; }
    while (d.getDay() !== weekday || d < new Date()) d.setDate(d.getDate() + 1);
    return d;
  };
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const items = [
    { key: 'checkin', remove, title: 'Ascend: Morning check-in', rule: 'daily', start: next(null, s.morningTime).toISOString(), minutes: 15, description: 'Sleep, energy, mood and your top targets for today. Open Ascend.' },
    { key: 'weekly', remove, title: 'Ascend: Weekly review', rule: 'weekly', weekday: days[Number(s.weeklyDay)], start: next(Number(s.weeklyDay), s.weeklyTime).toISOString(), minutes: 45, description: 'Close the week and set next week\'s priorities. Open Ascend.' }
  ];
  const r = await gCall('cal.recurring', { items });
  D.sync.recurring = remove ? null : { morningTime: s.morningTime, weeklyDay: s.weeklyDay, weeklyTime: s.weeklyTime };
  save();
  return r;
}

function setSyncStatus() {
  const el = document.getElementById('syncStatus');
  const parts = [];
  if (gEnabled()) parts.push(GSYNC.busy ? 'Google: syncing…' : GSYNC.error ? 'Google: ' + GSYNC.error : GSYNC.lastOk ? 'Google: synced ' + ago(GSYNC.lastOk) : 'Google: connected');
  if (gEnabled()) parts.push(CLOUD.busy ? (ASCEND_IS_MOBILE ? 'Laptop sync: syncing…' : 'Phone sync: syncing…') : CLOUD.needsUpdate ? 'Phone sync: update your Google script' : CLOUD.error ? 'Sync: ' + CLOUD.error : CLOUD.lastOk ? (ASCEND_IS_MOBILE ? 'Laptop sync: ' : 'Phone sync: ') + ago(CLOUD.lastOk) : '');
  if (D.settings.intervalsKey) parts.push(IVSYNC.busy ? 'intervals.icu: syncing…' : IVSYNC.error ? 'intervals.icu: ' + IVSYNC.error : D.sync.intervalsAt ? 'intervals.icu: synced ' + ago(D.sync.intervalsAt) : 'intervals.icu: connected');
  if (D.settings.ankiOn && !ASCEND_IS_MOBILE && typeof ANKI !== 'undefined') parts.push(ANKI.busy ? 'Anki: reading…' : ANKI.error ? 'Anki: ' + ANKI.error : D.anki && D.anki.at ? 'Anki: ' + ago(D.anki.at) : '');
  if (el) { el.innerHTML = parts.filter(Boolean).map(p => `<div class="${/error|could not|wrong|not accept/i.test(p) ? 'bad' : ''}">${esc(p)}</div>`).join(''); }
}
function ago(ts) { const m = Math.round((Date.now() - ts) / 60e3); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'; }

// ---------- intervals.icu ----------
const IVSYNC = { busy: false, error: '' };
function ivType(t = '') {
  t = String(t).toLowerCase();
  if (/run/.test(t)) return 'run';
  if (/walk|hike/.test(t)) return 'walk';
  if (/ride|cycl|bike/.test(t)) return 'cycling';
  if (/swim/.test(t)) return 'swim';
  if (/weight|strength/.test(t)) return 'strength';
  if (/yoga|pilates|stretch/.test(t)) return 'yoga';
  if (/hiit|crossfit|interval|elliptical|rowing|row/.test(t)) return 'hiit';
  if (/soccer|tennis|badminton|basketball|squash|cricket|volley|sport|dance/.test(t)) return 'sport';
  return 'other';
}

async function syncIntervals(manual = false) {
  const s = D.settings;
  if (!s.intervalsKey || IVSYNC.busy) return null;
  IVSYNC.busy = true; setSyncStatus();
  const today = todayStr();
  const oldest = addDays(today, D.sync.intervalsAt ? -21 : -120);
  const ath = encodeURIComponent(String(s.intervalsAthlete || '0').trim() || '0');
  let added = 0, updated = 0, skipped = 0;
  try {
    const acts = await bridge.intervals(s.intervalsKey, `/athlete/${ath}/activities?oldest=${oldest}&newest=${today}`);
    if (acts.error) throw new Error(acts.error);
    const ignored = new Set(D.sync.ivIgnored || []);
    for (const a of (Array.isArray(acts.data) ? acts.data : [])) {
      if (!a || !a.id) continue;
      if (!a.type || a._note) { skipped++; continue; } // e.g. Strava-sourced activities, which Strava blocks from the API
      if (ignored.has(String(a.id))) continue;
      const date = String(a.start_date_local || '').slice(0, 10); if (!date) continue;
      const w = {
        id: 'iv-' + a.id, extId: String(a.id), source: 'intervals', date, at: a.start_date_local, type: ivType(a.type), name: a.name || '',
        minutes: Math.round((a.moving_time || a.elapsed_time || 0) / 60), distance: a.distance ? round1(a.distance / 1000) : 0,
        avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null, load: a.icu_training_load ? Math.round(a.icu_training_load) : null,
        calories: a.calories ? Math.round(a.calories) : null, zones: Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times.map(Number) : null, elevation: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null
      };
      const i = D.workouts.findIndex(x => x.extId === w.extId);
      if (i >= 0) { D.workouts[i] = { ...D.workouts[i], ...w }; updated++; } else { D.workouts.push({ effort: 0, notes: '', ...w }); added++; }
    }
    const wl = await bridge.intervals(s.intervalsKey, `/athlete/${ath}/wellness?oldest=${oldest}&newest=${today}`);
    if (!wl.error && Array.isArray(wl.data)) for (const r of wl.data) {
      if (!r || !r.id) continue;
      const v = { steps: r.steps ?? null, sleepSecs: r.sleepSecs ?? null, sleepScore: r.sleepScore ?? null, restingHR: r.restingHR ?? null, hrv: r.hrv ?? null, weight: r.weight ?? null, vo2max: r.vo2max ?? null };
      if (Object.values(v).some(x => x !== null)) D.wellness[String(r.id).slice(0, 10)] = v;
    }
    if (typeof dedupeWorkouts === 'function') dedupeWorkouts();
    D.sync.intervalsAt = Date.now(); IVSYNC.error = '';
    save();
    if (currentView === 'health' && !document.querySelector('.scrim')) rerender();
    if (manual) toast(added ? `${added} new activit${added === 1 ? 'y' : 'ies'} from intervals.icu` : 'intervals.icu is up to date');
    if (manual && skipped) setTimeout(() => toast(`${skipped} activit${skipped === 1 ? 'y' : 'ies'} came from Strava, which blocks sharing ${skipped === 1 ? 'it' : 'them'}. Connect Amazfit directly in intervals.icu.`), 2800);
    return { added, updated, skipped };
  } catch (e) {
    IVSYNC.error = e.message; if (manual) toast(e.message);
    return null;
  } finally { IVSYNC.busy = false; setSyncStatus(); }
}

// ---------- Sync all: every source, then the other device and Google ----------
// Sources first, so their new data goes up to the other device in the same pass.
let syncingAll = false;
async function syncEverything() {
  if (syncingAll) return;
  syncingAll = true; $$('[data-act=sync-everything]').forEach(b => b.classList.add('busy'));
  const errors = [];
  try {
    await Promise.allSettled([
      D.settings.intervalsKey ? syncIntervals() : null,
      typeof syncAnki === 'function' ? syncAnki() : null,
      typeof syncHealth === 'function' ? syncHealth() : null,
      typeof syncLinks === 'function' ? syncLinks() : null
    ]);
    await syncAll();
    if (D.settings.intervalsKey && IVSYNC.error) errors.push('intervals.icu: ' + IVSYNC.error);
    if (typeof ANKI !== 'undefined' && D.settings.ankiOn && !ASCEND_IS_MOBILE && ANKI.error) errors.push('Anki: ' + ANKI.error);
    if (typeof HCSYNC !== 'undefined' && D.settings.hcOn && ASCEND_IS_MOBILE && HCSYNC.error) errors.push('Health Connect: ' + HCSYNC.error);
    if (typeof LINKS !== 'undefined' && LINKS.error) errors.push(LINKS.error);
    if (gEnabled() && GSYNC.error) errors.push('Google: ' + GSYNC.error);
    if (gEnabled() && CLOUD.error) errors.push((ASCEND_IS_MOBILE ? 'Laptop' : 'Phone') + ' sync: ' + CLOUD.error);
  } finally {
    syncingAll = false; $$('[data-act=sync-everything]').forEach(b => b.classList.remove('busy'));
    setSyncStatus();
  }
  toast(errors.length ? errors.join(' · ') : 'Everything is synced');
  if (!document.querySelector('.scrim') && !(document.activeElement && document.activeElement.matches('input,textarea,select'))) rerender();
}

// ---------- Background schedule ----------
// Order matters: merge the other device's data first, then Google Tasks, so imports are not duplicated.
async function syncAll() { await cloudSync(); await pullGoogle(); await flushGoogle(); }
function startBackgroundSync() {
  setTimeout(async () => { await syncAll(); syncIntervals(); }, 3000);
  setInterval(() => { syncAll(); }, 3 * 60e3);
  setInterval(() => { syncIntervals(); }, 30 * 60e3);
  setInterval(setSyncStatus, 60e3);
  let lastFocusPull = 0;
  const onBack = () => { if (Date.now() - lastFocusPull > 30e3) { lastFocusPull = Date.now(); syncAll(); } };
  window.addEventListener('focus', onBack);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onBack(); });
}
