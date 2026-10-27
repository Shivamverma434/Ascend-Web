/* Ascend for Android: phone-specific behaviour on top of the shared app (app.js, sync.js, datasync.js).
   Bottom tab bar, pairing with the laptop, real Android notifications, back button, haptics. */
'use strict';

const TABS = [['today', 'Today'], ['focus', 'Focus'], ['journal', 'Journal'], ['fitness', 'Fitness']];
const MORE = [['health', 'Healthspan', 'Ascend Age and Pace of Aging'], ['exams', 'Exams', 'Countdown and spaced revision'], ['goals', 'Goals', 'Goals, habits and life balance'], ['people', 'People', 'Keep in touch with those who matter'], ['review', 'Weekly review', 'Close the week, set priorities'], ['coach', 'Coach', 'Plan, review and pep talks with Claude'], ['settings', 'Settings', 'Reminders, connections, pairing']];
let tabX = null;

// ---------- Bottom tab bar ----------
window.renderNav = function () {
  const inMore = MORE.some(([id]) => id === currentView);
  const nav = $('#nav');
  nav.innerHTML = `<span class="nav-ind" id="navInd"></span>` +
    TABS.map(([id, label]) => `<button data-go="${id}" class="${currentView === id ? 'active' : ''}">${icon(id)}<span>${label}</span></button>`).join('') +
    `<button data-act="more-sheet" class="${inMore ? 'active' : ''}">${icon('more')}<span>More</span>${new Date().getDay() === Number(D.settings.weeklyDay) && !reviewedThisWeek() ? '<i class="nav-dot"></i>' : ''}</button>`;
  const act = $('button.active', nav), ind = $('#navInd');
  if (act && ind) {
    const x = act.offsetLeft; ind.style.width = act.offsetWidth + 'px';
    if (tabX === null || reduced()) ind.style.transform = `translateX(${x}px)`;
    else { ind.style.transition = 'none'; ind.style.transform = `translateX(${tabX}px)`; void ind.offsetWidth; ind.style.transition = ''; ind.style.transform = `translateX(${x}px)`; }
    tabX = x;
  }
  // Slim top bar with streak and focus status
  let top = $('#mtop');
  if (!top) { top = document.createElement('div'); top.id = 'mtop'; top.className = 'mtop'; $('#main').insertBefore(top, $('#view')); }
  const a = D.activeSession;
  top.innerHTML = `<div class="m-brand"><svg viewBox="0 0 32 32" width="26" height="26"><path d="M3 27 L13 9 L18 17 L22 12 L29 27 Z" fill="#FF4F1F"/><path d="M13 9 L16 14.4 L13.6 15.6 L11.2 13.2 Z" fill="#fff"/><circle cx="24.5" cy="6.5" r="3" fill="#D4F53C"/></svg>Ascend</div>
    <div class="row" style="gap:6px"><button type="button" class="m-chip sync-chip ${syncingAll ? 'busy' : ''}" data-act="sync-everything" aria-label="Sync all">${icon('sync')}</button>${a ? `<button class="m-chip focusing" data-go="focus">${icon('focus', 'class="spin-slow"')}<span id="railTimer">Focusing</span></button>` : ''}<span class="m-chip">${icon('flame', 'class="flicker" style="color:var(--ember)"')}${streak()}</span></div>`;
};

function moreSheet() {
  const m = modal(`<div class="sheet-grip"></div>
    <div class="more-grid">${MORE.map(([id, label, sub], i) => `<button class="more-item" data-go="${id}" style="--i:${i}"><span class="more-ic">${icon(id)}</span><b>${label}</b><span class="muted">${sub}</span></button>`).join('')}</div>
    <div class="more-foot"><div>${icon('flame', 'class="flicker" style="width:16px;height:16px;color:var(--ember);vertical-align:-3px"')} ${streak()} day streak · ${esc(D.season.name)}, day ${seasonInfo().dayNum} of ${seasonInfo().total}</div><div id="syncStatus" class="sync-status light"></div></div>`, 'sheet');
  m.addEventListener('click', (e) => { if (e.target.closest('[data-go]')) closeModal(); });
  setSyncStatus();
}

// ---------- Pairing with the laptop (first launch) ----------
const THIS_DEVICE = window.ASCEND_WEB ? 'iPad' : 'phone';
const desktopOnboarding = window.onboarding;
window.onboarding = function () {
  const m = modal(`<div class="onb-mark"><svg viewBox="0 0 32 32" width="64" height="64"><path d="M3 27 L13 9 L18 17 L22 12 L29 27 Z" fill="#FF4F1F"/><path d="M13 9 L16 14.4 L13.6 15.6 L11.2 13.2 Z" fill="#fff"/><circle cx="24.5" cy="6.5" r="3" fill="#D4F53C"/></svg></div>
    <h2 style="text-align:center">Welcome to Ascend</h2><p class="sub" style="text-align:center">Pair with Ascend on your laptop so your goals, targets and journal stay in sync. Anything already on this ${THIS_DEVICE} is kept and copied to your laptop.</p>
    <ol class="setup-steps">
      <li>On your laptop, open Ascend › <b>Settings</b> › <b>Your phone</b>.</li>
      <li>Tap <b>Copy pairing code</b> and send it to yourself (WhatsApp, email or Google Keep).</li>
      <li>Copy it on this ${THIS_DEVICE}, then tap <b>Paste</b>.</li>
    </ol>
    <form><div class="field"><textarea class="input" name="code" rows="3" placeholder="ASCEND1.…" autocomplete="off" spellcheck="false"></textarea></div>
      <div class="row"><button type="button" class="btn" data-local="paste">${icon('copy')}Paste</button><button class="btn primary grow shine" type="submit">Connect</button></div>
      <p class="muted" id="pairMsg" style="font-size:13px;margin-top:10px"></p>
      <button type="button" class="btn ghost sm" data-local="fresh" style="margin-top:6px">Use without the laptop for now</button></form>`, 'sheet');
  m.closest('.scrim').dataset.locked = '1';
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-local]'); if (!b) return;
    if (b.dataset.local === 'paste') { $('[name=code]', m).value = await bridge.paste(); }
    if (b.dataset.local === 'fresh') { closeModal(true); desktopOnboarding(); }
  });
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#pairMsg', m), btn = $('[type=submit]', m);
    msg.textContent = 'Connecting to your Google account…'; btn.disabled = true;
    try {
      await pairWith($('[name=code]', m).value);
      msg.innerHTML = CLOUD.error ? `<b style="color:var(--on)">Paired.</b> Your data will reach the laptop on the next sync (${esc(CLOUD.error)}).` : `<b style="color:var(--on)">Paired. Your ${THIS_DEVICE} and laptop now share the same data.</b>`;
      bridge.haptic('success');
      setTimeout(async () => { closeModal(true); go('today'); confetti(150); await bridge.notifications.setup(); planNotifications(); pullGoogle(); syncIntervals(); }, 700);
    } catch (err) { msg.innerHTML = `<b style="color:var(--off)">${esc(err.message)}</b>`; btn.disabled = false; }
  });
};

// ---------- Real Android notifications, planned from your data ----------
let planTimer = null;
let widgetTimer = null;
window.onSaved = () => { clearTimeout(planTimer); planTimer = setTimeout(planNotifications, 5000); clearTimeout(widgetTimer); widgetTimer = setTimeout(updateWidget, 1500); };

// ---------- Home-screen widget: streak, today's targets, readiness, exam, Anki and a line from Mochi ----------
function updateWidget() {
  if (!D || !bridge.widget) return;
  const t = todayStr(), dd = D.days[t] || { targets: [] };
  const targets = dd.targets.slice().sort((a, b) => (a.done - b.done) || ((a.time || '99') < (b.time || '99') ? -1 : 1)).slice(0, 3);
  const rd = readiness(t), ex = nextExam(), plan = ex ? examPlan(ex) : null;
  const next = dd.targets.find(x => !x.done);
  const h = new Date().getHours();
  const line = !dd.checkin && h < 12 ? 'Good morning! Check in with me?' : !dd.targets.length ? 'What would make today count?' : !next ? 'All done today. So proud of you!' : plan && plan.due.length ? `${plan.due.length} revision${plan.due.length === 1 ? '' : 's'} due. Start with one?` : D.anki && D.anki.due ? `${D.anki.due} Anki cards are waiting.` : `Next: ${next.title}`;
  bridge.widget({
    streak: streak(),
    done: dd.targets.filter(x => x.done).length, total: dd.targets.length,
    t1: targets[0] ? (targets[0].done ? '✓ ' : '○ ') + targets[0].title : 'No targets yet',
    t2: targets[1] ? (targets[1].done ? '✓ ' : '○ ') + targets[1].title : '',
    t3: targets[2] ? (targets[2].done ? '✓ ' : '○ ') + targets[2].title : '',
    readiness: rd ? `Recovery ${rd.score}% · ${rd.band.label}` : '',
    exam: ex ? `${ex.name} in ${Math.max(0, daysBetween(t, ex.date))}d` : '',
    anki: D.anki && D.anki.at ? `Anki ${D.anki.due} due` : '',
    cat: `${D.settings.buddyName || 'Mochi'}: ${line}`
  });
}

// Questions planned ahead for a given moment. The phone shows them even when Ascend is closed,
// so they lean on goals, season and streak (known in advance) rather than live numbers.
function nudgeTexts(at) {
  return thoughtNudges(at, true).map(n => [(n.eyebrow || 'A question for you') + ' 💭', n.title + ' ' + n.body]);
}

async function planNotifications() {
  if (!D || !D.settings.onboarded) return;
  const s = D.settings;
  if (!s.remindersOn) { await bridge.notifications.replaceAll([]); return; }
  const now = new Date(); const list = [];
  const name = s.name ? ', ' + s.name : '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(todayStr(), i);
    const at = (hhmm) => { const x = parseDay(d); const [h, m] = String(hhmm || '00:00').split(':').map(Number); x.setHours(h, m, 0, 0); return x; };
    const ci = at(s.morningTime);
    if (ci > now && !(i === 0 && day(d).checkin)) list.push({ id: 1000 + i, title: `Good morning${name} ☀️`, body: thoughtFor('morning', daySeed(d)), at: ci, extra: { kind: 'checkin', view: 'checkin' } });
    const jt = at(s.journalTime);
    if (jt > now && !(i === 0 && D.journal[d] && D.journal[d].saved)) list.push({ id: 2000 + i, title: 'Before the day disappears ✍️', body: thoughtFor('evening', daySeed(d)) + ' Two minutes in your journal.', at: jt, extra: { kind: 'journal', view: 'journal' } });
    if (parseDay(d).getDay() === Number(s.weeklyDay)) { const wt = at(s.weeklyTime); if (wt > now && !(i === 0 && reviewedThisWeek())) list.push({ id: 3000 + i, title: 'Weekly review 📅', body: 'Was this week spent on what matters most? Ten honest minutes, then set next week\'s top 3.', at: wt, extra: { kind: 'weekly', view: 'review' } }); }
    if (i < 3) {
      const every = (Number(s.nudgeEveryHours) || 2) * 3600e3, end = at(s.activeEnd);
      let t = new Date(+at(s.activeStart) + every), k = 0;
      const used = new Set();
      while (t <= end && k < 12) {
        if (t > now && Math.abs(t - ci) > 20 * 60e3 && Math.abs(t - jt) > 20 * 60e3) {
          const msgs = nudgeTexts(t);
          let n = (daySeed(d) * 7 + k * 5) % msgs.length, tries = 0;
          while (used.has(msgs[n][1]) && tries++ < msgs.length) n = (n + 1) % msgs.length;
          const mm = msgs[n]; used.add(mm[1]);
          list.push({ id: 4000 + i * 20 + k, title: mm[0], body: mm[1], at: new Date(t), extra: { kind: 'nudge', view: 'today' } });
        }
        t = new Date(+t + every); k++;
      }
    }
  }
  await bridge.notifications.replaceAll(list);
}

// ---------- Hooks into the shared app ----------
const _burst = window.burst;
window.burst = function (el) { bridge.haptic('light'); return _burst(el); };
const _celebrate = window.celebrate;
window.celebrate = function (o) { bridge.haptic('success'); return _celebrate(o); };
const _closeModal = window.closeModal;
window.closeModal = function (force) {
  const locked = $('#layer .scrim[data-locked]');
  if (locked && !force) return;
  return _closeModal();
};

document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'more-sheet') moreSheet();
  if (a.dataset.act === 'notif-test') { const ok = await bridge.testNotification(); toast(ok ? 'A test notification arrives in 3 seconds' : 'Notifications are off. Allow them for Ascend in Android settings.'); }
  if (a.dataset.act === 'repair') onboarding();
});

window.onBooted = function () {
  bridge.hideSplash();
  if (D.settings.onboarded) { bridge.notifications.setup().then(planNotifications); }
  bridge.on('notification', (ex) => {
    if (ex.kind === 'focus') { go('focus'); return; }
    if (ex.kind === 'nudge') { go('today'); setTimeout(() => { const n = buildNudge('nudge', true); if (n) bridge.showPopup(n); }, 700); return; }
    go(ex.view || 'today');
  });
  setTimeout(updateWidget, 2000);
  let lastDay = todayStr();
  bridge.on('app-state', ({ active }) => {
    if (!active) { save(); updateWidget(); return; }
    if (todayStr() !== lastDay) { lastDay = todayStr(); calCache.at = 0; rerender(); }
    syncAll(); planNotifications();
    if (D.activeSession) startTimerLoop();
  });
  bridge.on('back', () => {
    if ($('#layer .scrim')) { closeModal(); return; }
    if (currentView !== 'today') { go('today'); return; }
    bridge.exitApp();
  });
};

// Refresh reminders when the other device changes something (for example a new check-in time)
window.onCloudMerged = () => { window.onSaved(); };
