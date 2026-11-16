'use strict';

/* ================= Datos ================= */

// Niveles de esfuerzo (0..5). El color tiñe el fondo y el gráfico.
const EFFORTS = [
  { name: 'Muy ligero',  color: '#3b82f6', bg: '#1e3a8a' },
  { name: 'Ligero',      color: '#22c55e', bg: '#14532d' },
  { name: 'Moderado',    color: '#eab308', bg: '#713f12' },
  { name: 'Intenso',     color: '#f97316', bg: '#c2410c' },
  { name: 'Muy intenso', color: '#ef4444', bg: '#991b1b' },
  { name: 'Máximo',      color: '#f43f5e', bg: '#6b0f24' },
];

const POSITIONS = {
  sentado:      { name: 'Sentado',      short: 'sentado' },
  de_pie:       { name: 'De pie',       short: 'de pie' },
  estiramiento: { name: 'Estiramiento', short: 'estiramientos' },
};

const PRE_ANNOUNCE_SECONDS = 10;

/* ================= Utilidades ================= */

const $ = (id) => document.getElementById(id);

function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function storageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

// Añade a cada tramo su inicio y devuelve la duración total.
function prepareRoutine(routine) {
  let t = 0;
  for (const seg of routine.segments) { seg.start = t; t += seg.duration; }
  routine.total = t;
  return routine;
}

function segmentIndexAt(routine, elapsed) {
  const segs = routine.segments;
  for (let i = 0; i < segs.length; i++) {
    if (elapsed < segs[i].start + segs[i].duration) return i;
  }
  return segs.length - 1;
}

// Agrupa tramos seguidos con mismo esfuerzo y posición, para que
// "Próximo cambio" apunte a un cambio real y no a una división interna.
function nextChangeIndex(routine, idx) {
  const segs = routine.segments;
  const cur = segs[idx];
  for (let i = idx + 1; i < segs.length; i++) {
    if (segs[i].effort !== cur.effort || segs[i].position !== cur.position) return i;
  }
  return -1;
}

/* ================= Gráfico ================= */

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawChart(svg, routine, { withProgress = false } = {}) {
  const H = 100;
  const total = routine.total;
  svg.setAttribute('viewBox', `0 0 ${total} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = '';

  const gap = Math.max(1, total / 400);
  for (const seg of routine.segments) {
    const h = ((seg.effort + 1) / EFFORTS.length) * (H - 6);
    const color = EFFORTS[seg.effort].color;
    const x = seg.start + gap / 2;
    const w = Math.max(0.5, seg.duration - gap);
    svg.appendChild(rect(x, H - h, w, h, color, seg.position === 'estiramiento' ? 0.45 : 1));
    if (seg.position === 'de_pie') {
      // De pie: franja blanca arriba de la barra.
      svg.appendChild(rect(x, H - h, w, 5, '#fff', 0.85));
    }
  }

  if (withProgress) {
    const shade = rect(0, 0, 0, H, '#000', 0.5);
    shade.id = 'chart-shade';
    svg.appendChild(shade);
    const cursor = rect(0, 0, Math.max(1.5, total / 250), H, '#fff');
    cursor.id = 'chart-cursor';
    svg.appendChild(cursor);
  }
}

function rect(x, y, w, h, fill, opacity = 1) {
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('x', x); r.setAttribute('y', y);
  r.setAttribute('width', w); r.setAttribute('height', h);
  r.setAttribute('fill', fill);
  if (opacity !== 1) r.setAttribute('fill-opacity', opacity);
  return r;
}

function updateChartProgress(elapsed, total) {
  const shade = $('chart-shade');
  const cursor = $('chart-cursor');
  if (!shade) return;
  shade.setAttribute('width', elapsed);
  const w = Number(cursor.getAttribute('width'));
  cursor.setAttribute('x', Math.min(total - w, Math.max(0, elapsed - w / 2)));
}

/* ================= Avisos (voz y pitidos) ================= */

const Cues = {
  muted: storageGet('muted', false),
  audio: null,
  voice: null,

  unlock() {
    // Debe llamarse dentro de un toque del usuario (iOS/Android lo exigen).
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch { /* sin audio */ }
    if ('speechSynthesis' in window) {
      this.pickVoice();
      speechSynthesis.onvoiceschanged = () => this.pickVoice();
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  },

  pickVoice() {
    const voices = speechSynthesis.getVoices();
    this.voice =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('es') && v.localService) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('es')) ||
      null;
  },

  say(text) {
    if (this.muted || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice ? this.voice.lang : 'es-ES';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  },

  beep(freq = 880, ms = 140) {
    if (this.muted || !this.audio) return;
    const ctx = this.audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  },

  setMuted(m) {
    this.muted = m;
    storageSet('muted', m);
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  },
};

function describeShort(seg) {
  if (seg.position === 'estiramiento') return 'estiramientos';
  if (seg.effort <= 1 && /recupera/i.test(seg.label)) return 'recuperación';
  return `${POSITIONS[seg.position].short}, ${EFFORTS[seg.effort].name.toLowerCase()}`;
}

// Frase al empezar un tramo, según qué cambió respecto al anterior.
function transitionPhrase(prev, seg) {
  const parts = [];
  if (!prev || prev.position !== seg.position) {
    if (seg.position === 'de_pie') parts.push('¡De pie!');
    else if (seg.position === 'sentado' && prev) parts.push('Siéntate.');
    else if (seg.position === 'estiramiento') parts.push('Bájate de la bici y estira.');
  }
  if (seg.position !== 'estiramiento') {
    const level = EFFORTS[seg.effort].name.toLowerCase();
    if (!prev) parts.push(`Empezamos. ${seg.label}.`);
    else if (seg.effort > prev.effort) parts.push(`Sube la intensidad, ${level}.`);
    else if (seg.effort < prev.effort) parts.push(/recupera/i.test(seg.label) ? 'Recupera, baja la resistencia.' : `Baja la resistencia, ${level}.`);
    if (prev && /intervalo/i.test(seg.label)) {
      const m = seg.label.match(/intervalo (\d+) de (\d+)/i);
      if (m) parts.push(m[1] === m[2] ? '¡Último intervalo!' : `Intervalo ${m[1]}.`);
    }
  }
  return parts.join(' ');
}

/* ================= Reproductor ================= */

const Player = {
  routine: null,
  elapsedBefore: 0,
  startedAt: 0,
  running: false,
  timer: null,
  lastIdx: -1,
  lastWhole: null,
  preAnnounced: new Set(),
  wakeLock: null,
  finished: false,

  load(routine) {
    this.stop();
    this.routine = routine;
    this.elapsedBefore = 0;
    this.lastIdx = -1;
    this.lastWhole = null;
    this.preAnnounced = new Set();
    this.finished = false;
    $('w-name').textContent = routine.name;
    $('finished').hidden = true;
    drawChart($('chart'), routine, { withProgress: true });
    this.render();
  },

  elapsed() {
    const e = this.running ? this.elapsedBefore + (performance.now() - this.startedAt) / 1000 : this.elapsedBefore;
    return Math.min(e, this.routine.total);
  },

  play() {
    if (this.running || this.finished) return;
    Cues.unlock();
    this.startedAt = performance.now();
    this.running = true;
    this.timer = setInterval(() => this.tick(), 200);
    this.requestWakeLock();
    $('btn-play').classList.add('running');
    $('btn-play').setAttribute('aria-label', 'Pausar');
    if (this.lastIdx === -1) this.tick();
  },

  pause() {
    if (!this.running) return;
    this.elapsedBefore = this.elapsed();
    this.running = false;
    clearInterval(this.timer);
    this.releaseWakeLock();
    $('btn-play').classList.remove('running');
    $('btn-play').setAttribute('aria-label', 'Continuar');
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  stop() {
    this.pause();
    this.releaseWakeLock();
  },

  toggle() { this.running ? this.pause() : this.play(); },

  seekSegment(delta) {
    if (!this.routine || this.finished) return;
    const segs = this.routine.segments;
    const e = this.elapsed();
    let idx = segmentIndexAt(this.routine, e);
    // "Anterior" con más de 3 s en el tramo vuelve al inicio del mismo tramo.
    if (delta < 0 && e - segs[idx].start > 3) delta = 0;
    idx = Math.min(segs.length - 1, Math.max(0, idx + delta));
    this.elapsedBefore = segs[idx].start;
    if (this.running) this.startedAt = performance.now();
    this.lastWhole = null;
    this.tick();
  },

  tick() {
    const r = this.routine;
    const e = this.elapsed();
    const idx = segmentIndexAt(r, e);
    const seg = r.segments[idx];
    const segRemaining = seg.start + seg.duration - e;

    if (this.running) {
      if (idx !== this.lastIdx) {
        const prev = this.lastIdx >= 0 ? r.segments[idx - 1] : null;
        if (this.lastIdx >= 0) Cues.beep(1320, 300);
        const phrase = transitionPhrase(prev, seg);
        if (phrase) Cues.say(phrase);
      }

      const nci = nextChangeIndex(r, idx);
      if (nci !== -1) {
        const next = r.segments[nci];
        const untilChange = next.start - e;
        const whole = Math.ceil(untilChange);
        if (whole !== this.lastWhole) {
          if (whole === PRE_ANNOUNCE_SECONDS && !this.preAnnounced.has(nci) && next.start - seg.start >= PRE_ANNOUNCE_SECONDS + 3) {
            this.preAnnounced.add(nci);
            Cues.say(`En ${PRE_ANNOUNCE_SECONDS} segundos, ${describeShort(next)}.`);
          }
          if (whole >= 1 && whole <= 3 && this.lastWhole !== null) Cues.beep(880, 120);
          this.lastWhole = whole;
        }
      }

      if (e >= r.total) this.finish();
    }

    this.lastIdx = idx;
    this.render(e, idx, segRemaining);
  },

  finish() {
    this.pause();
    this.finished = true;
    Cues.beep(1320, 500);
    Cues.say('¡Clase terminada! Buen trabajo.');
    $('finished-text').textContent = `Completaste ${this.routine.name} (${fmt(this.routine.total)}).`;
    $('finished').hidden = false;
  },

  render(e = this.elapsed(), idx = segmentIndexAt(this.routine, e), segRemaining) {
    const r = this.routine;
    const seg = r.segments[idx];
    if (segRemaining === undefined) segRemaining = seg.start + seg.duration - e;
    const eff = EFFORTS[seg.effort];

    const ws = $('workout').style;
    ws.setProperty('--effort-bg', eff.bg);
    ws.setProperty('--effort-color', eff.color);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', eff.bg);

    $('c-effort').textContent = seg.position === 'estiramiento' ? 'Estirar' : eff.name;
    $('c-label').textContent = seg.label;
    $('c-seg-time').textContent = fmt(segRemaining);
    $('c-position').textContent = POSITIONS[seg.position].name;

    const nci = nextChangeIndex(r, idx);
    if (nci === -1) {
      $('c-next-time').textContent = fmt(r.total - e);
      $('c-next-what').textContent = 'Fin de la clase';
    } else {
      const next = r.segments[nci];
      $('c-next-time').textContent = fmt(next.start - e);
      const what = describeShort(next);
      $('c-next-what').textContent = what.charAt(0).toUpperCase() + what.slice(1);
    }

    $('w-clock').textContent = `${fmt(e)} / ${fmt(r.total)}`;
    updateChartProgress(e, r.total);
  },

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch { /* no disponible */ }
  },

  releaseWakeLock() {
    try { if (this.wakeLock) this.wakeLock.release(); } catch { /* ya liberado */ }
    this.wakeLock = null;
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Player.running) Player.requestWakeLock();
});

/* ================= Navegación ================= */

let routines = [];

async function loadRoutines() {
  const index = await (await fetch('routines/index.json')).json();
  routines = await Promise.all(
    index.map(async (item) => prepareRoutine(await (await fetch(item.file)).json()))
  );
}

function renderHome() {
  const list = $('routine-list');
  list.innerHTML = '';
  for (const r of routines) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'routine-card';
    btn.innerHTML = `<h2></h2><span class="meta"></span><p></p>`;
    btn.querySelector('h2').textContent = r.name;
    btn.querySelector('.meta').textContent = `${Math.round(r.total / 60)} min · ${r.segments.length} tramos`;
    btn.querySelector('p').textContent = r.description || '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    drawChart(svg, r);
    btn.appendChild(svg);
    btn.addEventListener('click', () => { location.hash = `#/rutina/${r.id}`; });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function route() {
  const m = location.hash.match(/^#\/rutina\/(.+)$/);
  const routine = m && routines.find((r) => r.id === decodeURIComponent(m[1]));
  if (routine) {
    $('home').hidden = true;
    $('workout').hidden = false;
    if (Player.routine !== routine) Player.load(routine);
  } else {
    Player.stop();
    Player.routine = null;
    $('workout').hidden = true;
    $('home').hidden = false;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#161616');
  }
}

function syncMuteButton() {
  const b = $('btn-mute');
  b.setAttribute('aria-pressed', String(Cues.muted));
  b.setAttribute('aria-label', Cues.muted ? 'Activar avisos' : 'Silenciar avisos');
}

$('btn-play').addEventListener('click', () => Player.toggle());
$('btn-prev').addEventListener('click', () => Player.seekSegment(-1));
$('btn-next').addEventListener('click', () => Player.seekSegment(1));
$('btn-back').addEventListener('click', () => { location.hash = ''; });
$('btn-finish-home').addEventListener('click', () => { location.hash = ''; });
$('btn-mute').addEventListener('click', () => { Cues.setMuted(!Cues.muted); syncMuteButton(); });
window.addEventListener('hashchange', route);

(async function init() {
  syncMuteButton();
  try {
    await loadRoutines();
  } catch (err) {
    $('routine-list').innerHTML = '<li class="muted">No se pudieron cargar las rutinas.</li>';
    console.error(err);
    return;
  }
  renderHome();
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
})();
