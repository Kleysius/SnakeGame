import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, step, queueDirection, comboMultiplier, multiplier, tickDuration } from "../src/game.js";
import { ITEMS, RULES, tickInterval } from "../src/config.js";

// Deterministic rng: always 0.99 → never golden, never spawns a mouse.
const rng = () => 0.99;
const make = (opts = {}) => createGame({ cols: 10, rows: 10, rng, ...opts });

test("snake starts with the configured length, heading right", () => {
  const g = make();
  assert.equal(g.snake.length, RULES.startLength);
  assert.equal(g.dir, "right");
});

test("food never spawns on the snake", () => {
  for (let i = 0; i < 50; i++) {
    const g = createGame({ cols: 5, rows: 5, rng: Math.random });
    assert.ok(!g.snake.some((s) => s.x === g.food.x && s.y === g.food.y));
  }
});

test("reversing direction is ignored instead of killing the snake", () => {
  const g = make();
  assert.equal(queueDirection(g, "left"), false);
  step(g);
  assert.ok(g.alive);
});

test("quick turns are buffered and applied one per tick", () => {
  const g = make();
  g.food = { x: 0, y: 0, kind: "apple" };
  queueDirection(g, "up");
  queueDirection(g, "left");
  const head = { ...g.snake[0] };
  step(g);
  assert.deepEqual(g.snake[0], { x: head.x, y: head.y - 1 });
  step(g);
  assert.deepEqual(g.snake[0], { x: head.x - 1, y: head.y - 1 });
});

test("hitting a wall ends the game in classic mode", () => {
  const g = make();
  g.food = { x: 0, y: 0, kind: "apple" };
  const events = [];
  for (let i = 0; i < 10 && g.alive; i++) events.push(...step(g));
  assert.equal(g.alive, false);
  assert.ok(events.some((e) => e.type === "die" && e.cause === "wall"));
});

test("portal mode wraps around the edges", () => {
  const g = make({ wrap: true });
  g.food = { x: 0, y: 0, kind: "apple" };
  for (let i = 0; i < 12; i++) step(g);
  assert.ok(g.alive);
  assert.equal(g.snake[0].y, 5);
});

test("eating an apple grows the snake and scores", () => {
  const g = make();
  const head = g.snake[0];
  g.food = { x: head.x + 1, y: head.y, kind: "apple" };
  const events = step(g);
  assert.equal(g.snake.length, RULES.startLength + ITEMS.apple.grow);
  assert.equal(g.score, ITEMS.apple.points);
  assert.ok(events.some((e) => e.type === "eat" && e.kind === "apple"));
});

test("golden apple grows by several segments over the next ticks", () => {
  const g = make({ wrap: true });
  const head = g.snake[0];
  g.food = { x: head.x + 1, y: head.y, kind: "golden" };
  step(g);
  g.food = { x: 0, y: 9, kind: "apple" };
  for (let i = 0; i < 3; i++) step(g);
  assert.equal(g.snake.length, RULES.startLength + ITEMS.golden.grow);
});

test("eating quickly builds a combo multiplier", () => {
  const g = make({ wrap: true });
  const head = g.snake[0];
  g.food = { x: head.x + 1, y: head.y, kind: "apple" };
  step(g);
  g.food = { x: head.x + 2, y: head.y, kind: "apple" };
  const events = step(g);
  assert.equal(comboMultiplier(g), 2);
  assert.equal(events.find((e) => e.type === "eat").points, ITEMS.apple.points * 2);
});

test("the snake may move into the cell its tail is leaving", () => {
  const g = createGame({ cols: 10, rows: 10, rng });
  // A 4-long snake in a 2x2 square: moving into the tail cell is legal.
  g.snake = [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 1 },
  ];
  g.dir = "up";
  g.food = { x: 9, y: 9, kind: "apple" };
  queueDirection(g, "right");
  step(g);
  assert.ok(g.alive);
});

test("running into the body is fatal", () => {
  const g = createGame({ cols: 10, rows: 10, rng });
  g.snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 3, y: 1 },
  ];
  g.dir = "up";
  g.food = { x: 9, y: 9, kind: "apple" };
  queueDirection(g, "right");
  const events = step(g);
  assert.equal(g.alive, false);
  assert.equal(events[0].cause, "self");
});

test("levels go up every few items eaten", () => {
  const g = make({ wrap: true });
  const events = [];
  for (let i = 0; i < RULES.itemsPerLevel; i++) {
    const head = g.snake[0];
    g.food = { x: (head.x + 1) % 10, y: head.y, kind: "apple" };
    events.push(...step(g));
  }
  assert.equal(g.level, 2);
  assert.ok(events.some((e) => e.type === "levelUp"));
});

// ---- Lasso, near miss, chili, frenzy -------------------------------------------

test("closing the body around an item captures it with the lasso bonus", () => {
  const g = make();
  // A U-shaped snake around (5,5); moving left from (6,4) to (5,4) seals it.
  g.snake = [
    { x: 6, y: 4 },
    { x: 6, y: 5 },
    { x: 6, y: 6 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 4, y: 5 },
    { x: 4, y: 4 },
    { x: 4, y: 3 },
  ];
  g.dir = "up";
  g.food = { x: 5, y: 5, kind: "apple" };
  queueDirection(g, "left");
  const events = step(g);
  const lasso = events.find((e) => e.type === "lasso");
  assert.ok(lasso, "expected a lasso event");
  assert.deepEqual(lasso.cells, [{ x: 5, y: 5 }]);
  const eat = events.find((e) => e.type === "eat");
  assert.equal(eat.lasso, true);
  assert.equal(eat.points, ITEMS.apple.points * RULES.lassoMultiplier);
  assert.equal(g.grow, ITEMS.apple.grow);
  assert.ok(g.food && !(g.food.x === 5 && g.food.y === 5));
});

test("items in the open are never lassoed", () => {
  const g = make();
  g.food = { x: 8, y: 1, kind: "apple" };
  const events = step(g);
  assert.ok(!events.some((e) => e.type === "lasso"));
});

test("brushing past the body scores a near miss once per approach", () => {
  const g = make();
  g.snake = [
    { x: 5, y: 3 },
    { x: 5, y: 4 },
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
    { x: 3, y: 4 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 3, y: 1 },
  ];
  g.dir = "up";
  g.grow = 5; // keep the tail in place
  g.food = { x: 9, y: 9, kind: "apple" };
  const events = step(g); // head → (5,2), no body next to it
  assert.ok(!events.some((e) => e.type === "nearMiss"));
  queueDirection(g, "left");
  const e2 = step(g); // head → (4,2), next to (3,2)
  const miss = e2.find((e) => e.type === "nearMiss");
  assert.ok(miss);
  assert.equal(miss.points, RULES.nearMissPoints);
  assert.equal(g.stats.nearMisses, 1);
  queueDirection(g, "up");
  const e3 = step(g); // still hugging the body: no second reward
  assert.ok(!e3.some((e) => e.type === "nearMiss"));
});

test("eating a chili makes the snake faster and triples points for a while", () => {
  const g = make({ wrap: true });
  const head = g.snake[0];
  g.chili = { x: head.x + 1, y: head.y, ttl: 50, maxTtl: 50 };
  const events = step(g);
  assert.ok(events.some((e) => e.type === "spicyStart"));
  assert.ok(tickDuration(g) < tickInterval(g.level));
  assert.equal(multiplier(g), comboMultiplier(g) * RULES.spicyMultiplier);
  g.food = { x: 0, y: 0, kind: "apple" };
  let ended = false;
  for (let i = 0; i < RULES.spicyTicks && !ended; i++) ended = step(g).some((e) => e.type === "spicyEnd");
  assert.ok(ended);
  assert.equal(tickDuration(g), tickInterval(g.level));
});

test("an ignored chili withers away", () => {
  const g = make({ wrap: true });
  g.food = { x: 0, y: 0, kind: "apple" };
  g.chili = { x: 0, y: 9, ttl: 2, maxTtl: 2 };
  step(g);
  const events = step(g);
  assert.ok(events.some((e) => e.type === "chiliGone"));
  assert.equal(g.chili, null);
});

test("filling the frenzy gauge doubles points", () => {
  const g = make({ wrap: true });
  g.feverGauge = 0.95;
  const head = g.snake[0];
  g.food = { x: head.x + 1, y: head.y, kind: "apple" };
  const events = step(g);
  assert.ok(events.some((e) => e.type === "feverStart"));
  assert.equal(g.fever > 0, true);
  assert.equal(multiplier(g), comboMultiplier(g) * RULES.feverMultiplier);
});
