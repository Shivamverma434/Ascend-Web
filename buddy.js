/* Ascend: Mochi, a small cat that lives along the bottom of the app.
   It wanders over to where you are, naps when you are idle or focusing, hops when you finish things,
   and offers one helpful nudge per screen. Uses globals from app.js. Works on desktop and Android. */
'use strict';

const CAT_SVG = `<svg class="cat" viewBox="0 0 110 80" aria-hidden="true">
  <ellipse cx="52" cy="77" rx="32" ry="3.2" fill="rgba(43,29,46,.14)"/>
  <g class="cat-bob">
    <g class="tail"><path d="M30 52 C 16 50 9 40 13 26" stroke="#EE8A3E" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M13.6 28 C 12.6 25 13 22.5 14.4 20.5" stroke="#FFE0BF" stroke-width="7" stroke-linecap="round" fill="none"/></g>
    <rect class="leg l1" x="36" y="58" width="7" height="17" rx="3.5" fill="#D9762F"/>
    <rect class="leg l3" x="62" y="58" width="7" height="17" rx="3.5" fill="#D9762F"/>
    <g class="body">
      <ellipse cx="50" cy="55" rx="27" ry="15" fill="#F59A4A"/>
      <path d="M38 42 q3 6 0 11 M47 41 q3 6 0 11 M29 47 q3 5 0 9" stroke="#E07B32" stroke-width="3" stroke-linecap="round" fill="none"/>
      <ellipse cx="57" cy="62" rx="15" ry="6" fill="#FFE0BF"/>
    </g>
    <rect class="leg l2" x="27" y="59" width="7.5" height="17" rx="3.75" fill="#F59A4A"/>
    <rect class="leg l4" x="71" y="59" width="7.5" height="17" rx="3.75" fill="#F59A4A"/>
    <ellipse cx="30.8" cy="75.4" rx="4.6" ry="2.2" fill="#FFE0BF"/><ellipse cx="74.8" cy="75.4" rx="4.6" ry="2.2" fill="#FFE0BF"/>
    <g class="head">
      <path d="M66 31 L68 12 L80 24 Z" fill="#F59A4A"/><path d="M68.6 27 L69.8 16.5 L77 24 Z" fill="#FFB8A8"/>
      <g class="ear-r"><path d="M84 23 L95 10 L97 31 Z" fill="#F59A4A"/><path d="M86.5 23 L93.8 14.5 L95 27 Z" fill="#FFB8A8"/></g>
      <circle cx="81" cy="37" r="17" fill="#F59A4A"/>
      <path d="M78 22 v6 M83 21 v7 M88 23 v5" stroke="#E07B32" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="87" cy="44" rx="8.5" ry="5.8" fill="#FFE0BF"/>
      <circle cx="73.5" cy="42" r="2.8" fill="#FF8E7A" opacity=".45"/><circle cx="95.5" cy="41" r="2.3" fill="#FF8E7A" opacity=".45"/>
      <g class="eyes"><ellipse cx="78" cy="36" rx="2.7" ry="3.5" fill="#2B1D2E"/><ellipse cx="90" cy="36" rx="2.7" ry="3.5" fill="#2B1D2E"/><circle cx="79" cy="34.6" r="1" fill="#fff"/><circle cx="91" cy="34.6" r="1" fill="#fff"/></g>
      <path class="eyes-shut" d="M75.3 36.5 q2.7 2.2 5.4 0 M87.3 36.5 q2.7 2.2 5.4 0" stroke="#2B1D2E" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path class="eyes-happy" d="M75.3 37 q2.7 -3.2 5.4 0 M87.3 37 q2.7 -3.2 5.4 0" stroke="#2B1D2E" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path d="M88.8 41.3 h3 l-1.5 2 Z" fill="#E86A7A"/>
      <path d="M90.3 43.3 q-1.6 2.1 -3.4 1 M90.3 43.3 q1.6 2.1 3.4 1" stroke="#2B1D2E" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <path d="M96 43 h8 M96 45.5 l7 2.2 M78 44 h-8" stroke="#2B1D2E" stroke-width=".7" opacity=".45"/>
    </g>
    <g class="zzz"><text x="96" y="20">z</text><text x="100" y="12">z</text><text x="103" y="5">z</text></g>
  </g>
</svg>`;

const Buddy = {
  el: null, x: 0, target: null, raf: 0, last: 0, facing: 1,
  idleTimer: 0, followTimer: 0, sayTimer: 0, bubble: null, lastInput: Date.now(), seen: {},
  get name() { return (D && D.settings.buddyName) || 'Mochi'; },
  get on() { return D && D.settings.buddy !== false; },

  init() {
    this.el = document.createElement('div');
    this.el.className = 'buddy';
    this.el.innerHTML = `<div class="cat-wrap" role="button" tabindex="0" aria-label="${esc(this.name)}, your companion. Click for a tip.">${CAT_SVG}</div>`;
    document.body.appendChild(this.el);
    this.x = this.bounds().max - 40;
    this.place();
    this.el.querySelector('.cat-wrap').addEventListener('click', (e) => { e.stopPropagation(); this.pet(); });
    this.el.querySelector('.cat-wrap').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pet(); } });
    addEventListener('resize', () => { this.x = clamp(this.x, this.bounds().min, this.bounds().max); this.place(); });
    // Desktop: come over to wherever the pointer settles. Phone: walk to where you tap.
    const near = (cx) => Math.abs(cx - (this.x + 48)) < 150;
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.wake();
      clearTimeout(this.followTimer);
      this.followTimer = setTimeout(() => { if (!near(e.clientX) && this.inMain(e.clientX)) this.walkTo(e.clientX - 48); }, 900);
      this.el.classList.toggle('curious', Math.abs(e.clientX - (this.x + 48)) < 120 && e.clientY > innerHeight - 220);
    }, { passive: true });
    document.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('.buddy, .buddy-say, .scrim')) return;
      this.wake();
      clearTimeout(this.followTimer);
      this.followTimer = setTimeout(() => { if (!near(e.clientX)) this.walkTo(e.clientX - 48); }, 500);
    }, { passive: true });
    document.addEventListener('keydown', () => this.wake(), { passive: true });
    setInterval(() => this.tick(), 5000);
    this.refresh();
  },

  // ---------- Position ----------
  bounds() {
    const mobile = document.body.classList.contains('mobile');
    const rail = $('.rail');
    const min = mobile ? 6 : (rail ? rail.getBoundingClientRect().right + 8 : 8);
    return { min, max: innerWidth - 104, bottom: mobile ? null : 4 };
  },
  inMain(x) { return x > this.bounds().min; },
  place() {
    this.el.style.transform = `translateX(${Math.round(this.x)}px)`;
    if (document.body.classList.contains('mobile')) this.el.style.bottom = 'calc(84px + var(--sab, 0px))';
    if (this.bubble) this.positionBubble();
  },
  walkTo(x) {
    if (!this.on || D.activeSession) return;
    const b = this.bounds();
    this.target = clamp(x, b.min, b.max);
    if (Math.abs(this.target - this.x) < 6) { this.target = null; return; }
    this.setState(null);
    if (reduced()) { this.x = this.target; this.target = null; this.place(); return; }
    this.facing = this.target > this.x ? 1 : -1;
    this.el.classList.toggle('left', this.facing < 0);
    this.el.classList.add('walking');
    this.el.classList.toggle('running', Math.abs(this.target - this.x) > 380);
    cancelAnimationFrame(this.raf); this.last = performance.now();
    const step = (t) => {
      const dt = Math.min(.05, (t - this.last) / 1000); this.last = t;
      const speed = this.el.classList.contains('running') ? 300 : 130;
      const dx = this.target - this.x;
      if (Math.abs(dx) <= speed * dt) { this.x = this.target; this.target = null; this.place(); this.el.classList.remove('walking', 'running'); return; }
      this.x += Math.sign(dx) * speed * dt; this.place();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },

  // ---------- Moods ----------
  setState(s) {
    this.el.classList.remove('sleeping', 'happy', 'stretch');
    if (s) this.el.classList.add(s);
  },
  hop(times = 1) {
    if (!this.on) return;
    this.wake(true);
    this.el.classList.add('happy');
    let n = 0;
    const once = () => { this.el.classList.remove('hop'); void this.el.offsetWidth; this.el.classList.add('hop'); if (++n < times) setTimeout(once, 620); else setTimeout(() => this.el.classList.remove('hop', 'happy'), 900); };
    once();
  },
  hearts(n = 4) {
    const r = this.el.getBoundingClientRect();
    for (let i = 0; i < n; i++) setTimeout(() => {
      const h = document.createElement('span'); h.className = 'buddy-heart'; h.textContent = ['💛', '🧡', '❤️'][i % 3];
      h.style.left = (r.left + r.width * (this.facing > 0 ? .72 : .28)) + 'px'; h.style.top = (r.top + 6) + 'px'; h.style.setProperty('--dx', ((Math.random() - .5) * 30) + 'px');
      document.body.appendChild(h); setTimeout(() => h.remove(), 1300);
    }, i * 160);
  },
  sleep() { if (!this.on || this.target !== null) return; this.closeSay(); this.setState('sleeping'); },
  wake(quiet = false) {
    this.lastInput = Date.now();
    if (!this.el || !this.el.classList.contains('sleeping') || D.activeSession) return;
    this.setState('stretch');
    setTimeout(() => this.el.classList.remove('stretch'), 1400);
    if (!quiet) this.twitch();
  },
  twitch() { this.el.classList.remove('twitch'); void this.el.offsetWidth; this.el.classList.add('twitch'); },
  tick() {
    if (!this.on) return;
    if (D.activeSession) { this.setState('sleeping'); return; }
    if (Date.now() - this.lastInput > 75e3 && !this.el.classList.contains('sleeping')) this.sleep();
  },

  // ---------- Speech ----------
  say(text, actions = [], ms = 9000) {
    if (!this.on) return;
    this.closeSay(true);
    const b = document.createElement('div');
    b.className = 'buddy-say'; b.setAttribute('role', 'status');
    b.innerHTML = `<button class="say-x" aria-label="Close">×</button><b class="who">${esc(this.name)}</b><div>${esc(text)}</div>${actions.length ? `<div class="say-acts">${actions.map((a, i) => `<button class="btn ${i ? 'ghost' : 'primary'} sm" data-say="${i}" ${a.go ? `data-go="${a.go}"` : ''}>${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    b.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-say]');
      if (btn) { const a = actions[Number(btn.dataset.say)]; if (a && a.fn) a.fn(); this.closeSay(); }
      if (e.target.closest('.say-x')) this.closeSay();
    });
    b.addEventListener('mouseenter', () => clearTimeout(this.sayTimer));
    b.addEventListener('mouseleave', () => { this.sayTimer = setTimeout(() => this.closeSay(), 4000); });
    document.body.appendChild(b); this.bubble = b; this.positionBubble();
    this.twitch();
    clearTimeout(this.sayTimer); this.sayTimer = setTimeout(() => this.closeSay(), ms);
  },
  positionBubble() {
    const b = this.bubble; if (!b) return;
    const r = this.el.getBoundingClientRect();
    const w = b.offsetWidth, h = b.offsetHeight;
    const left = clamp(r.left + r.width / 2 - 40, 8, innerWidth - w - 8);
    b.style.left = left + 'px'; b.style.top = Math.max(8, r.top - h - 10) + 'px';
    const tail = clamp(r.left + r.width * (this.facing > 0 ? .7 : .3) - left - 7, 14, w - 28);
    b.style.setProperty('--tail', tail + 'px'); b.style.setProperty('--ox', tail + 'px');
  },
  closeSay(now = false) {
    clearTimeout(this.sayTimer);
    const b = this.bubble; this.bubble = null; if (!b) return;
    if (now) { b.remove(); return; }
    b.classList.add('out'); setTimeout(() => b.remove(), 200);
  },

  // ---------- Helpful things to say, based on where you are and your data ----------
  tip(view, petted = false) {
    const t = todayStr(), dd = D.days[t] || { targets: [] }, h = new Date().getHours();
    const next = dd.targets.find(x => !x.done);
    const done = dd.targets.filter(x => x.done).length;
    const rd = readiness(t);
    const focusNext = next ? { label: 'Focus 25 min', fn: () => { UI.focusTask = next.title; UI.focusGoal = next.goalId; go('focus'); } } : null;
    switch (view) {
      case 'today':
        if (!dd.checkin && h < 14) return ['Good morning! Want to check in? One minute, then we plan the day together.', [{ label: 'Check in', go: 'checkin' }]];
        if (!dd.targets.length) return ['No targets yet. What is one thing that would make today count?', [{ label: 'Add one', fn: () => { const el = $('#addTitle'); if (el) el.focus(); } }]];
        { const ex = nextExam(), plan = ex && examPlan(ex);
          if (plan && plan.due.length && Math.random() < .5) return [`${plan.due.length} revision${plan.due.length === 1 ? '' : 's'} due for ${ex.name}. Topics stick when you revisit them on time.`, [{ label: 'Open plan', go: 'exams' }]];
          if (D.anki && D.anki.due >= 20 && ankiToday() < 20 && Math.random() < .5) return [`${D.anki.due} Anki cards are waiting. Ten minutes now beats an hour tonight.`, ASCEND_IS_MOBILE ? [] : [{ label: 'Open Anki', fn: () => ankiCall('guiDeckBrowser').catch(e => toast(e.message)) }]]; }
        if (!next) return ['Everything is done! I am so proud of you. Go stretch, like me.', []];
        return [`${done ? `${done} down, ${dd.targets.length - done} to go. ` : ''}"${next.title}" is next. Shall we start it?`, [focusNext]];
      case 'focus':
        return D.activeSession ? ['I will nap right here while you focus. Phone face down?', []] : [`${fmtMin(focusMinOn(t))} of focus today. Pick one thing and I will keep you company.`, next ? [focusNext] : []];
      case 'fitness':
        if (!rd) return ['Connect intervals.icu or log your sleep in the morning check-in, and I will tell you how ready your body is.', []];
        return [`Recovery ${rd.score}%: ${rd.band.label.toLowerCase()}. ${rd.band.advice}`, rd.band.key === 'rest' || rd.band.key === 'easy' ? [{ label: 'Log a walk', fn: () => workoutModal() }] : [{ label: 'Log workout', fn: () => workoutModal() }]];
      case 'journal':
        return [`Here is something to think about tonight: ${thoughtFor('evening', daySeed(t))}`, []];
      case 'goals': {
        const behind = activeGoals().map(g => ({ g, s: goalStatus(g) })).filter(x => x.s.key === 'off' || x.s.key === 'adjust')[0];
        return behind ? [`${behind.g.name} needs a little love. One small step today keeps it alive.`, [{ label: 'Work on it', fn: () => { UI.focusGoal = behind.g.id; go('focus'); } }]] : ['All your goals are on track. Keep climbing!', []];
      }
      case 'exams': {
        const ex = nextExam(); if (!ex) return ['Add your exam and its topics, and I will help you pace them.', []];
        const st = examStats(ex), plan = examPlan(ex);
        return [plan.due.length ? `Revisions first: ${plan.due.length} due. Then ${plan.learn.length} new topic${plan.learn.length === 1 ? '' : 's'}. ${st.daysLeft} days to go, we can do this.` : plan.learn.length ? `${plan.learn.length} new topic${plan.learn.length === 1 ? '' : 's'} today keeps you on pace. ${st.daysLeft} days to go.` : `Today's plan is done. ${st.pctLearned}% learned. Rest is revision too.`, []];
      }
      case 'health': {
        const a = ascendAge(); if (!a) return ['Connect Health Connect or intervals.icu and I will work out your Ascend Age.', []];
        const lv = a.factors.filter(f => f.years - f.atTarget > 0.2).sort((x, y) => (y.years - y.atTarget) - (x.years - x.atTarget))[0];
        return [lv ? `Biggest opportunity: ${lv.label.toLowerCase()}. ${lv.display} now, ${lv.target} would take ${round1(lv.years - lv.atTarget)} years off.` : 'Every marker is in great shape. Keep it up!', []];
      }
      case 'review':
        return reviewedThisWeek() ? ['Week closed. Rest is part of the plan too.', []] : ['Ten honest minutes. What worked this week, and what will you change?', []];
      case 'coach':
        return [h < 12 ? 'Morning is a good time to ask Claude to plan your day.' : h >= 19 ? 'Evening: try "Review my day" before you journal.' : 'Losing steam? Try "I need a push".', [{ label: h < 12 ? 'Plan my day' : h >= 19 ? 'Review my day' : 'I need a push', go: 'coach:' + (h < 12 ? 'plan' : h >= 19 ? 'review' : 'pep') }]];
    }
    if (petted) {
      const st = streak();
      const lines = ['Purr… you are doing better than you think.', st > 1 ? `${st} days in a row. I have been counting!` : 'Every streak starts with day one. Today could be it.', 'Drink some water. I just did.', 'Stretch with me? Arms up, big yawn.', thoughtFor('day')];
      return [lines[(Math.random() * lines.length) | 0], []];
    }
    return null;
  },
  pet() {
    this.wake(true); this.hearts(); this.hop();
    const r = this.tip(currentView);
    const p = this.tip('_', true);
    const pick = r && Math.random() < .6 ? r : p;
    this.say(pick[0], pick[1].filter(Boolean));
  },
  onView(view) {
    if (!this.on) return;
    this.wake(true);
    // Wander somewhere new on each screen
    const b = this.bounds();
    setTimeout(() => this.walkTo(b.min + Math.random() * (b.max - b.min)), 350);
    const key = view + ':' + todayStr();
    if (this.seen[key] || $('.scrim')) return;
    this.seen[key] = true;
    const r = this.tip(view);
    if (r) setTimeout(() => { if (currentView === view && !$('.scrim')) this.say(r[0], r[1].filter(Boolean)); }, 1600);
  },
  refresh() {
    if (!this.el) return;
    this.el.classList.toggle('hidden', !this.on);
    if (!this.on) this.closeSay(true);
    const cw = this.el.querySelector('.cat-wrap'); if (cw) cw.setAttribute('aria-label', `${this.name}, your companion. Click for a tip.`);
  }
};

// ---------- Hook into the app's moments ----------
(() => {
  const wrap = (name, after) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function (...a) { const r = orig.apply(this, a); try { after(...a); } catch (e) { console.warn('buddy', e); } return r; }; };
  wrap('go', (view, opts) => { if (Buddy.el && !(opts && opts.soft)) Buddy.onView(currentView); });
  wrap('burst', () => Buddy.el && Buddy.hop());
  wrap('celebrate', (o) => { if (!Buddy.el) return; Buddy.hop(3); Buddy.hearts(6); setTimeout(() => Buddy.say(['You did it!', 'That is my human!', 'Look at you go!'][(Math.random() * 3) | 0] + ' ' + (o && o.title ? o.title + '.' : ''), [], 5000), 1800); });
  wrap('startSession', () => { if (!Buddy.el) return; Buddy.say('Go! I will nap right here and keep quiet.', [], 4000); setTimeout(() => Buddy.setState('sleeping'), 3500); });
  wrap('finishSession', () => { if (!Buddy.el) return; Buddy.setState('stretch'); setTimeout(() => Buddy.el.classList.remove('stretch'), 1400); });
  wrap('rerender', () => Buddy.refresh());
  const boot = () => { if (!D) { setTimeout(boot, 200); return; } Buddy.init(); Buddy.onView(currentView); };
  document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
})();
