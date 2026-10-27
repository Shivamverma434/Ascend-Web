/* Ascend: a motivating quote when you open the app, and a moving scene for every section.
   Uses globals from app.js and life.js. Everything stays still when the system asks for reduced motion. */
'use strict';

// ---------- Opening quote ----------
// [quote, author, life area]. Leans towards the areas you have goals in.
const LIFE_QUOTES = [
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant', 'mind'],
  ['Every action you take is a vote for the type of person you wish to become.', 'James Clear', 'mind'],
  ['What you do every day matters more than what you do once in a while.', 'Gretchen Rubin', 'mind'],
  ['Motivation is what gets you started. Habit is what keeps you going.', 'Jim Ryun', 'mind'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca', 'mind'],
  ['Waste no more time arguing about what a good man should be. Be one.', 'Marcus Aurelius', 'mind'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche', 'mind'],
  ['A reader lives a thousand lives before he dies. The man who never reads lives only one.', 'George R. R. Martin', 'mind'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb', 'mind'],
  ['Fall seven times, stand up eight.', 'Japanese proverb', 'mind'],
  ['A year from now you may wish you had started today.', 'Karen Lamb', 'mind'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt', 'mind'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin', 'study'],
  ['Practice isn\'t the thing you do once you\'re good. It\'s the thing you do that makes you good.', 'Malcolm Gladwell', 'study'],
  ['The good physician treats the disease; the great physician treats the patient who has the disease.', 'William Osler', 'study'],
  ['Medicine is a science of uncertainty and an art of probability.', 'William Osler', 'study'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs', 'study'],
  ['Take care of your body. It\'s the only place you have to live.', 'Jim Rohn', 'health'],
  ['Exercise is king. Nutrition is queen. Put them together and you\'ve got a kingdom.', 'Jack LaLanne', 'health'],
  ['Sleep is that golden chain that ties health and our bodies together.', 'Thomas Dekker', 'health'],
  ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott', 'health'],
  ['Health is a state of complete harmony of the body, mind and spirit.', 'B. K. S. Iyengar', 'health'],
  ['You can\'t use up creativity. The more you use, the more you have.', 'Maya Angelou', 'hobbies'],
  ['Every child is an artist. The problem is how to remain an artist once we grow up.', 'Pablo Picasso', 'hobbies'],
  ['The days are long, but the years are short.', 'Gretchen Rubin', 'hobbies'],
  ['Good relationships keep us happier and healthier. Period.', 'Robert Waldinger', 'people'],
  ['If you want to go fast, go alone. If you want to go far, go together.', 'African proverb', 'people'],
  ['No act of kindness, no matter how small, is ever wasted.', 'Aesop', 'people'],
  ['Be kind, for everyone you meet is fighting a hard battle.', 'Ian Maclaren', 'people'],
  ['Friendship is born at that moment when one person says to another: "What! You too? I thought I was the only one."', 'C. S. Lewis', 'people']
];
const SPLASH_STYLES = ['rise', 'ink', 'type', 'sweep', 'bloom'];
function pickQuote() {
  const all = [...LIFE_QUOTES, ...QUOTES.filter(q => q[1]).map(([t, a]) => [t, a, 'study'])];
  let last = -1; try { last = Number(localStorage.getItem('ascend-quote') ?? -1); } catch {}
  const areas = new Set(activeGoals().map(g => g.area || 'study'));
  const pool = all.map((q, i) => [q, i]).filter(([, i]) => i !== last).flatMap(x => areas.has(x[0][2]) ? [x, x] : [x]);
  const [q, i] = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem('ascend-quote', String(i)); } catch {}
  return q;
}
function showQuoteSplash() {
  if ($('#quoteSplash') || $('.scrim')) return;
  const [text, author, areaId] = pickQuote();
  const a = AREAS.find(x => x.id === areaId) || AREAS[0];
  const style = SPLASH_STYLES[Math.floor(Math.random() * SPLASH_STYLES.length)];
  const words = text.split(' ');
  const dur = clamp(2600 + text.length * 35, 3400, 6500);
  const el = document.createElement('div');
  el.id = 'quoteSplash'; el.className = 'qs qs-' + style;
  el.style.setProperty('--c', a.color); el.style.setProperty('--dur', dur + 'ms');
  el.innerHTML = `<div class="qs-bg"><i></i><i></i><i></i></div>
    <div class="qs-body"><span class="qs-area">${icon(a.icon)}${esc(a.label)}</span>
      <p class="qs-text">${words.map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`).join(' ')}</p>
      ${author ? `<p class="qs-author" style="--i:${words.length}">${esc(author)}</p>` : ''}</div>
    <div class="qs-bar"><i></i></div><span class="qs-skip">Tap to continue</span>`;
  document.body.appendChild(el);
  const close = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 650); };
  el.addEventListener('click', close);
  setTimeout(close, dur);
}
// Coming back after a while also counts as opening the app
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 45 * 60e3 && D && D.settings.onboarded) setTimeout(showQuoteSplash, 300);
});

// ---------- A moving scene for every section ----------
const SCENES = {
  focus: `<svg viewBox="0 0 200 120"><circle class="s-breath" cx="140" cy="60" r="16"/><circle class="s-breath d2" cx="140" cy="60" r="32"/><circle class="s-breath d3" cx="140" cy="60" r="48"/><g class="s-orbit"><circle class="fill" cx="140" cy="12" r="4.5"/></g></svg>`,
  goals: `<svg viewBox="0 0 200 120"><path class="s-ridge" d="M14 112 L74 44 L98 72 L136 22 L196 112"/><path class="s-trail" d="M36 110 Q62 92 80 78 T116 54 T136 24"/><g class="s-flag"><path d="M136 22 V4"/><path class="fill" d="M136 5 L152 10 L136 15Z"/></g><circle class="s-sun fill" cx="174" cy="22" r="7"/></svg>`,
  people: `<svg viewBox="0 0 200 120"><g class="s-links"><path d="M60 40 L110 24 L160 52 L120 92 L70 86 Z M110 24 L120 92 M60 40 L160 52"/></g>${[[60, 40], [110, 24], [160, 52], [120, 92], [70, 86]].map(([x, y], i) => `<circle class="s-node fill" style="--i:${i}" cx="${x}" cy="${y}" r="7"/>`).join('')}</svg>`,
  fitness: `<svg viewBox="0 0 200 120"><path class="s-ecg" d="M0 70 H54 L64 70 L72 34 L84 104 L94 52 L102 70 H128 L134 62 L140 70 H200"/></svg>`,
  health: `<svg viewBox="0 0 200 120">${Array.from({ length: 11 }, (_, i) => { const x = 40 + i * 14; return `<g class="s-rung" style="--i:${i}"><line x1="${x}" y1="38" x2="${x}" y2="82"/><circle class="fill a" cx="${x}" cy="38" r="4"/><circle class="fill b" cx="${x}" cy="82" r="4"/></g>`; }).join('')}</svg>`,
  journal: `<svg viewBox="0 0 200 120"><path class="s-ink" d="M30 80 C48 50, 62 96, 80 70 S108 44, 120 72 S150 92, 170 58"/><g class="s-pen"><path d="M170 58 L186 30 L192 34 L176 62 Z"/></g></svg>`,
  review: `<svg viewBox="0 0 200 120"><rect x="96" y="22" width="76" height="76" rx="10"/><path d="M96 42 H172 M116 14 V30 M152 14 V30"/><g class="s-page"><rect class="fill" x="104" y="50" width="60" height="40" rx="6"/></g><path class="s-check" d="M118 70 L130 80 L150 60"/></svg>`,
  coach: `<svg viewBox="0 0 200 120">${[[150, 40, 14], [112, 78, 9], [178, 86, 7], [92, 30, 6]].map(([x, y, r], i) => `<path class="s-star fill" style="--i:${i}" d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z"/>`).join('')}</svg>`,
  exams: `<svg viewBox="0 0 200 120"><g class="s-book" style="--i:0"><rect x="96" y="80" width="84" height="16" rx="3"/></g><g class="s-book" style="--i:1"><rect x="104" y="62" width="74" height="16" rx="3"/></g><g class="s-book" style="--i:2"><rect x="100" y="44" width="78" height="16" rx="3"/></g><path class="s-cap" d="M110 30 L140 18 L170 30 L140 42 Z M126 36 V44 Q140 50 154 44 V36"/></svg>`,
  settings: `<svg viewBox="0 0 200 120"><g class="s-gear"><circle cx="128" cy="58" r="22" stroke-width="9" stroke-dasharray="6 5.5"/><circle cx="128" cy="58" r="9"/></g><g class="s-gear rev"><circle cx="168" cy="88" r="14" stroke-width="7" stroke-dasharray="4.5 4.2"/><circle cx="168" cy="88" r="5"/></g></svg>`
};
let sceneOf = null;
function paintScene() {
  const v = $('#view'); if (v) v.dataset.v = currentView;
  if (sceneOf === currentView) return;
  sceneOf = currentView;
  const main = $('#main'); if (!main) return;
  let s = $('#scene');
  if (!s) { s = document.createElement('div'); s.id = 'scene'; s.setAttribute('aria-hidden', 'true'); main.prepend(s); }
  s.className = 'scene scene-' + currentView;
  s.innerHTML = SCENES[currentView] || '';
}
// Draw the scene whenever the section changes
const goPlain = go;
go = function (view, opts) { goPlain(view, opts); paintScene(); };
