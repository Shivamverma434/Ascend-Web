/* Ascend: renderer. Views, data model, charts, focus timer, check-in, journal, weekly review, coach prompts, nudges. */
'use strict';

// ---------- Bridge (falls back to localStorage when opened in a plain browser) ----------
const bridge = window.ascend || (() => {
  const KEY = 'ascend-data';
  const handlers = {};
  return {
    load: async () => ({ data: JSON.parse(localStorage.getItem(KEY) || 'null'), dataDir: 'Browser storage (preview mode)', file: '', detectedDrive: false }),
    save: async (d) => { localStorage.setItem(KEY, JSON.stringify(d)); return true; },
    chooseFolder: async () => null, openFolder: async () => {},
    idleSeconds: async () => 0,
    openExternal: async (u) => window.open(u, '_blank'),
    copy: async (t) => { try { await navigator.clipboard.writeText(t); } catch {} return true; },
    calendar: async () => ({ events: [] }),
    showPopup: async (p) => { console.log('popup', p); toast(p.title); },
    closePopup: async () => {}, popupAction: async () => {},
    setLogin: async () => {}, info: async () => ({ version: 'preview', platform: 'web' }),
    google: async () => ({ ok: false, error: 'Only available in the desktop app' }),
    intervals: async () => ({ error: 'Only available in the desktop app' }),
    anki: async () => ({ error: 'Only available in the desktop app' }),
    notion: async () => ({ error: 'Only available in the app' }),
    trayStatus: async () => {},
    on: (c, fn) => { handlers[c] = fn; }
  };
})();

const ASCEND_IS_MOBILE = !!window.ASCEND_MOBILE;

// ---------- Light or dark: Settings > Appearance, or follow the device ----------
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const pick = (typeof D !== 'undefined' && D && D.settings && D.settings.theme) || 'system';
  const dark = pick === 'dark' || (pick === 'system' && !!(darkQuery && darkQuery.matches));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#150F18' : '#FFF7F0';
}
if (darkQuery) darkQuery.addEventListener('change', () => applyTheme());

// ---------- Small helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return todayStr(d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const weekStart = (s) => { const d = parseDay(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return todayStr(d); };
const fmtMin = (m) => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${pad(r)}m` : `${r}m`; };
const fmtClock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtHM = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const dayName = (s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => parseDay(s).toLocaleDateString(undefined, opts);
const shortDay = (s) => dayName(s, { weekday: 'short', day: 'numeric', month: 'short' });
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Goal colours: validated categorical order (identity), never status colours.
const GOAL_COLORS = ['#5A3CF0', '#FF4F1F', '#0E9AA7', '#D6247A', '#7A8B00'];

const ICONS = {
  health: '<path d="M12 21s-7.5-4.6-7.5-10.4A4.4 4.4 0 0 1 12 7.8a4.4 4.4 0 0 1 7.5 2.8C19.5 16.4 12 21 12 21Z"/><path d="M6.5 13h3l1.5-3 2 5 1.5-2h3"/>',
  exams: '<path d="M2 9.5 12 4.5l10 5-10 5Z"/><path d="M6 11.6V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.4M22 9.5V15"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v12"/><path d="M7 12h5M7 15.5h3"/>',
  today: '<path d="M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  goals: '<path d="M3 20 10 7l4 7 2-3 5 9Z"/><path d="M10 7V3l4 1.5L10 6"/>',
  fitness: '<circle cx="14" cy="4.5" r="1.8"/><path d="m8 21 3-6 3 2v5M6 12l3-4 4 1 2 3 3 1M11 15l1-5"/>',
  journal: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  review: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  coach: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  play: '<path d="M7 4v16l13-8Z" fill="currentColor"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.4L20 16M20 20v-4h-4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  flame: '<path d="M12 22c4.4 0 7-2.8 7-6.6 0-3.6-2.5-5.9-4-8.4-.4 2-1.4 3.2-2.6 3.6C12.9 7 11.5 4 8.6 2c.3 3.4-1.6 5.6-2.8 7.4C4.7 11 5 12.8 5 15.4 5 19.2 7.6 22 12 22Z" fill="currentColor"/>',
  run: '<circle cx="14" cy="4.5" r="1.8"/><path d="m8 21 3-6 3 2v5M6 12l3-4 4 1 2 3 3 1M11 15l1-5"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  yoga: '<circle cx="12" cy="4.5" r="1.8"/><path d="M4 20h16M12 7v6l-5 4M12 13l5 4M7 10l5 1 5-1"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="m6 16 4-7h5l3 7M10 9 8 6H6M14 6h2"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2-6 2 2v4M10 9l3-1 2 4 2 1M11 15l1-6-3 3"/>',
  swim: '<circle cx="16" cy="6" r="1.8"/><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M5 14l5-5 3 3 3-1"/>',
  hiit: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 1 0 18M3 12h18"/>',
  dots: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-.01"/>',
  steps: '<path d="M8 3c2 0 3 2.5 3 5s-1 4-3 4-3-1.5-3-4 1-5 3-5ZM16 9c2 0 3 2.5 3 5s-1 4-3 4-3-1.5-3-4 1-5 3-5ZM6 15h4M14 21h4"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2Z"/><path d="M12 21c2.5 0 4.6-.8 6.1-2.2l-3-2.3a5.5 5.5 0 0 1-8.2-2.9H3.8v2.4A9 9 0 0 0 12 21Z"/><path d="M6.9 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.8a9 9 0 0 0 0 8.2Z"/><path d="M12 6.6c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9 9 0 0 0 3.8 7.8l3.1 2.4A5.4 5.4 0 0 1 12 6.6Z"/>'
};
const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name] || ''}</svg>`;

const WORKOUT_TYPES = [
  { id: 'run', label: 'Run', icon: 'run', color: '#FF4F1F', distance: true },
  { id: 'walk', label: 'Walk', icon: 'walk', color: '#0E9AA7', distance: true },
  { id: 'strength', label: 'Strength', icon: 'dumbbell', color: '#5A3CF0' },
  { id: 'yoga', label: 'Yoga', icon: 'yoga', color: '#D6247A' },
  { id: 'cycling', label: 'Cycling', icon: 'bike', color: '#7A8B00', distance: true },
  { id: 'swim', label: 'Swim', icon: 'swim', color: '#0E9AA7', distance: true },
  { id: 'hiit', label: 'HIIT', icon: 'hiit', color: '#FF4F1F' },
  { id: 'sport', label: 'Sport', icon: 'ball', color: '#5A3CF0' },
  { id: 'other', label: 'Other', icon: 'dots', color: '#4A4D6B' }
];
const wType = (id) => WORKOUT_TYPES.find(t => t.id === id) || WORKOUT_TYPES[WORKOUT_TYPES.length - 1];

const MOODS = [
  { v: 1, label: 'Drained', c: '#E5383B' }, { v: 2, label: 'Low', c: '#E8930C' }, { v: 3, label: 'Okay', c: '#8A8DA6' },
  { v: 4, label: 'Good', c: '#0E9AA7' }, { v: 5, label: 'On fire', c: '#FF4F1F' }
];
const ENERGY = ['Empty', 'Low', 'Okay', 'Good', 'Charged'];
const SLEEPQ = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];
const WEEKRATE = ['Rough', 'Meh', 'Okay', 'Good', 'Great'];
const ALIGN = [['yes', 'Moved it'], ['some', 'A little'], ['no', 'Not today']];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const METRICS = {
  hours: { label: 'Focus hours', unit: 'h', hint: 'Counts focus sessions you tag to this goal, plus anything you log by hand.' },
  tasks: { label: 'Targets completed', unit: 'targets', hint: 'Counts daily targets tagged to this goal when you tick them off.' },
  km: { label: 'Kilometres run', unit: 'km', hint: 'Counts the distance of every run, including runs from intervals.icu.' },
  workouts: { label: 'Workouts', unit: 'workouts', hint: 'Counts every workout, including ones from intervals.icu.' },
  anki: { label: 'Anki reviews', unit: 'reviews', hint: 'Counts the cards you review in Anki, read from Anki on your laptop.' },
  count: { label: 'Custom count', unit: '', hint: 'Anything you count yourself: chapters, pages, applications, videos.' }
};

const QUOTES = [
  ['Small steps every day add up to big results.', ''],
  ['Discipline is choosing between what you want now and what you want most.', 'Augusta F. Kantra'],
  ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['It always seems impossible until it is done.', 'Nelson Mandela'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['Done is better than perfect.', ''],
  ['Motivation gets you going. Habit keeps you going.', 'Jim Ryun'],
  ['Focus on being productive instead of busy.', 'Tim Ferriss'],
  ['A year from now you will wish you had started today.', 'Karen Lamb'],
  ['The best way to predict the future is to create it.', 'Peter Drucker'],
  ['Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier'],
  ['Energy flows where attention goes.', ''],
  ['You are one focused hour away from a better mood.', ''],
  ['Hard choices, easy life. Easy choices, hard life.', 'Jerzy Gregorek'],
  ['Do something today that your future self will thank you for.', ''],
  ['Strive for progress, not perfection.', ''],
  ['The pain of discipline is far less than the pain of regret.', ''],
  ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
  ['What you do every day matters more than what you do once in a while.', 'Gretchen Rubin']
];


// Questions that interrupt autopilot. Used by reminders, notifications and the Today card.
const THOUGHTS = {
  morning: [
    'What would make today a win you would still be proud of next month?',
    'If you could only finish one thing today, which one changes the most?',
    'Who do you want to be by 9 pm tonight?',
    'What is the hard thing you will do first, before the day gets loud?',
    'Which small promise to yourself will you keep today?',
    'What would the version of you who already reached the goal do this morning?'
  ],
  day: [
    'Is what you are doing right now moving a goal, or just filling time?',
    'What are you avoiding right now? Name it, then give it ten minutes.',
    'If today ended now, would you be proud of it? There is still time to change the answer.',
    'One year from now, which part of today will matter?',
    'What tiny action in the next five minutes would make tomorrow easier?',
    'Are you busy, or are you moving forward?',
    'What would you do next if nobody was watching?',
    'Discomfort now or regret later. Which one are you choosing this hour?',
    'What is the next step so small you cannot say no to it?',
    'Where is your attention leaking right now?'
  ],
  evening: [
    'What did today teach you about how you work best?',
    'What small win deserves more credit than you gave it?',
    'Where did you play small today?',
    'What will you do differently tomorrow, starting in the first hour?',
    'What gave you energy today, and what quietly drained it?',
    'What are you grateful for that you almost missed?'
  ]
};
const thoughtFor = (slot, seed = Date.now()) => { const l = THOUGHTS[slot] || THOUGHTS.day; return l[Math.abs(Math.floor(seed)) % l.length]; };
const daySeed = (s = todayStr()) => { const d = parseDay(s); return d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); };

// ---------- State ----------
let D = null;
let META = { dataDir: '', file: '', detectedDrive: false };
let currentView = 'today';
let coachPick = null;
let calCache = { at: 0, key: '', events: [], error: '' };
let saveTimer = null;
let timerTick = null;
let navY = null;
const UI = {}; // transient form state (segmented choices) for the open view

function defaults() {
  const t = todayStr();
  return {
    version: 2,
    settings: {
      name: '', activeStart: '08:00', activeEnd: '22:00', nudgeEveryHours: 2, morningTime: '08:30', journalTime: '21:30',
      weeklyDay: 0, weeklyTime: '10:00', journalMode: 'quick', bedTime: '00:30', bedLead: 30, bedGoal: '00:00', wakeTime: '08:00', nudgeMode: 'plan', restUntil: '', qbankDaily: 0, proteinTarget: 80,
      notionUrl: '', calendarUrl: '', remindersOn: true, launchAtLogin: true, sound: true, onboarded: false, focusDefault: 25,
      googleUrl: '', googleKey: '', googleTasks: true, googleCalendar: true, googleCalendarRead: true,
      intervalsKey: '', intervalsAthlete: '0', buddy: true, buddyName: 'Mochi', ankiOn: false, notionToken: '', notionAuto: true, dob: '', sex: 'male', maxHr: '', sleepBase: 7.5, heightCm: '', bodyFat: '', leanKg: '', weightKg: '', hcOn: false, chessSite: 'chess.com', chessUser: '', goodreadsUrl: ''
    },
    season: { name: 'Season 1', start: weekStart(t), weeks: 12 },
    goals: [], days: {}, sessions: [], workouts: [], journal: {}, coach: [], reviews: {}, wellness: {}, exams: [], anki: null, hc: null, people: [], habitLog: {}, links: null, habitSkip: {}, qbank: [], gts: [], mistakes: [], labs: [], protein: {}, reserve: {},
    activeSession: null, dismissedCarry: '', syncQueue: [], sync: {}, tomb: {}
  };
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (typeof stampAll === 'function') stampAll(D); bridge.save(D); updateTray(); if (typeof onSaved === 'function') onSaved(); }, 300);
}

function day(date = todayStr()) {
  if (!D.days[date]) D.days[date] = { targets: [] };
  return D.days[date];
}

// ---------- Derived stats ----------
function sessionsOn(date) { return D.sessions.filter(s => s.date === date); }
function focusMinOn(date) { return sum(sessionsOn(date), s => s.minutes); }
function avgQuality(list) { const m = sum(list, s => s.minutes); return m ? Math.round(sum(list, s => s.quality * s.minutes) / m) : 0; }
function workoutsOn(date) { return D.workouts.filter(w => w.date === date); }
function range(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
function wellnessOn(date) {
  const w = D.wellness[date], h = D.hc && D.hc.days && D.hc.days[date];
  if (!h) return w || null;
  const m = { ...(w || {}) };
  // Health Connect comes straight from the watch, with sleep stages and nightly HRV, so it wins; intervals.icu fills gaps
  for (const [k, hk] of [['sleepSecs', 'sleepSecs'], ['restingHR', 'rhr'], ['hrv', 'hrv'], ['vo2max', 'vo2'], ['weight', 'weight']]) if (h[hk] != null) m[k] = h[hk];
  // One source per number, never a mix: intervals.icu's sleep score only stays when it rated the same night
  if (h.sleepSecs != null) { if (w && w.sleepSecs != null && Math.abs(w.sleepSecs - h.sleepSecs) > 1800) delete m.sleepScore; m.sleepSrc = 'hc'; }
  if (h.steps != null) m.steps = h.steps;
  for (const k of ['hrPeak', 'fat', 'lean', 'heightCm', 'bmr', 'activeKcal', 'totalKcal', 'km', 'floors', 'waterL', 'spo2', 'resp', 'sys', 'dia', 'glucose', 'tempC']) if (m[k] == null && h[k] != null) m[k] = h[k];
  return m;
}
function sleepHours(date) { const w = wellnessOn(date); if (w && w.sleepSecs) return round1(w.sleepSecs / 3600); const c = (D.days[date] || {}).checkin; return c && c.sleepH ? Number(c.sleepH) : null; }

// ---------- Readiness: one 0-100 score from sleep, HRV, resting HR, training load and how you feel ----------
const mean = (arr) => arr.length ? sum(arr) / arr.length : null;
function baseline(field, date, days = 28) {
  const vals = range(addDays(date, -days), addDays(date, -1)).map(d => wellnessOn(d) && wellnessOn(d)[field]).filter(v => v);
  return vals.length >= 4 ? mean(vals) : null;
}
function loadOn(date) { return sum(workoutsOn(date), w => w.load || w.minutes * (w.effort || 3) / 3); }
function readiness(date = todayStr()) {
  const w = wellnessOn(date) || {};
  const c = (D.days[date] || {}).checkin || {};
  const parts = [];
  const sh = sleepHours(date);
  if (sh !== null || w.sleepScore) {
    const hrs = sh !== null ? clamp((sh - 4.5) / (8 - 4.5), 0, 1) * 100 : null;
    const v = Math.round(hrs !== null && w.sleepScore ? (hrs + w.sleepScore) / 2 : hrs !== null ? hrs : w.sleepScore);
    parts.push({ key: 'sleep', label: 'Sleep', v, w: .35, note: sh !== null ? `${sh}h${w.sleepScore ? `, score ${w.sleepScore}` : ''}` : `score ${w.sleepScore}` });
  }
  const hb = baseline('hrv', date);
  if (w.hrv && hb) { const r = w.hrv / hb; parts.push({ key: 'hrv', label: 'HRV', v: Math.round(clamp(50 + (r - 1) * 250, 0, 100)), w: .25, note: `${Math.round(w.hrv)} ms vs ${Math.round(hb)} usual`, delta: Math.round((r - 1) * 100) }); }
  const rb = baseline('restingHR', date);
  if (w.restingHR && rb) { const dlt = w.restingHR - rb; parts.push({ key: 'rhr', label: 'Resting HR', v: Math.round(clamp(60 - dlt * 8, 0, 100)), w: .15, note: `${w.restingHR} bpm vs ${Math.round(rb)} usual`, delta: round1(dlt) }); }
  const acute = sum(range(addDays(date, -6), date), loadOn), chronic = sum(range(addDays(date, -27), date), loadOn) / 4;
  if (chronic > 0) { const acwr = acute / chronic; const v = acwr > 1.5 ? 30 : acwr > 1.3 ? 55 : acwr < 0.6 ? 75 : 90; parts.push({ key: 'load', label: 'Training load', v: Math.round(v - Math.min(25, loadOn(addDays(date, -1)) / 6)), w: .15, note: `${Math.round(acwr * 100)}% of your usual week`, acwr }); }
  if (c.energy) parts.push({ key: 'feel', label: 'How you feel', v: (c.energy - 1) * 25, w: .1, note: `energy ${c.energy}/5` });
  if (!parts.some(p => p.key === 'sleep' || p.key === 'hrv')) return null;
  const tw = sum(parts, p => p.w);
  const score = Math.round(sum(parts, p => p.v * p.w) / tw);
  const band = score >= 67 ? { key: 'push', label: 'Primed', color: '#2FA36B', advice: 'Your body is ready. A good day for your hardest session.' }
    : score >= 50 ? { key: 'steady', label: 'Steady', color: '#D9A21B', advice: 'Normal training is fine. Keep intensity moderate.' }
    : score >= 34 ? { key: 'easy', label: 'Take it easy', color: '#F0A030', advice: 'Go light: an easy run, a walk or mobility work.' }
    : { key: 'rest', label: 'Recover', color: '#E5484D', advice: 'Recovery day. Rest, walk, stretch and sleep early.' };
  return { score, band, parts };
}
function sleepDebt(date = todayStr(), need = 7.5) { return round1(sum(range(addDays(date, -6), date).map(sleepHours).filter(x => x !== null), h => Math.max(0, need - h))); }
function fitnessSuggestions(date = todayStr()) {
  const r = readiness(date); const out = [];
  if (!r) return out;
  const P = Object.fromEntries(r.parts.map(p => [p.key, p]));
  const recentRuns = range(addDays(date, -3), date).flatMap(workoutsOn);
  const train = { push: recentRuns.length ? 'Go for quality today: intervals, tempo or a heavy strength session.' : 'You have rested for days and your body is ready. A 30 to 40 minute run today.', steady: 'A normal session: steady run or full-body strength. Stop while it still feels good.', easy: 'Swap any hard session for 30 minutes easy: zone 2 run, walk or yoga.', rest: 'Skip training today. A 20 minute walk and 10 minutes of stretching is the win.' }[r.band.key];
  out.push({ icon: 'run', color: r.band.color, title: `Training: ${r.band.label.toLowerCase()}`, text: train });
  const debt = sleepDebt(date);
  if (debt >= 2) { const [h, m] = (D.settings.morningTime || '07:00').split(':').map(Number); const mins = clamp(((h * 60 + m - 8.5 * 60) + 1440) % 1440, 21.5 * 60, 23 * 60); const bed = new Date(); bed.setHours(0, mins, 0, 0); out.push({ icon: 'bed', color: 'var(--violet)', title: `${debt}h sleep debt this week`, text: `Pay it back slowly: lights out by ${bed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} for the next three nights, screens away 30 minutes before.` }); }
  else if (P.sleep && P.sleep.v >= 70) out.push({ icon: 'bed', color: 'var(--on)', title: 'Sleep is on point', text: 'Protect the routine that got you here. Same bedtime tonight.' });
  if (P.hrv && P.hrv.delta <= -10) out.push({ icon: 'pulse', color: 'var(--adjust)', title: `HRV ${Math.abs(P.hrv.delta)}% below your usual`, text: 'Your nervous system is under stress. Ten minutes of slow breathing or an easy walk, and no caffeine after 2 pm.' });
  if (P.rhr && P.rhr.delta >= 5) out.push({ icon: 'heart', color: 'var(--off)', title: `Resting HR up ${P.rhr.delta} bpm`, text: 'Often a sign of fatigue, stress or a cold coming. Keep today easy and drink more water.' });
  if (P.load && P.load.acwr > 1.4) out.push({ icon: 'bolt', color: 'var(--adjust)', title: 'You ramped up fast', text: `This week is ${Math.round(P.load.acwr * 100)}% of your usual load. Hold volume steady next week to stay injury free.` });
  const steps = range(addDays(date, -6), date).map(d => wellnessOn(d) && wellnessOn(d).steps).filter(Boolean);
  if (steps.length >= 3 && mean(steps) < 6000) out.push({ icon: 'steps', color: 'var(--teal, #0E9AA7)', title: `${Math.round(mean(steps)).toLocaleString()} steps a day`, text: 'Add a 15 minute walk after lunch. It lifts afternoon focus too.' });
  const ins = sleepFocusInsight(date); if (ins) out.push(ins);
  return out.slice(0, 5);
}
// Does sleep change how much you get done? Compares focus on days after good vs short sleep.
function sleepFocusInsight(date = todayStr()) {
  const good = [], short = [];
  for (const d of range(addDays(date, -27), addDays(date, -1))) { const h = sleepHours(d); if (h === null) continue; (h >= 7 ? good : h < 6.5 ? short : []).push(focusMinOn(d)); }
  if (good.length < 3 || short.length < 3) return null;
  const diff = Math.round(mean(good) - mean(short));
  if (Math.abs(diff) < 15) return null;
  return { icon: 'bolt', color: 'var(--ember)', title: diff > 0 ? `Sleep buys you ${fmtMin(diff)} of focus` : 'Short nights have not cost you focus yet', text: diff > 0 ? `After 7h+ nights you focus ${fmtMin(diff)} more than after nights under 6.5h. Tonight's bedtime is tomorrow's study session.` : 'But that rarely lasts. Watch your energy this week.' };
}

function activeDay(date) {
  const d = D.days[date];
  return (d && (d.targets.some(t => t.done) || d.checkin)) || !!(D.reserve && D.reserve[date]) || focusMinOn(date) >= 10 || workoutsOn(date).length > 0 || !!(D.journal[date] && D.journal[date].saved) || ((D.anki && D.anki.days && D.anki.days[date]) || 0) >= 20;
}
function streak() {
  let s = 0; let d = todayStr();
  if (!activeDay(d)) d = addDays(d, -1);
  while (activeDay(d)) { s++; d = addDays(d, -1); if (s > 3000) break; }
  return s;
}

function seasonInfo() {
  const total = D.season.weeks * 7;
  const idx = clamp(daysBetween(D.season.start, todayStr()) + 1, 1, total);
  const end = addDays(D.season.start, total - 1);
  return { total, dayNum: idx, left: Math.max(0, daysBetween(todayStr(), end)), end, frac: idx / total, week: Math.ceil(idx / 7) };
}

function goalProgress(g, until = todayStr(), from = D.season.start) {
  if (typeof isLevel === 'function' && isLevel(g)) return levelValue(g) ?? 0;
  const inRange = (d) => d >= from && d <= until;
  let v = typeof lifeProgress === 'function' ? lifeProgress(g, from, until) : 0;
  if (g.metric === 'hours') v += sum(D.sessions.filter(s => s.goalId === g.id && inRange(s.date)), s => s.minutes) / 60;
  if (g.metric === 'km') v += sum(D.workouts.filter(w => w.type === 'run' && inRange(w.date)), w => w.distance);
  if (g.metric === 'workouts') v += D.workouts.filter(w => inRange(w.date)).length;
  if (g.metric === 'anki' && D.anki) for (const [d, n] of Object.entries(D.anki.days || {})) if (inRange(d)) v += n;
  if (g.metric === 'tasks') for (const [d, dd] of Object.entries(D.days)) if (inRange(d)) v += dd.targets.filter(t => t.done && t.goalId === g.id).length;
  v += sum((g.logs || []).filter(l => inRange(l.date)), l => l.amount);
  return round1(v);
}

function goalStatus(g) {
  if (typeof isLevel === 'function' && isLevel(g)) return levelStatus(g);
  const si = seasonInfo();
  const p = goalProgress(g);
  if (p >= goalTarget(g)) return { key: 'on', label: 'Done', p };
  if (si.dayNum < 7) return { key: 'new', label: 'Warming up', p };
  const expected = goalTarget(g) * si.frac;
  const ratio = expected ? p / expected : 1;
  if (ratio >= 0.9) return { key: 'on', label: 'On track', p, ratio };
  if (ratio >= 0.6) return { key: 'adjust', label: 'Adjust', p, ratio };
  return { key: 'off', label: 'Off track', p, ratio };
}
function unitOf(g) { return g.metric === 'count' ? (g.unit || '') : (METRICS[g.metric] || {}).unit || ''; }
// A habit's season target follows the season: times a week × weeks
function goalTarget(g) { return g.metric === 'habit' ? (Number(g.times) || 3) * D.season.weeks : Number(g.target) || 1; }
const activeGoals = () => D.goals.filter(g => !g.archived);

// Weekly review helpers: a review covers the 7 days ending on the day it is done.
function latestReview(withinDays = 8) {
  const t = todayStr();
  const keys = Object.keys(D.reviews || {}).filter(k => k <= t && daysBetween(k, t) < withinDays).sort();
  return keys.length ? { key: keys[keys.length - 1], ...D.reviews[keys[keys.length - 1]] } : null;
}
function reviewedThisWeek() { return !!latestReview(6); }
function weekStats(from, to) {
  const days = range(from, to);
  const targets = days.flatMap(d => (D.days[d] || { targets: [] }).targets);
  const sess = D.sessions.filter(s => s.date >= from && s.date <= to);
  const wk = D.workouts.filter(w => w.date >= from && w.date <= to);
  const moods = days.map(d => D.journal[d] && D.journal[d].saved && D.journal[d].mood).filter(Boolean);
  const sleeps = days.map(sleepHours).filter(x => x !== null);
  return {
    days, focusMin: sum(sess, s => s.minutes), quality: avgQuality(sess), done: targets.filter(t => t.done).length, total: targets.length,
    workouts: wk.length, activeMin: sum(wk, w => w.minutes), km: round1(sum(wk.filter(w => w.type === 'run'), w => w.distance)),
    journalDays: days.filter(d => D.journal[d] && D.journal[d].saved).length, checkins: days.filter(d => D.days[d] && D.days[d].checkin).length,
    mood: moods.length ? round1(sum(moods) / moods.length) : null, sleep: sleeps.length ? round1(sum(sleeps) / sleeps.length) : null,
    steps: (() => { const st = days.map(d => wellnessOn(d) && wellnessOn(d).steps).filter(Boolean); return st.length ? Math.round(sum(st) / st.length) : null; })()
  };
}

// ---------- Shell & navigation ----------
const NAV = [['today', 'Today'], ['exams', 'Exams'], ['goals', 'Goals'], ['health', 'Health'], ['journal', 'Journal'], ['coach', 'Coach'], ['settings', 'Settings']];
// Screens that live inside a tab: go('fitness') opens Health on its training page, and so on
const VIEW_ALIAS = { fitness: ['health', 'htab', 'train'], healthspan: ['health', 'htab', 'span'], review: ['journal', 'jtab', 'review'], people: ['goals', 'gtab', 'people'] };
const NAV_PARENT = { focus: 'today' };
const navOn = (id) => currentView === id || NAV_PARENT[currentView] === id;

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = `<span class="nav-ind" id="navInd"></span>` + NAV.map(([id, label]) => `<button data-go="${id}" class="${navOn(id) ? 'active' : ''}">${icon(id)}<span>${label}</span>${id === 'journal' && !reviewedThisWeek() && new Date().getDay() === Number(D.settings.weeklyDay) ? '<i class="nav-dot"></i>' : ''}</button>`).join('');
  // Slide the white pill from the previous item to the new one
  const act = $('button.active', nav), ind = $('#navInd');
  if (act && ind) {
    const y = act.offsetTop;
    ind.style.height = act.offsetHeight + 'px';
    if (navY === null || reduced()) { ind.style.transform = `translateY(${y}px)`; }
    else { ind.style.transition = 'none'; ind.style.transform = `translateY(${navY}px)`; void ind.offsetWidth; ind.style.transition = ''; ind.style.transform = `translateY(${y}px)`; }
    navY = y;
  }
  const st = streak();
  const a = D.activeSession;
  $('#railFoot').innerHTML = `
    ${a ? `<div class="streak-pill focusing" data-go="focus">${icon('focus', 'class="flame spin-slow"')}<span id="railTimer">Focusing</span></div>` : ''}
    <div class="streak-pill">${icon('flame', 'class="flame flicker" style="color:var(--ember)"')} <span>${st} day streak</span></div>
    <div>${esc(D.season.name)} · Day ${seasonInfo().dayNum} of ${seasonInfo().total}</div>
    <button type="button" class="sync-all ${typeof syncingAll !== 'undefined' && syncingAll ? 'busy' : ''}" data-act="sync-everything" title="Sync with your phone, Google, intervals.icu and Anki">${icon('sync')}Sync all</button>
    <div id="syncStatus" class="sync-status"></div>`;
  if (typeof setSyncStatus === 'function') setSyncStatus();
}

function go(view, opts = {}) {
  if (view === 'checkin') { go('today'); setTimeout(openCheckin, 250); return; }
  if (view && view.startsWith('coach:')) { coachPick = view.split(':')[1]; view = 'coach'; }
  if (VIEW_ALIAS[view]) { const [v, k, tab] = VIEW_ALIAS[view]; UI[k] = tab; view = v; }
  if (view !== currentView) { UI.jdate = null; UI.jopen = null; UI.allWorkouts = false; UI.noteLimit = 10; }
  currentView = VIEWS[view] ? view : 'today';
  renderNav();
  const v = $('#view');
  v.classList.remove('enter');
  v.innerHTML = VIEWS[currentView]();
  if (!opts.soft) { void v.offsetWidth; v.classList.add('enter'); }
  if (!opts.keepScroll) $('#main').scrollTop = 0;
  AFTER[currentView] && AFTER[currentView](!opts.soft);
}
function rerender() { go(currentView, { keepScroll: true, soft: true }); }

// ---------- Motion helpers ----------
const Motion = {
  countUp(root) {
    $$('[data-count]', root).forEach(el => {
      const target = parseFloat(el.dataset.count); const fmt = el.dataset.fmt || 'int';
      const f = (v) => fmt === 'min' ? fmtMin(v) : fmt === 'dec' ? round1(v).toString() : fmt === 'pct' ? Math.round(v) + '%' : fmt === 'steps' ? Math.round(v).toLocaleString() : Math.round(v).toString();
      if (reduced() || !isFinite(target)) { el.textContent = f(target); return; }
      const t0 = performance.now(), dur = 900 + Math.min(600, target * 8);
      const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = f(target * e); if (p < 1) requestAnimationFrame(step); };
      el.textContent = f(0); requestAnimationFrame(step);
    });
  },
  climb(frac, animate) {
    const track = $('#ridgeTrack'), trail = $('#ridgeTrail'), climber = $('#climber');
    if (!track || !climber) return;
    const L = track.getTotalLength();
    const place = (f) => { const p = track.getPointAtLength(L * f); climber.setAttribute('transform', `translate(${p.x} ${p.y})`); trail.style.strokeDashoffset = String(L * (1 - f)); };
    trail.style.strokeDasharray = String(L);
    if (!animate || reduced()) { place(frac); return; }
    const t0 = performance.now(), dur = 1700;
    place(0);
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; place(frac * e); if (p < 1) requestAnimationFrame(step); else climber.classList.add('arrived'); };
    requestAnimationFrame(step);
  }
};

// ---------- TODAY ----------
function headline(done, total) {
  const h = new Date().getHours();
  if (total && done === total) return 'Summit reached. Take a bow.';
  if (total && done / total >= 0.5) return 'Over halfway. Keep climbing.';
  if (total && done > 0) return 'Momentum is building.';
  if (h < 12) return 'Make this morning count.';
  if (h < 17) return 'Pick one thing. Start now.';
  return 'Finish strong tonight.';
}
const words = (text) => text.split(' ').map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`).join(' ');

function ridgeSVG(frac) {
  const pts = [[0, 140], [70, 118], [130, 128], [210, 92], [280, 104], [360, 66], [430, 80], [520, 40], [590, 54], [660, 18], [700, 22]];
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  return `<svg class="ridge" viewBox="0 0 700 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="rg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L700 150 L0 150 Z" fill="url(#rg)"/>
    <path id="ridgeTrack" d="${d}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-dasharray="4 6" class="march"/>
    <path id="ridgeTrail" d="${d}" fill="none" stroke="#FFE08A" stroke-width="3.5" stroke-linecap="round"/>
    <g transform="translate(660 18)"><path class="flag" d="M0 0V-16l11 5-11 5" fill="#FF4F1F" stroke="#fff" stroke-width="1.5"/></g>
    <g id="climber"><g class="climber"><circle r="16" fill="#FF4F1F" class="climber-pulse"/><circle r="10" fill="#FF4F1F" stroke="#fff" stroke-width="3"/><circle r="3.5" fill="#fff"/></g></g>
  </svg>`;
}

function heroSky() {
  const h = new Date().getHours();
  const tod = h < 11 ? 'dawn' : h < 17 ? 'day' : h < 20 ? 'dusk' : 'night';
  const stars = Array.from({ length: 22 }, (_, i) => `<i style="left:${(i * 37 + 11) % 100}%;top:${(i * 53 + 7) % 62}%;animation-delay:${(i * 0.37) % 3}s"></i>`).join('');
  const sparks = Array.from({ length: 10 }, (_, i) => `<i style="left:${8 + i * 9}%;animation-delay:${(i * 0.8) % 6}s;animation-duration:${6 + (i % 4)}s"></i>`).join('');
  return { tod, html: `<div class="sky"><span class="celestial"></span><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i><div class="stars">${stars}</div><div class="sparks">${sparks}</div></div><div class="range far"></div><div class="range mid"></div>` };
}

function viewToday() {
  const t = todayStr();
  const dd = day(t);
  const done = dd.targets.filter(x => x.done).length, total = dd.targets.length;
  const fmin = focusMinOn(t);
  const st = streak();
  const name = D.settings.name ? `, ${esc(D.settings.name)}` : '';
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const frac = total ? done / total : 0;
  const latest = D.coach.slice().reverse().sort((a, b) => b.date.localeCompare(a.date))[0];
  const carry = carryOver();
  const sky = heroSky();
  const ci = dd.checkin;
  const rv = latestReview(8);
  const pr = rv && rv.priorities && rv.priorities.length ? rv : null;
  const rd = readiness(t);

  return `
  <section class="hero tod-${sky.tod}">
    ${sky.html}
    <div class="hero-top">
      <div>
        <div class="date">${greet}${name} · ${dayName(t)}</div>
        <h1 class="words">${words(headline(done, total))}</h1>
        ${ci && (ci.win || ci.stretch) ? winLine(ci) : `<p class="hero-thought">${esc(thoughtFor(h < 12 ? 'morning' : h < 18 ? 'day' : 'evening', daySeed(t)))}</p>`}
        ${ci || rd || (typeof nextExam === 'function' && nextExam()) ? `<div class="ci-chips">${rd ? `<span data-go="fitness" style="cursor:pointer"><i class="rd-dot" style="background:${rd.band.color}"></i>Recovery ${rd.score}% · ${rd.band.label}</span>` : ''}${typeof nextExam === 'function' && nextExam() ? `<span data-go="exams" style="cursor:pointer">${icon('exams')} ${esc(nextExam().name)} in ${Math.max(0, daysBetween(t, nextExam().date))}d</span>` : ''}${ci && ci.energy ? `<span>${icon('bolt')} Energy ${ci.energy}/5</span>` : ''}${ci && ci.mood ? `<span>${icon('heart')} ${MOODS[ci.mood - 1].label}</span>` : ''}</div>` : ''}
      </div>
      <div class="hero-stats">
        <div class="hstat hot"><b data-count="${st}">${st}</b><span>day streak</span></div>
        <div class="hstat"><b><span data-count="${done}">${done}</span>/${total}</b><span>targets</span></div>
        <div class="hstat"><b data-count="${fmin}" data-fmt="min">${fmtMin(fmin)}</b><span>focused</span></div>
      </div>
    </div>
    ${ridgeSVG(frac)}
  </section>

  <div class="quick">
    ${!ci && h < 15 ? `<button class="btn primary" data-go="checkin">${icon('sun')}Morning check-in</button><button class="btn" data-go="focus">${icon('play')}Start focus</button>` : `<button class="btn primary" data-go="focus">${icon('play')}Start focus</button>`}
    <button class="btn ghost" data-act="log-workout">${icon('run')}Log workout</button>
    <button class="btn ghost" data-go="journal">${icon('journal')}Reflect</button>
    ${D.reserve && D.reserve[t] ? '' : reservesUsed(t) < RESERVE_PER_WEEK ? `<button class="btn ghost" data-act="reserve-day" title="Protects streaks and targets for today. 2 a week.">${icon('bed')}Reserve day</button>` : ''}
  </div>
  ${typeof restartCard === 'function' ? restartCard() : ''}
  ${D.reserve && D.reserve[t] ? `<div class="carry reserve-banner"><p><b>Reserve day.</b> Habits, streaks and tomorrow's QBank target are protected. ${RESERVE_PER_WEEK - reservesUsed(t)} left this week.</p><button class="btn sm ghost" data-act="reserve-day">Undo</button></div>` : resting(t) ? `<div class="carry reserve-banner"><p><b>Rest mode until ${shortDay(D.settings.restUntil)}.</b> Habits and reminders are paused.</p><button class="btn sm ghost" data-go="settings">Change</button></div>` : ''}

  <div class="grid g-main">
    <section class="panel">
      <div class="panel-head">
        <h2>Today's targets</h2>
        <b class="big-pct"><span data-count="${total ? Math.round(frac * 100) : 0}" data-fmt="pct">${total ? Math.round(frac * 100) : 0}%</span></b>
      </div>
      <div class="progress-bar" style="margin-bottom:14px"><i style="width:${total ? frac * 100 : 0}%"></i></div>
      ${carry ? `<div class="carry">${icon('bolt', 'style="width:18px;height:18px;color:#A86400;flex:none"')}<p><b>${carry.items.length} unfinished from ${carry.date === addDays(t, -1) ? 'yesterday' : dayName(carry.date, { weekday: 'long' })}.</b> Bring them into today?</p><button class="btn sm" data-act="carry-yes">Bring over</button><button class="btn sm ghost" data-act="carry-no">Let go</button></div>` : ''}
      <div class="target-list">
        ${dd.targets.slice().sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1).map((tg, i) => targetRow(tg, i)).join('') || `<div class="empty"><div class="empty-art">${icon('goals')}</div><h3>No targets yet</h3><p>What would make today a win? Do your morning check-in or add one below.</p></div>`}
      </div>
      <form class="add-row" data-form="add-target">
        <input class="input grow" name="title" id="addTitle" placeholder="Add a target, e.g. Draft the workplan intro" autocomplete="off" maxlength="140">
        <input class="input" name="time" type="time" style="width:118px" title="Optional time (adds it to your calendar)">
        <select class="input" name="goal" style="width:160px">${goalOptions()}</select>
        <button class="btn dark" type="submit">${icon('plus')}Add</button>
      </form>
    </section>

    <div class="grid" style="align-content:start">
      ${typeof hcMoreCard === 'function' ? hcMoreCard() : ''}
      ${typeof strainWatchCard === 'function' ? strainWatchCard() : ''}
      ${typeof liftRateCard === 'function' ? liftRateCard() : ''}
      ${focusTodayCard()}
      ${qbankTodayCard()}
      ${typeof insightTodayCard === 'function' ? insightTodayCard() : ''}
      ${pr ? `<section class="panel prio">
        <div class="panel-head"><h3>${icon('compass', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px"')} This week's priorities</h3><span class="muted" style="font-size:12px">${pr.priorities.filter(p => p.done).length}/${pr.priorities.length}</span></div>
        ${pr.priorities.map(p => { const g = D.goals.find(x => x.id === p.goalId); return `<div class="target ${p.done ? 'done' : ''}" data-pid="${p.id}"><button class="check" data-act="toggle-prio" aria-label="Mark done">${icon('check', 'stroke-width="3"')}</button><span class="t-title">${esc(p.title)}</span>${g ? `<span class="t-meta"><span class="chip"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}</span></span>` : ''}</div>`; }).join('')}
        ${pr.obstacle ? `<p class="muted ifthen-plan">If ${esc(pr.obstacle)}, then ${esc(pr.ifthen || '…')}</p>` : ''}
      </section>` : ''}
      ${typeof habitsTodayCard === 'function' ? habitsTodayCard() : ''}
      ${typeof peopleTodayCard === 'function' ? peopleTodayCard() : ''}
      ${typeof examTodayCard === 'function' ? examTodayCard() : ''}
      ${sleepKitCard()}
      ${typeof proteinTodayCard === 'function' ? proteinTodayCard() : ''}
      ${typeof labsTodayCard === 'function' ? labsTodayCard() : ''}
      ${typeof healthTodayCard === 'function' ? healthTodayCard() : ''}
      ${typeof ankiTodayCard === 'function' ? ankiTodayCard() : ''}
      <section class="panel">
        <div class="panel-head"><h2>Your day</h2><button class="icon-btn" title="Refresh calendar" data-act="cal-refresh">${icon('sync')}</button></div>
        <div id="agenda" class="agenda">${agendaHTML()}</div>
      </section>
      <section class="coach-note">
        <div class="row" style="justify-content:space-between"><h3>${icon('coach', 'style="width:16px;height:16px;color:var(--volt);vertical-align:-2px"')} ${latest ? esc(coachLabel(latest.kind)) : 'Coach'}</h3><span class="muted" style="font-size:12px">${latest ? dayName(latest.date, { day: 'numeric', month: 'short' }) : ''}</span></div>
        ${latest ? `<div class="note-body md">${md(latest.text)}</div><button class="btn sm note-open" data-go="coach">All notes</button>`
          : `<p class="note-body">Ask Claude to plan your day. It takes 30 seconds and the plan stays here.</p><button class="btn sm note-open" data-go="coach:plan">Plan my day</button>`}
      </section>
    </div>
  </div>`;
}

// Focus lives on Today: a live countdown while a session runs, otherwise one tap to start
function focusTodayCard() {
  const a = D.activeSession, t = todayStr(), fmin = focusMinOn(t), n = sessionsOn(t).length;
  if (a) return `<section class="panel focus-card on" data-go="focus"><div class="row" style="justify-content:space-between"><h3>${icon('focus', 'class="spin-slow" style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} ${a.pausedAt ? 'Paused' : 'Focusing'}</h3><b class="fc-clock" id="tdTimer">${fmtClock(Math.max(0, a.planned * 60 - sessionElapsed(a)))}</b></div>
    <p class="muted" style="font-size:13px">${esc(a.task || 'Focus session')} · tap to open the timer</p></section>`;
  const p = D.settings.focusDefault || 25;
  return `<section class="panel focus-card"><div class="panel-head"><h3>${icon('focus', 'style="width:16px;height:16px;color:var(--ember);vertical-align:-2px"')} Focus</h3><span class="muted" style="font-size:12px">${fmtMin(fmin)} today${n ? ` · ${n} session${n === 1 ? '' : 's'}` : ''}</span></div>
    <form data-form="start-focus" class="fc-form"><input class="input grow" name="task" placeholder="What will you focus on?" maxlength="120" autocomplete="off">
      <select class="input" name="custom" style="width:92px">${[25, 50, 90].map(m => `<option value="${m}" ${m === p ? 'selected' : ''}>${m} min</option>`).join('')}</select>
      <input type="hidden" name="goal" value=""><button class="btn primary" type="submit">${icon('play')}Start</button></form>
    <button class="btn ghost sm" data-go="focus" style="margin-top:8px">Sessions and focus history</button></section>`;
}

function targetRow(tg, i = 0) {
  const g = D.goals.find(x => x.id === tg.goalId);
  const isNew = UI.newTarget === tg.id;
  return `<div class="target ${tg.done ? 'done' : ''} ${isNew ? 'pop-in' : ''}" data-id="${tg.id}" style="--i:${i}">
    <button class="check" data-act="toggle-target" aria-label="Mark done">${icon('check', 'stroke-width="3"')}</button>
    <span class="t-title">${esc(tg.title)}</span>
    <span class="t-meta">
      ${tg.time ? `<span class="chip time-chip">${icon('clock', 'style="width:12px;height:12px"')}${fmtHM(tg.time)} · ${tg.dur || 50}m</span>` : ''}
      ${g ? `<span class="chip"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}</span>` : ''}
      ${tg.taskId ? `<span class="g-dot ${tg.dirty ? 'pending' : ''}" title="${tg.dirty ? 'Waiting to sync with Google' : 'Synced with Google Tasks'}"></span>` : ''}
      <button class="icon-btn" data-act="edit-target" title="Edit, schedule or add to calendar">${icon('clock')}</button>
      <button class="icon-btn" data-act="focus-target" title="Focus on this">${icon('focus')}</button>
      <button class="icon-btn" data-act="del-target" title="Remove">${icon('x')}</button>
    </span>
  </div>`;
}

function goalOptions(sel = '') {
  return `<option value="">No goal</option>` + activeGoals().map(g => `<option value="${g.id}" ${sel === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
}

function carryOver() {
  const t = todayStr();
  if (D.dismissedCarry === t) return null;
  const prev = Object.keys(D.days).filter(d => d < t).sort().pop();
  if (!prev || daysBetween(prev, t) > 7) return null;
  const items = D.days[prev].targets.filter(x => !x.done && !x.carried);
  return items.length ? { date: prev, items } : null;
}

function agendaHTML() {
  const useGoogle = gEnabled() && D.settings.googleCalendarRead;
  if (!useGoogle && !D.settings.calendarUrl) return `<div class="empty" style="padding:10px"><p style="margin-bottom:10px">Connect Google to see your calendar here and in coach prompts.</p><button class="btn sm" data-go="settings">Connect Google</button></div>`;
  if (calCache.error) return `<p class="muted">Could not load your calendar: ${esc(calCache.error)}</p>`;
  if (!calCache.at) return `<div class="skeleton"></div><div class="skeleton" style="width:70%"></div>`;
  const evs = calCache.events.filter(e => !e.allDay);
  const all = calCache.events.filter(e => e.allDay);
  if (!calCache.events.length) return `<p class="muted">Nothing on the calendar today. A wide-open day for deep work.</p>`;
  const now = Date.now();
  return all.map(e => `<div class="chip" style="align-self:flex-start">${esc(e.title)}</div>`).join('') + evs.map((e, i) => {
    const s = +new Date(e.start), en = +new Date(e.end);
    const cls = en < now ? 'past' : (s <= now && now < en ? 'now' : '');
    return `<div class="ev ${cls} ${e.ascend ? 'mine' : ''}" style="--i:${i}"><time>${fmtTime(e.start)}</time><div class="ev-card"><b>${esc(e.title)}</b><span>${fmtTime(e.start)} to ${fmtTime(e.end)}${e.location ? ' · ' + esc(e.location) : ''}</span>${cls === 'now' ? '<i class="now-bar"></i>' : ''}</div></div>`;
  }).join('');
}

async function loadCalendar(force = false) {
  const useGoogle = gEnabled() && D.settings.googleCalendarRead;
  const key = (useGoogle ? 'g:' + D.settings.googleUrl : 'i:' + D.settings.calendarUrl) + todayStr();
  if (!useGoogle && !D.settings.calendarUrl) return;
  if (!force && calCache.key === key && Date.now() - calCache.at < 10 * 60e3) return;
  let events = [], error = '';
  try {
    if (useGoogle) events = await googleEvents(todayStr());
    else { const r = await bridge.calendar(D.settings.calendarUrl, todayStr(), 1); events = r.events || []; error = r.error || ''; }
  } catch (e) { error = e.message; }
  events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  calCache = { at: Date.now(), key, events, error };
  const el = $('#agenda'); if (el) el.innerHTML = agendaHTML();
}

// ---------- MORNING CHECK-IN ----------
function openCheckin() {
  const t = todayStr();
  const dd = day(t);
  const ci = dd.checkin || {};
  const w = wellnessOn(t) || wellnessOn(addDays(t, -1));
  const autoSleep = w && w.sleepSecs ? round1(w.sleepSecs / 3600) : '';
  const rows = dd.targets.filter(x => !x.done).slice(0, 3);
  while (rows.length < 3) rows.push(null);
  const rv = latestReview(8);
  UI.ci = { sleepQ: ci.sleepQ || 0, energy: ci.energy || 0, mood: ci.mood || 0, tags: Array.isArray(ci.tags) ? ci.tags.slice() : [], pain: ci.pain ?? null };
  const segRow = (key, labels) => `<div class="seg wide" data-seg="${key}">${labels.map((l, i) => `<button type="button" data-v="${i + 1}" class="${UI.ci[key] === i + 1 ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const m = modal(`
    <div class="ci-head"><div class="sunrise"><span class="sun"></span><span class="hill h1"></span><span class="hill h2"></span></div>
      <div class="ci-title"><span class="muted-w">${dayName(t)}</span><h2>Good morning${D.settings.name ? ', ' + esc(D.settings.name) : ''}</h2></div></div>
    <form data-form-local="checkin">
      <div class="ci-grid">
        <div class="field"><label>${icon('bed', 'class="lab-ic"')} Sleep (hours)</label><input class="input" name="sleepH" type="number" step="0.1" min="0" max="16" value="${esc(ci.sleepH || autoSleep)}" placeholder="7.5">${autoSleep ? `<span class="hint">From your watch via ${w.sleepSrc === 'hc' ? 'Health Connect' : 'intervals.icu'}${w.sleepScore ? `, score ${w.sleepScore}` : ''}</span>` : ''}</div>
        <div class="field"><label>Sleep quality</label>${segRow('sleepQ', SLEEPQ)}</div>
      </div>
      <div class="field"><label>${icon('bolt', 'class="lab-ic"')} Energy</label>${segRow('energy', ENERGY)}</div>
      <div class="field"><label>${icon('heart', 'class="lab-ic"')} Mood</label>${segRow('mood', MOODS.map(x => x.label))}</div>
      ${typeof behaviorChips === 'function' ? behaviorChips(UI.ci.tags) : ''}
      <div class="row"><div class="field grow"><label>Today is a win if… (minimum)</label><input class="input" name="win" value="${esc(ci.win || '')}" placeholder="40 QBank questions, even on a bad day" maxlength="140"></div>
        <div class="field grow"><label>Stretch</label><input class="input" name="stretch" value="${esc(ci.stretch || '')}" placeholder="80 questions and clear the Anki backlog" maxlength="140"></div></div>
      ${(() => { const T = todayStr(), lift = [T, addDays(T, -1)].some(d => workoutsOn(d).some(w => w.type === 'strength')); return lift || ci.pain != null ? `<div class="field"><label>Back pain or soreness after lifting (0 to 10)</label><div class="seg wide pain-seg" data-pain>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" data-p="${v}" class="${ci.pain === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>` : ''; })()}
      ${rv && rv.priorities && rv.priorities.length ? `<div class="prio-chips"><span class="muted">This week:</span>${rv.priorities.map(p => `<span class="chip ${p.done ? 'status-on' : ''}">${esc(p.title)}</span>`).join('')}</div>` : ''}
      <div class="field"><label>Top 3 for today</label>
        <div class="ci-targets">${rows.map((r, i) => `<div class="ci-row" data-row="${i}" data-id="${r ? r.id : ''}">
          <span class="ci-num">${i + 1}</span>
          <input class="input grow" name="title${i}" value="${esc(r ? r.title : '')}" placeholder="${['The most important thing', 'Next most important', 'One for your health or growth'][i]}" maxlength="140">
          <select class="input" name="goal${i}" style="width:150px">${goalOptions(r ? r.goalId : '')}</select>
          <input class="input" name="time${i}" type="time" value="${r && r.time ? r.time : ''}" style="width:112px" title="Optional: adds a block to your calendar">
          <select class="input" name="dur${i}" style="width:82px">${[25, 50, 90, 120].map(d => `<option value="${d}" ${(r && r.dur ? r.dur : 50) === d ? 'selected' : ''}>${d}m</option>`).join('')}</select>
        </div>`).join('')}</div>
        <div class="row ifthen"><span class="muted">Make #1 an if-then. When</span><input class="input grow" name="cue" value="${esc(rows[0] && rows[0].cue || '')}" placeholder="I sit down after lunch / it is 14:00" maxlength="80"><span class="muted">, I will do #1.</span></div>
        <span class="hint">${gEnabled() ? 'These go to your Google Tasks list "Ascend". Ones with a time also go into Google Calendar.' : 'Connect Google in Settings to send these to Google Tasks and Calendar.'}</span>
      </div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Later</button><button class="btn primary big" type="submit">${icon('check')}Start my day</button></div>
    </form>`, 'wide');
  m.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pain] [data-p]');
    if (p) { UI.ci.pain = Number(p.dataset.p); $$('[data-p]', m).forEach(x => x.classList.toggle('on', x === p)); return; }
    const b = e.target.closest('[data-seg] [data-v]'); if (!b) return;
    const key = b.parentElement.dataset.seg; UI.ci[key] = Number(b.dataset.v);
    $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b));
  });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let added = 0;
    for (let i = 0; i < 3; i++) {
      const title = String(fd.get('title' + i) || '').trim();
      const id = $(`[data-row="${i}"]`, m).dataset.id;
      const existing = id ? dd.targets.find(x => x.id === id) : null;
      const vals = { title, goalId: fd.get('goal' + i) || '', time: fd.get('time' + i) || '', dur: Number(fd.get('dur' + i)) || 50 };
      if (i === 0) vals.cue = String(fd.get('cue') || '').trim();
      if (existing) { if (title) { Object.assign(existing, vals); markDirty(existing); } }
      else if (title) { const it = { id: uid(), done: false, ...vals }; dd.targets.push(it); markDirty(it); added++; }
    }
    dd.checkin = { tags: UI.ci.tags || [], sleepH: fd.get('sleepH') ? Number(fd.get('sleepH')) : null, sleepQ: UI.ci.sleepQ || null, energy: UI.ci.energy || null, mood: UI.ci.mood || null, win: String(fd.get('win') || '').trim(), stretch: String(fd.get('stretch') || '').trim(), pain: UI.ci.pain, floorDone: !!ci.floorDone, stretchDone: !!ci.stretchDone, at: new Date().toISOString() };
    save(); closeModal(); go('today'); chime('done');
    setTimeout(() => { confetti(120); toast('Checked in. Go climb.'); checkStreakMilestone(); }, 500);
  });
}

// ---------- FOCUS ----------
function viewFocus() {
  const a = D.activeSession;
  const t = todayStr();
  const list = sessionsOn(t);
  const fmin = sum(list, s => s.minutes);
  const presets = [25, 50, 90];
  const planned = a ? a.planned : (D.settings.focusDefault || 25);
  const week = range(addDays(t, -6), t).map(d => ({ label: parseDay(d).toLocaleDateString(undefined, { weekday: 'short' }), value: round1(focusMinOn(d) / 60), tip: `${shortDay(d)}: ${fmtMin(focusMinOn(d))} focused` }));

  return `
  <div class="view-head"><div><button class="btn ghost sm back-btn" data-go="today">‹ Today</button><h1>Focus</h1><p class="sub">${ASCEND_IS_MOBILE ? 'One task. One timer. Lock your phone and get to work: Ascend tells you when time is up.' : 'One task. One timer. Study wherever you like: Ascend just counts the time.'}</p></div></div>
  <div class="focus-stage">
    <section class="timer-wrap ${a && !a.pausedAt ? 'running' : ''} ${a && a.pausedAt ? 'paused' : ''}" id="timerWrap">
      <div class="aurora"><i></i><i></i><i></i></div>
      <div class="pulse"></div>
      <div class="seg" id="presetSeg">${presets.map(p => `<button data-preset="${p}" class="${planned === p ? 'on' : ''}" ${a ? 'disabled' : ''}>${p} min</button>`).join('')}</div>
      <div class="timer-ring">
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10"/>
          <circle id="ring" cx="100" cy="100" r="88" fill="none" stroke="url(#tg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="552.9" stroke-dashoffset="0" style="transition:stroke-dashoffset .9s linear"/>
          <defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#FFB347"/><stop offset="1" stop-color="#F2547D"/></linearGradient></defs></svg>
        <div class="orbit"><i></i><i></i><i></i></div>
        <div class="digits"><b id="digits">${fmtClock(planned * 60)}</b><span id="digitsSub">${a ? esc(a.task || 'Focusing') : 'Ready when you are'}</span></div>
      </div>
      ${a ? `
        <div class="row">
          ${a.pausedAt ? `<button class="btn primary big" data-act="resume">${icon('play')}Resume</button>` : `<button class="btn big" data-act="pause" style="background:rgba(255,255,255,.1);border-color:transparent;color:#fff">${icon('pause')}Pause</button>`}
          <button class="btn big" data-act="finish" style="background:#fff;color:var(--ink)">${icon('stop')}Finish</button>
        </div>

        <button class="btn sm ghost" data-act="discard" style="color:rgba(255,255,255,.6);margin-top:8px">Discard session</button>`
      : `
        <form data-form="start-focus" style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:10px;position:relative;z-index:2">
          <input class="input" name="task" placeholder="What will you focus on?" maxlength="120" value="${esc(UI.focusTask || '')}" autocomplete="off">
          <div class="row"><select class="input grow" name="goal">${goalOptions(UI.focusGoal || '')}</select>
          <input class="input" name="custom" type="number" min="5" max="240" value="${planned}" style="width:90px" title="Minutes"></div>
          <button class="btn primary big shine" type="submit">${icon('play')}Start focusing</button>
        </form>`}
    </section>

    <div class="grid" style="align-content:start">
      <section class="panel">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><span class="muted">Focused today</span><div class="kpi" data-count="${fmin}" data-fmt="min">${fmtMin(fmin)}</div></div>
          <div style="text-align:right"><span class="muted">Sessions</span><div class="kpi">${list.length}</div></div>
        </div>
        <p class="muted" style="margin-bottom:12px">${list.length} session${list.length === 1 ? '' : 's'} today</p>
        <div class="session-list">${list.slice().reverse().map((s, i) => `<div class="session" style="--i:${i}"><div class="grow"><b>${esc(s.task || 'Focus session')}</b><div class="muted" style="font-size:12px">${fmtTime(s.start)} · ${fmtMin(s.minutes)}${s.goalId && D.goals.find(g => g.id === s.goalId) ? ' · ' + esc(D.goals.find(g => g.id === s.goalId).name) : ''}</div></div></div>`).join('') || '<p class="muted">Your sessions will appear here.</p>'}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h3>Focus hours, last 7 days</h3></div>
        ${barChart(week, { color: '#8B4C9E', unit: 'h', height: 150 })}
      </section>
    </div>
  </div>`;
}

function sessionElapsed(a) { const now = a.pausedAt || Date.now(); return Math.max(0, (now - a.start - (a.pausedMs || 0)) / 1000); }

function startTimerLoop() {
  clearInterval(timerTick);
  timerTick = setInterval(async () => {
    const a = D.activeSession;
    if (!a) { clearInterval(timerTick); return; }
    const el = sessionElapsed(a);
    const remain = a.planned * 60 - el;
    const q = el > 0 ? Math.round(100 * clamp(1 - (a.idleSec || 0) / el, 0, 1)) : 100;
    const dg = $('#digits'); if (dg) dg.textContent = fmtClock(Math.max(remain, 0));
    const ring = $('#ring'); if (ring) ring.style.strokeDashoffset = String(552.9 * (1 - clamp(remain / (a.planned * 60), 0, 1)));
    const lq = $('#liveQ'); if (lq) lq.textContent = q + '%';
    const li = $('#liveIdle'); if (li) li.textContent = `${a.drifts || 0} drift${a.drifts === 1 ? '' : 's'}`;
    const rt = $('#railTimer'); if (rt) rt.textContent = `Focusing · ${fmtClock(Math.max(remain, 0))}`;
    const tt = $('#tdTimer'); if (tt) tt.textContent = fmtClock(Math.max(remain, 0));
    if (Math.round(el) % 30 === 0) save();
    if (remain <= 0) finishSession(true);
  }, 1000);
}

function startSession(task, goalId, minutes) {
  D.activeSession = { id: uid(), start: Date.now(), planned: clamp(Number(minutes) || 25, 1, 240), task: task.trim(), goalId, idleSec: 0, drifts: 0, pausedMs: 0, pausedAt: null };
  if ([25, 50, 90].includes(D.activeSession.planned)) D.settings.focusDefault = D.activeSession.planned;
  UI.focusTask = ''; UI.focusGoal = '';
  save(); chime('start'); go('focus'); startTimerLoop();
  if (bridge.focusTimer) bridge.focusTimer(D.activeSession.start + D.activeSession.planned * 60e3, D.activeSession.task);
}

function finishSession(auto = false) {
  const a = D.activeSession; if (!a) return;
  const el = sessionElapsed(a);
  const minutes = Math.round(el / 60);
  const quality = el > 0 ? Math.round(100 * clamp(1 - (a.idleSec || 0) / el, 0, 1)) : 100;
  const before = focusMinOn(todayStr());
  D.activeSession = null; clearInterval(timerTick);
  if (bridge.focusTimer) bridge.focusTimer(null);
  if (minutes >= 1) D.sessions.push({ id: a.id, date: todayStr(new Date(a.start)), start: new Date(a.start).toISOString(), minutes, task: a.task, goalId: a.goalId, quality, drifts: a.drifts || 0 });
  save(); chime('done');
  if (currentView === 'focus') go('focus'); else renderNav();
  if (minutes >= 1) {
    const after = before + minutes;
    const crossed = [60, 120, 180, 240, 300].find(m => before < m && after >= m);
    const milestone = crossed ? ` That takes you past ${crossed / 60} hour${crossed > 60 ? 's' : ''} of deep work today.` : '';
    celebrate({ big: fmtMin(minutes), title: auto ? 'Session complete' : 'Nice work', text: `${fmtMin(minutes)} on ${a.task || 'deep work'}. Done.${milestone}`, cta: 'Take a 5 minute break' });
    if (document.hidden || auto) bridge.showPopup({ kind: 'done', theme: 'celebrate', icon: 'trophy', eyebrow: 'Focus session complete', title: `${fmtMin(minutes)} locked in`, body: `${a.task || 'Deep work'}.${milestone} Stand up, stretch, drink some water.`, stat: fmtMin(after), statLabel: 'today', sound: D.settings.sound, actions: [{ label: 'Start another', view: 'focus', primary: true }, { label: 'Done for now' }] });
    setTimeout(checkStreakMilestone, 2500);
  }
}

// ---------- GOALS / SEASON ----------
function viewGoals(tabs = '') {
  const si = seasonInfo();
  const all = activeGoals();
  const goals = UI.area ? all.filter(g => (g.area || 'study') === UI.area) : all;
  const recs = recommendations(goals.filter(g => !isLevel(g)));
  return `
  <div class="view-head"><div><h1>Goals</h1><p class="sub">Every part of your life: study, health, mind, hobbies and people. An honest read on every goal and habit.</p></div>
    <div class="row wrap">${tabs}<button class="btn primary shine" data-act="new-goal">${icon('plus')}New goal</button></div></div>

  <section class="panel" style="margin-bottom:18px">
    <div class="season-banner">
      <div><span class="muted">${esc(D.season.name)} · ${dayName(D.season.start, { day: 'numeric', month: 'short' })} to ${dayName(si.end, { day: 'numeric', month: 'short' })}</span>
        <div class="season-days">Day <span data-count="${si.dayNum}">${si.dayNum}</span> of ${si.total}</div></div>
      <div style="text-align:right"><div class="season-days" style="color:var(--ember)"><span data-count="${si.left}">${si.left}</span> days left</div><button class="btn sm ghost" data-act="edit-season">${icon('edit')}Edit season</button></div>
    </div>
    <div class="progress-bar" style="margin:12px 0 18px"><i style="width:${si.frac * 100}%"></i></div>
    ${goals.filter(g => !isLevel(g)).length ? seasonChart(goals.filter(g => !isLevel(g))) : ''}
  </section>

  ${typeof lifeBalancePanel === 'function' ? lifeBalancePanel() : ''}

  ${recs.length ? `<section class="panel" style="margin-bottom:18px"><div class="panel-head"><h3>${icon('coach', 'style="width:16px;height:16px;color:var(--violet);vertical-align:-2px" class="twinkle"')} Recommendations</h3></div>
    <div class="grid" style="gap:10px">${recs.map((r, i) => `<div class="target rec" style="--i:${i};align-items:flex-start;background:var(--mist-2)"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${r.color};margin-top:6px;flex:none"></span><div class="grow"><b>${esc(r.title)}</b><p class="muted" style="font-size:13px">${esc(r.text)}</p></div>${r.action ? `<button class="btn sm" data-act="${r.action}" data-goal="${r.goalId}">${esc(r.actionLabel)}</button>` : ''}<button class="btn sm ghost" data-go="coach:season">Chat with coach</button></div>`).join('')}</div></section>` : ''}

  ${UI.area ? `<div class="carry"><p>Showing <b>${esc(areaOf({ area: UI.area }).label)}</b> goals.</p><button class="btn sm" data-act="area-filter" data-area="${UI.area}">Show all</button></div>` : ''}
  ${goals.length ? `<div class="goal-grid">${goals.map(goalCard).join('')}</div>` :
    `<section class="panel empty"><div class="empty-art">${icon('goals')}</div><h3>Set your first goal</h3><p>Pick something that matters this season: a skill, a fitness target, a project. Ascend tracks it from your focus sessions, runs and targets.</p><button class="btn primary" data-act="new-goal">${icon('plus')}Create a goal</button></section>`}`;
}

function goalCard(g, i) {
  if (typeof lifeGoalCard === 'function' && (g.metric === 'habit' || isLevel(g))) return lifeGoalCard(g, i);
  const s = goalStatus(g);
  const pct = g.target ? clamp(s.p / g.target, 0, 1) * 100 : 0;
  const si = seasonInfo();
  const weeksLeft = Math.max(1, (si.total - si.dayNum) / 7);
  const need = Math.max(0, g.target - s.p);
  return `<div class="goal" style="--i:${i}">
    <div class="g-top"><div class="swatch" style="background:${g.color}">${esc((g.name[0] || '?').toUpperCase())}</div>
      <div class="grow"><h3>${esc(g.name)}</h3>${g.why ? `<p class="muted" style="font-size:12.5px">${esc(g.why)}</p>` : ''}</div>
      <span class="chip status-${s.key}">${s.label}</span></div>
    <div><span class="g-num" data-count="${s.p}" data-fmt="dec">${s.p}</span> <span class="muted">/ ${g.target} ${esc(unitOf(g))}</span></div>
    <div class="progress-bar"><i style="width:${pct}%;background:${g.color}"></i></div>
    <p class="muted" style="font-size:12.5px">${need > 0 ? `About ${round1(need / weeksLeft)} ${esc(unitOf(g))} a week to finish on time.` : 'Target hit. Raise the bar?'} ${esc(METRICS[g.metric].label)}${g.metric === 'calendar' && g.keyword ? ` ("${esc(g.keyword)}")` : ''}.</p>
    ${(() => { const ps = ((latestReview(8) || {}).priorities || []).filter(p => p.goalId === g.id); return ps.length ? `<p class="g-prio">This week: ${ps.map(p => (p.done ? '✓ ' : '') + esc(p.title)).join(' · ')}</p>` : ''; })()}
    <div class="g-actions">
      <button class="btn sm" data-act="log-goal" data-goal="${g.id}">${icon('plus')}Log progress</button>
      <button class="btn sm ghost" data-act="edit-goal" data-goal="${g.id}">${icon('edit')}Edit</button>
    </div>
  </div>`;
}

function recommendations(goals) {
  const out = [];
  const si = seasonInfo();
  const weeksLeft = Math.max(1, (si.total - si.dayNum) / 7);
  for (const g of goals) {
    const s = goalStatus(g);
    if (s.key === 'off' || s.key === 'adjust') {
      const need = round1((goalTarget(g) - s.p) / weeksLeft);
      out.push({ goalId: g.id, color: g.color, title: `${g.name} is ${s.key === 'off' ? 'off track' : 'slipping'}`, text: `You are at ${s.p} of ${goalTarget(g)} ${unitOf(g)}. To finish by ${dayName(si.end, { day: 'numeric', month: 'short' })} you need about ${need} ${unitOf(g)} a week. Put one small step for it in today's targets.`, action: 'rec-target', actionLabel: 'Add to today' });
    }
  }
  const fm = sum(range(addDays(todayStr(), -6), todayStr()), focusMinOn);
  if (goals.length && fm < 120 && si.dayNum > 3) out.push({ color: '#FF4F1F', title: 'Protect time for deep work', text: `Only ${fmtMin(fm)} of focus in the last 7 days. Book a 50 minute block for your top goal tomorrow morning.`, action: null });
  const sl = weekStats(addDays(todayStr(), -6), todayStr()).sleep;
  if (sl !== null && sl < 6.5) out.push({ color: '#0E9AA7', title: 'Sleep is holding you back', text: `You averaged ${sl} hours of sleep this week. Energy drives everything else: aim for a fixed wind-down time tonight.`, action: null });
  return out.slice(0, 4);
}

function seasonChart(goals) {
  const si = seasonInfo();
  const W = 760, H = 250, L = 44, R = 16, T = 16, B = 30;
  const weeks = D.season.weeks;
  const x = (w) => L + (w / weeks) * (W - L - R);
  const series = goals.map(g => {
    const pts = [[0, 0]];
    for (let w = 1; w <= Math.min(si.week, weeks); w++) {
      const until = w === si.week ? todayStr() : addDays(D.season.start, w * 7 - 1);
      pts.push([w === si.week ? si.dayNum / 7 : w, 100 * goalProgress(g, until) / goalTarget(g)]);
    }
    const last = pts[pts.length - 1];
    const proj = si.dayNum >= 7 ? clamp(last[1] / (last[0] / weeks), 0, 160) : null;
    return { g, pts, proj, last };
  });
  const maxY = Math.max(100, ...series.map(s => Math.max(s.last[1], s.proj || 0)));
  const yMax = Math.ceil(maxY / 25) * 25;
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  const grid = [0, 25, 50, 75, 100].filter(v => v <= yMax).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--mist)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}%</text>`).join('');
  const xl = Array.from({ length: weeks }, (_, i) => `<text x="${x(i + 0.5)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${i + 1 === si.week ? 'var(--ink)' : 'var(--ink-3)'}" font-weight="${i + 1 === si.week ? 700 : 400}">w${i + 1}</text>`).join('');
  const todayX = x(si.dayNum / 7);
  const lines = series.map((s, i) => {
    const d = s.pts.map((p, j) => (j ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
    const lx = x(s.last[0]), ly = y(s.last[1]);
    return `<path class="draw" pathLength="1" style="animation-delay:${i * 150}ms" d="${d}" fill="none" stroke="${s.g.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${s.proj !== null ? `<path class="fade-late" d="M${lx} ${ly} L${x(weeks)} ${y(s.proj)}" stroke="${s.g.color}" stroke-width="2" stroke-dasharray="4 5" opacity=".6"/>` : ''}
      <circle class="dot-pop" style="animation-delay:${1100 + i * 150}ms" cx="${lx}" cy="${ly}" r="5" fill="${s.g.color}" stroke="var(--surface)" stroke-width="2"/>`;
  }).join('');
  const hits = Array.from({ length: weeks }, (_, i) => {
    const w = i + 1;
    const tip = w > si.week ? `Week ${w}: ahead of you` : `Week ${w}` + series.map(s => { const p = s.pts.find(pp => Math.ceil(pp[0]) === w); return p ? ` · ${s.g.name} ${Math.round(p[1])}%` : ''; }).join('');
    return `<rect x="${x(i)}" y="${T}" width="${x(1) - x(0)}" height="${H - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Season progress by goal">
    ${grid}${xl}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(weeks)}" y2="${y(100)}" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="2 4"/>
    <text x="${x(weeks) - 6}" y="${y(100) + 16}" text-anchor="end" font-size="11" fill="var(--ink-3)">Pace to finish</text>
    <line x1="${todayX}" x2="${todayX}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3" opacity=".5"/>
    <text x="${todayX}" y="${T - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">Today</text>
    ${lines}${hits}
  </svg>
  <div class="chart-legend">${series.map(s => { const st = goalStatus(s.g); return `<span><i style="background:${s.g.color}"></i><b>${esc(s.g.name)}</b><span class="chip status-${st.key}">${st.label}</span></span>`; }).join('')}<span><i style="background:var(--ink-3)"></i>Pace to finish</span></div>`;
}

// ---------- Generic bar chart (bars grow up on entry) ----------
function barChart(data, { color = '#FF6B4A', unit = '', height = 160, fmt = (v) => round1(v) + unit } = {}) {
  const W = 520, H = height, L = 40, R = 8, T = 12, B = 24;
  const max = Math.max(1e-9, ...data.map(d => d.value));
  const nice = (() => { if (max <= 0) return 1; const steps = [1, 2, 2.5, 5, 10]; const mag = Math.pow(10, Math.floor(Math.log10(max))); for (const s of steps) if (s * mag >= max) return s * mag; return 10 * mag; })();
  const bw = (W - L - R) / data.length;
  const y = (v) => T + (1 - v / nice) * (H - T - B);
  const bar = (x0, w, v) => {
    const top = y(v), base = y(0), r = Math.min(4, w / 2, base - top);
    if (v <= 0) return '';
    return `M${x0} ${base} L${x0} ${top + r} Q${x0} ${top} ${x0 + r} ${top} L${x0 + w - r} ${top} Q${x0 + w} ${top} ${x0 + w} ${top + r} L${x0 + w} ${base} Z`;
  };
  const grid = [0, nice / 2, nice].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--mist)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--ink-3)">${fmt(v)}</text>`).join('');
  const bars = data.map((d, i) => {
    const w = Math.min(36, bw * 0.62), x0 = L + i * bw + (bw - w) / 2;
    return `<path class="bar" style="animation-delay:${i * 45}ms" d="${bar(x0, w, d.value)}" fill="${d.color || color}"/>
      <text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--ink-3)">${esc(d.label)}</text>
      <rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-tip="${esc(d.tip || `${d.label}: ${fmt(d.value)}`)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}${bars}</svg>`;
}

// ---------- FITNESS ----------
function viewFitness(tabs = '') {
  const t = todayStr();
  const ws = weekStart(t);
  const thisWeek = D.workouts.filter(w => w.date >= ws && w.date <= t);
  const activeDays = new Set(thisWeek.map(w => w.date)).size;
  const monthKey = t.slice(0, 7);
  const kmMonth = round1(sum(D.workouts.filter(w => w.type === 'run' && w.date.startsWith(monthKey)), w => w.distance));
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const s = addDays(ws, -7 * i), e = addDays(s, 6);
    const list = D.workouts.filter(w => w.date >= s && w.date <= e);
    const mins = sum(list, w => w.minutes);
    const runs = list.filter(w => w.type === 'run');
    const km = round1(sum(runs, w => w.distance));
    const rmin = sum(runs, w => w.minutes);
    const lab = parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    weeks.push({ label: i % 2 ? '' : lab, mins, km, tipM: `Week of ${lab}: ${fmtMin(mins)} active, ${list.length} workouts`, tipK: `Week of ${lab}: ${km} km over ${runs.length} runs${km ? `, avg pace ${paceStr(rmin, km)}` : ''}` });
  }
  const allW = D.workouts.slice().sort((a, b) => (b.date + (b.at || '')).localeCompare(a.date + (a.at || '')));
  const recent = UI.allWorkouts ? allW : allW.slice(0, 8);
  const last14 = range(addDays(t, -13), t);
  const hasWell = last14.some(d => wellnessOn(d));
  const ivOn = !!D.settings.intervalsKey;
  const w7 = weekStats(addDays(t, -6), t);
  const lastRhr = last14.slice().reverse().map(d => wellnessOn(d) && wellnessOn(d).restingHR).find(Boolean);
  const rd = readiness(t);
  const tips = fitnessSuggestions(t);
  return `
  <div class="view-head"><div><h1>Health</h1><p class="sub">${rd ? 'Train with your body, not against it.' : ivOn ? 'Your workouts arrive from intervals.icu and Health Connect.' : 'Every session counts.'}</p></div>
    <div class="row wrap">${tabs}${ivOn ? `<button class="btn ghost" data-act="iv-sync">${icon('sync', 'class="' + (IVSYNC.busy ? 'spinning' : '') + '"')}Sync</button>` : `<button class="btn" data-act="iv-connect">${icon('pulse')}Connect intervals.icu</button>`}
    <button class="btn primary" data-act="log-workout">${icon('plus')}Log workout</button></div></div>
  ${typeof whoopRow === 'function' ? whoopRow(t) : ''}
  ${rd ? `<div class="ready-wrap">
    <section class="ready band-${rd.band.key}">
      ${readyRing(rd.score, rd.band.color)}
      <div class="ready-txt"><span class="eyebrow">Recovery today</span><h2>${rd.band.label}</h2><p>${rd.band.advice}</p>
        <div class="ready-parts">${rd.parts.map(p => `<div class="rp"><span>${p.label}</span><i><b style="width:${p.v}%;background:${p.v >= 70 ? 'var(--on)' : p.v >= 45 ? 'var(--adjust)' : 'var(--off)'}"></b></i><em>${esc(p.note)}</em></div>`).join('')}</div></div>
    </section>
    <section class="panel tips"><h3>What to do about it</h3>
      ${tips.map((s, i) => `<div class="tip-row" style="--i:${i}"><span class="tip-ic" style="color:${s.color}">${icon(s.icon)}</span><div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div></div>`).join('')}
    </section>
  </div>
  <section class="panel" style="margin-bottom:18px"><div class="panel-head"><h3>Recovery, last 14 days</h3><span class="muted" style="font-size:12px">Higher is fresher</span></div>
    ${barChart(last14.map(d => { const r = readiness(d); return { label: parseDay(d).getDate() + '', value: r ? r.score : 0, color: r ? r.band.color : '#E3E5EE', tip: `${shortDay(d)}: ${r ? r.score + ', ' + r.band.label.toLowerCase() : 'no data'}` }; }), { height: 130 })}
  </section>` : hasWell ? '' : `<section class="panel ready-empty"><div class="empty-art">${icon('heart')}</div><h3>Get a daily readiness score</h3><p class="muted">Connect intervals.icu (with your Amazfit synced to it) or log your sleep in the morning check-in. Ascend turns sleep, HRV, resting heart rate and training load into one score with advice for the day.</p></section>`}
  <div class="stat-row">
    <div class="stat accent"><b><span data-count="${activeDays}">${activeDays}</span>/7</b><span>active days this week</span></div>
    <div class="stat"><b data-count="${sum(thisWeek, w => w.minutes)}" data-fmt="min">${fmtMin(sum(thisWeek, w => w.minutes))}</b><span>active this week</span></div>
    <div class="stat"><b><span data-count="${kmMonth}" data-fmt="dec">${kmMonth}</span> km</b><span>run this month</span></div>
  </div>
  ${hasWell ? `<section class="panel recovery" style="margin-bottom:18px">
    <div class="panel-head"><h3>Sleep and steps</h3><span class="muted" style="font-size:12px">7 day average: ${w7.sleep !== null ? w7.sleep + 'h sleep' : ''}${w7.steps !== null ? ' · ' + w7.steps.toLocaleString() + ' steps' : ''}${lastRhr ? ' · resting HR ' + lastRhr : ''}</span></div>
    <div class="grid g-2">
      <div><h4 class="chart-title">Sleep, last 14 days</h4>${barChart(last14.map(d => ({ label: parseDay(d).getDate() + '', value: wellnessOn(d) && wellnessOn(d).sleepSecs ? round1(wellnessOn(d).sleepSecs / 3600) : 0, tip: `${shortDay(d)}: ${wellnessOn(d) && wellnessOn(d).sleepSecs ? fmtMin(wellnessOn(d).sleepSecs / 60) + ' sleep' + (wellnessOn(d).sleepScore ? `, score ${wellnessOn(d).sleepScore}` : '') : 'no data'}` })), { color: '#8B4C9E', unit: 'h', height: 140 })}</div>
      <div><h4 class="chart-title">Steps, last 14 days</h4>${barChart(last14.map(d => ({ label: parseDay(d).getDate() + '', value: (wellnessOn(d) && wellnessOn(d).steps) || 0, tip: `${shortDay(d)}: ${((wellnessOn(d) && wellnessOn(d).steps) || 0).toLocaleString()} steps` })), { color: '#0E9AA7', height: 140, fmt: (v) => v >= 1000 ? round1(v / 1000) + 'k' : String(Math.round(v)) })}</div>
    </div>
  </section>` : ''}
  <div class="grid g-2" style="margin-bottom:18px">
    <section class="panel"><div class="panel-head"><h3>Active minutes per week</h3></div>${barChart(weeks.map(w => ({ label: w.label, value: w.mins, tip: w.tipM })), { color: '#FF6B4A' })}</section>
    <section class="panel"><div class="panel-head"><h3>Kilometres run per week</h3></div>${barChart(weeks.map(w => ({ label: w.label, value: w.km, tip: w.tipK })), { color: '#8B4C9E' })}</section>
  </div>
  <section class="panel">
    <div class="panel-head"><h3>${UI.allWorkouts ? `All workouts (${allW.length})` : 'Recent workouts'}</h3>${ivOn && D.sync.intervalsAt ? `<span class="muted" style="font-size:12px">synced ${ago(D.sync.intervalsAt)}</span>` : ''}</div>
    <div class="w-list">${recent.map((w, i) => { const ty = wType(w.type); return `<div class="w-item" style="--i:${i}"><div class="w-badge" style="background:${ty.color}1A;color:${ty.color}">${icon(ty.icon)}</div>
      <div class="grow"><b>${esc(w.name || ty.label)}${w.distance ? ` · ${w.distance} km` : ''}</b> ${w.source === 'intervals' ? '<span class="src-badge">intervals.icu</span>' : w.source === 'hc' ? '<span class="src-badge">Health Connect</span>' : ''}<div class="muted" style="font-size:12.5px">${shortDay(w.date)} · ${fmtMin(w.minutes)}${w.distance && w.type === 'run' ? ' · ' + paceStr(w.minutes, w.distance) : ''}${w.avgHr ? ' · ' + w.avgHr + ' bpm' : ''}${w.load ? ' · load ' + w.load : ''}${w.effort ? ' · effort ' + w.effort + '/5' : ''}${w.notes ? ' · ' + esc(w.notes) : ''}</div></div>
      <button class="icon-btn" data-act="del-workout" data-id="${w.id}" title="Remove from Ascend">${icon('trash')}</button></div>`; }).join('') || `<div class="empty"><div class="empty-art">${icon('run')}</div><h3>No workouts yet</h3><p>Log today's walk, run or gym session, or connect intervals.icu to bring in your Amazfit workouts.</p><button class="btn primary" data-act="log-workout">${icon('plus')}Log workout</button></div>`}</div>
    ${allW.length > 8 ? `<button class="btn ghost more-btn" data-act="toggle-all-workouts">${UI.allWorkouts ? 'Show fewer' : `Show all ${allW.length} workouts`}</button>` : ''}
  </section>`;
}
function readyRing(score, color) {
  const C = 2 * Math.PI * 52;
  return `<div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="10"/>
    <circle class="ring-arc" cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}" style="--c:${C}"/></svg>
    <div class="ring-num"><b data-count="${score}">${score}</b><span>of 100</span></div></div>`;
}
function paceStr(min, km) { if (!km) return ''; const p = min / km; return `${Math.floor(p)}:${pad(Math.round((p % 1) * 60) % 60)} /km`; }

function workoutModal() {
  let type = 'run', effort = 3;
  const m = modal(`<h2>Log a workout</h2><p class="sub">Every session counts toward your streak.</p>
    <form>
      <div class="field"><label>Type</label><div class="type-picker">${WORKOUT_TYPES.map(t => `<button type="button" data-type="${t.id}" class="${t.id === type ? 'on' : ''}">${icon(t.icon, 'style="width:14px;height:14px"')}${t.label}</button>`).join('')}</div></div>
      <div class="row"><div class="field grow"><label>Date</label><input class="input" type="date" name="date" value="${todayStr()}" max="${todayStr()}"></div>
      <div class="field grow"><label>Minutes</label><input class="input" type="number" name="minutes" min="1" max="600" value="30" required></div>
      <div class="field grow" id="distField"><label>Distance (km)</label><input class="input" type="number" name="distance" step="0.01" min="0" placeholder="5"></div></div>
      <div class="field"><label>Effort</label><div class="seg" id="effortSeg">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-effort="${n}" class="${n === 3 ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="field"><label>Notes</label><input class="input" name="notes" placeholder="Felt strong on the hills" maxlength="140"></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save workout</button></div>
    </form>`);
  m.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-type]');
    if (tb) { type = tb.dataset.type; $$('[data-type]', m).forEach(b => b.classList.toggle('on', b === tb)); $('#distField', m).style.visibility = wType(type).distance ? 'visible' : 'hidden'; }
    const eb = e.target.closest('[data-effort]');
    if (eb) { effort = Number(eb.dataset.effort); $$('[data-effort]', m).forEach(b => b.classList.toggle('on', b === eb)); }
  });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    D.workouts.push({ id: uid(), date: f.get('date') || todayStr(), at: new Date().toISOString(), type, minutes: Number(f.get('minutes')) || 0, distance: wType(type).distance ? Number(f.get('distance')) || 0 : 0, effort, notes: String(f.get('notes') || '').trim() });
    save(); closeModal(); burst(); chime('start'); toast(`${wType(type).label} logged. Streak is alive.`);
    rerender(); checkStreakMilestone();
  });
}

// ---------- JOURNAL ----------
function journalEntries() { return Object.entries(D.journal).filter(([, e]) => e && (e.saved || e.win || e.freewrite)).sort((a, b) => b[0].localeCompare(a[0])); }
const JOURNAL_Q = 'What was good today? What could have gone better, and how will you improve it? What progress did you make?';
// One flowing piece of writing per day. Entries from before 1.3.4 kept separate answers: join them into paragraphs.
function journalText(j) {
  const old = [j.win, j.blocker, j.grateful && 'Grateful for ' + j.grateful.replace(/^grateful for\s*/i, ''), j.tomorrow && 'Tomorrow: ' + j.tomorrow, j.matters].filter(Boolean);
  return [...old, j.freewrite].filter(Boolean).join('\n\n');
}
function viewJournal() {
  const count = journalEntries().length + Object.values(D.reviews).filter(r => r && r.at).length;
  const due = !reviewedThisWeek() && new Date().getDay() === Number(D.settings.weeklyDay);
  const tab = UI.jtab || 'write';
  const tabs = `<div class="seg big-seg" id="jtab"><button data-jtab="write" class="${tab === 'write' ? 'on' : ''}">Write</button><button data-jtab="review" class="${tab === 'review' ? 'on' : ''}">Weekly review${due ? ' <i class="seg-dot"></i>' : ''}</button><button data-jtab="history" class="${tab === 'history' ? 'on' : ''}">History${count ? ` · ${count}` : ''}</button></div>`;
  return tab === 'history' ? journalHistory(tabs) : tab === 'review' ? viewReview(tabs) : journalWrite(tabs);
}

function journalHistory(tabs) {
  const all = journalEntries();
  const moods = all.map(([, e]) => e.mood).filter(Boolean);
  const month = todayStr().slice(0, 7);
  const T = todayStr(), start = addDays(weekStart(T), -28);
  const cells = range(start, addDays(start, 34)).map((d, i) => { const e = D.journal[d]; const cls = e && e.saved ? 'j' : ''; return `<div class="${cls} ${d === T ? 'today' : ''}" ${d <= T ? `data-act="j-open" data-d="${d}"` : ''} style="--i:${i};${d > T ? 'opacity:.35' : ''}" data-tip="${esc(shortDay(d) + (e && e.saved ? ' · journaled' + (e.mood ? ', feeling ' + MOODS[e.mood - 1].label.toLowerCase() : '') : d > T ? '' : ' · no entry, click to write'))}"></div>`; });
  const jStreak = (() => { let s = 0, d = (D.journal[T] && D.journal[T].saved) ? T : addDays(T, -1); while (D.journal[d] && D.journal[d].saved) { s++; d = addDays(d, -1); } return s; })();
  return `
  <div class="view-head"><div><h1>Journal</h1><p class="sub">${all.length ? `${all.length} entries · ${all.filter(([d]) => d.startsWith(month)).length} this month${moods.length ? ` · average mood ${MOODS[Math.round(mean(moods)) - 1].label.toLowerCase()}` : ''}` : 'Your reflections will collect here.'}</p></div>${tabs}</div>
  <section class="panel j-heat">
    <div class="panel-head"><h3>Last 5 weeks</h3><span class="chip">${icon('flame', 'style="width:12px;height:12px;color:var(--ember)"')} ${jStreak} day streak</span></div>
    <div class="heat-labels">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="heat">${cells.join('')}</div>
  </section>
  <div class="j-tools">
    <input class="input" id="jSearch" placeholder="Search your entries" value="${esc(UI.jq || '')}" autocomplete="off">
    <div class="seg" id="jFilter">${[['all', 'All'], ['good', 'Good days'], ['low', 'Hard days'], ['weeks', 'Weekly reviews']].map(([k, l]) => `<button data-jfilter="${k}" class="${(UI.jfilter || 'all') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>
  <div id="jlist">${journalListHTML()}</div>`;
}

function journalListHTML() {
  const q = (UI.jq || '').toLowerCase().trim(); const f = UI.jfilter || 'all';
  if (f === 'weeks') return reviewListHTML(q);
  const list = journalEntries().filter(([, e]) => {
    if (f === 'good' && !(e.mood >= 4)) return false;
    if (f === 'low' && !(e.mood && e.mood <= 2)) return false;
    return !q || ['win', 'blocker', 'grateful', 'tomorrow', 'freewrite', 'matters'].some(k => String(e[k] || '').toLowerCase().includes(q));
  });
  if (!list.length) return `<div class="empty"><p>${q || f !== 'all' ? 'No entries match.' : 'Nothing here yet. Write your first reflection tonight.'}</p></div>`;
  const shown = list.slice(0, UI.jlimit || 30);
  let html = '', lastMonth = '';
  shown.forEach(([d, e], i) => {
    const m = d.slice(0, 7);
    if (m !== lastMonth) { if (lastMonth) html += '</div>'; html += `<h3 class="j-month">${parseDay(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><div class="j-grid">`; lastMonth = m; }
    html += journalCard(d, e, i);
  });
  html += '</div>';
  if (list.length > shown.length) html += `<button class="btn more-btn" data-act="j-more">Show ${Math.min(30, list.length - shown.length)} more of ${list.length - shown.length}</button>`;
  return html;
}

// Closed weeks live in History, newest first
function reviewListHTML(q = '') {
  const list = Object.entries(D.reviews).filter(([, r]) => r && r.at).sort((a, b) => b[0].localeCompare(a[0]))
    .filter(([, r]) => !q || ['win', 'struggle', 'lesson', 'stop'].some(k => String(r[k] || '').toLowerCase().includes(q)) || (r.priorities || []).some(p => p.title.toLowerCase().includes(q)));
  if (!list.length) return `<div class="empty"><p>${q ? 'No reviews match.' : 'Your closed weeks will collect here.'}</p></div>`;
  const cur = (latestReview(6) || {}).key;
  return `<div class="j-grid">${list.map(([k, r], i) => { const ws = weekStats(addDays(k, -6), k); return `<article class="je ${UI.jopen === 'r' + k ? 'open' : ''}" data-rkey="${k}" style="--i:${i % 12};--mc:var(--violet)">
    <header data-act="r-toggle"><div><b>Week to ${dayName(k, { weekday: 'short', day: 'numeric', month: 'short' })}</b><span class="muted">${round1(ws.focusMin / 60)}h focus · ${ws.workouts} workouts${ws.sleep !== null ? ` · ${ws.sleep}h sleep` : ''}</span></div>
      <span class="je-tags">${r.rating ? `<span class="chip">${WEEKRATE[r.rating - 1]}</span>` : ''}</span></header>
    <div class="je-body"><p class="je-text">${esc([r.win && 'Win: ' + r.win, r.struggle && 'Did not go well: ' + r.struggle, r.lesson && 'Lesson: ' + r.lesson, r.stop && 'Stop doing: ' + r.stop, (r.priorities || []).length && 'Priorities: ' + r.priorities.map(p => (p.done ? '✓ ' : '✗ ') + p.title).join(', ')].filter(Boolean).join('\n\n'))}</p></div>
    <footer><button class="btn ghost sm" data-act="r-toggle">${UI.jopen === 'r' + k ? 'Show less' : 'Read'}</button>${k === cur ? `<button class="btn ghost sm" data-act="r-edit">${icon('edit')}Edit</button>` : ''}</footer>
  </article>`; }).join('')}</div>`;
}

function journalCard(d, e, i) {
  const mood = e.mood ? MOODS[e.mood - 1] : null;
  const dd = D.days[d];
  const stats = [dd && dd.targets.length ? `${dd.targets.filter(x => x.done).length}/${dd.targets.length} targets` : '', focusMinOn(d) ? fmtMin(focusMinOn(d)) + ' focus' : '', sleepHours(d) ? sleepHours(d) + 'h sleep' : ''].filter(Boolean).join(' · ');
  return `<article class="je ${UI.jopen === d ? 'open' : ''}" data-jdate="${d}" style="--i:${i % 12};--mc:${mood ? mood.c : 'var(--mist)'}">
    <header data-act="j-toggle"><div><b>${dayName(d, { weekday: 'long', day: 'numeric', month: 'short' })}</b>${stats ? `<span class="muted">${stats}</span>` : ''}</div>
      <span class="je-tags">${mood ? `<span class="chip" style="background:${mood.c}1F;color:${mood.c}">${mood.label}</span>` : ''}</span></header>
    <div class="je-body"><p class="je-text">${esc(journalText(e))}</p></div>
    <footer><button class="btn ghost sm" data-act="j-toggle">${UI.jopen === d ? 'Show less' : 'Read'}</button><button class="btn ghost sm" data-act="j-edit">${icon('edit')}Edit</button><button class="btn ghost sm" data-act="j-copy">${icon('copy')}Copy</button>${e.notionLink ? `<button class="btn ghost sm" data-act="j-notion">${icon('external')}Notion</button>` : ''}</footer>
  </article>`;
}

function journalWrite(tabs) {
  const t = UI.jdate || todayStr();
  const isToday = t === todayStr();
  const j = D.journal[t] || {};
  const dd = D.days[t] || { targets: [] };
  const text = journalText(j);
  // What actually happened, so "what progress did you make?" has something to answer from
  const progress = activeGoals().map(g => {
    const f = sum(sessionsOn(t).filter(s => s.goalId === g.id), s => s.minutes);
    const tg = dd.targets.filter(x => x.goalId === g.id);
    const parts = [];
    if (f) parts.push(fmtMin(f) + ' focus');
    if (tg.length) parts.push(`${tg.filter(x => x.done).length}/${tg.length} targets`);
    if (g.metric === 'km') { const km = round1(sum(workoutsOn(t).filter(w => w.type === 'run'), w => w.distance)); if (km) parts.push(km + ' km'); }
    if (g.metric === 'workouts' && workoutsOn(t).length) parts.push(workoutsOn(t).length + ' workout');
    return parts.length ? `<span class="chip"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}: ${parts.join(' · ')}</span>` : '';
  }).filter(Boolean);
  return `
  <div class="view-head"><div><h1>Journal</h1><p class="sub">${dayName(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>${tabs}</div>
  ${!isToday ? `<div class="carry"><p><b>Editing ${dayName(t)}.</b> Changes save to that day.</p><button class="btn sm" data-act="j-today">Back to today</button></div>` : ''}
  <section class="panel j-write">
    <form data-form="journal">
      <div class="j-meta"><span class="muted">${dd.targets.filter(x => x.done).length}/${dd.targets.length} targets · ${fmtMin(focusMinOn(t))} focused${workoutsOn(t).length ? ` · ${workoutsOn(t).length} workout${workoutsOn(t).length === 1 ? '' : 's'}` : ''}${sleepHours(t) ? ` · slept ${sleepHours(t)}h` : ''}</span>${j.saved ? '<span class="chip status-on">Saved</span>' : ''}</div>
      <div class="mood">${MOODS.map(m => `<button type="button" data-mood="${m.v}" class="${j.mood === m.v ? 'on' : ''}"><span class="m-bar" style="background:${m.c}"></span>${m.label}</button>`).join('')}</div>
      <p class="j-question">${esc(JOURNAL_Q)}</p>
      ${progress.length ? `<div class="j-progress">${progress.join('')}</div>` : ''}
      <textarea class="input freewrite" name="freewrite" id="freewrite" placeholder="Just write. Start anywhere.">${esc(text)}</textarea>
      <div class="row wrap j-actions">
        <span class="muted" style="font-size:12px;margin-right:auto" id="wordCount">${wordCount(text)} words</span>
        ${D.settings.notionUrl ? `<button type="button" class="btn ghost" data-act="open-notion">${icon('external')}Notion</button>` : ''}
        <button type="button" class="btn ghost" data-act="copy-notion">${icon('copy')}Copy</button>
        <button class="btn primary" type="submit">${icon('check')}Save</button>
      </div>
    </form>
  </section>`;
}
const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;

// Reads like a journal: one quiet line about the day, then the writing. The date is the Notion page title.
function journalMarkdown(date = todayStr()) {
  const j = D.journal[date] || {};
  const dd = D.days[date] || { targets: [] };
  const w = workoutsOn(date);
  const day = [j.mood ? 'Feeling ' + MOODS[j.mood - 1].label.toLowerCase() : '', dd.targets.length ? `${dd.targets.filter(x => x.done).length}/${dd.targets.length} targets` : '',
    focusMinOn(date) ? fmtMin(focusMinOn(date)) + ' focus' : '', w.map(x => (x.name || wType(x.type).label) + (x.distance ? ' ' + x.distance + ' km' : '')).join(', '), sleepHours(date) ? `slept ${sleepHours(date)}h` : ''].filter(Boolean);
  const lines = [`## ${dayName(date)}`, ''];
  if (day.length) lines.push(day.join(' · '), '');
  lines.push(journalText(j));
  return lines.join('\n');
}

// ---------- WEEKLY REVIEW ----------
function reviewKey() {
  const lr = latestReview(6);
  return lr ? lr.key : todayStr();
}
function viewReview(tabs = '') {
  const key = reviewKey();
  const rv = D.reviews[key] || {};
  // Once the week is closed the form steps aside: the review moves to History until next week's is due
  if (rv.at && !UI.reviewEdit) return reviewDone(tabs, key, rv);
  const from = addDays(key, -6);
  const ws = weekStats(from, key);
  const prev = Object.keys(D.reviews).filter(k => k < key).sort().pop();
  const prevPr = prev ? (D.reviews[prev].priorities || []) : [];
  UI.rate = UI.rate || rv.rating || 0;
  const pr = rv.priorities || [];
  const goals = activeGoals();
  const days = ws.days.map(d => ({ label: parseDay(d).toLocaleDateString(undefined, { weekday: 'short' }), value: round1(focusMinOn(d) / 60), tip: `${shortDay(d)}: ${fmtMin(focusMinOn(d))} focus, ${(D.days[d] || { targets: [] }).targets.filter(x => x.done).length} targets done, ${workoutsOn(d).length} workouts` }));
  const allPast = Object.entries(D.reviews).filter(([k]) => k !== key).sort((a, b) => b[0].localeCompare(a[0]));
  const past = UI.allReviews ? allPast : allPast.slice(0, 4);
  const tile = (val, fmt, label, cls = '') => `<div class="stat ${cls}"><b>${val === null ? '–' : `<span data-count="${val}" data-fmt="${fmt}">${val}</span>`}${fmt === 'dec' && label.includes('sleep') && val !== null ? 'h' : ''}</b><span>${label}</span></div>`;
  return `
  <div class="view-head"><div><h1>Journal</h1><p class="sub">Weekly review · ${dayName(from, { weekday: 'short', day: 'numeric', month: 'short' })} to ${dayName(key, { weekday: 'short', day: 'numeric', month: 'short' })}. Close the week honestly, then set three priorities for the next one.</p></div>
    ${tabs}</div>
  <section class="review-hero">
    <div class="rh-glow"></div>
    <div class="stat-row">
      ${tile(round1(ws.focusMin / 60), 'dec', 'focus hours', 'accent')}
      ${tile(ws.total ? Math.round(100 * ws.done / ws.total) : 0, 'pct', `targets done (${ws.done}/${ws.total})`)}
      ${tile(ws.workouts, 'int', `workouts · ${ws.km} km run`)}
      ${tile(ws.journalDays, 'int', `journal days · ${ws.checkins} check-ins`)}
    </div>
    <div class="grid g-2">
      <div class="panel"><h4 class="chart-title">Focus by day</h4>${barChart(days, { color: '#FF6B4A', unit: 'h', height: 140 })}</div>
      <div class="panel">
        <h4 class="chart-title">Goals this week</h4>
        ${goals.map(g => { const lvl = isLevel(g), delta = round1(goalProgress(g, key, from)); const s = goalStatus(g); return `<div class="g-week"><span class="dot" style="background:${g.color}"></span><b class="grow">${esc(g.name)}</b><span class="muted">${lvl ? (s.p ?? '–') : '+' + delta} ${esc(unitOf(g))}</span><span class="chip status-${s.key}">${s.label}</span></div>`; }).join('') || '<p class="muted">No goals yet.</p>'}
        <div class="row" style="gap:16px;margin-top:10px;flex-wrap:wrap">${ws.mood !== null ? `<span class="muted">Avg mood <b style="color:var(--ink)">${ws.mood}/5</b></span>` : ''}${ws.sleep !== null ? `<span class="muted">Avg sleep <b style="color:var(--ink)">${ws.sleep}h</b></span>` : ''}</div>
        ${prevPr.length ? `<div class="prev-prio"><span class="muted">Last week's priorities: ${prevPr.filter(p => p.done).length}/${prevPr.length} done</span>${prevPr.map(p => `<span class="chip ${p.done ? 'status-on' : 'status-off'}">${p.done ? '✓' : '✗'} ${esc(p.title)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>
  <div class="grid g-main" style="margin-top:18px">
    <section class="panel">
      <form data-form="review">
        <div class="field"><label>How was your week?</label><div class="seg wide" data-rate>${WEEKRATE.map((l, i) => `<button type="button" data-v="${i + 1}" class="${UI.rate === i + 1 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="field"><label>Biggest win</label><textarea class="input" name="win" placeholder="What are you proud of this week?">${esc(rv.win || '')}</textarea></div>
        <div class="field"><label>What did not go well, and why?</label><textarea class="input" name="struggle" placeholder="Look at the numbers above. What pattern do you see?">${esc(rv.struggle || '')}</textarea></div>
        <div class="row"><div class="field grow"><label>Lesson to carry forward</label><input class="input" name="lesson" value="${esc(rv.lesson || '')}"></div>
        <div class="field grow"><label>One thing to stop doing</label><input class="input" name="stop" value="${esc(rv.stop || '')}"></div></div>
        <div class="row"><div class="field grow"><label>Biggest obstacle next week</label><input class="input" name="obstacle" value="${esc(rv.obstacle || '')}" maxlength="120" placeholder="ward duty runs late on Thursday"></div>
        <div class="field grow"><label>If it happens, I will…</label><input class="input" name="ifthen" value="${esc(rv.ifthen || '')}" maxlength="120" placeholder="do 30 questions before bed instead of 60"></div></div>
        <div class="field"><label>Next week's top 3 priorities</label>
          ${[0, 1, 2].map(i => `<div class="ci-row"><span class="ci-num">${i + 1}</span><input class="input grow" name="p${i}" value="${esc(pr[i] ? pr[i].title : '')}" placeholder="${['The one that matters most', 'Second priority', 'Health, learning or relationships'][i]}" maxlength="120"><select class="input" name="pg${i}" style="width:160px" title="The goal it moves">${goalOptions(pr[i] ? pr[i].goalId || '' : '')}</select></div>`).join('')}
          <span class="hint">${gEnabled() && D.settings.googleTasks ? 'These go to Google Tasks, due in 7 days, and show on your Today screen all week.' : 'These show on your Today screen all week.'}</span></div>
        <div class="row wrap" style="justify-content:flex-end;gap:8px">
          ${UI.reviewEdit ? `<button type="button" class="btn ghost" data-act="r-cancel" style="margin-right:auto">Cancel</button>` : ''}
          <button type="button" class="btn" data-act="copy-review">${icon('copy')}Copy for Notion</button>
          <button class="btn primary shine big" type="submit">${icon('check')}${rv.at ? 'Update review' : 'Close the week'}</button>
        </div>
      </form>
    </section>
    <div class="grid" style="align-content:start">
      ${typeof lifeBalanceMini === 'function' ? lifeBalanceMini(from, key) : ''}
      ${typeof insightsPanel === 'function' ? insightsPanel() : ''}
      ${allPast.length ? `<button class="btn ghost" data-act="r-history">${icon('journal')}Past reviews in History</button>` : ''}
    </div>
  </div>`;
}

function reviewDone(tabs, key, rv) {
  const next = addDays(key, 7), pr = rv.priorities || [];
  return `
  <div class="view-head"><div><h1>Journal</h1><p class="sub">This week is closed. Your next review opens on ${dayName(next, { weekday: 'long', day: 'numeric', month: 'short' })}.</p></div>${tabs}</div>
  <div class="grid g-main">
    <section class="panel review-done">
      <div class="rd-check">${icon('check', 'stroke-width="3"')}</div>
      <h2>Week to ${dayName(key, { day: 'numeric', month: 'short' })} closed${rv.rating ? `: ${WEEKRATE[rv.rating - 1].toLowerCase()}` : ''}</h2>
      ${pr.length ? `<p class="muted" style="margin:6px 0 10px">This week's priorities, also on Today:</p><div class="prio-chips" style="justify-content:center">${pr.map(p => `<span class="chip ${p.done ? 'status-on' : ''}">${p.done ? '✓ ' : ''}${esc(p.title)}</span>`).join('')}</div>` : ''}
      <div class="row wrap" style="justify-content:center;gap:8px;margin-top:16px"><button class="btn" data-act="r-history">${icon('journal')}Read it in History</button><button class="btn ghost" data-act="r-edit">${icon('edit')}Edit</button><button class="btn ghost" data-go="coach:weekly">${icon('coach')}Weekly insights from Claude</button></div>
    </section>
    <div class="grid" style="align-content:start">
      ${typeof lifeBalanceMini === 'function' ? lifeBalanceMini(addDays(todayStr(), -6), todayStr()) : ''}
      ${typeof insightsPanel === 'function' ? insightsPanel() : ''}
    </div>
  </div>`;
}

function reviewMarkdown(key) {
  const rv = D.reviews[key] || {};
  const from = addDays(key, -6); const ws = weekStats(from, key);
  const L = [`## Weekly review: ${dayName(from, { day: 'numeric', month: 'short' })} to ${dayName(key, { day: 'numeric', month: 'short' })}`, ''];
  if (rv.rating) L.push(`**Week:** ${WEEKRATE[rv.rating - 1]}`);
  L.push(`**Focus:** ${fmtMin(ws.focusMin)} · **Targets:** ${ws.done}/${ws.total} · **Workouts:** ${ws.workouts} (${ws.km} km run) · **Journal days:** ${ws.journalDays}${ws.sleep !== null ? ` · **Avg sleep:** ${ws.sleep}h` : ''}`, '');
  const goals = activeGoals(); if (goals.length) { L.push('### Goals'); goals.forEach(g => L.push(`- ${g.name}: +${goalProgress(g, key, from)} ${unitOf(g)} this week, ${goalStatus(g).label}`)); L.push(''); }
  if (rv.win) L.push('### Biggest win', rv.win, '');
  if (rv.struggle) L.push('### What did not go well', rv.struggle, '');
  if (rv.lesson) L.push('### Lesson', rv.lesson, '');
  if (rv.stop) L.push('### Stop doing', rv.stop, '');
  if (rv.obstacle) L.push('### If-then for next week', `If ${rv.obstacle}, then ${rv.ifthen || ''}`, '');
  if (rv.priorities && rv.priorities.length) { L.push("### Next week's priorities"); rv.priorities.forEach(p => L.push(`- [ ] ${p.title}`)); }
  return L.join('\n');
}

// ---------- COACH (Claude, no API: copy prompt, paste reply) ----------
const COACH_KINDS = [
  { id: 'plan', title: 'Plan my day', text: 'A realistic plan for today around your calendar, targets, sleep and energy.', icon: 'sun', bg: '#FFE6DD', fg: '#FF4F1F' },
  { id: 'review', title: 'Review my day', text: 'An honest look at what went well, what slipped and one fix for tomorrow.', icon: 'moon', bg: '#E9E4FF', fg: '#5A3CF0' },
  { id: 'weekly', title: 'Weekly insights', text: 'Patterns across your focus, workouts, sleep, mood and goals over 14 days.', icon: 'bolt', bg: '#F1FBC9', fg: '#3F5200' },
  { id: 'season', title: 'Season check-in', text: 'Are your goals on track? What to cut, keep or move this week.', icon: 'compass', bg: '#DDF3F4', fg: '#0B7A84' },
  { id: 'pep', title: 'I need a push', text: 'Losing steam? Get a short, specific pep talk and the next tiny step.', icon: 'flame', bg: '#FFE0EE', fg: '#D6247A' },
  { id: 'fitness', title: 'Fitness coach', text: 'Feedback on workouts, sleep and recovery, plus next week\'s training plan.', icon: 'run', bg: '#E2F6EB', fg: '#12A15B' }
];
const coachLabel = (k) => (COACH_KINDS.find(c => c.id === k) || { title: 'Coach' }).title;

function contextBlock(daysBack = 7) {
  const t = todayStr();
  const si = seasonInfo();
  const L = [];
  L.push(`Today is ${dayName(t)} (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}).`);
  if (D.settings.name) L.push(`My name is ${D.settings.name}.`);
  L.push('', '## My season', `${D.season.name}: day ${si.dayNum} of ${si.total}, ${si.left} days left.`);
  const goals = activeGoals();
  if (goals.length) { L.push('', '## My goals'); goals.forEach(g => { const s = goalStatus(g); L.push(`- ${g.name}: ${s.p} of ${g.target} ${unitOf(g)} (${s.label})${g.why ? `. Why it matters: ${g.why}` : ''}`); }); }
  else L.push('', 'I have not set goals in the app yet.');
  const rv = latestReview(8);
  if (rv && rv.priorities && rv.priorities.length) { L.push('', "## This week's priorities"); rv.priorities.forEach(p => L.push(`- [${p.done ? 'x' : ' '}] ${p.title}`)); }
  const dd = day(t);
  if (dd.checkin) { const c = dd.checkin; L.push('', '## Morning check-in', `Energy ${c.energy || '?'}/5, sleep ${c.sleepH || '?'}h (quality ${c.sleepQ ? SLEEPQ[c.sleepQ - 1] : '?'}), mood ${c.mood ? MOODS[c.mood - 1].label : '?'}.${c.win ? ` Today is a win if: ${c.win}` : ''}`); }
  L.push('', "## Today's targets");
  if (dd.targets.length) dd.targets.forEach(x => { const g = D.goals.find(gg => gg.id === x.goalId); L.push(`- [${x.done ? 'x' : ' '}] ${x.title}${x.time ? ` (${fmtHM(x.time)}, ${x.dur || 50} min)` : ''}${g ? ` (goal: ${g.name})` : ''}`); });
  else L.push('- none set yet');
  if (calCache.events.length) { L.push('', "## Today's calendar"); calCache.events.forEach(e => L.push(`- ${e.allDay ? 'All day' : fmtTime(e.start) + ' to ' + fmtTime(e.end)}: ${e.title}`)); }
  L.push('', `## Last ${daysBack} days`);
  for (const d of range(addDays(t, -(daysBack - 1)), t)) {
    const dy = D.days[d] || { targets: [] };
    const s = sessionsOn(d), w = workoutsOn(d), j = D.journal[d], wl = wellnessOn(d);
    const parts = [`targets ${dy.targets.filter(x => x.done).length}/${dy.targets.length}`, `focus ${fmtMin(focusMinOn(d))}`, typeof qbOn === 'function' && qbOn(d).length ? `QBank ${qbSum(qbOn(d)).n} questions at ${pctOf(qbSum(qbOn(d)))}%` : '', `workouts: ${w.map(x => (x.name || wType(x.type).label) + ' ' + x.minutes + 'min' + (x.distance ? ' ' + x.distance + 'km' : '') + (x.avgHr ? ' avgHR ' + x.avgHr : '')).join(', ') || 'none'}`];
    if (wl) { if (wl.sleepSecs) parts.push(`sleep ${round1(wl.sleepSecs / 3600)}h`); if (wl.steps) parts.push(`${wl.steps} steps`); if (wl.restingHR) parts.push(`resting HR ${wl.restingHR}`); }
    if (dy.checkin && dy.checkin.energy) parts.push(`morning energy ${dy.checkin.energy}/5`);
    if (j && j.saved) { if (j.mood) parts.push(`mood ${MOODS[j.mood - 1].label}`); const txt = journalText(j).replace(/\s+/g, ' '); if (txt) parts.push(`journal: "${txt.length > 400 ? txt.slice(0, 400) + '…' : txt}"`); }
    L.push(`- ${shortDay(d)}: ${parts.filter(Boolean).join('; ')}`);
  }
  if (D.anki && D.anki.at) L.push('', '## Anki', `${D.anki.due} cards due, ${ankiToday()} reviewed today, ${ankiStreak()} day Anki streak.`);
  { const aa = ascendAge(); if (aa) L.push('', '## Healthspan', `Ascend Age offset ${aa.offset > 0 ? '+' : ''}${aa.offset} years${aa.bio ? ` (biological ${aa.bio}, real ${Math.floor(aa.age)})` : ''}. Day strain ${strainOn(todayStr()) ?? '?'}/21.`); }
  const nx = nextExam(); if (nx) { const es = examStats(nx); L.push('', '## Exam', `${nx.name} on ${dayName(nx.date)} (${es.daysLeft} days). ${es.learned}/${es.total} topics learned, ${es.strong} strong, ${es.due} revisions due.`); }
  if (typeof qbTarget === 'function' && D.settings.qbankDaily) L.push('', '## QBank', `Daily target ${qbTarget().n} today. Last 7 days ${qbIn(addDays(t, -6), t).n} questions.`);
  if (typeof personalNeed === 'function') { const rd = readiness(t); L.push('', '## Recovery', `Sleep need ${personalNeed().need}h, 14-night sleep debt ${sleepDebt(t)}h, lights out ${D.settings.bedTime || '00:30'}, wake ${D.settings.wakeTime || '08:00'}.${rd ? ` Readiness ${rd.score}/100 (${rd.band.label}).` : ''}`); }
  L.push('', `Current streak: ${streak()} days.`);
  return L.join('\n');
}

// Short, specific replies: a hard word limit and a fixed shape, so the answer gets read
function coachPrompt(kind) {
  const asks = {
    plan: 'Plan my day. Line 1: the ONE thing that matters most today. Then at most 4 time blocks (start time, what, minutes) that fit my calendar, sleep and energy, QBank before notes. Last line: what to drop if time runs short.',
    review: 'Review today. Line 1: verdict in under 10 words. Then: what slipped and the real cause (from the numbers), one change for tomorrow, and tomorrow\'s top 3 as a 3-item list.',
    weekly: 'Review my last 2 weeks. Line 1: the single biggest pattern you see, with its numbers. Then: one thing to keep, one thing to stop, and 3 priorities for next week as a 3-item list.',
    season: 'Check my goals. One line per goal: on track, adjust or off track, with the number and one concrete fix. Last line: what to say no to this week.',
    pep: 'I am losing steam. Two lines on what I have actually done (numbers), then ONE step I can start in the next 5 minutes.',
    fitness: 'Coach my training. Line 1: verdict on recovery and load. Then a 7-day plan, one short line per day, around lifting 5 days, running toward a half marathon and my back pain.'
  };
  const days = ['weekly', 'fitness', 'season'].includes(kind) ? 14 : 7;
  return `You are my coach inside my app Ascend. I am a final-year MBBS student. Be direct and push me; no greetings, no praise, no motivational filler, no medical explanations. Use my numbers, never generic advice.
Hard rules: at most 90 words in total. Start with a one-line verdict. Use short lines, no headings, no em dashes. End with one question I must answer with a number.

${asks[kind]}

# My data
${contextBlock(days)}`;
}

// Light markdown for Claude's replies: headings, bullets, numbered lists, bold.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, '$1<i>$2</i>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim();
    let m;
    if (!l) { close(); continue; }
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(l)}</p>`);
  }
  close();
  return out.join('');
}

function coachNotesHTML() {
  const k = UI.noteKind || 'all';
  const list = D.coach.slice().reverse().sort((a, b) => b.date.localeCompare(a.date)).filter(n => k === 'all' || n.kind === k);
  if (!list.length) return `<p class="muted">${k === 'all' ? 'Saved replies from Claude will appear here.' : 'No notes of this kind yet.'}</p>`;
  const shown = list.slice(0, UI.noteLimit || 10);
  return `<div class="notes">${shown.map((n, i) => { const c = COACH_KINDS.find(x => x.id === n.kind) || COACH_KINDS[0]; return `<article class="note" data-id="${n.id}" style="--i:${i}">
    <header><span class="cc-icon" style="background:${c.bg};color:${c.fg}">${icon(c.icon)}</span><div class="grow"><b>${esc(c.title)}</b><span class="muted">${dayName(n.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
      <button class="icon-btn" data-act="copy-note" title="Copy">${icon('copy')}</button><button class="icon-btn" data-act="del-note" data-id="${n.id}" title="Delete">${icon('trash')}</button></header>
    <div class="md clamp">${md(n.text)}</div>
    <button class="btn ghost sm note-more" data-act="note-toggle">Read more</button>
  </article>`; }).join('')}</div>${list.length > shown.length ? `<button class="btn more-btn" data-act="note-more">Show older notes (${list.length - shown.length})</button>` : ''}`;
}

function fitNotes() { $$('.note').forEach(n => { const b = $('.md', n); $('.note-more', n).hidden = b.scrollHeight <= b.clientHeight + 4; }); }

function viewCoach() {
  const pick = coachPick;
  const kinds = [...new Set(D.coach.map(n => n.kind))];
  return `
  <div class="view-head"><div><h1>Coach</h1><p class="sub">Pick a session. Ascend writes the prompt with your real numbers; you paste Claude's reply back here.</p></div></div>
  <div class="coach-row">
    ${COACH_KINDS.map((c, i) => `<button class="coach-pill ${pick === c.id ? 'selected' : ''}" data-coach="${c.id}" style="--i:${i}" data-tip="${esc(c.text)}"><span class="cc-icon" style="background:${c.bg};color:${c.fg}">${icon(c.icon)}</span>${c.title}</button>`).join('')}
  </div>
  ${pick ? `<section class="panel slide-down" style="margin-bottom:18px">
    <div class="panel-head"><div><h2>${coachLabel(pick)}</h2><p class="muted">${esc((COACH_KINDS.find(c => c.id === pick) || {}).text || '')}</p></div><button class="icon-btn" data-act="coach-close" title="Close">${icon('x')}</button></div>
    <div class="steps">
      <button class="btn primary shine" data-act="copy-prompt">${icon('copy')}1. Copy prompt</button>
      <button class="btn violet" data-act="open-claude">${icon('external')}2. Open Claude and paste</button>
    </div>
    <details><summary class="muted" style="cursor:pointer;margin-bottom:8px">Preview the prompt</summary><div class="prompt-box" id="promptBox">${esc(coachPrompt(pick))}</div></details>
    <form data-form="coach-reply" style="margin-top:14px">
      <div class="field"><label>3. Paste Claude's reply to keep it</label><textarea class="input" name="reply" style="min-height:130px" placeholder="Paste the plan or advice here. It shows on your Today screen."></textarea></div>
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-act="reply-targets">${icon('plus')}Save and turn bullets into targets</button><button class="btn dark" type="submit">Save note</button></div>
    </form>
  </section>` : ''}
  <div class="panel-head notes-head"><h2>Your notes${D.coach.length ? ` <span class="muted">${D.coach.length}</span>` : ''}</h2>
    ${kinds.length > 1 ? `<div class="seg">${[['all', 'All'], ...COACH_KINDS.filter(c => kinds.includes(c.id)).map(c => [c.id, c.title])].map(([id, l]) => `<button data-nkind="${id}" class="${(UI.noteKind || 'all') === id ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>
  <div id="noteList">${coachNotesHTML()}</div>`;
}

// ---------- SETTINGS ----------
function viewSettings() {
  const s = D.settings;
  const hrs = [1, 2, 3, 4];
  const g = gEnabled();
  return `
  <div class="view-head"><div><h1>Settings</h1><p class="sub">Make Ascend yours.</p></div></div>
  <form data-form="settings" class="grid g-2">
    <section class="panel">
      <h3 class="set-h">${icon('heart')} You</h3>
      <div class="field"><label>Your name</label><input class="input" name="name" value="${esc(s.name)}" placeholder="Used in greetings"></div>
      <div class="row"><div class="field grow"><label>Appearance</label><select class="input" name="theme">${[['system', 'Match this device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(s.theme || 'system') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field grow"><label>Your cat's name</label><input class="input" name="buddyName" value="${esc(s.buddyName || 'Mochi')}" maxlength="20"></div></div>
      <label class="row toggle-row"><input type="checkbox" name="buddy" ${s.buddy !== false ? 'checked' : ''}> Show ${esc(s.buddyName || 'Mochi')}, the cat who keeps you company</label>
      <h3 class="set-h">${icon('clock')} Reminders</h3>
      <label class="row toggle-row"><input type="checkbox" name="remindersOn" ${s.remindersOn ? 'checked' : ''}> Show animated reminders on screen</label>
      <div class="row"><div class="field grow"><label>Morning check-in</label><input class="input" type="time" name="morningTime" value="${s.morningTime}"></div>
      <div class="field grow"><label>Evening journal</label><input class="input" type="time" name="journalTime" value="${s.journalTime}"></div></div>
      <div class="row"><div class="field grow"><label>Weekly review day</label><select class="input" name="weeklyDay">${WEEKDAYS.map((d, i) => `<option value="${i}" ${Number(s.weeklyDay) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="field grow"><label>Weekly review time</label><input class="input" type="time" name="weeklyTime" value="${s.weeklyTime}"></div></div>
      <div class="row"><div class="field grow"><label>Nudges</label><select class="input" name="nudgeMode">${[['plan', 'At your planned times (up to 3 a day)'], ['off', 'Off'], ...hrs.map(h => ['h' + h, `Generic, every ${h} hour${h > 1 ? 's' : ''}`])].map(([v, l]) => `<option value="${v}" ${(s.nudgeMode === 'hours' ? 'h' + Number(s.nudgeEveryHours) : s.nudgeMode || 'plan') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field grow"><label>Between</label><div class="row"><input class="input" type="time" name="activeStart" value="${s.activeStart}"><input class="input" type="time" name="activeEnd" value="${s.activeEnd}"></div></div></div>
      <div class="row"><div class="field grow"><label>Wake anchor (every day)</label><input class="input" type="time" name="wakeTime" value="${esc(s.wakeTime || '08:00')}"></div>
      <div class="field grow"><label>Lights-out goal</label><input class="input" type="time" name="bedGoal" value="${esc(s.bedGoal || '00:00')}"></div></div>
      <div class="row"><div class="field grow"><label>Rest mode until</label><input class="input" type="date" name="restUntil" value="${esc(s.restUntil || '')}"><span class="hint">Pauses habits and reminders, for illness or a planned break. Leave empty for off.</span></div>
      <div class="field grow"><label>Protein target (g a day)</label><input class="input" type="number" name="proteinTarget" min="0" max="400" value="${esc(s.proteinTarget ?? 80)}"></div></div>
      <div class="row"><div class="field grow"><label>Lights out (now)</label><input class="input" type="time" name="bedTime" value="${esc(s.bedTime || '00:30')}"></div>
      <div class="field grow"><label>Bedtime reminder</label><select class="input" name="bedLead">${[[0, 'Off'], [15, '15 min before'], [30, '30 min before'], [45, '45 min before'], [60, '1 hour before']].map(([v, l]) => `<option value="${v}" ${Number(s.bedLead ?? 30) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="row toggle-row"><input type="checkbox" name="sound" ${s.sound ? 'checked' : ''}> Play a sound with reminders and timers</label>
      <label class="row toggle-row desk-only"><input type="checkbox" name="launchAtLogin" ${s.launchAtLogin ? 'checked' : ''}> Start Ascend quietly when Windows starts</label>
      <div class="row wrap" style="margin-top:6px"><span class="muted" style="font-size:12px;width:100%">Preview a reminder:</span>
        <button type="button" class="btn sm" data-preview="checkin">Check-in</button><button type="button" class="btn sm" data-preview="nudge">Nudge</button><button type="button" class="btn sm" data-preview="journal">Journal</button><button type="button" class="btn sm" data-preview="weekly">Weekly review</button><button type="button" class="btn sm" data-preview="bedtime">Bedtime</button></div>
      <div class="desk-only">
      <h3 class="set-h">${icon('folder')} Your data</h3>
      <p class="muted" style="font-size:13px;word-break:break-all">${esc(META.dataDir)}</p>
      <p class="muted" style="font-size:12px;margin:6px 0 12px">${META.detectedDrive ? 'Saved in your Google Drive folder, so it is backed up and synced automatically.' : 'Tip: choose a folder inside Google Drive for Desktop to back up and sync your data.'} A daily backup is kept for 14 days.</p>
      <div class="row wrap"><button type="button" class="btn" data-act="open-folder">Open folder</button><button type="button" class="btn" data-act="choose-folder">Change folder</button><button type="button" class="btn ghost" data-act="export">Export JSON</button></div>
      </div>
    </section>
    <div class="grid" style="align-content:start">
      ${devicePanel()}
      ${typeof backupPanel === 'function' ? backupPanel() : ''}
      <section class="panel conn ${g ? 'on' : ''}">
        <div class="conn-head"><span class="conn-ic g">${icon('google')}</span><div class="grow"><h3>Google Tasks and Calendar</h3><p class="muted" style="font-size:12.5px">${g ? `Connected${GSYNC.email ? ' as ' + esc(GSYNC.email) : ''}. ${GSYNC.lastOk ? 'Last synced ' + ago(GSYNC.lastOk) + '.' : ''}` : 'Two-way sync of targets with Google Tasks, and timed targets in Google Calendar.'}</p></div>
          ${g ? `<button type="button" class="btn sm" data-act="g-sync">${icon('sync')}Sync now</button>` : `<button type="button" class="btn sm primary" data-act="g-setup">Set up</button>`}</div>
        ${g ? `
          <label class="row toggle-row"><input type="checkbox" name="googleTasks" ${s.googleTasks ? 'checked' : ''}> Sync targets and weekly priorities with Google Tasks (list "Ascend")</label>
          <label class="row toggle-row"><input type="checkbox" name="googleCalendar" ${s.googleCalendar ? 'checked' : ''}> Put targets that have a time into Google Calendar</label>
          <label class="row toggle-row"><input type="checkbox" name="googleCalendarRead" ${s.googleCalendarRead ? 'checked' : ''}> Show my Google Calendar on Today and in coach prompts</label>
          <div class="row wrap" style="margin-top:8px">
            ${D.sync.recurring ? `<button type="button" class="btn sm" data-act="g-recurring">Update check-in and review events</button><button type="button" class="btn sm ghost" data-act="g-recurring-off">Remove them</button>` : `<button type="button" class="btn sm" data-act="g-recurring">${icon('calendar')}Add check-in and weekly review to my calendar</button>`}
            <button type="button" class="btn sm ghost" data-act="g-setup">Reconnect</button><button type="button" class="btn sm ghost" data-act="g-off" style="color:var(--off)">Disconnect</button></div>` : ''}
      </section>
      <section class="panel conn ${s.intervalsKey ? 'on' : ''}">
        <div class="conn-head"><span class="conn-ic iv">${icon('pulse')}</span><div class="grow"><h3>intervals.icu</h3><p class="muted" style="font-size:12.5px">Brings in your Amazfit workouts, sleep, steps and resting heart rate.</p></div>
          ${s.intervalsKey ? `<button type="button" class="btn sm" data-act="iv-sync">${icon('sync')}Sync now</button>` : ''}</div>
        <div class="field"><label>API key</label><input class="input" type="password" name="intervalsKey" value="${esc(s.intervalsKey)}" placeholder="Paste your intervals.icu API key" autocomplete="off">
          <span class="hint">On intervals.icu: Settings › Developer Settings › API key › copy. To get your Amazfit data into intervals.icu, tick the Amazfit box on its Settings page and sync the Zepp app once.</span></div>
        <div class="field"><label>Athlete ID</label><input class="input" name="intervalsAthlete" value="${esc(s.intervalsAthlete)}" style="width:160px"><span class="hint">Leave as 0 to use the athlete the key belongs to.</span></div>
      </section>
      ${healthPanels()}
      ${integrationPanels()}
      ${typeof lifeLinksPanel === 'function' ? lifeLinksPanel() : ''}
      <section class="panel">
        ${!g ? `<h3 class="set-h">${icon('calendar')} Calendar link (without Google sync)</h3>
        <div class="field"><label>Google Calendar private link (iCal)</label><input class="input" name="calendarUrl" value="${esc(s.calendarUrl)}" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"><span class="hint">Read-only. Google Calendar › Settings › your calendar › Integrate calendar › Secret address in iCal format.</span></div>` : `<input type="hidden" name="calendarUrl" value="${esc(s.calendarUrl)}">`}
      </section>
    </div>
    <div style="grid-column:1/-1;display:flex;justify-content:flex-end"><button class="btn primary big shine" type="submit">Save settings</button></div>
  </form>`;
}

function devicePanel() {
  const g = gEnabled();
  if (ASCEND_IS_MOBILE) {
    return `<section class="panel conn ${CLOUD.lastOk ? 'on' : ''}">
      <div class="conn-head"><span class="conn-ic lap">${icon('laptop')}</span><div class="grow"><h3>Your laptop</h3><p class="muted" style="font-size:12.5px">${CLOUD.lastOk ? 'In sync through your Google account. Last synced ' + ago(CLOUD.lastOk) + '.' : CLOUD.error ? esc(CLOUD.error) : 'Syncs through your Google account.'}</p></div>
        <button type="button" class="btn sm" data-act="cloud-sync">${icon('sync')}Sync now</button></div>
      <div class="row wrap">${window.ASCEND_WEB ? '' : `<button type="button" class="btn sm" data-act="notif-test">${icon('bell')}Test a notification</button>`}<button type="button" class="btn sm ghost" data-act="repair">Pair again</button></div>
      ${window.ASCEND_WEB ? '<p class="muted" style="font-size:12px;margin-top:8px">Home-screen web apps on iPad cannot send reminders. Your laptop and phone still remind you.</p>' : ''}
    </section>`;
  }
  const head = `<div class="conn-head"><span class="conn-ic lap">${icon('phone')}</span><div class="grow"><h3>Your phone</h3><p class="muted" style="font-size:12.5px">Install Ascend on your Android phone and pair it with the code below. Both stay in sync through your Google account.</p></div>${g && !CLOUD.needsUpdate ? `<button type="button" class="btn sm" data-act="cloud-sync">${icon('sync')}Sync now</button>` : ''}</div>`;
  if (!g) return `<section class="panel conn">${head}<p class="muted">Connect Google below first. The phone uses the same connection.</p></section>`;
  if (CLOUD.needsUpdate) return `<section class="panel conn warn">${head}
    <div class="update-box"><b>One step first: update your Google script.</b> The phone needs a newer version of the Ascend bridge.
    <ol class="setup-steps">
      <li><button type="button" class="btn primary sm" data-act="copy-script">${icon('copy')}Copy the new script</button></li>
      <li>Open <button type="button" class="btn sm" data-act="open-scripts">${icon('external')}script.google.com</button> and click your <b>Ascend bridge</b> project.</li>
      <li>Select all the code (<kbd>Ctrl</kbd> <kbd>A</kbd>), paste (<kbd>Ctrl</kbd> <kbd>V</kbd>) and save (<kbd>Ctrl</kbd> <kbd>S</kbd>).</li>
      <li>Click <b>Deploy</b> › <b>Manage deployments</b> › pencil icon › Version: <b>New version</b> › <b>Deploy</b>. Allow access to Google Drive when asked. Your web app link stays the same.</li>
      <li><button type="button" class="btn dark sm" data-act="cloud-sync">I've done it, sync now</button></li>
    </ol></div></section>`;
  const code = pairingCode();
  return `<section class="panel conn ${CLOUD.lastOk ? 'on' : ''}">${head}
    <div class="pair-box"><img id="pairQr" alt="Pairing QR code" width="132" height="132">
      <div class="grow"><p style="font-size:13px;margin-bottom:8px"><b>On your phone:</b> open Ascend, then paste this code or scan the QR with Google Lens and copy the text.</p>
      <code class="pair-code">${esc(code.slice(0, 26))}…</code>
      <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="copy-pair">${icon('copy')}Copy pairing code</button></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Keep this code private: it unlocks your Ascend data.</p></div></div>
    ${CLOUD.lastOk ? `<p class="muted" style="font-size:12px;margin-top:10px">Data synced ${ago(CLOUD.lastOk)}.</p>` : ''}
  </section>`;
}

function googleSetupModal() {
  if (!D.settings.googleKey) { D.settings.googleKey = (uid() + uid() + uid()).replace(/[^a-z0-9]/gi, ''); save(); }
  const m = modal(`
    <div class="conn-head" style="margin-bottom:6px"><span class="conn-ic g">${icon('google')}</span><div><h2>Connect Google Tasks and Calendar</h2><p class="sub" style="margin:0">Free, no hosting. About 5 minutes, once.</p></div></div>
    <ol class="setup-steps">
      <li><b>Copy the setup script.</b> It contains a private key only your Ascend knows.<div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-local="copy-gs">${icon('copy')}Copy setup script</button></div></li>
      <li><b>Open Google Apps Script</b> with your personal Gmail account, and start a new project.<div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-local="open-gs">${icon('external')}Open script.google.com</button></div></li>
      <li>Delete the sample code, press <kbd>Ctrl</kbd> <kbd>V</kbd> to paste, then <kbd>Ctrl</kbd> <kbd>S</kbd> to save. Name the project <b>Ascend bridge</b>.</li>
      <li>On the left, next to <b>Services</b>, click <b>+</b>, choose <b>Google Tasks API</b> and click <b>Add</b>.</li>
      <li>Click <b>Deploy</b> › <b>New deployment</b> › gear icon › <b>Web app</b>. Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>. Click <b>Deploy</b>, then <b>Authorize access</b>.</li>
      <li>Google will warn that the app is unverified, because it is your own script. Click <b>Advanced</b> › <b>Go to Ascend bridge</b> › <b>Allow</b>.</li>
      <li>Copy the <b>Web app URL</b> and paste it here:</li>
    </ol>
    <div class="row"><input class="input grow" id="gUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(D.settings.googleUrl)}"><button type="button" class="btn dark" data-local="test-gs">Connect</button></div>
    <p class="muted" id="gMsg" style="font-size:12.5px;margin-top:8px">Work Google accounts often block this. Use a personal Gmail account if it fails.</p>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Close</button></div>`, 'wide');
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-local]'); if (!b) return;
    if (b.dataset.local === 'copy-gs') { await bridge.copy(appsScriptSource(D.settings.googleKey)); b.innerHTML = `${icon('check')}Copied`; burst(b); }
    if (b.dataset.local === 'open-gs') bridge.openExternal('https://script.google.com/home/projects/create');
    if (b.dataset.local === 'test-gs') {
      const url = $('#gUrl', m).value.trim(); const msg = $('#gMsg', m);
      msg.textContent = 'Connecting to Google… the first call can take 10 seconds.'; msg.className = 'muted';
      b.disabled = true; b.innerHTML = `${icon('sync', 'class="spinning"')}Connecting`;
      const prev = D.settings.googleUrl; D.settings.googleUrl = url;
      try {
        const r = await gCall('ping');
        GSYNC.email = r.email || ''; save();
        msg.innerHTML = `<b style="color:var(--on)">Connected${r.email ? ' as ' + esc(r.email) : ''}.</b> Your Google Tasks list "Ascend" is ready.`;
        // Push today's and future targets, then pull anything from the phone
        syncItems().filter(x => x.due >= todayStr()).forEach(x => markDirty(x.item));
        await cloudSync(); await flushGoogle(); await pullGoogle();
        calCache.at = 0; loadCalendar(true);
        confetti(120); chime('done');
        b.innerHTML = `${icon('check')}Connected`;
        setTimeout(() => { closeModal(); go('settings'); toast('Google connected. Add your check-in and weekly review to the calendar next.'); }, 1400);
      } catch (err) {
        D.settings.googleUrl = prev; save();
        msg.innerHTML = `<b style="color:var(--off)">${esc(err.message)}</b>`; b.disabled = false; b.textContent = 'Try again';
      }
    }
  });
}

function editTargetModal(tg, date = todayStr()) {
  let dur = tg.dur || 50;
  const m = modal(`<h2>Edit target</h2><p class="sub">${gEnabled() && D.settings.googleCalendar ? 'Give it a time and it goes into your Google Calendar as a focus block.' : 'Give it a time to plan your day around it.'}</p>
    <form>
      <div class="field"><label>Target</label><input class="input" name="title" value="${esc(tg.title)}" required maxlength="140"></div>
      <div class="field"><label>Goal</label><select class="input" name="goal">${goalOptions(tg.goalId)}</select></div>
      <div class="row"><div class="field"><label>Start time</label><input class="input" type="time" name="time" value="${tg.time || ''}" style="width:140px"></div>
      <div class="field grow"><label>Length</label><div class="seg" data-dur>${[25, 50, 90, 120].map(d => `<button type="button" data-v="${d}" class="${dur === d ? 'on' : ''}">${d}m</button>`).join('')}</div></div></div>
      <div class="modal-actions">${tg.time ? '<button type="button" class="btn ghost" data-local="clear" style="margin-right:auto">Remove time</button>' : ''}<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dur] [data-v]'); if (b) { dur = Number(b.dataset.v); $$('[data-dur] button', m).forEach(x => x.classList.toggle('on', x === b)); }
    if (e.target.closest('[data-local=clear]')) { $('[name=time]', m).value = ''; }
  });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    Object.assign(tg, { title: String(fd.get('title')).trim() || tg.title, goalId: fd.get('goal') || '', time: fd.get('time') || '', dur });
    markDirty(tg); save(); closeModal(); rerender(); toast(tg.time && gEnabled() && D.settings.googleCalendar ? 'Saved. Adding it to Google Calendar.' : 'Target updated');
  });
}

// ---------- Modals, toasts, celebration ----------
function modal(html, size = '') {
  closeModal();
  const s = document.createElement('div');
  s.className = 'scrim'; s.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">${html}</div>`;
  s.addEventListener('mousedown', (e) => { if (e.target === s) closeModal(); });
  $('#layer').appendChild(s);
  const first = $('input:not([type=checkbox]):not([type=hidden]),textarea,select', s); if (first) setTimeout(() => first.focus(), 60);
  return $('.modal', s);
}
function closeModal() { $$('#layer .scrim').forEach(n => { n.classList.add('closing'); setTimeout(() => n.remove(), 180); }); }

function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `${icon('check', 'style="width:16px;height:16px;color:var(--volt)"')}${esc(msg)}`;
  document.body.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2800);
}

function celebrate({ big, title, text, cta = 'Keep going' }) {
  const c = document.createElement('div'); c.className = 'celebrate';
  c.innerHTML = `<div class="card"><div class="burst-rays"></div><div class="big">${esc(big)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn primary big">${esc(cta)}</button></div>`;
  c.addEventListener('click', () => { c.classList.add('out'); setTimeout(() => c.remove(), 250); });
  document.body.appendChild(c); confetti(180);
}

function checkStreakMilestone() {
  const st = streak();
  const marks = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
  if (marks.includes(st) && D.sync.streakCelebrated !== st) {
    D.sync.streakCelebrated = st; save();
    setTimeout(() => celebrate({ big: '🔥' + st, title: `${st}-day streak!`, text: st >= 30 ? 'This is who you are now. Keep the chain alive.' : 'Consistency beats intensity. You are building something real.', cta: 'Keep climbing' }), 600);
  }
}

// Confetti on the full-window canvas
function confetti(n = 120, origin = null) {
  if (reduced()) return;
  const cv = $('#confetti'); const ctx = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const colors = ['#FF6B4A', '#FFC24B', '#F2547D', '#FFB38A', '#8B4C9E', '#FFFFFF'];
  const ox = origin ? origin.x : innerWidth / 2, oy = origin ? origin.y : innerHeight * 0.35;
  const parts = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, v = (origin ? 3 : 6) + Math.random() * (origin ? 5 : 9);
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (origin ? 2 : 5), r: 3 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 0, shape: Math.random() > .5, wob: Math.random() * 6 };
  });
  let frame = 0;
  (function step() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.life++; p.vy += 0.22; p.vx *= 0.99; p.x += p.vx + Math.sin(p.life / 8 + p.wob) * 0.6; p.y += p.vy; p.rot += p.vr;
      if (p.y < innerHeight + 20 && p.life < 240) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, 1 - p.life / 240); ctx.fillStyle = p.c;
      if (p.shape) ctx.fillRect(-p.r, -p.r / 2 * Math.abs(Math.cos(p.life / 6)), p.r * 2, p.r * Math.abs(Math.cos(p.life / 6)) + .5); else { ctx.beginPath(); ctx.arc(0, 0, p.r / 1.4, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    if (alive && frame++ < 420) requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}
function burst(el) {
  if (el) { const r = el.getBoundingClientRect(); confetti(30, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }
  else confetti(70);
}

// Simple synthesized chime (no audio files needed)
function chime(kind = 'done') {
  if (!D.settings.sound) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'start' ? [523.25, 659.25] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t0 = ac.currentTime + i * 0.11;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 0.55);
    });
    setTimeout(() => ac.close(), 1500);
  } catch {}
}

// ---------- Nudges (animated pop-ups) ----------
function buildNudge(kind, force = false) {
  const t = todayStr();
  const dd = day(t);
  const done = dd.targets.filter(x => x.done).length, total = dd.targets.length;
  const next = dd.targets.find(x => !x.done);
  const fmin = focusMinOn(t);
  const st = streak();
  const name = D.settings.name || 'there';
  const base = { sound: D.settings.sound };
  if (kind === 'checkin') {
    if (dd.checkin && !force) return null;
    const sl = sleepHours(t);
    return { ...base, kind, theme: 'sunrise', icon: 'sun', eyebrow: dayName(t), title: `Good morning, ${name}`, body: `${thoughtFor('morning', daySeed(t))} ${sl ? `You slept ${sl}h.` : ''} Check in and set your top 3.`, stat: sl ? sl + 'h' : String(st), statLabel: sl ? 'sleep' : 'day streak', actions: [{ label: 'Check in now', view: 'checkin', primary: true }, { label: 'In 15 min', snooze: 15, kind: 'checkin' }] };
  }
  if (kind === 'journal') {
    if (D.journal[t] && D.journal[t].saved && !force) return null;
    return { ...base, kind, theme: 'journal', icon: 'pen', eyebrow: 'Evening reflection', title: thoughtFor('evening', daySeed(t)), body: `${done}/${total} targets · ${fmtMin(fmin)} focused today. Two minutes to write it down while it is fresh.`, stat: `${done}/${total}`, statLabel: 'targets', actions: D.settings.notionUrl ? [{ label: 'Open Notion', url: D.settings.notionUrl, view: 'journal', primary: true }, { label: 'Reflect here', view: 'journal' }, { label: 'In 30 min', snooze: 30, kind: 'journal' }] : [{ label: 'Reflect now', view: 'journal', primary: true }, { label: 'In 30 min', snooze: 30, kind: 'journal' }] };
  }
  if (kind === 'weekly') {
    if (reviewedThisWeek() && !force) return null;
    const ws = weekStats(addDays(t, -6), t);
    return { ...base, kind, theme: 'review', icon: 'calendar', eyebrow: 'Weekly review', title: 'Was this week spent on what you say matters most?', body: `${fmtMin(ws.focusMin)} focused, ${ws.workouts} workouts, ${ws.done}/${ws.total} targets. Ten minutes to be honest and set next week's top 3.`, stat: ws.total ? Math.round(100 * ws.done / ws.total) + '%' : String(ws.workouts), statLabel: ws.total ? 'targets done' : 'workouts', actions: [{ label: 'Start review', view: 'review', primary: true }, { label: 'In 1 hour', snooze: 60, kind: 'weekly' }] };
  }
  // Rotating nudge: a question that interrupts autopilot, grounded in today's numbers.
  const options = thoughtNudges().map(n => ({ ...n, stat: n.stat ?? String(st), statLabel: n.statLabel ?? 'day streak' }));
  if (total && done < total) options.unshift({ icon: 'target', eyebrow: `${done} of ${total} done`, title: `Is "${next.title}" the most important thing you could do right now?`, body: 'If yes, start it. If not, what is?', stat: `${Math.round(100 * done / total)}%`, statLabel: 'of today', actions: [{ label: 'Focus on it now', view: 'focus', focusTask: next.title, focusGoal: next.goalId, primary: true }, { label: 'Not now' }] });
  const pick = Math.random() < 0.4 ? options[0] : options[(Math.random() * options.length) | 0];
  return { ...base, kind: 'nudge', theme: 'energy', ...pick };
}

// Thought-provoking nudges shared by desktop pop-ups and Android notifications.
// Each has a short title (the question) and a body that ties it to your own data.
function thoughtNudges(at = new Date(), ahead = false) {
  const t = todayStr(at), h = at.getHours();
  const dd = D.days[t] || { targets: [] };
  const fmin = focusMinOn(t), st = streak(), si = seasonInfo();
  const out = [];
  const goals = activeGoals();
  goals.forEach(g => { const s = goalStatus(g); out.push({ icon: 'mountain', eyebrow: `${g.name} · ${Math.round(100 * s.p / g.target)}%`, title: `Is what you are doing right now moving ${g.name} forward?`, body: g.why ? `You said it matters because: ${g.why}` : 'Or is it just filling time?', stat: `${Math.round(100 * s.p / g.target)}%`, statLabel: s.label.toLowerCase(), actions: [{ label: 'Work on it', view: 'focus', focusGoal: g.id, primary: true }, { label: 'Not now' }] }); });
  const ex = typeof nextExam === 'function' && nextExam();
  if (ex) { const dl = Math.max(0, daysBetween(t, ex.date)); out.push({ icon: 'cat', eyebrow: `${ex.name} in ${dl} days`, title: `${dl} days. What will you understand tonight that you did not this morning?`, body: 'Revise what is due first, then one new topic.', stat: String(dl), statLabel: 'days left', actions: [{ label: 'Open exam plan', view: 'exams', primary: true }, { label: 'Later' }] }); }
  if (D.anki && D.anki.at && D.anki.due >= 20) out.push({ icon: 'cat', eyebrow: 'Anki', title: 'Your cards are waiting. Ten minutes now, or an hour of catch-up later?', body: ahead ? 'Clear the due pile while it is small.' : `${D.anki.due} due, ${ankiToday()} reviewed today.`, stat: ahead ? '' : String(D.anki.due), statLabel: ahead ? '' : 'cards due', actions: [{ label: 'Open Ascend', view: 'today', primary: true }, { label: 'Later' }] });
  if (si.left > 0) out.push({ icon: 'mountain', eyebrow: `${D.season.name}`, title: `${si.left} days left. What would the person who already finished do in the next hour?`, body: 'Do that.', stat: String(si.left), statLabel: 'days left', actions: [{ label: 'Start focus', view: 'focus', primary: true }, { label: 'Later' }] });
  if (!ahead && fmin < 25 && h >= 11) out.push({ icon: 'rocket', eyebrow: `${fmtMin(fmin)} focused so far`, title: 'What are you avoiding right now?', body: 'Name it. Then give it just 25 minutes. Starting is the hard part.', stat: fmtMin(fmin), statLabel: 'focused', actions: [{ label: 'Start 25 min', view: 'focus', primary: true }, { label: 'Later' }] });
  if (st >= 2) out.push({ icon: 'flame', eyebrow: `${st} day streak`, title: 'Streaks are built on the days you do not feel like it.', body: 'What is the smallest thing that keeps the chain alive today?', stat: String(st), statLabel: 'day streak', actions: [{ label: 'Open today', view: 'today', primary: true }, { label: 'Got it' }] });
  if (h >= 15) out.push({ icon: 'target', eyebrow: ahead ? 'Afternoon check' : `${dd.targets.filter(x => x.done).length}/${dd.targets.length} targets`, title: 'If today ended now, would you be proud of it?', body: 'There is still time to change the answer.', actions: [{ label: 'Open today', view: 'today', primary: true }, { label: 'Later' }] });
  const rd = readiness(t);
  if (!ahead && rd && h >= 12 && !workoutsOn(t).length) out.push({ icon: 'heart', eyebrow: `Recovery ${rd.score}% · ${rd.band.label}`, title: rd.band.key === 'rest' || rd.band.key === 'easy' ? 'Your body asked for an easy day. Are you listening?' : 'Your body is ready. What will you do with it today?', body: rd.band.advice, stat: String(rd.score), statLabel: 'readiness', actions: [{ label: 'See fitness', view: 'fitness', primary: true }, { label: 'Later' }] });
  const tails = ['Sit with it for ten seconds.', 'Answer honestly, then act on it.', 'No need to reply. Just notice.', 'Your answer is your next step.', 'Be honest. Nobody else is reading.'];
  THOUGHTS.day.forEach((q, i) => out.push({ icon: 'cat', eyebrow: 'A question for you', title: q, body: tails[i % tails.length], quote: true, actions: [{ label: 'Open Ascend', view: 'today', primary: true }, { label: 'Got it' }] }));
  return out;
}

function updateTray() {
  if (!D) return;
  const dd = day(todayStr());
  bridge.trayStatus(`Ascend · ${streak()} day streak · ${dd.targets.filter(x => x.done).length}/${dd.targets.length} targets · ${fmtMin(focusMinOn(todayStr()))} focused`);
}

// ---------- Event handling ----------
document.addEventListener('click', async (e) => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) { go(goBtn.dataset.go); return; }
  const preset = e.target.closest('[data-preset]');
  if (preset) { $$('[data-preset]').forEach(b => b.classList.toggle('on', b === preset)); const c = $('[name=custom]'); if (c) c.value = preset.dataset.preset; $('#digits').textContent = fmtClock(Number(preset.dataset.preset) * 60); return; }
  const cc = e.target.closest('[data-coach]');
  if (cc) { coachPick = cc.dataset.coach; go('coach', { keepScroll: true, soft: true }); setTimeout(() => { const p = $('.slide-down'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50); return; }
  const mood = e.target.closest('[data-mood]');
  if (mood) { $$('[data-mood]').forEach(b => b.classList.toggle('on', b === mood)); UI.mood = Number(mood.dataset.mood); return; }
  const jt = e.target.closest('[data-jtab]');
  if (jt) { stashJournalDraft(); UI.jtab = jt.dataset.jtab; UI.reviewEdit = false; if (UI.jtab === 'history') UI.jlimit = 30; go('journal'); return; }
  const jf = e.target.closest('[data-jfilter]');
  if (jf) { UI.jfilter = jf.dataset.jfilter; UI.jlimit = 30; $$('[data-jfilter]').forEach(b => b.classList.toggle('on', b === jf)); $('#jlist').innerHTML = journalListHTML(); return; }
  const nk = e.target.closest('[data-nkind]');
  if (nk) { UI.noteKind = nk.dataset.nkind; UI.noteLimit = 10; $$('[data-nkind]').forEach(b => b.classList.toggle('on', b === nk)); $('#noteList').innerHTML = coachNotesHTML(); fitNotes(); return; }
  const rt = e.target.closest('[data-rate] [data-v]');
  if (rt) { UI.rate = Number(rt.dataset.v); $$('button', rt.parentElement).forEach(b => b.classList.toggle('on', b === rt)); return; }
  const pv = e.target.closest('[data-preview]');
  if (pv) { const n = buildNudge(pv.dataset.preview, true); if (n) bridge.showPopup(n); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  const t = todayStr();
  const row = a.closest('[data-id]');
  switch (act) {
    case 'toggle-target': {
      const tg = day(t).targets.find(x => x.id === row.dataset.id);
      tg.done = !tg.done; tg.doneAt = tg.done ? new Date().toISOString() : null; markDirty(tg); if (tg.examRef) examTargetToggled(tg); save();
      row.classList.toggle('done', tg.done);
      if (tg.done) { row.classList.add('just-done'); burst(a); chime('start'); }
      const dd = day(t);
      if (tg.done && dd.targets.length >= 2 && dd.targets.every(x => x.done)) setTimeout(() => celebrate({ big: '100%', title: 'Summit reached', text: `All ${dd.targets.length} targets done. That is how goals get built.`, cta: 'Celebrate' }), 450);
      setTimeout(() => { rerender(); if (tg.done) Motion.climb(dd.targets.filter(x => x.done).length / dd.targets.length, false); checkStreakMilestone(); }, 650);
      break;
    }
    case 'toggle-prio': {
      const rv = latestReview(8); const p = rv && D.reviews[rv.key].priorities.find(x => x.id === a.closest('[data-pid]').dataset.pid);
      if (p) { p.done = !p.done; markDirty(p); save(); if (p.done) { burst(a); chime('start'); } setTimeout(rerender, 400); a.closest('.target').classList.toggle('done', p.done); }
      break;
    }
    case 'del-target': { const dd = day(t); const tg = dd.targets.find(x => x.id === row.dataset.id); queueRemoteDelete(tg); row.classList.add('leaving'); setTimeout(() => { dd.targets = dd.targets.filter(x => x !== tg); save(); rerender(); }, 260); break; }
    case 'edit-target': editTargetModal(day(t).targets.find(x => x.id === row.dataset.id)); break;
    case 'focus-target': { const tg = day(t).targets.find(x => x.id === row.dataset.id); UI.focusTask = tg.title; UI.focusGoal = tg.goalId; go('focus'); break; }
    case 'carry-yes': { const c = carryOver(); c.items.forEach(x => { x.carried = true; const it = { id: uid(), title: x.title, goalId: x.goalId, done: false }; day(t).targets.push(it); markDirty(it); if (x.taskId) queueRemoteDelete({ taskId: x.taskId }); }); save(); rerender(); toast('Brought over. Fresh start.'); break; }
    case 'carry-no': { D.dismissedCarry = t; save(); rerender(); break; }
    case 'cal-refresh': a.classList.add('spinning'); await loadCalendar(true); await pullGoogle(); a.classList.remove('spinning'); toast('Refreshed'); break;
    case 'log-workout': workoutModal(); break;
    case 'del-workout': { const w = D.workouts.find(x => x.id === a.dataset.id); if (w && w.extId) D.sync.ivIgnored = [...(D.sync.ivIgnored || []), w.extId]; D.workouts = D.workouts.filter(x => x.id !== a.dataset.id); save(); rerender(); break; }
    case 'iv-sync': a.classList.add('busy'); await syncIntervals(true); a.classList.remove('busy'); break;
    case 'iv-connect': go('settings'); setTimeout(() => { const f = $('[name=intervalsKey]'); if (f) { f.focus(); f.closest('.panel').classList.add('flash'); } }, 120); break;
    case 'pause': { D.activeSession.pausedAt = Date.now(); const s = D.activeSession; if (bridge.focusTimer) bridge.focusTimer(null, s.task, { paused: true, left: fmtMin(Math.max(0, s.planned - sessionElapsed(s) / 60)) }); save(); go('focus', { soft: true }); break; }
    case 'resume': { const s = D.activeSession; s.pausedMs += Date.now() - s.pausedAt; s.pausedAt = null; if (bridge.focusTimer) bridge.focusTimer(Date.now() + (s.planned * 60 - sessionElapsed(s)) * 1000, s.task); save(); go('focus', { soft: true }); startTimerLoop(); break; }
    case 'finish': finishSession(false); break;
    case 'discard': if (confirmInline(a, 'Discard?')) { D.activeSession = null; clearInterval(timerTick); if (bridge.focusTimer) bridge.focusTimer(null); save(); go('focus'); } break;
    case 'new-goal': goalModal(); break;
    case 'edit-goal': goalModal(D.goals.find(g => g.id === a.dataset.goal)); break;
    case 'log-goal': logGoalModal(D.goals.find(g => g.id === a.dataset.goal)); break;
    case 'rec-target': { const g = D.goals.find(x => x.id === a.dataset.goal); const it = { id: uid(), title: `Move ${g.name} forward`, goalId: g.id, done: false }; day(t).targets.push(it); markDirty(it); save(); toast('Added to today. Rename it to the exact next step.'); break; }
    case 'edit-season': seasonModal(); break;
    case 'copy-notion': { saveJournalForm(); await bridge.copy(journalMarkdown(UI.jdate || t)); toast('Copied. Paste it into Notion.'); break; }
    case 'j-today': UI.jdate = null; go('journal', { keepScroll: false }); break;
    case 'j-open': { const d = a.dataset.d; if (D.journal[d] && D.journal[d].saved) { UI.jtab = 'history'; UI.jopen = d; UI.jq = ''; UI.jfilter = 'all'; const idx = journalEntries().findIndex(([k]) => k === d); UI.jlimit = Math.max(30, idx + 1); go('journal'); setTimeout(() => { const c = $(`[data-jdate="${d}"]`); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 80); } else { UI.jdate = d === t ? null : d; UI.jtab = 'write'; go('journal'); } break; }
    case 'j-toggle': case 'r-toggle': {
      const c = a.closest('.je'); const open = !c.classList.contains('open');
      $$('.je.open').forEach(x => { x.classList.remove('open'); const b = $('footer [data-act$=-toggle]', x); if (b) b.textContent = 'Read'; });
      c.classList.toggle('open', open); $('footer [data-act$=-toggle]', c).textContent = open ? 'Show less' : 'Read';
      UI.jopen = open ? (c.dataset.jdate || 'r' + c.dataset.rkey) : null; break;
    }
    case 'r-edit': UI.jtab = 'review'; UI.reviewEdit = true; go('journal'); break;
    case 'r-cancel': UI.reviewEdit = false; go('journal'); break;
    case 'r-history': UI.jtab = 'history'; UI.jfilter = 'weeks'; UI.jq = ''; go('journal'); break;
    case 'j-edit': { const d = a.closest('[data-jdate]').dataset.jdate; UI.jdate = d === t ? null : d; UI.jtab = 'write'; go('journal'); break; }
    case 'j-notion': { const e2 = D.journal[a.closest('[data-jdate]').dataset.jdate]; if (e2 && e2.notionLink) bridge.openExternal(e2.notionLink); break; }
    case 'j-copy': await bridge.copy(journalMarkdown(a.closest('[data-jdate]').dataset.jdate)); toast('Entry copied'); break;
    case 'j-more': UI.jlimit = (UI.jlimit || 30) + 30; $('#jlist').innerHTML = journalListHTML(); break;
    case 'toggle-all-reviews': UI.allReviews = !UI.allReviews; rerender(); break;
    case 'toggle-all-workouts': UI.allWorkouts = !UI.allWorkouts; rerender(); break;
    case 'copy-review': { saveReviewForm(); await bridge.copy(reviewMarkdown(reviewKey())); toast('Copied. Paste it into Notion.'); break; }
    case 'open-notion': bridge.openExternal(D.settings.notionUrl); break;
    case 'set-notion': go('settings'); setTimeout(() => $('[name=notionUrl]') && $('[name=notionUrl]').focus(), 100); break;
    case 'notion-done': { const j = D.journal[t] = D.journal[t] || {}; j.notion = a.checked; save(); if (a.checked) burst(a); break; }
    case 'copy-prompt': await bridge.copy(coachPrompt(coachPick)); toast('Prompt copied. Paste it into Claude.'); a.innerHTML = `${icon('check')}Copied`; break;
    case 'open-claude': await bridge.copy(coachPrompt(coachPick)); bridge.openExternal('https://claude.ai/new'); toast('Prompt copied. Press Ctrl+V in Claude.'); break;
    case 'reply-targets': saveCoachReply(true); break;
    case 'del-note': if (confirmInline(a, 'Delete?')) { D.coach = D.coach.filter(n => n.id !== a.dataset.id); save(); rerender(); } break;
    case 'copy-note': { const n = D.coach.find(x => x.id === a.closest('[data-id]').dataset.id); if (n) { await bridge.copy(n.text); toast('Note copied'); } break; }
    case 'note-toggle': { const b = a.parentElement.querySelector('.md'); const open = b.classList.toggle('clamp') === false; a.textContent = open ? 'Show less' : 'Read more'; break; }
    case 'note-more': UI.noteLimit = (UI.noteLimit || 10) + 10; $('#noteList').innerHTML = coachNotesHTML(); fitNotes(); break;
    case 'coach-close': coachPick = null; go('coach', { keepScroll: true, soft: true }); break;
    case 'g-setup': googleSetupModal(); break;
    case 'g-sync': a.classList.add('busy'); try { await flushGoogle(); const n = await pullGoogle(true); calCache.at = 0; await loadCalendar(true); toast(n ? `Synced ${n} change${n === 1 ? '' : 's'} from Google` : 'Google is up to date'); } catch (err) { toast(err.message); } a.classList.remove('busy'); rerender(); break;
    case 'g-recurring': try { a.classList.add('busy'); await setupRecurringEvents(false); toast('Check-in and weekly review added to Google Calendar'); confetti(80); rerender(); } catch (err) { toast(err.message); a.classList.remove('busy'); } break;
    case 'g-recurring-off': try { await setupRecurringEvents(true); toast('Removed from Google Calendar'); rerender(); } catch (err) { toast(err.message); } break;
    case 'g-off': if (confirmInline(a, 'Disconnect?')) { D.settings.googleUrl = ''; GSYNC.error = ''; save(); calCache.at = 0; rerender(); toast('Google disconnected. Your Apps Script can be deleted too.'); } break;
    case 'open-folder': bridge.openFolder(); break;
    case 'choose-folder': { const r = await bridge.chooseFolder(); if (r) { META.dataDir = r.dataDir; if (r.data) D = migrate(r.data); toast('Data folder updated'); rerender(); } break; }
    case 'export': { await bridge.copy(JSON.stringify(D, null, 1)); toast('All data copied as JSON'); break; }
    case 'copy-pair': await bridge.copy(pairingCode()); toast('Pairing code copied. Send it to your phone (WhatsApp to yourself works).'); burst(a); break;
    case 'copy-script': await bridge.copy(appsScriptSource(D.settings.googleKey)); a.innerHTML = `${icon('check')}Copied`; burst(a); break;
    case 'open-scripts': bridge.openExternal('https://script.google.com/home'); break;
    case 'sync-everything': syncEverything(); break;
    case 'cloud-sync': a.classList.add('busy'); CLOUD.needsUpdate = false; await cloudSync(); a.classList.remove('busy'); toast(CLOUD.error || 'All synced'); rerender(); break;
    case 'close-modal': closeModal(); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'jSearch') { UI.jq = e.target.value; UI.jlimit = 30; $('#jlist').innerHTML = journalListHTML(); return; }
  if (e.target.id === 'freewrite') {
    const n = wordCount(e.target.value);
    const wc = $('#wordCount'); if (wc) wc.textContent = `${n} words`;
    if (n === 150 && !UI.wordBurst) { UI.wordBurst = true; burst(wc); toast('150 words. Keep going if it flows.'); }
  }
});

function confirmInline(btn, label) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; const old = btn.innerHTML; btn.textContent = label + ' Click again';
  setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = old; }, 2500);
  return false;
}

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const t = todayStr();
  switch (f.dataset.form) {
    case 'add-target': {
      const title = String(fd.get('title') || '').trim(); if (!title) return;
      const it = { id: uid(), title, goalId: fd.get('goal') || '', time: fd.get('time') || '', dur: 50, done: false };
      day(t).targets.push(it); markDirty(it); UI.newTarget = it.id; save(); rerender(); UI.newTarget = null;
      setTimeout(() => $('#addTitle') && $('#addTitle').focus(), 30);
      break;
    }
    case 'start-focus': startSession(String(fd.get('task') || ''), fd.get('goal') || '', fd.get('custom')); break;
    case 'journal': saveJournalForm(); notionPush('journal', UI.jdate || t); toast('Reflection saved. See you tomorrow.'); burst($('[data-form=journal] [type=submit]')); chime('done'); setTimeout(() => { rerender(); checkStreakMilestone(); }, 300); break;
    case 'review': {
      saveReviewForm(); notionPush('review', reviewKey()); UI.reviewEdit = false;
      const n = D.reviews[reviewKey()].priorities.length;
      chime('done'); celebrate({ big: '✓', title: 'Week closed', text: n ? `${n} priorit${n === 1 ? 'y' : 'ies'} set for next week${gEnabled() && D.settings.googleTasks ? ' and sent to Google Tasks' : ''}. Rest well.` : 'Reflection saved. Set priorities to give next week a direction.', cta: 'Onward' });
      setTimeout(rerender, 300);
      break;
    }
    case 'coach-reply': saveCoachReply(false); break;
    case 'settings': {
      const s = D.settings;
      const before = JSON.stringify([s.morningTime, s.weeklyDay, s.weeklyTime]);
      // Only write what you changed on this form. A sync can update settings while the page is open,
      // and saving the stale, older values would quietly undo it on every device.
      const shown = UI.settingsForm || {}, now = formSnapshot(f);
      const changed = (k) => k in now && (!(k in shown) || shown[k] !== now[k]);
      for (const k of ['name', 'buddyName', 'notionToken', 'dob', 'sex', 'maxHr', 'sleepBase', 'heightCm', 'bodyFat', 'leanKg', 'weightKg', 'activeStart', 'activeEnd', 'morningTime', 'journalTime', 'weeklyTime', 'bedTime', 'wakeTime', 'bedGoal', 'restUntil', 'calendarUrl', 'notionUrl', 'intervalsKey', 'intervalsAthlete', 'chessSite', 'chessUser', 'goodreadsUrl']) if (changed(k)) s[k] = String(fd.get(k) || '').trim();
      if (changed('nudgeMode')) { const v = String(fd.get('nudgeMode')); if (v.startsWith('h')) { s.nudgeMode = 'hours'; s.nudgeEveryHours = Number(v.slice(1)) || 2; } else s.nudgeMode = v; }
      if (changed('theme')) { s.theme = String(fd.get('theme')); applyTheme(); }
      if (changed('proteinTarget')) s.proteinTarget = Number(fd.get('proteinTarget')) || 0;
      if (changed('weeklyDay')) s.weeklyDay = Number(fd.get('weeklyDay')) || 0;
      if (changed('bedLead')) s.bedLead = Number(fd.get('bedLead')) || 0;
      for (const k of ['remindersOn', 'sound', 'launchAtLogin', 'buddy', 'notionAuto']) if (changed(k)) s[k] = fd.get(k) === 'on';
      s.buddyName = s.buddyName || 'Mochi';
      if (changed('ankiOn')) { const was = s.ankiOn; s.ankiOn = fd.get('ankiOn') === 'on'; if (s.ankiOn && !was) setTimeout(() => syncAnki(true), 300); }
      if (gEnabled()) for (const k of ['googleTasks', 'googleCalendar', 'googleCalendarRead']) if (changed(k)) s[k] = fd.get(k) === 'on';
      bridge.setLogin(s.launchAtLogin); save(); calCache.at = 0; loadCalendar(true); toast('Settings saved'); rerender();
      if (gEnabled() && D.sync.recurring && before !== JSON.stringify([s.morningTime, s.weeklyDay, s.weeklyTime])) setupRecurringEvents(false).then(() => toast('Calendar reminders moved to the new times')).catch(() => {});
      if (s.intervalsKey && !D.sync.intervalsAt) syncIntervals(true);
      if (typeof syncLinks === 'function' && ['chessSite', 'chessUser', 'goodreadsUrl'].some(changed)) setTimeout(() => syncLinks(true), 300);
      break;
    }
  }
});

// What a form shows right now, field by field (checkboxes as true/false)
function formSnapshot(f) { const o = {}; for (const el of f.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value; return o; }

function stashJournalDraft() {
  const f = $('[data-form=journal]'); if (!f) return;
  const fd = new FormData(f); const t = UI.jdate || todayStr();
  const j = D.journal[t] = D.journal[t] || {};
  if (fd.has('freewrite')) {
    j.freewrite = String(fd.get('freewrite') || '').trim();
    // The box already shows any older separate answers, so they now live in the one text
    for (const k of ['win', 'blocker', 'grateful', 'tomorrow', 'matters']) delete j[k];
    j.prompt = JOURNAL_Q; j.deep = false;
  }
  if (UI.mood) j.mood = UI.mood;
  save();
}

function saveJournalForm() {
  const f = $('[data-form=journal]'); if (!f) return;
  stashJournalDraft();
  const t = UI.jdate || todayStr(); const j = D.journal[t];
  j.saved = true; j.at = new Date().toISOString();
  save();
}

function saveReviewForm() {
  const f = $('[data-form=review]'); if (!f) return;
  const fd = new FormData(f); const key = reviewKey();
  const rv = D.reviews[key] = D.reviews[key] || { priorities: [] };
  for (const k of ['win', 'struggle', 'lesson', 'stop', 'obstacle', 'ifthen']) rv[k] = String(fd.get(k) || '').trim();
  if (UI.rate) rv.rating = UI.rate;
  if (typeof areaScores === 'function') rv.balance = areaValues(areaScores(addDays(key, -6), key));
  const titles = [0, 1, 2].map(i => String(fd.get('p' + i) || '').trim()), gids = [0, 1, 2].map(i => String(fd.get('pg' + i) || ''));
  const old = rv.priorities || [];
  const next = [];
  titles.forEach((title, i) => {
    const ex = old[i];
    if (title) { if (ex) { if (ex.title !== title) { ex.title = title; markDirty(ex); } ex.goalId = gids[i]; next.push(ex); } else { const p = { id: uid(), title, done: false, goalId: gids[i] }; next.push(p); markDirty(p); } }
    else if (ex) queueRemoteDelete(ex);
  });
  rv.priorities = next; rv.at = new Date().toISOString();
  save();
}

function saveCoachReply(toTargets) {
  const ta = $('[data-form=coach-reply] [name=reply]'); const text = (ta && ta.value || '').trim();
  if (!text) { toast('Paste Claude\'s reply first'); return; }
  D.coach.push({ id: uid(), date: todayStr(), kind: coachPick || 'plan', text });
  let added = 0;
  if (toTargets) {
    const targetDay = coachPick === 'review' ? addDays(todayStr(), 1) : todayStr();
    const bullets = text.split('\n').map(l => l.trim()).filter(l => /^([-*•]|\d+[.)])\s+/.test(l)).map(l => l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim()).filter(l => l.length > 3 && l.length < 140);
    bullets.slice(0, 6).forEach(b => { const it = { id: uid(), title: b, goalId: '', done: false }; day(targetDay).targets.push(it); markDirty(it); added++; });
  }
  save(); toast(added ? `Saved, and ${added} targets added` : 'Coach note saved'); coachPick = null; go(added ? 'today' : 'coach');
}

// ---------- Goal & season modals ----------
function goalModal(g = null) {
  const isNew = !g;
  g = g || { id: uid(), name: '', why: '', area: UI.area || 'study', metric: 'hours', target: 50, unit: '', color: GOAL_COLORS[D.goals.length % GOAL_COLORS.length], logs: [] };
  let area = g.area || 'study';
  const metricOptions = (ar, cur) => {
    const fits = Object.entries(METRICS).filter(([, v]) => !v.areas || v.areas.includes(ar)), rest = Object.entries(METRICS).filter(([, v]) => v.areas && !v.areas.includes(ar));
    const opt = ([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.label}</option>`;
    return `<optgroup label="Good for ${esc(areaOf({ area: ar }).label)}">${fits.map(opt).join('')}</optgroup>${rest.length ? `<optgroup label="Other ways">${rest.map(opt).join('')}</optgroup>` : ''}`;
  };
  const m = modal(`<h2>${isNew ? 'New goal' : 'Edit goal'}</h2><p class="sub">Pick the part of your life it belongs to, then how Ascend should measure it.</p>
    <form>
      <div class="field"><label>Life area</label><div class="area-pick">${AREAS.map(a => `<button type="button" data-area-pick="${a.id}" class="${a.id === area ? 'on' : ''}" style="--c:${a.color}">${icon(a.icon)}${a.short}</button>`).join('')}</div></div>
      <div class="field"><label>Goal</label><input class="input" name="name" value="${esc(g.name)}" required maxlength="60" placeholder="Sleep 7.5 hours, play guitar 3× a week, call Mum every week"></div>
      <div class="field"><label>Why it matters to you</label><input class="input" name="why" value="${esc(g.why)}" maxlength="160" placeholder="Your reminders will show you this"></div>
      <div class="row"><div class="field grow"><label>Track it by</label><select class="input" name="metric">${metricOptions(area, g.metric)}</select></div>
        <div class="field" style="width:130px" id="targetField"><label id="targetLabel">Season target</label><input class="input" type="number" name="target" min="0" step="any" value="${g.target}" required></div>
        <div class="field" style="width:130px" id="timesField"><label>How often</label><select class="input" name="times">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${(Number(g.times) || 3) === n ? 'selected' : ''}>${n === 7 ? 'Every day' : n + '× a week'}</option>`).join('')}</select></div>
        <div class="field" style="width:120px" id="unitField"><label>Unit</label><input class="input" name="unit" value="${esc(g.unit)}" placeholder="chapters"></div>
        <div class="field" style="width:140px" id="keywordField"><label>Calendar keyword</label><input class="input" name="keyword" value="${esc(g.keyword || '')}" placeholder="Guitar"></div>
        <div class="field" style="width:130px" id="dirField"><label>Direction</label><select class="input" name="dir"><option value="-1" ${Number(g.dir) !== 1 ? 'selected' : ''}>Go down to</option><option value="1" ${Number(g.dir) === 1 ? 'selected' : ''}>Go up to</option></select></div></div>
      <p class="hint muted" id="metricHint" style="font-size:12px;margin:-6px 0 14px"></p>
      ${habitAutoFields(g)}
      <div class="field"><label>Colour</label><div class="swatches">${[...new Set([...GOAL_COLORS, ...AREAS.map(a => a.color)])].map(c => `<button type="button" data-color="${c}" style="background:${c}" class="${c === g.color ? 'on' : ''}" aria-label="Colour"></button>`).join('')}</div></div>
      <div class="modal-actions">${isNew ? '' : `<button type="button" class="btn ghost" data-local="archive" style="margin-right:auto;color:var(--off)">Archive goal</button>`}<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Create goal' : 'Save'}</button></div>
    </form>`);
  let color = g.color, lastMetric = g.metric;
  const show = (id, on) => { $('#' + id, m).style.display = on ? '' : 'none'; };
  const syncFields = () => {
    const mv = $('[name=metric]', m).value, meta = METRICS[mv] || {};
    show('unitField', mv === 'count'); show('timesField', mv === 'habit'); show('autoField', mv === 'habit'); show('keywordField', mv === 'calendar'); show('dirField', mv === 'weight'); show('targetField', mv !== 'habit');
    $('[name=keyword]', m).required = mv === 'calendar';
    $('#targetLabel', m).textContent = meta.kind === 'level' ? `Aim for (${meta.unit})` : 'Season target';
    $('#metricHint', m).textContent = meta.hint || '';
    if (mv !== lastMetric && METRIC_DEFAULTS[mv] != null && (isNew || mv !== g.metric)) $('[name=target]', m).value = METRIC_DEFAULTS[mv];
    lastMetric = mv;
  };
  syncFields(); $('[name=metric]', m).addEventListener('change', syncFields); wireHabitAuto(m);
  m.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-color]'); if (sw) { color = sw.dataset.color; $$('[data-color]', m).forEach(b => b.classList.toggle('on', b === sw)); }
    const ap = e.target.closest('[data-area-pick]');
    if (ap) {
      area = ap.dataset.areaPick; $$('[data-area-pick]', m).forEach(b => b.classList.toggle('on', b === ap));
      const sel = $('[name=metric]', m), cur = sel.value; sel.innerHTML = metricOptions(area, cur);
      if (isNew) sel.value = { health: 'sleep', mind: 'habit', hobbies: 'habit', people: 'habit', study: 'questions' }[area];
      if (isNew) { color = areaOf({ area }).color; $$('[data-color]', m).forEach(b => b.classList.toggle('on', b.dataset.color === color)); }
      syncFields();
    }
    if (e.target.closest('[data-local=archive]')) { g.archived = true; save(); closeModal(); rerender(); toast('Goal archived'); }
  });
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const metric = fd.get('metric');
    Object.assign(g, { area, name: String(fd.get('name')).trim(), why: String(fd.get('why') || '').trim(), metric, target: Number(fd.get('target')) || 1, unit: String(fd.get('unit') || '').trim(), color });
    if (metric === 'habit') { g.times = Number(fd.get('times')) || 3; g.target = goalTarget(g); readHabitAuto(g, fd); }
    if (metric === 'calendar') g.keyword = String(fd.get('keyword') || '').trim();
    if (metric === 'weight') g.dir = Number(fd.get('dir')) || -1;
    if (isNew) D.goals.push(g);
    save(); closeModal(); go('goals'); if (isNew) { confetti(90); toast(metric === 'habit' ? 'Habit set. Tick it off on Today.' : 'Goal set. Let\'s climb.'); }
    if (metric === 'calendar') setTimeout(() => syncLinks(), 400);
  });
}

function logGoalModal(g) {
  const m = modal(`<h2>Log progress</h2><p class="sub">${esc(g.name)} · ${goalProgress(g)} / ${g.target} ${esc(unitOf(g))}</p>
    <form><div class="row"><div class="field grow"><label>Amount (${esc(unitOf(g) || 'units')})</label><input class="input" type="number" step="0.1" name="amount" value="1" required></div>
    <div class="field grow"><label>Date</label><input class="input" type="date" name="date" value="${todayStr()}"></div></div>
    <div class="field"><label>Note</label><input class="input" name="note" placeholder="Optional"></div>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Log it</button></div></form>`);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    g.logs = g.logs || []; g.logs.push({ date: fd.get('date') || todayStr(), amount: Number(fd.get('amount')) || 0, note: String(fd.get('note') || '') });
    save(); closeModal(); go('goals'); confetti(60); toast('Progress logged');
  });
}

function seasonModal() {
  const m = modal(`<h2>Season</h2><p class="sub">A season is a focused stretch, usually 12 weeks, to make real progress on a few goals.</p>
    <form><div class="field"><label>Name</label><input class="input" name="name" value="${esc(D.season.name)}"></div>
    <div class="row"><div class="field grow"><label>Starts</label><input class="input" type="date" name="start" value="${D.season.start}"></div>
    <div class="field grow"><label>Length</label><select class="input" name="weeks">${[4, 6, 8, 10, 12, 16].map(w => `<option value="${w}" ${D.season.weeks === w ? 'selected' : ''}>${w} weeks</option>`).join('')}</select></div></div>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    D.season = { name: String(fd.get('name') || 'Season').trim(), start: fd.get('start') || D.season.start, weeks: Number(fd.get('weeks')) || 12 };
    save(); closeModal(); go('goals');
  });
}

function onboarding() {
  const m = modal(`<div class="onb-mark"><svg viewBox="0 0 32 32" width="64" height="64"><path d="M3 27 L13 9 L18 17 L22 12 L29 27 Z" fill="#FF4F1F"/><path d="M13 9 L16 14.4 L13.6 15.6 L11.2 13.2 Z" fill="#fff"/><circle cx="24.5" cy="6.5" r="3" fill="#D4F53C"/></svg></div>
    <h2 style="text-align:center">Welcome to Ascend</h2><p class="sub" style="text-align:center">Your daily climb toward the goals that matter. Let's set up the basics.</p>
    <form><div class="field"><label>What should I call you?</label><input class="input" name="name" required placeholder="Your first name"></div>
    <p class="muted" style="font-size:12.5px;margin-bottom:14px">${META.detectedDrive ? 'Your data will be saved in your Google Drive folder, in a folder called Ascend.' : 'Your data is saved on this computer. You can move it into Google Drive later in Settings.'}</p>
    <div class="modal-actions"><button class="btn primary big shine" type="submit" style="width:100%">Start climbing</button></div></form>`);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault(); D.settings.name = String(new FormData(e.target).get('name')).trim(); D.settings.onboarded = true;
    bridge.setLogin(true); save(); closeModal(); go('today'); confetti(140);
  });
}

// ---------- Tooltip ----------
const tip = document.createElement('div');
tip.className = 'tip';
document.body.appendChild(tip);
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el && el.dataset.tip) {
    tip.textContent = el.dataset.tip; tip.classList.add('on');
    const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px';
    if (el.tagName === 'rect') el.setAttribute('fill', 'rgba(24,26,51,.05)');
    $$('rect[data-tip]').forEach(r => { if (r !== el) r.setAttribute('fill', 'transparent'); });
  } else { tip.classList.remove('on'); $$('rect[data-tip]').forEach(r => r.setAttribute('fill', 'transparent')); }
});

// ---------- View registry ----------
const VIEWS = { today: viewToday, focus: viewFocus, goals: viewGoals, fitness: viewFitness, journal: viewJournal, review: viewReview, coach: viewCoach, settings: viewSettings };
const AFTER = {
  today: (fresh) => {
    const dd = day(todayStr());
    Motion.climb(dd.targets.length ? dd.targets.filter(x => x.done).length / dd.targets.length : 0, fresh);
    if (fresh) Motion.countUp($('#view'));
    loadCalendar();
    if (D.activeSession) startTimerLoop();
  },
  focus: (fresh) => { if (fresh) Motion.countUp($('#view')); if (D.activeSession) startTimerLoop(); },
  goals: (fresh) => { if (fresh) Motion.countUp($('#view')); },
  journal: (fresh) => {
    if (!fresh) return;
    if (UI.jtab === 'review') { UI.rate = (D.reviews[reviewKey()] || {}).rating || 0; Motion.countUp($('#view')); return; }
    const j = D.journal[UI.jdate || todayStr()] || {}; UI.mood = j.mood || 0; UI.wordBurst = wordCount(journalText(j)) >= 150;
  },
  coach: () => { loadCalendar(); fitNotes(); },
  settings: async () => { const f = $('[data-form=settings]'); if (f) UI.settingsForm = formSnapshot(f); const img = $('#pairQr'); if (img && bridge.qr) { const url = await bridge.qr(pairingCode()); if (url) img.src = url; } }
};

function migrate(d) {
  const base = defaults();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, season: { ...base.season, ...(d.season || {}) } };
  for (const k of ['goals', 'sessions', 'workouts', 'coach', 'syncQueue', 'exams', 'people', 'qbank', 'gts', 'mistakes', 'labs']) if (!Array.isArray(out[k])) out[k] = [];
  if (out.links && typeof out.links !== 'object') out.links = null;
  if (out.anki && (typeof out.anki !== 'object' || !out.anki.days)) out.anki = null;
  if (out.hc && (typeof out.hc !== 'object' || !out.hc.days)) out.hc = null;
  for (const k of ['days', 'journal', 'reviews', 'wellness', 'sync', 'tomb', 'habitLog', 'habitSkip', 'protein', 'reserve']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  if (out.activeSession && Date.now() - out.activeSession.start > 12 * 3600e3) out.activeSession = null;
  out.version = 2;
  return out;
}

// ---------- Boot ----------
async function boot() {
  const r = await bridge.load();
  META = { dataDir: r.dataDir, file: r.file, detectedDrive: r.detectedDrive };
  D = migrate(r.data || defaults());
  primeStamps(D);
  applyTheme();
  // Older versions could count a night or a workout from two sources twice: repair that before anything is shown
  if (typeof cleanSources === 'function') cleanSources();
  if (ASCEND_IS_MOBILE) document.body.classList.add('mobile');
  save();
  go('today');
  if (!D.settings.onboarded) onboarding();
  else if (typeof showQuoteSplash === 'function') showQuoteSplash();
  if (D.activeSession) startTimerLoop();

  bridge.on('navigate', (v) => {
    if (v && typeof v === 'object') {
      if (v.focusTask) UI.focusTask = v.focusTask;
      if (v.focusGoal) UI.focusGoal = v.focusGoal;
      go(v.view || 'today');
      if (v.focusAdd) setTimeout(() => { const el = $('#addTitle'); if (el) { el.focus(); el.closest('.add-row').classList.add('flash'); } }, 200);
    } else go(v);
  });
  bridge.on('request-nudge', async (p) => {
    if (['checkin', 'nudge', 'weekly'].includes(p.kind)) await loadCalendar().catch(() => {});
    const n = buildNudge(p.kind, p.force);
    if (n) bridge.showPopup(n);
  });
  startBackgroundSync();
  updateTray();
  if (typeof onBooted === 'function') onBooted();
  let lastDay = todayStr();
  setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); calCache.at = 0; rerender(); } }, 60e3);
  setInterval(() => { if (currentView === 'today' && !$('.scrim') && !document.activeElement.matches('input,textarea,select')) rerender(); }, 30 * 60e3);
}
document.addEventListener('DOMContentLoaded', boot);
