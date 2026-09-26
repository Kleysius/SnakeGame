// Pure game logic: no DOM, no timers, no randomness outside the injected rng.
// `step()` advances the simulation by one tick and returns a list of events
// that the UI layer turns into sounds, particles and screen updates.

import { ITEMS, RULES, tickInterval } from "./config.js";

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
// Every collectible lives in its own slot on the state.
const SLOTS = ["food", "mouse", "chili"];

export function createGame({ cols, rows, wrap = false, rng = Math.random }) {
  const y = Math.floor(rows / 2);
  const snake = [];
  for (let i = 0; i < RULES.startLength; i++) snake.push({ x: 4 - i, y });

  const state = {
    cols,
    rows,
    wrap,
    rng,
    snake,
    dir: "right",
    queue: [],
    grow: 0,
    food: null,
    mouse: null,
    chili: null,
    score: 0,
    eaten: 0,
    miceEaten: 0,
    level: 1,
    combo: 0,
    maxCombo: 0,
    lastEatTick: -Infinity,
    spicy: 0, // ticks left
    fever: 0, // ticks left
    feverGauge: 0, // 0 → 1
    wasNear: false,
    lastNearMissTick: -Infinity,
    stats: { lassos: 0, nearMisses: 0, fevers: 0, chilis: 0, bestHit: 0 },
    tick: 0,
    alive: true,
    won: false,
  };
  state.food = spawnFood(state);
  return state;
}

/** Buffers a turn so quick successive key presses are never lost. */
export function queueDirection(state, dir) {
  if (!DIRS[dir] || !state.alive) return false;
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (dir === last || dir === OPPOSITE[last]) return false;
  if (state.queue.length >= RULES.maxQueuedTurns) return false;
  state.queue.push(dir);
  return true;
}

export function comboMultiplier(state) {
  return Math.max(1, Math.min(state.combo, RULES.maxCombo));
}

/** Everything currently boosting points (lasso aside, which is per capture). */
export function multiplier(state) {
  return (
    comboMultiplier(state) *
    (state.fever > 0 ? RULES.feverMultiplier : 1) *
    (state.spicy > 0 ? RULES.spicyMultiplier : 1)
  );
}

/** Fraction (1 → 0) of the combo window remaining. */
export function comboProgress(state) {
  if (state.combo < 2) return 0;
  const left = RULES.comboWindow - (state.tick - state.lastEatTick);
  return Math.max(0, left / RULES.comboWindow);
}

/** Current tick duration in ms: level speed, boosted while spicy. */
export function tickDuration(state) {
  return tickInterval(state.level) * (state.spicy > 0 ? RULES.spicySpeed : 1);
}

export function step(state) {
  const events = [];
  if (!state.alive) return events;
  state.tick++;

  if (state.queue.length) state.dir = state.queue.shift();
  const d = DIRS[state.dir];
  const head = state.snake[0];
  let next = { x: head.x + d.x, y: head.y + d.y };

  if (state.wrap) {
    next = wrapCell(state, next);
  } else if (!inBounds(state, next)) {
    return die(state, events, "wall");
  }

  const eaten = SLOTS.find((slot) => state[slot] && same(next, state[slot]));
  // The tail cell frees up this tick unless the snake is growing.
  const tailMoves = state.grow === 0 && !eaten;
  const body = tailMoves ? state.snake.slice(0, -1) : state.snake;
  if (body.some((s) => same(s, next))) return die(state, events, "self");

  state.snake.unshift(next);
  if (state.grow > 0) state.grow--;
  else if (tailMoves) state.snake.pop();

  if (eaten) collect(state, events, eaten, next, false);
  checkLasso(state, events);
  checkNearMiss(state, events);

  if (state.combo > 1 && state.tick - state.lastEatTick > RULES.comboWindow) {
    state.combo = 0;
    events.push({ type: "comboLost" });
  }

  updateMouse(state, events);
  updateTimers(state, events);

  if (!state.food) {
    state.alive = false;
    state.won = true;
    events.push({ type: "win" });
  }
  return events;
}

/** Removes the item in `slot` and applies all of its effects. */
function collect(state, events, slot, at, lasso) {
  const item = state[slot];
  const kind = slot === "food" ? item.kind : slot;
  state[slot] = null;
  eat(state, events, kind, at, lasso);

  if (slot === "mouse") state.miceEaten++;
  if (slot === "chili") {
    state.stats.chilis++;
    state.spicy = RULES.spicyTicks;
    events.push({ type: "spicyStart" });
  }
  if (slot === "food") {
    state.food = spawnFood(state);
    if (!state.mouse && state.rng() < RULES.mouseChance) {
      state.mouse = spawnTimed(state, RULES.mouseLifetime);
      if (state.mouse) events.push({ type: "mouseSpawn" });
    }
    if (!state.chili && state.spicy === 0 && state.level >= RULES.chiliMinLevel && state.rng() < RULES.chiliChance) {
      state.chili = spawnTimed(state, RULES.chiliLifetime);
      if (state.chili) events.push({ type: "chiliSpawn" });
    }
  }
}

function eat(state, events, kind, at, lasso) {
  const item = ITEMS[kind];
  state.combo = state.tick - state.lastEatTick <= RULES.comboWindow ? state.combo + 1 : 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.lastEatTick = state.tick;

  const mult = multiplier(state) * (lasso ? RULES.lassoMultiplier : 1);
  const points = item.points * mult;
  // Direct bites: the head we just added already counts as one growth unit.
  state.grow += lasso ? item.grow : item.grow - 1;
  state.score += points;
  state.eaten++;
  state.stats.bestHit = Math.max(state.stats.bestHit, points);
  events.push({
    type: "eat",
    kind,
    x: at.x,
    y: at.y,
    points,
    multiplier: mult,
    combo: comboMultiplier(state),
    fever: state.fever > 0,
    spicy: state.spicy > 0,
    lasso,
  });
  addFever(state, events, RULES.feverGain.eat);

  const level = 1 + Math.floor(state.eaten / RULES.itemsPerLevel);
  if (level > state.level) {
    state.level = level;
    events.push({ type: "levelUp", level });
  }
}

// ---- Lasso ------------------------------------------------------------------

function checkLasso(state, events) {
  const blocked = new Set(state.snake.map(key));
  for (const slot of SLOTS) {
    const item = state[slot];
    if (!item) continue;
    const cells = pocket(state, item, blocked, RULES.lassoMaxPocket);
    if (!cells) continue;
    state.stats.lassos++;
    const kind = slot === "food" ? item.kind : slot;
    events.push({ type: "lasso", kind, x: item.x, y: item.y, cells });
    addFever(state, events, RULES.feverGain.lasso);
    collect(state, events, slot, item, true);
  }
}

/**
 * Flood-fills from `start` through cells not occupied by the snake. Returns the
 * region's cells if it is a closed pocket of at most `limit` cells, else null.
 */
function pocket(state, start, blocked, limit) {
  const seen = new Set([key(start)]);
  const cells = [{ x: start.x, y: start.y }];
  for (let i = 0; i < cells.length; i++) {
    for (const n of neighbours(state, cells[i])) {
      const k = key(n);
      if (seen.has(k) || blocked.has(k)) continue;
      if (cells.length >= limit) return null;
      seen.add(k);
      cells.push(n);
    }
  }
  return cells;
}

// ---- Near miss & frenzy -------------------------------------------------------

function checkNearMiss(state, events) {
  const head = state.snake[0];
  const around = new Set(neighbours(state, head).map(key));
  let brushed = null;
  for (let i = RULES.nearMissMinIndex; i < state.snake.length; i++) {
    if (around.has(key(state.snake[i]))) {
      brushed = state.snake[i];
      break;
    }
  }
  const fresh = brushed && !state.wasNear && state.tick - state.lastNearMissTick >= RULES.nearMissCooldown;
  state.wasNear = !!brushed;
  if (!fresh) return;

  state.lastNearMissTick = state.tick;
  state.stats.nearMisses++;
  const points = RULES.nearMissPoints * multiplier(state);
  state.score += points;
  events.push({ type: "nearMiss", x: brushed.x, y: brushed.y, hx: head.x, hy: head.y, points });
  addFever(state, events, RULES.feverGain.nearMiss);
}

function addFever(state, events, amount) {
  if (state.fever > 0) return;
  state.feverGauge = Math.min(1, state.feverGauge + amount);
  if (state.feverGauge < 1) return;
  state.feverGauge = 0;
  state.fever = RULES.feverTicks;
  state.stats.fevers++;
  events.push({ type: "feverStart" });
}

function updateTimers(state, events) {
  if (state.fever > 0 && --state.fever === 0) events.push({ type: "feverEnd" });
  if (state.spicy > 0 && --state.spicy === 0) events.push({ type: "spicyEnd" });
  if (state.chili && --state.chili.ttl <= 0) {
    state.chili = null;
    events.push({ type: "chiliGone" });
  }
}

// ---- Mouse --------------------------------------------------------------------

function updateMouse(state, events) {
  const m = state.mouse;
  if (!m) return;
  m.ttl--;
  if (m.ttl <= 0) {
    state.mouse = null;
    events.push({ type: "mouseEscaped" });
    return;
  }
  if (state.tick % RULES.mouseMoveEvery !== 0) return;
  // Scurry to a random free neighbouring cell, preferring to flee the head.
  const head = state.snake[0];
  const options = Object.values(DIRS)
    .map((d) => ({ x: m.x + d.x, y: m.y + d.y }))
    .filter((c) => inBounds(state, c) && isFree(state, c));
  if (!options.length) return;
  const dist = (c) => Math.abs(c.x - head.x) + Math.abs(c.y - head.y);
  options.sort((a, b) => dist(b) - dist(a));
  const pick = state.rng() < 0.6 ? options[0] : options[Math.floor(state.rng() * options.length)];
  m.x = pick.x;
  m.y = pick.y;
}

// ---- Spawning -------------------------------------------------------------------

function spawnFood(state) {
  const cell = randomFreeCell(state);
  if (!cell) return null;
  return { ...cell, kind: state.rng() < RULES.goldenChance ? "golden" : "apple", born: state.tick };
}

function spawnTimed(state, ttl) {
  const cell = randomFreeCell(state);
  if (!cell) return null;
  return { ...cell, ttl, maxTtl: ttl };
}

/** A random free cell, preferably in the open (never inside a lasso pocket). */
export function randomFreeCell(state) {
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (isFree(state, { x, y })) free.push({ x, y });
    }
  }
  if (!free.length) return null;
  const blocked = new Set(state.snake.map(key));
  for (let tries = 0; tries < 25; tries++) {
    const cell = free[Math.floor(state.rng() * free.length)];
    if (!pocket(state, cell, blocked, RULES.lassoMaxPocket)) return cell;
  }
  return free[Math.floor(state.rng() * free.length)];
}

// ---- Helpers --------------------------------------------------------------------

function isFree(state, c) {
  if (state.snake.some((s) => same(s, c))) return false;
  return !SLOTS.some((slot) => state[slot] && same(state[slot], c));
}

function neighbours(state, c) {
  const out = [];
  for (const d of Object.values(DIRS)) {
    const n = { x: c.x + d.x, y: c.y + d.y };
    if (state.wrap) out.push(wrapCell(state, n));
    else if (inBounds(state, n)) out.push(n);
  }
  return out;
}

function die(state, events, cause) {
  state.alive = false;
  events.push({ type: "die", cause });
  return events;
}

const wrapCell = (state, c) => ({ x: (c.x + state.cols) % state.cols, y: (c.y + state.rows) % state.rows });
const inBounds = (state, c) => c.x >= 0 && c.y >= 0 && c.x < state.cols && c.y < state.rows;
const same = (a, b) => a.x === b.x && a.y === b.y;
const key = (c) => `${c.x},${c.y}`;
