'use strict';
const api = window.ascend || (window.parent !== window && window.parent.__popupApi) || null;
const $ = (s) => document.querySelector(s);
const DURATION = 30000; // auto-dismiss after 30 s; hovering pauses it
let remaining = DURATION, lastT = 0, hovering = false, closing = false, touched = false, theme = 'energy';

// Animated mascot stickers, one per kind of reminder
const S = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
const MASCOTS = {
  sun: `<svg viewBox="0 0 40 40"><g class="m-spin"><g stroke="#FFB31F" stroke-width="3" ${S}><path d="M20 2v5M20 33v5M2 20h5M33 20h5M7 7l3.5 3.5M29.5 29.5 33 33M7 33l3.5-3.5M29.5 10.5 33 7"/></g></g><circle cx="20" cy="20" r="8" fill="#FF8A3D"/><circle cx="17" cy="17.5" r="2.5" fill="#FFE27A"/></svg>`,
  pen: `<svg viewBox="0 0 40 40"><path class="m-draw" d="M4 34c4-4 7 2 11-2s6 2 10-1 6 1 11-2" stroke="#5A3CF0" stroke-width="3" ${S}/><g class="m-tilt"><path d="M8 26 24 6l6 5-16 20-7 2Z" fill="#FF4F1F"/><path d="M24 6l6 5 2-2.5a2 2 0 0 0-.3-2.8l-2.6-2.1a2 2 0 0 0-2.8.3Z" fill="#181A33"/><path d="M8 26l6 5-7 2Z" fill="#FFE27A"/></g></svg>`,
  calendar: `<svg viewBox="0 0 40 40"><rect x="5" y="8" width="30" height="27" rx="5" fill="#0E9AA7"/><g class="m-page"><rect x="5" y="8" width="30" height="9" rx="4" fill="#5A3CF0"/></g><path d="M12 4v8M28 4v8" stroke="#181A33" stroke-width="3" ${S}/><path class="m-draw" d="M13 25l5 5 9-10" stroke="#fff" stroke-width="3.5" ${S}/></svg>`,
  target: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#FF4F1F"/><circle cx="20" cy="20" r="11" fill="#fff"/><circle cx="20" cy="20" r="6" fill="#FF4F1F"/><g class="m-arrow"><path d="M20 20 34 6" stroke="#181A33" stroke-width="3" ${S}/><path d="M30 4h5v5" stroke="#181A33" stroke-width="3" ${S}/></g></svg>`,
  rocket: `<svg viewBox="0 0 40 40"><g class="m-shake"><path d="M20 4c6 5 8 12 6 20H14c-2-8 0-15 6-20Z" fill="#5A3CF0"/><circle cx="20" cy="14" r="3.5" fill="#fff"/><path d="M14 24l-5 5 6-1M26 24l5 5-6-1" fill="#FF3D8B"/><g class="m-flick"><path d="M16 26c0 5 2 8 4 10 2-2 4-5 4-10Z" fill="#FFB31F"/></g></g></svg>`,
  flame: `<svg viewBox="0 0 40 40"><g class="m-flick"><path d="M20 37c8 0 13-5 13-12 0-7-5-11-8-16-1 4-3 6-5 7 0-5-3-10-8-13 1 6-3 10-5 13-2 3-2 6-2 9 0 7 5 12 15 12Z" fill="#FF4F1F"/><path d="M20 37c4 0 7-2.5 7-6.5S24 24 22 21c-.5 2-2 3-3 3.5-.5-2-2-4-4-5 .5 3-2 5-2 8 0 5 3 9.5 7 9.5Z" fill="#FFE27A"/></g></svg>`,
  mountain: `<svg viewBox="0 0 40 40"><path d="M2 36 15 12l6 10 4-6 13 20Z" fill="#5A3CF0"/><path d="M15 12l3.5 6-2 1.5-2.5-2-2 2Z" fill="#fff"/><path d="M22 4v12" stroke="#181A33" stroke-width="2" ${S}/><g class="m-wave"><path d="M22 4h10l-3 3 3 3H22Z" fill="#FF4F1F"/></g></svg>`,
  heart: `<svg viewBox="0 0 40 40"><g class="m-beat"><path d="M20 35S5 26 5 15a8 8 0 0 1 15-4 8 8 0 0 1 15 4c0 11-15 20-15 20Z" fill="#FF3D8B"/><path d="M11 13a4 4 0 0 1 4-3" stroke="#fff" stroke-width="2.5" ${S} opacity=".7"/></g></svg>`,
  star: `<svg viewBox="0 0 40 40"><g class="m-twinkle"><path d="M20 3l4.9 10.6 11.6 1.3-8.6 7.9 2.4 11.4L20 28.4 9.7 34.2l2.4-11.4-8.6-7.9 11.6-1.3Z" fill="#FFB31F"/></g><circle cx="33" cy="7" r="2" fill="#D6247A"/><circle cx="6" cy="33" r="1.6" fill="#5A3CF0"/></svg>`,
  water: `<svg viewBox="0 0 40 40"><ellipse class="m-ripple" cx="20" cy="34" rx="12" ry="3" fill="none" stroke="#0E9AA7" stroke-width="2"/><g class="m-drop"><path d="M20 4c5 8 9 13 9 18a9 9 0 0 1-18 0c0-5 4-10 9-18Z" fill="#0E9AA7"/><path d="M15.5 22a4.5 4.5 0 0 0 3 4" stroke="#fff" stroke-width="2.4" ${S}/></g></svg>`,
  cat: `<svg viewBox="0 0 40 40"><g class="m-twinkle"><path d="M7 16 L8 3 L17 11 Z" fill="#F59A4A"/><path d="M33 16 L32 3 L23 11 Z" fill="#F59A4A"/><path d="M9 13 L9.6 6.5 L14.5 11 Z M31 13 L30.4 6.5 L25.5 11 Z" fill="#FFB8A8"/><circle cx="20" cy="22" r="14" fill="#F59A4A"/><path d="M16 9.5v4 M20 9v5 M24 9.5v4" stroke="#E07B32" stroke-width="2" stroke-linecap="round"/><ellipse cx="20" cy="27.5" rx="7" ry="4.6" fill="#FFE0BF"/><ellipse cx="14.5" cy="21" rx="2.2" ry="2.9" fill="#2B1D2E"/><ellipse cx="25.5" cy="21" rx="2.2" ry="2.9" fill="#2B1D2E"/><circle cx="15.3" cy="20" r=".8" fill="#fff"/><circle cx="26.3" cy="20" r=".8" fill="#fff"/><path d="M18.6 25 h2.8 l-1.4 1.8 Z" fill="#E86A7A"/><path d="M20 26.8 q-1.4 1.8 -3 .9 M20 26.8 q1.4 1.8 3 .9" stroke="#2B1D2E" stroke-width="1" fill="none" stroke-linecap="round"/></g></svg>`,
  trophy: `<svg viewBox="0 0 40 40"><defs><clipPath id="tc"><path d="M11 4h18v10a9 9 0 0 1-18 0Z"/></clipPath></defs><path d="M11 6H5v3a7 7 0 0 0 7 7M29 6h6v3a7 7 0 0 1-7 7" stroke="#FFB31F" stroke-width="3" ${S}/><path d="M11 4h18v10a9 9 0 0 1-18 0Z" fill="#FFB31F"/><g clip-path="url(#tc)"><rect class="m-shine" x="8" y="0" width="6" height="30" fill="#fff" opacity=".6" transform="skewX(-20)"/></g><path d="M20 23v6M13 35h14M15 29h10v6H15Z" fill="#5A3CF0" stroke="#5A3CF0" stroke-width="2.5" ${S}/></svg>`
};

function render(p) {
  theme = p.theme || 'energy';
  document.body.className = 'theme-' + theme;
  $('#eyebrow').textContent = p.eyebrow || 'Ascend';
  $('#title').innerHTML = '';
  String(p.title || '').split(' ').forEach((w, i) => { const s = document.createElement('span'); s.style.setProperty('--i', i); s.textContent = w; $('#title').appendChild(s); $('#title').appendChild(document.createTextNode(' ')); });
  $('#title').classList.toggle('quote', !!p.quote);
  $('#title').classList.toggle('long', String(p.title || '').length > 64);
  $('#body').textContent = p.body || '';
  $('#stat').textContent = p.stat || '';
  $('#statLabel').textContent = p.statLabel || '';
  $('#mascot').innerHTML = MASCOTS[p.icon] || MASCOTS[{ sunrise: 'sun', journal: 'pen', review: 'calendar', celebrate: 'trophy' }[theme]] || MASCOTS.rocket;
  const m = String(p.stat || '').match(/^(\d+)%$/);
  const frac = m ? Math.min(1, Number(m[1]) / 100) : (/^(\d+)\/(\d+)$/.test(p.stat || '') ? (() => { const [a, b] = p.stat.split('/').map(Number); return b ? a / b : 0; })() : 1);
  requestAnimationFrame(() => requestAnimationFrame(() => { $('.orb-fill').style.strokeDashoffset = String(276.5 * (1 - frac)); }));
  const acts = (p.actions && p.actions.length ? p.actions : [{ label: 'Got it', primary: true }]);
  $('#actions').innerHTML = '';
  acts.forEach(a => {
    const b = document.createElement('button');
    b.className = a.primary ? 'primary' : a.snooze ? 'snooze' : 'secondary';
    b.textContent = a.snooze ? '⏰ ' + a.label : a.label;
    b.addEventListener('click', () => leave(a.view || a.url || a.snooze ? a : null));
    $('#actions').appendChild(b);
  });
  $('#card').classList.add('in');
  setTimeout(() => burstFrom($('.orb'), theme === 'celebrate' ? 120 : 50), 420);
  setTimeout(() => burstFrom($('#mascot'), 18), 900);
  if (p.sound) chime(theme);
  requestAnimationFrame(loop);
  // Gentle attention wiggle until the person interacts
  setInterval(() => { if (touched || closing) return; const f = $('#floater'); f.classList.remove('wiggle'); void f.offsetWidth; f.classList.add('wiggle'); burstFrom($('#mascot'), 10); }, 7000);
}

function leave(action) {
  if (closing) return; closing = true;
  $('#card').classList.remove('in'); $('#card').classList.add('out');
  $('#mascot').style.transition = 'transform .3s'; $('#mascot').style.transform = 'scale(0) rotate(40deg)';
  if (!api) return;
  if (action) api.popupAction(action); else api.closePopup();
}

function loop(t) {
  if (closing) return;
  if (lastT && !hovering) remaining -= (t - lastT);
  lastT = t;
  $('#timerBar').style.transform = `scaleX(${Math.max(0, remaining / DURATION)})`;
  if (remaining <= 0) return leave(null);
  requestAnimationFrame(loop);
}

// Particles: bursts plus a gentle continuous sparkle stream
const fx = { ctx: null, ps: [], running: false };
function initFx() {
  const cv = $('#fx'); const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  fx.ctx = cv.getContext('2d'); fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const COLORS = ['#D4F53C', '#FFFFFF', '#FF3D8B', '#FFB31F', '#7B5CFF'];
function burstFrom(el, n) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect(); const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6;
    fx.ps.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5, s: 2 + Math.random() * 4, c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, max: 80 + Math.random() * 30, rot: Math.random() * 6, star: Math.random() > .6, g: .14 });
  }
  run();
}
function sparkle() {
  if (closing || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const card = $('#card').getBoundingClientRect();
  fx.ps.push({ x: card.left + Math.random() * card.width, y: card.bottom - 20 - Math.random() * 30, vx: (Math.random() - .5) * .6, vy: -.6 - Math.random() * .9, s: 1.5 + Math.random() * 2.5, c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, max: 120, rot: 0, star: Math.random() > .5, g: -0.004 });
  run();
}
function run() {
  if (fx.running) return; fx.running = true;
  const ctx = fx.ctx;
  (function step() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    fx.ps = fx.ps.filter(p => p.life < p.max);
    for (const p of fx.ps) {
      p.life++; p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += .1;
      const a = Math.max(0, 1 - p.life / p.max);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.star) { ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.lineTo(0, -p.s * 1.6); ctx.lineTo(p.s * .4, -p.s * .4); } ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    if (fx.ps.length) requestAnimationFrame(step); else { fx.running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  })();
}

function chime(th) {
  try {
    const ac = new AudioContext();
    const notes = th === 'journal' ? [392, 523.25, 659.25] : th === 'celebrate' ? [523.25, 659.25, 783.99, 1046.5] : th === 'sunrise' ? [440, 554.37, 659.25, 880] : th === 'review' ? [523.25, 783.99, 659.25] : [587.33, 880];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = ac.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 0.75);
    });
  } catch {}
}

initFx();
setInterval(sparkle, 260);
$('#close').addEventListener('click', () => leave(null));
$('#card').addEventListener('mouseenter', () => { hovering = true; touched = true; });
$('#card').addEventListener('mouseleave', () => { hovering = false; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') leave(null); });

if (api) api.on('popup-data', render);
// Preview mode in a plain browser
else {
  const q = new URLSearchParams(location.search);
  render({ theme: q.get('theme') || 'energy', icon: q.get('icon') || '', eyebrow: 'Progress check', title: '2 of 5 done. Next up:', body: 'Draft the assessment workplan introduction', stat: '40%', statLabel: 'of today', actions: [{ label: 'Focus on it now', primary: true }, { label: 'Not now' }, { label: 'In 15 min', snooze: 15 }] });
}
