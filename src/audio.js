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
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.18, type: "triangle" }));
  },
};

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.35;
}
