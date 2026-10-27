/* Ascend: the body, beyond the watch. Protein in 4 meal slots with one-tap foods, lab results with the recheck
   dates your doctor gives you, running guardrails (no long run more than 10% past your longest in 30 days), and back
   pain charted against lifting. Uses globals from app.js, health.js, flow.js, prep.js and daily.js. */
'use strict';

// ---------- Protein ----------
// About 20 g or more per meal, spread through the day (ISSN position stand); 4 slots of 20 g reach 80 g
const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
const DEFAULT_FOODS = [['2 eggs', 12], ['Whey scoop', 24], ['Paneer 100 g', 18], ['Chicken 100 g', 27], ['Dal bowl', 9], ['Curd bowl', 8], ['Milk glass', 8], ['Soya chunks 50 g', 26]];
const proteinFoods = () => Array.isArray(D.settings.proteinFoods) && D.settings.proteinFoods.length ? D.settings.proteinFoods : DEFAULT_FOODS;
const proteinOn = (d) => ((D.protein || {})[d] || { items: [] }).items || [];
const proteinTotal = (d) => sum(proteinOn(d), x => x.g);
const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 0 : h < 16 ? 1 : h < 19 ? 2 : 3; };
function addProtein(name, g, slot = mealNow()) {
  D.protein = D.protein || {};
  const t = todayStr(), rec = D.protein[t] = D.protein[t] || { items: [] };
  rec.items = [...(rec.items || []), { f: name, g: Number(g) || 0, s: slot }];
  save(); rerender();
}
function proteinTodayCard() {
  const target = Number(D.settings.proteinTarget ?? 80); if (!target) return '';
  const t = todayStr(), items = proteinOn(t), total = proteinTotal(t), slot = mealNow();
  return `<section class="panel protein-card"><div class="panel-head"><h3>${icon('dumbbell', 'style="width:16px;height:16px;color:#0E9AA7;vertical-align:-2px"')} Protein</h3><span class="muted" style="font-size:12px">${total} / ${target} g</span></div>
    <div class="progress-bar thin"><i style="width:${Math.min(100, 100 * total / target)}%;background:#0E9AA7"></i></div>
    <div class="meal-slots">${MEALS.map((m, i) => { const g = sum(items.filter(x => x.s === i), x => x.g); return `<span class="meal ${g >= 20 ? 'hit' : ''} ${i === slot ? 'now' : ''}">${g >= 20 ? '✓ ' : ''}${m}<b>${g ? g + ' g' : ''}</b></span>`; }).join('')}</div>
    <div class="food-chips">${proteinFoods().map(([n, g], i) => `<button class="chip" data-act="protein-add" data-i="${i}">${esc(n)} <b>${g}g</b></button>`).join('')}<button class="chip" data-act="protein-custom">${icon('plus')}Other</button>${items.length ? `<button class="chip ghost" data-act="protein-undo" title="Remove the last one">Undo</button>` : ''}</div>
    <p class="muted" style="font-size:11.5px;margin-top:6px">Adds to ${MEALS[slot].toLowerCase()}. A meal ticks at 20 g.</p></section>`;
}

// ---------- Lab results ----------
const LAB_PRESETS = [['Vitamin B12', 'pg/mL'], ['Vitamin D (25-OH)', 'ng/mL'], ['HDL cholesterol', 'mg/dL'], ['LDL cholesterol', 'mg/dL'], ['Triglycerides', 'mg/dL'], ['Haemoglobin', 'g/dL'], ['MCV', 'fL'], ['Ferritin', 'ng/mL'], ['HbA1c', '%'], ['TSH', 'mIU/L']];
const labMarkers = () => { const by = {}; for (const l of (D.labs || []).slice().sort((a, b) => a.date.localeCompare(b.date))) (by[l.name] = by[l.name] || []).push(l); return by; };
const recheckOf = (list) => list.map(l => l.recheck).filter(Boolean).sort().pop() || '';
function labModal(pre = {}) {
  const m = modal(`<h2>Add a lab result</h2><p class="sub">Copy the value and reference range from your report. Ascend only tracks it; your doctor interprets it.</p>
    <form>
      <div class="row"><div class="field grow"><label>Test</label><input class="input" name="name" list="labNames" required maxlength="40" value="${esc(pre.name || '')}" placeholder="Vitamin B12"><datalist id="labNames">${LAB_PRESETS.map(([n]) => `<option value="${n}">`).join('')}</datalist></div>
        <div class="field" style="width:120px"><label>Date</label><input class="input" type="date" name="date" value="${todayStr()}" required></div></div>
      <div class="row"><div class="field grow"><label>Value</label><input class="input" type="number" step="any" name="value" required></div>
        <div class="field grow"><label>Unit</label><input class="input" name="unit" maxlength="12" value="${esc(pre.unit || '')}"></div>
        <div class="field grow"><label>Range low</label><input class="input" type="number" step="any" name="lo"></div>
        <div class="field grow"><label>Range high</label><input class="input" type="number" step="any" name="hi"></div></div>
      <div class="field"><label>Recheck on (if your doctor gave a date)</label><input class="input" type="date" name="recheck"></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`);
  const f = $('form', m);
  f.elements.name.addEventListener('change', () => { const p = LAB_PRESETS.find(([n]) => n === f.elements.name.value); if (p && !f.elements.unit.value) f.elements.unit.value = p[1]; });
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(f), num = (k) => fd.get(k) === '' ? null : Number(fd.get(k));
    D.labs.push({ id: uid(), name: String(fd.get('name')).trim(), date: fd.get('date'), value: num('value'), unit: String(fd.get('unit') || '').trim(), lo: num('lo'), hi: num('hi'), recheck: fd.get('recheck') || '' });
    save(); closeModal(); rerender();
  });
}
function labsPanel() {
  const by = labMarkers(), names = Object.keys(by), T = todayStr();
  const z = memo('z13week', () => round1(sum(range(addDays(T, -27), T), d => zonesOn(d).z.slice(0, 3).reduce((a, b) => a + b, 0)) / 4));
  return `<section class="panel labs" style="margin-top:18px"><div class="panel-head"><h3>${icon('pulse', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} Lab results</h3><button class="btn sm" data-act="lab-add">${icon('plus')}Add result</button></div>
    ${names.length ? names.map(n => { const list = by[n], last = list[list.length - 1], rc = recheckOf(list), out = (last.lo != null && last.value < last.lo) || (last.hi != null && last.value > last.hi);
      return `<div class="lab-row"><div class="grow"><b>${esc(n)}</b> <span class="muted" style="font-size:12px">${list.map(l => `${l.value}${l.unit ? ' ' + esc(l.unit) : ''} (${dayName(l.date, { day: 'numeric', month: 'short', year: '2-digit' })})`).join(' → ')}</span>
        ${/hdl/i.test(n) ? `<p class="muted" style="font-size:11.5px">Easy cardio lately: about ${Math.round(z)} min a week</p>` : ''}</div>
        ${out ? '<span class="chip status-off">outside range</span>' : last.lo != null || last.hi != null ? '<span class="chip status-on">in range</span>' : ''}
        ${rc ? `<span class="chip ${rc <= T ? 'status-off' : ''}">recheck ${shortDay(rc)}</span>` : ''}
        <button class="icon-btn" data-act="lab-more" data-name="${esc(n)}" title="Add a newer result">${icon('plus')}</button></div>`; }).join('')
      : '<p class="muted">Add your B12, vitamin D and lipid results with the recheck date your doctor gives you. Ascend reminds you a week before.</p>'}
  </section>`;
}
function labsTodayCard() {
  const T = todayStr(), soon = Object.entries(labMarkers()).map(([n, l]) => [n, recheckOf(l)]).filter(([, r]) => r && r <= addDays(T, 7));
  if (!soon.length) return '';
  return `<section class="panel" data-go="healthspan"><h3>${icon('pulse', 'style="width:16px;height:16px;color:var(--pink);vertical-align:-2px"')} Lab recheck</h3><p class="muted" style="font-size:13px;margin-top:4px">${soon.map(([n, r]) => `${esc(n)} ${r < T ? `was due ${shortDay(r)}` : r === T ? 'is due today' : `due ${shortDay(r)}`}`).join(' · ')}</p></section>`;
}

// ---------- Running guardrails ----------
// A single run more than 10% longer than your longest in the past 30 days raised injury risk (Frandsen 2025, 5,205
// runners); weekly-percentage rules did not hold up. Below about 30 km a week, marathon injury risk was higher.
function runGuard(T = todayStr()) {
  const runs = D.workouts.filter(w => w.type === 'run' && w.distance > 0);
  const longestBefore = (d) => Math.max(0, ...runs.filter(w => w.date < d && w.date >= addDays(d, -30)).map(w => w.distance));
  const longest = longestBefore(addDays(T, 1));
  const spikes = runs.filter(w => w.date >= addDays(T, -13)).map(w => ({ w, prev: longestBefore(w.date) })).filter(x => x.prev && x.w.distance > x.prev * 1.1);
  const wk = round1(sum(runs.filter(w => w.date > addDays(T, -7)), w => w.distance));
  return { longest, cap: round1(longest * 1.1), spikes, wk, any: runs.length > 0 };
}
function trainingExtras() {
  const T = todayStr(), g = runGuard(T);
  const pains = range(addDays(T, -27), T).map(d => ({ d, p: ((D.days[d] || {}).checkin || {}).pain, s: sum(workoutsOn(d).filter(w => w.type === 'strength'), w => w.minutes) }));
  const hasPain = pains.some(x => x.p != null);
  return `<div class="grid g-2" style="margin-top:18px">
    ${g.any ? `<section class="panel"><div class="panel-head"><h3>${icon('run', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Running guardrails</h3></div>
      <div class="sk-row"><div><span>Longest run, 30 days</span><b>${g.longest} km</b></div><div><span>Next long run up to</span><b>${g.cap} km</b></div><div><span>This week</span><b>${g.wk} km</b></div></div>
      ${g.spikes.length ? g.spikes.map(x => `<p class="spike">${shortDay(x.w.date)}: ${x.w.distance} km was ${Math.round(100 * (x.w.distance / x.prev - 1))}% past your previous longest (${x.prev} km). Single-run jumps like this raise injury risk.</p>`).join('') : '<p class="muted" style="font-size:12.5px;margin-top:8px">No run in the last 2 weeks jumped more than 10% past your longest. Grow the long run by at most 10% at a time.</p>'}
      <p class="muted" style="font-size:12px;margin-top:6px">Before a marathon block, build toward 30 km a week or more.</p></section>` : ''}
    ${hasPain ? `<section class="panel"><div class="panel-head"><h3>Back pain vs lifting</h3><span class="muted" style="font-size:12px">0 to 10, from your check-ins</span></div>
      ${barChart(pains.map(x => ({ label: parseDay(x.d).getDate() + '', value: x.p ?? 0, color: x.p >= 5 ? '#E5383B' : x.p >= 3 ? '#E8930C' : '#0E9AA7', tip: `${shortDay(x.d)}: ${x.p ?? 'no rating'}${x.s ? ` · ${x.s} min lifting` : ''}` })), { height: 120, fmt: (v) => String(Math.round(v)) })}
      ${pains.filter(x => x.p != null).slice(-3).some(x => x.p >= 5) ? '<p class="spike">Pain was 5 or more recently. Above about 5, or worse the next morning, is the usual signal to ease the load and get it checked.</p>' : ''}</section>` : ''}
  </div>`;
}

// Health tab: labs under Healthspan, guardrails and back pain under Training
const healthHub = VIEWS.health;
VIEWS.health = () => healthHub() + (UI.htab === 'span' ? labsPanel() : trainingExtras());
HABIT_AUTO.protein = { label: 'Hit the protein target', test: (d) => proteinTotal(d) >= (Number(D.settings.proteinTarget) || 80) };

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  switch (a.dataset.act) {
    case 'protein-add': { const [n, g] = proteinFoods()[Number(a.dataset.i)] || []; if (n) { addProtein(n, g); burst(a); } break; }
    case 'protein-undo': { const r = (D.protein || {})[todayStr()]; if (r && r.items.length) { r.items = r.items.slice(0, -1); save(); rerender(); } break; }
    case 'protein-custom': {
      const m = modal(`<h2>Add protein</h2><form><div class="row"><div class="field grow"><label>Food</label><input class="input" name="f" required maxlength="40" placeholder="Rajma bowl"></div>
        <div class="field" style="width:110px"><label>Protein (g)</label><input class="input" type="number" name="g" min="1" max="200" required></div></div>
        <label class="row toggle-row"><input type="checkbox" name="keep" checked> Add it to my quick foods</label>
        <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Add</button></div></form>`);
      $('form', m).addEventListener('submit', (ev) => {
        ev.preventDefault(); const fd = new FormData(ev.target), f = String(fd.get('f')).trim(), g = Number(fd.get('g'));
        if (fd.get('keep') === 'on') D.settings.proteinFoods = [...proteinFoods(), [f, g]].slice(-12);
        closeModal(); addProtein(f, g);
      });
      break;
    }
    case 'lab-add': labModal(); break;
    case 'lab-more': { const last = (labMarkers()[a.dataset.name] || []).slice(-1)[0] || {}; labModal({ name: a.dataset.name, unit: last.unit }); break; }
  }
});
