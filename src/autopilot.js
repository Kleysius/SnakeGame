// A small heuristic AI that plays the attract-mode demo behind the main menu:
// chase the nearest treat, but never walk into a pocket smaller than the snake.

import { DIRS } from "./game.js";

const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

export function autopilot(state) {
  const head = state.snake[0];
  const target = state.mouse ?? state.chili ?? state.food;
  const blocked = new Set(state.snake.slice(0, -1).map(key));
  let best = state.dir;
  let bestValue = -Infinity;

  for (const dir of Object.keys(DIRS)) {
    if (dir === OPPOSITE[state.dir]) continue;
    const next = move(state, head, dir);
    if (!next || blocked.has(key(next))) continue;
    const room = flood(state, next, blocked, state.snake.length * 2);
    const dist = target ? distance(state, next, target) : 0;
    const value = (room >= state.snake.length ? 1000 : room * 10) - dist + Math.random() * 0.5;
    if (value > bestValue) {
      bestValue = value;
      best = dir;
    }
  }
  return best;
}

function move(state, c, dir) {
  let x = c.x + DIRS[dir].x;
  let y = c.y + DIRS[dir].y;
  if (state.wrap) {
    x = (x + state.cols) % state.cols;
    y = (y + state.rows) % state.rows;
  } else if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return null;
  return { x, y };
}

function flood(state, start, blocked, limit) {
  const seen = new Set([key(start)]);
  const stack = [start];
  while (stack.length && seen.size < limit) {
    const c = stack.pop();
    for (const dir of Object.keys(DIRS)) {
      const n = move(state, c, dir);
      if (!n) continue;
      const k = key(n);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return seen.size;
}

function distance(state, a, b) {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (state.wrap) {
    dx = Math.min(dx, state.cols - dx);
    dy = Math.min(dy, state.rows - dy);
  }
  return dx + dy;
}

const key = (c) => `${c.x},${c.y}`;
