// Pure game logic: no DOM, no timers, no randomness outside the injected rng.
// `step()` advances the simulation by one tick and returns a list of events
// that the UI layer turns into sounds, particles and screen updates.

import { ITEMS, RULES } from "./config.js";

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

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
    score: 0,
    eaten: 0,
    miceEaten: 0,
    level: 1,
    combo: 0,
    maxCombo: 0,
    lastEatTick: -Infinity,
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

/** Fraction (1 → 0) of the combo window remaining. */
export function comboProgress(state) {
  if (state.combo < 2) return 0;
  const left = RULES.comboWindow - (state.tick - state.lastEatTick);
  return Math.max(0, left / RULES.comboWindow);
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
    next.x = (next.x + state.cols) % state.cols;
    next.y = (next.y + state.rows) % state.rows;
  } else if (!inBounds(state, next)) {
    return die(state, events, "wall");
  }

  const eatsFood = state.food && same(next, state.food);
  const eatsMouse = state.mouse && same(next, state.mouse);
  // The tail cell frees up this tick unless the snake is growing.
  const tailMoves = state.grow === 0 && !eatsFood && !eatsMouse;
  const body = tailMoves ? state.snake.slice(0, -1) : state.snake;
  if (body.some((s) => same(s, next))) return die(state, events, "self");

  state.snake.unshift(next);
  if (state.grow > 0) state.grow--;
  else if (tailMoves) state.snake.pop();

  if (eatsFood) {
    const kind = state.food.kind;
    eat(state, events, kind, next);
    state.food = spawnFood(state);
    if (!state.mouse && state.rng() < RULES.mouseChance) {
      state.mouse = spawnMouse(state);
      if (state.mouse) events.push({ type: "mouseSpawn" });
    }
  } else if (eatsMouse) {
    state.mouse = null;
    state.miceEaten++;
    eat(state, events, "mouse", next);
  }

  if (state.combo > 1 && state.tick - state.lastEatTick > RULES.comboWindow) {
    state.combo = 0;
    events.push({ type: "comboLost" });
  }

  updateMouse(state, events);

  if (!state.food) {
    state.alive = false;
    state.won = true;
    events.push({ type: "win" });
  }
  return events;
}

function eat(state, events, kind, at) {
  const item = ITEMS[kind];
  state.combo = state.tick - state.lastEatTick <= RULES.comboWindow ? state.combo + 1 : 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.lastEatTick = state.tick;

  const multiplier = comboMultiplier(state);
  const points = item.points * multiplier;
  // The item's first growth unit is the head we just added without popping.
  state.grow += item.grow - 1;
  state.score += points;
  state.eaten++;
  events.push({ type: "eat", kind, x: at.x, y: at.y, points, multiplier });

  const level = 1 + Math.floor(state.eaten / RULES.itemsPerLevel);
  if (level > state.level) {
    state.level = level;
    events.push({ type: "levelUp", level });
  }
}

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

function spawnFood(state) {
  const cell = randomFreeCell(state);
  if (!cell) return null;
  return { ...cell, kind: state.rng() < RULES.goldenChance ? "golden" : "apple", born: state.tick };
}

function spawnMouse(state) {
  const cell = randomFreeCell(state);
  if (!cell) return null;
  return { ...cell, ttl: RULES.mouseLifetime, maxTtl: RULES.mouseLifetime };
}

export function randomFreeCell(state) {
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (isFree(state, { x, y })) free.push({ x, y });
    }
  }
  if (!free.length) return null;
  return free[Math.floor(state.rng() * free.length)];
}

function isFree(state, c) {
  if (state.snake.some((s) => same(s, c))) return false;
  if (state.food && same(state.food, c)) return false;
  if (state.mouse && same(state.mouse, c)) return false;
  return true;
}

function die(state, events, cause) {
  state.alive = false;
  events.push({ type: "die", cause });
  return events;
}

const inBounds = (state, c) => c.x >= 0 && c.y >= 0 && c.x < state.cols && c.y < state.rows;
const same = (a, b) => a.x === b.x && a.y === b.y;
