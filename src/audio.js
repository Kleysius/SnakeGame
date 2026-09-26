// Tiny synthesized sound effects with the Web Audio API: zero asset to load.

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);
  return ctx;
}

function tone(freq, { at = 0, dur = 0.1, type = "square", vol = 0.3, slide = 0 } = {}) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered white noise burst: whooshes, whip cracks, sizzles.
function noise({ at = 0, dur = 0.2, vol = 0.2, freq = 1200, q = 1, type = "bandpass", sweep = 0 } = {}) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

// Frenzy bass line (A minor pentatonic), one note every other tick.
const FEVER_LINE = [110, 110, 165, 131, 147, 110, 196, 165];

export const sfx = {
  unlock: () => ensure(),
  eat(multiplier = 1) {
    const base = 520 * Math.pow(1.12, multiplier - 1);
    tone(base, { dur: 0.07, slide: 260 });
  },
  golden() {
    [660, 830, 990, 1320].forEach((f, i) => tone(f, { at: i * 0.05, dur: 0.12, type: "triangle" }));
  },
  mouse() {
    tone(880, { dur: 0.06, type: "triangle" });
    tone(1320, { at: 0.06, dur: 0.09, type: "triangle" });
  },
  squeak: () => tone(1800, { dur: 0.05, type: "sine", vol: 0.12, slide: 600 }),
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.14, type: "square", vol: 0.2 }));
  },
  turn: () => tone(220, { dur: 0.02, type: "sine", vol: 0.05 }),
  tick: () => tone(440, { dur: 0.08, type: "sine", vol: 0.2 }),
  go: () => tone(880, { dur: 0.2, type: "sine", vol: 0.25 }),
  die() {
    tone(300, { dur: 0.45, type: "sawtooth", vol: 0.25, slide: -240 });
    tone(150, { at: 0.1, dur: 0.5, type: "square", vol: 0.15, slide: -100 });
  },
  lasso() {
    noise({ dur: 0.12, vol: 0.5, freq: 3000, q: 0.8, sweep: -2500 });
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: 0.06 + i * 0.045, dur: 0.12, type: "triangle", vol: 0.22 }));
  },
  nearMiss() {
    noise({ dur: 0.18, vol: 0.25, freq: 600, q: 2, sweep: 2400 });
    tone(1400, { dur: 0.06, type: "sine", vol: 0.08, slide: 400 });
  },
  chiliSpawn() {
    noise({ dur: 0.35, vol: 0.12, freq: 5000, q: 0.5, type: "highpass" });
  },
  spicyStart() {
    noise({ dur: 0.6, vol: 0.3, freq: 4000, q: 0.4, type: "highpass" });
    tone(196, { dur: 0.35, type: "sawtooth", vol: 0.18, slide: 400 });
    tone(392, { at: 0.08, dur: 0.3, type: "square", vol: 0.12, slide: 600 });
  },
  spicyEnd: () => tone(500, { dur: 0.3, type: "sine", vol: 0.15, slide: -300 }),
  heartbeat() {
    tone(70, { dur: 0.09, type: "sine", vol: 0.45 });
    tone(62, { at: 0.13, dur: 0.1, type: "sine", vol: 0.35 });
  },
  feverStart() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, { at: i * 0.05, dur: 0.16, type: "square", vol: 0.16 }));
    noise({ at: 0.3, dur: 0.4, vol: 0.18, freq: 8000, q: 0.3, type: "highpass" });
  },
  feverEnd: () => [784, 587, 440].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.12, type: "triangle", vol: 0.15 })),
  feverBeat(n) {
    if (n % 2) return;
    const f = FEVER_LINE[(n / 2) % FEVER_LINE.length];
    tone(f, { dur: 0.1, type: "square", vol: 0.12 });
    if (n % 4 === 0) noise({ dur: 0.05, vol: 0.12, freq: 9000, q: 0.5, type: "highpass" });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.18, type: "triangle" }));
  },
};

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.35;
}
