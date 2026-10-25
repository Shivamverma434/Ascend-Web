// Ascend for iPad and other browsers: the web version of the desktop "bridge" (window.ascend).
// Same phone layout as Android, added to the home screen from Safari. Loaded before app.js.
'use strict';
(() => {
  window.ASCEND_MOBILE = true;
  window.ASCEND_WEB = true;
  const KEY = 'ascend-data';
  const handlers = {};
  const pending = {}; // events that arrive before app.js registers its handlers
  const emit = (ch, payload) => { if (handlers[ch]) handlers[ch](payload); else (pending[ch] = pending[ch] || []).push(payload); };

  // ---------- Storage (this browser only; Google sync keeps a copy in your Drive) ----------
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  async function load() {
    let data = null;
    for (const k of [KEY, KEY + '.bak']) { try { data = JSON.parse(localStorage.getItem(k) || 'null'); } catch { data = null; } if (data) break; }
    return { data, dataDir: 'On this iPad, synced with your laptop through Google', file: '', detectedDrive: false, mobile: true };
  }
  async function save(d) {
    try {
      const old = localStorage.getItem(KEY);
      if (old) localStorage.setItem(KEY + '.bak', old);
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) { console.error('save failed', e); }
    return true;
  }

  // ---------- Network ----------
  async function google(url, body) {
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url || '')) return { ok: false, error: 'That does not look like an Apps Script web app link.' };
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { ok: false, error: 'Google replied with a web page instead of data. Check the deployment is set to "Anyone".' }; }
    } catch { return { ok: false, error: 'No internet connection, or Google could not be reached.' }; }
  }
  async function intervals(key, path) {
    try {
      const r = await fetch('https://intervals.icu/api/v1' + path, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + key), Accept: 'application/json' } });
      if (r.status === 401 || r.status === 403) return { error: 'intervals.icu did not accept the API key.' };
      if (r.status >= 400) return { error: 'intervals.icu replied with error ' + r.status };
      return { data: await r.json() };
    } catch { return { error: 'Could not reach intervals.icu' }; }
  }
  async function notion(token, method, path, body) {
    if (!token) return { error: 'Add your Notion integration secret in Settings.' };
    const okPath = (method === 'POST' && path === '/pages') || (['GET', 'PATCH', 'DELETE'].includes(method) && /^\/(pages|blocks)\/[0-9a-f-]{32,36}(\/children)?$/i.test(path || ''));
    if (!okPath) return { error: 'Ascend does not use that Notion request' };
    try {
      const r = await fetch('https://api.notion.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) return { error: 'Notion did not accept the secret.' };
      if (r.status === 404) return { error: 'Notion cannot see that page. In Notion open the page › ••• › Connections › add Ascend.' };
      if (r.status >= 400) return { error: data.message || 'Notion replied with error ' + r.status };
      return { data };
    } catch { return { error: 'Could not reach Notion' }; }
  }

  // ---------- In-app animated pop-up (same design as the desktop one) ----------
  let popupFrame = null, popupQueue = [];
  function showPopup(payload) {
    if (popupFrame) { popupQueue.push(payload); return; }
    popupFrame = document.createElement('iframe');
    popupFrame.className = 'popup-frame';
    popupFrame.setAttribute('title', 'Ascend reminder');
    window.__popupApi = {
      on: (ch, fn) => { if (ch === 'popup-data') setTimeout(() => fn(payload), 30); },
      closePopup: () => closePopup(),
      popupAction: (a) => { closePopup(); runAction(a); }
    };
    popupFrame.src = 'popup.html';
    document.body.appendChild(popupFrame);
    requestAnimationFrame(() => popupFrame && popupFrame.classList.add('in'));
  }
  function closePopup() {
    const f = popupFrame; if (!f) return;
    f.classList.remove('in'); f.classList.add('out');
    setTimeout(() => { f.remove(); if (popupFrame === f) popupFrame = null; if (popupQueue.length) setTimeout(() => showPopup(popupQueue.shift()), 500); }, 380);
  }
  function runAction(a) {
    if (!a) return;
    if (a.url) openExternal(a.url);
    if (a.view) emit('navigate', a);
  }

  // ---------- Misc ----------
  async function openExternal(url) {
    if (!/^(https?:|notion:)/i.test(url || '')) return false;
    window.open(url, '_blank', 'noopener');
    return true;
  }
  document.addEventListener('visibilitychange', () => emit('app-state', { active: !document.hidden }));

  // Works offline after the first visit
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  window.ascend = {
    load, save,
    chooseFolder: async () => null, openFolder: async () => {},
    idleSeconds: async () => 0,
    openExternal,
    copy: async (t) => { try { await navigator.clipboard.writeText(String(t)); } catch {} return true; },
    paste: async () => { try { return await navigator.clipboard.readText(); } catch { return ''; } },
    calendar: async () => ({ events: [] }),
    showPopup: async (p) => showPopup(p),
    closePopup: async () => closePopup(),
    popupAction: async (a) => runAction(a),
    setLogin: async () => {},
    info: async () => ({ version: '1.3.7', platform: 'web' }),
    google, intervals, notion,
    anki: async () => ({ error: 'Anki is read on your laptop and synced here.' }),
    trayStatus: async () => {},
    // A web app on iPad cannot schedule reminders, so these quietly do nothing
    notifications: { replaceAll: async () => false, setup: async () => false },
    haptic: () => {},
    exitApp: () => {},
    hideSplash: () => {},
    on: (ch, fn) => { handlers[ch] = fn; (pending[ch] || []).splice(0).forEach(p => fn(p)); }
  };
})();
