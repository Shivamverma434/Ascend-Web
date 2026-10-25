/* Ascend: Anki (through the free AnkiConnect add-on on the laptop) and Notion (free internal integration).
   Anki stats are read on the laptop and reach the phone through the normal Google Drive sync.
   Notion pages are written from either device. Uses globals from app.js and sync.js. */
'use strict';

// ---------- Anki ----------
const ANKI = { busy: false, error: '' };
async function ankiCall(action, params = {}) {
  const r = await bridge.anki(action, params);
  if (r.error) throw new Error(r.error);
  return r.result;
}
const ankiOn = () => !!D.settings.ankiOn;
const ankiToday = () => (D.anki && D.anki.days && D.anki.days[todayStr()]) || 0;
function ankiStreak() { let s = 0, d = todayStr(); const days = (D.anki && D.anki.days) || {}; if (!days[d]) d = addDays(d, -1); while (days[d]) { s++; d = addDays(d, -1); } return s; }

async function syncAnki(manual = false) {
  if (!D || ASCEND_IS_MOBILE || !ankiOn() || ANKI.busy || !bridge.anki) return;
  ANKI.busy = true; setSyncStatus();
  try {
    const byDay = await ankiCall('getNumCardsReviewedByDay');
    const names = (await ankiCall('deckNames')).filter(n => !n.includes('::'));
    let decks;
    try {
      const stats = await ankiCall('getDeckStats', { decks: names });
      decks = Object.values(stats || {}).filter(s => s.total_in_deck > 0)
        .map(s => ({ name: s.name, due: (s.review_count || 0) + (s.learn_count || 0), fresh: s.new_count || 0, total: s.total_in_deck }));
    } catch {
      // Some Anki versions answer "Deck counts unavailable": count with searches instead
      const count = async (q) => ((await ankiCall('findCards', { query: q })) || []).length;
      decks = [];
      for (const name of names) {
        const dq = `deck:"${name.replace(/"/g, '\\"')}"`;
        const due = await count(`${dq} is:due -is:suspended`), fresh = await count(`${dq} is:new -is:suspended`);
        if (due || fresh) decks.push({ name, due, fresh, total: null });
      }
    }
    decks.sort((a, b) => b.due - a.due);
    const from = addDays(todayStr(), -400), days = {};
    for (const [d, n] of byDay || []) if (d >= from && n) days[d] = n;
    D.anki = { days, decks, due: sum(decks, x => x.due), fresh: sum(decks, x => x.fresh), at: Date.now() };
    ANKI.error = '';
    save();
    if (['today', 'goals', 'settings'].includes(currentView) && !$('.scrim')) rerender();
    if (manual) toast(`Anki: ${D.anki.due} due, ${ankiToday()} reviewed today`);
  } catch (e) { ANKI.error = e.message; if (manual) toast(e.message); }
  finally { ANKI.busy = false; setSyncStatus(); }
}

function ankiTodayCard() {
  const a = D.anki;
  if (!a || !a.at) return ankiOn() && !ASCEND_IS_MOBILE ? `<section class="panel anki-card"><h3>${icon('cards', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px"')} Anki</h3><p class="muted" style="font-size:13px;margin-top:6px">${esc(ANKI.error || 'Waiting for Anki. Open Anki on this laptop.')}</p></section>` : '';
  const done = ankiToday(), due = a.due || 0;
  const pct = done + due ? Math.round(100 * done / (done + due)) : 100;
  const last14 = range(addDays(todayStr(), -13), todayStr()).map(d => a.days[d] || 0);
  const mx = Math.max(1, ...last14);
  const st = ankiStreak();
  return `<section class="panel anki-card">
    <div class="row" style="justify-content:space-between"><h3>${icon('cards', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px"')} Anki</h3>${st > 1 ? `<span class="chip">${icon('flame', 'style="width:12px;height:12px;color:var(--ember)"')} ${st} days</span>` : ''}</div>
    <div class="anki-nums"><div><b data-count="${due}">${due}</b><span>due now</span></div><div><b data-count="${done}">${done}</b><span>reviewed today</span></div>${a.fresh ? `<div><b>${a.fresh}</b><span>not seen yet</span></div>` : ''}</div>
    <div class="progress-bar thin"><i style="width:${pct}%"></i></div>
    <div class="anki-spark" title="Reviews, last 14 days">${last14.map((n, i) => `<i style="height:${Math.max(6, 100 * n / mx)}%;${n ? '' : 'opacity:.25'}" data-tip="${esc(shortDay(addDays(todayStr(), i - 13)))}: ${n} reviews"></i>`).join('')}</div>
    ${a.decks && a.decks.length ? `<div class="anki-decks">${a.decks.filter(d => d.due).slice(0, 4).map(d => `<span><b>${esc(d.name)}</b> ${d.due}</span>`).join('')}</div>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:8px"><span class="muted" style="font-size:11.5px">${ASCEND_IS_MOBILE ? 'From your laptop, ' : 'Updated '}${ago(a.at)}</span>${!ASCEND_IS_MOBILE ? `<button class="btn ghost sm" data-act="anki-open">${icon('external')}Open Anki</button>` : ''}</div>
  </section>`;
}

// ---------- Notion ----------
const NOTION = { busy: false, error: '' };
const notionReady = () => !!(D.settings.notionToken && notionPageId(D.settings.notionUrl));
function notionPageId(url) {
  try {
    const u = new URL(String(url || '').trim());
    const seg = (u.pathname.split('/').filter(Boolean).pop() || '').replace(/-/g, '');
    const id = seg.slice(-32);
    return /^[0-9a-f]{32}$/i.test(id) ? id : '';
  } catch { const m = String(url || '').replace(/-/g, '').match(/[0-9a-f]{32}/i); return m ? m[0] : ''; }
}
async function notion(method, path, body) {
  const r = await bridge.notion(D.settings.notionToken, method, path, body);
  if (r.error) throw new Error(r.error);
  return r.data;
}
// Markdown from journalMarkdown / reviewMarkdown into Notion blocks
function mdToBlocks(md) {
  const txt = (content, bold) => { const parts = []; for (let i = 0; i < content.length; i += 1900) parts.push({ type: 'text', text: { content: content.slice(i, i + 1900) }, ...(bold ? { annotations: { bold: true } } : {}) }); return parts; };
  const rich = (s) => { const out = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m; while ((m = re.exec(s))) { if (m.index > last) out.push(...txt(s.slice(last, m.index))); out.push(...txt(m[1], true)); last = re.lastIndex; } if (last < s.length) out.push(...txt(s.slice(last))); return out.length ? out : txt(' '); };
  const block = (type, extra) => ({ object: 'block', type, [type]: extra });
  const out = [block('divider', {})];
  for (const raw of String(md).split('\n')) {
    const l = raw.trimEnd(); let m;
    if (!l.trim()) continue;
    if ((m = l.match(/^##\s+(.*)/))) out.push(block('heading_2', { rich_text: rich(m[1]) }));
    else if ((m = l.match(/^###\s+(.*)/))) out.push(block('heading_3', { rich_text: rich(m[1]) }));
    else if ((m = l.match(/^- \[( |x)\]\s+(.*)/))) out.push(block('to_do', { rich_text: rich(m[2]), checked: m[1] === 'x' }));
    else if ((m = l.match(/^[-*]\s+(.*)/))) out.push(block('bulleted_list_item', { rich_text: rich(m[1]) }));
    else if ((m = l.match(/^>\s?(.*)/))) out.push(block('quote', { rich_text: rich(m[1] || ' ') }));
    else out.push(block('paragraph', { rich_text: rich(l) }));
  }
  return out;
}
// Each entry gets its own page inside your journal page, titled with its day and date.
// Re-saving rewrites that page, so nothing is ever duplicated.
const titleRich = (t) => ({ title: [{ type: 'text', text: { content: t } }] });
async function notionWrite(entry, markdown, title, emoji) {
  const parent = notionPageId(D.settings.notionUrl);
  // Entries saved before 1.3.1 were written straight into the journal page: tidy those away once
  if ((entry.notionBlocks || []).length && !entry.notionPage) { for (const id of entry.notionBlocks) { try { await notion('DELETE', '/blocks/' + id); } catch {} } }
  entry.notionBlocks = [];
  // The page title already says the date, so drop the leading divider and date heading
  const blocks = mdToBlocks(markdown).slice(1);
  if (blocks[0] && blocks[0].type === 'heading_2') blocks.shift();
  let page = entry.notionPage;
  if (page) {
    try { await notion('PATCH', '/pages/' + page, { properties: { title: titleRich(title) }, icon: { type: 'emoji', emoji }, archived: false }); }
    catch (e) { if (/cannot see|archived|could not find|not found/i.test(e.message)) page = null; else throw e; }
  }
  if (page) {
    // Clear the old content (up to a few hundred blocks), then write the new version
    for (let round = 0; round < 5; round++) {
      const kids = (await notion('GET', `/blocks/${page}/children`)).results || [];
      if (!kids.length) break;
      for (const k of kids) { try { await notion('DELETE', '/blocks/' + k.id); } catch {} }
    }
    for (let i = 0; i < blocks.length; i += 90) await notion('PATCH', `/blocks/${page}/children`, { children: blocks.slice(i, i + 90) });
  } else {
    const r = await notion('POST', '/pages', { parent: { page_id: parent }, icon: { type: 'emoji', emoji }, properties: { title: titleRich(title) }, children: blocks.slice(0, 90) });
    page = r.id; entry.notionLink = r.url || '';
    for (let i = 90; i < blocks.length; i += 90) await notion('PATCH', `/blocks/${page}/children`, { children: blocks.slice(i, i + 90) });
  }
  entry.notionPage = page; entry.notion = true; entry.notionAt = Date.now();
  save();
}
const longDate = (d) => parseDay(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
async function notionPush(kind, key) {
  if (!notionReady() || D.settings.notionAuto === false || NOTION.busy) return;
  const entry = kind === 'journal' ? D.journal[key] : D.reviews[key]; if (!entry) return;
  NOTION.busy = true;
  try {
    if (kind === 'journal') await notionWrite(entry, journalMarkdown(key), longDate(key), ['😩', '😕', '😐', '🙂', '🔥'][(entry.mood || 0) - 1] || '📝');
    else await notionWrite(entry, reviewMarkdown(key), `Weekly review · ${dayName(addDays(key, -6), { day: 'numeric', month: 'short' })} to ${dayName(key, { day: 'numeric', month: 'short', year: 'numeric' })}`, '📅');
    NOTION.error = ''; toast('Saved to Notion as its own page');
  }
  catch (e) { NOTION.error = e.message; toast('Notion: ' + e.message); }
  finally { NOTION.busy = false; }
}
async function notionTest(btn) {
  const msg = $('#notionMsg');
  if (!D.settings.notionToken || !notionPageId(D.settings.notionUrl)) { if (msg) msg.innerHTML = '<b style="color:var(--off)">Add both the secret and your page link, then save settings.</b>'; return; }
  btn.classList.add('busy');
  try { const p = await notion('GET', '/pages/' + notionPageId(D.settings.notionUrl)); const title = Object.values(p.properties || {}).find(x => x.type === 'title'); if (msg) msg.innerHTML = `<b style="color:var(--on)">Connected to "${esc(title && title.title[0] ? title.title.map(t => t.plain_text).join('') : 'your page')}".</b> Each reflection and weekly review becomes its own page inside it, named by its date.`; burst(btn); }
  catch (e) { if (msg) msg.innerHTML = `<b style="color:var(--off)">${esc(e.message)}</b>`; }
  btn.classList.remove('busy');
}

// ---------- Settings panels (replace the old Notion box) ----------
function integrationPanels() {
  const s = D.settings;
  const a = D.anki;
  return `
  <section class="panel conn ${ankiOn() && a && a.at && !ANKI.error ? 'on' : ''}">
    <div class="conn-head"><span class="conn-ic anki">${icon('cards')}</span><div class="grow"><h3>Anki</h3><p class="muted" style="font-size:12.5px">${ASCEND_IS_MOBILE ? (a && a.at ? `Your laptop last read Anki ${ago(a.at)}. Stats arrive here through Google sync.` : 'Turn this on in Ascend on your laptop. The phone shows what the laptop reads.') : ankiOn() ? 'Cards due, reviews per day and your Anki streak, read from Anki on this laptop.' : 'Off on this laptop. Press Sync now to start reading Anki here.'}</p></div>
      ${!ASCEND_IS_MOBILE ? `<button type="button" class="btn sm" data-act="anki-sync">${icon('sync')}Sync now</button>` : ''}</div>
    ${ASCEND_IS_MOBILE ? '' : `<label class="row toggle-row"><input type="checkbox" name="ankiOn" ${s.ankiOn ? 'checked' : ''}> Read my Anki stats</label>
    ${ANKI.error && ankiOn() ? `<p style="font-size:12.5px;color:var(--off);margin-bottom:8px">${esc(ANKI.error)}</p>` : ''}
    <ol class="setup-steps"><li>In Anki: <b>Tools › Add-ons › Get Add-ons</b>, paste code <code class="pair-code">2055492159</code> (AnkiConnect, free) and restart Anki.</li><li>Tick the box above and save. Keep Anki open while you study; Ascend checks every 15 minutes.</li></ol>`}
  </section>
  <section class="panel conn ${notionReady() && !NOTION.error ? 'on' : ''}">
    <div class="conn-head"><span class="conn-ic notion">${icon('journal')}</span><div class="grow"><h3>Notion</h3><p class="muted" style="font-size:12.5px">Each reflection becomes its own page in Notion, named with its day and date. Free.</p></div>
      ${notionReady() ? `<button type="button" class="btn sm" data-act="notion-test">Test</button>` : ''}</div>
    <div class="field"><label>Notion journal page link</label><input class="input" name="notionUrl" value="${esc(s.notionUrl)}" placeholder="https://www.notion.so/…"></div>
    <div class="field"><label>Internal integration secret</label><input class="input" type="password" name="notionToken" value="${esc(s.notionToken || '')}" placeholder="ntn_…" autocomplete="off"></div>
    <label class="row toggle-row"><input type="checkbox" name="notionAuto" ${s.notionAuto !== false ? 'checked' : ''}> Write to Notion automatically when I save</label>
    <p class="muted" id="notionMsg" style="font-size:12.5px;margin-bottom:6px"></p>
    <details><summary class="muted" style="cursor:pointer;font-size:13px">How to get the secret (2 minutes)</summary>
      <ol class="setup-steps"><li>Open <button type="button" class="btn sm" data-act="notion-integrations">${icon('external')}notion.so/my-integrations</button> and click <b>New integration</b>. Name it <b>Ascend</b>, type <b>Internal</b>, save.</li>
      <li>Copy the <b>Internal Integration Secret</b> and paste it above.</li>
      <li>Open your journal page in Notion › <b>•••</b> (top right) › <b>Connections</b> › add <b>Ascend</b>.</li>
      <li>Copy the page link (Share › Copy link), paste it above, save settings, then press <b>Test</b>.</li></ol></details>
  </section>`;
}

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'anki-sync': {
      // Anki is switched on per laptop, so a fresh install starts with it off: Sync now turns it on
      if (!ankiOn()) { D.settings.ankiOn = true; save(); const cb = $('[name=ankiOn]'); if (cb) cb.checked = true; }
      a.classList.add('busy'); await syncAnki(true); a.classList.remove('busy'); break;
    }
    case 'anki-open': try { await ankiCall('guiDeckBrowser'); } catch (err) { toast(err.message); } break;
    case 'notion-test': notionTest(a); break;
    case 'notion-integrations': bridge.openExternal('https://www.notion.so/my-integrations'); break;
  }
});

// Read Anki now and then while the laptop app is open
if (!ASCEND_IS_MOBILE) {
  setTimeout(() => syncAnki(), 6000);
  setInterval(() => syncAnki(), 15 * 60e3);
  let lastAnki = 0;
  addEventListener('focus', () => { if (Date.now() - lastAnki > 2 * 60e3) { lastAnki = Date.now(); syncAnki(); } });
}
