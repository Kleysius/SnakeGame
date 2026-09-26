// App orchestration: a tiny state machine (menu → countdown → playing ⇄ paused
// → dying → over), a fixed-timestep loop driven by requestAnimationFrame, and
// the glue between game events and UI / sound / visual effects.

import { GRID, MODES, RULES } from "./config.js";
import { createGame, step, queueDirection, comboMultiplier, comboProgress, multiplier, tickDuration } from "./game.js";
import { Renderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { autopilot } from "./autopilot.js";
import { sfx, setMuted } from "./audio.js";
import * as storage from "./storage.js";

const $ = (sel) => document.querySelector(sel);
const ui = {
  app: $(".app"),
  canvas: $("#game"),
  board: $("#board"),
  score: $("#hud-score"),
  best: $("#hud-best"),
  level: $("#hud-level"),
  mult: $("#mult"),
  multTotal: $("#mult-total"),
  chipCombo: $("#chip-combo"),
  chipComboVal: $("#chip-combo-val"),
  chipFever: $("#chip-fever"),
  chipSpicy: $("#chip-spicy"),
  comboBar: $("#combo-bar"),
  fever: $("#fever"),
  feverFill: $("#fever-fill"),
  banner: $("#banner"),
  pauseBtn: $("#btn-pause"),
  muteBtn: $("#btn-mute"),
  countdown: $("#countdown"),
  toast: $("#toast"),
  screens: {
    menu: $("#screen-menu"),
    help: $("#screen-help"),
    pause: $("#screen-pause"),
    over: $("#screen-over"),
  },
  menuBest: $("#menu-best"),
  modeInputs: document.querySelectorAll("input[name=mode]"),
  modeHint: $("#mode-hint"),
  overTitle: $("#over-title"),
  overScore: $("#over-score"),
  overRecord: $("#over-record"),
  overStats: $("#over-stats"),
  overBoard: $("#over-board"),
};

// Dev/debug: `?autopilot` lets the AI play real games (handy to test balancing).
const AUTOPILOT = new URLSearchParams(location.search).has("autopilot");

const settings = storage.getSettings();
if (!MODES[settings.mode]) settings.mode = "classic";
setMuted(settings.muted);

const renderer = new Renderer(ui.canvas, GRID);

let phase = "menu";
let game = null;
let prevSnake = null;
let acc = 0;
let alpha = 0;
let last = performance.now();
let phaseTime = 0;
let startedAt = 0;
let shownScore = 0;
let toastTimer = 0;
let bannerTimer = 0;

// Which overlay screen belongs to which phase.
const SCREEN_OF = { menu: "menu", help: "help", paused: "pause", over: "over" };
const isDemo = () => phase === "menu" || phase === "help";

// ---- Game lifecycle ---------------------------------------------------------

function newGame() {
  bannerQueue.length = 0;
  clearTimeout(bannerTimer);
  ui.banner.classList.remove("pop");
  game = createGame({ ...GRID, wrap: MODES[settings.mode].wrap });
  prevSnake = clone(game.snake);
  acc = 0;
  alpha = 0;
  renderer.setWrap(game.wrap);
  renderer.clearEffects();
}

function setPhase(next) {
  phase = next;
  phaseTime = 0;
  ui.app.dataset.phase = next;
  for (const [name, el] of Object.entries(ui.screens)) {
    const visible = SCREEN_OF[next] === name;
    el.hidden = !visible;
    if (visible) requestAnimationFrame(() => el.querySelector("[data-autofocus]")?.focus({ preventScroll: true }));
  }
  ui.pauseBtn.disabled = !(next === "playing" || next === "paused");
}

function showMenu() {
  newGame(); // Demo game played by the autopilot behind the menu.
  refreshMenu();
  setPhase("menu");
}

function startGame() {
  sfx.unlock();
  newGame();
  shownScore = 0;
  updateHud(true);
  setPhase("countdown");
  countdownStep = -1;
}

function pause() {
  if (phase !== "playing") return;
  setPhase("paused");
}

function resume() {
  if (phase !== "paused") return;
  last = performance.now();
  setPhase("playing");
}

function togglePause() {
  if (phase === "playing") pause();
  else if (phase === "paused") resume();
}

function finishGame() {
  const won = game.won;
  const duration = Math.round((performance.now() - startedAt) / 1000);
  const rank = storage.addScore(settings.mode, {
    score: game.score,
    level: game.level,
    length: game.snake.length,
    date: new Date().toISOString(),
  });

  ui.overTitle.textContent = won ? "Victoire !" : "Game Over";
  ui.overTitle.classList.toggle("win", won);
  ui.overRecord.hidden = rank !== 0;
  animateNumber(ui.overScore, game.score, 900);

  const s = game.stats;
  const stats = [
    ["Pommes", game.eaten - game.miceEaten - s.chilis],
    ["Souris", game.miceEaten],
    ["Niveau", game.level],
    ["Combo max", `×${Math.min(game.maxCombo, RULES.maxCombo) || 1}`],
    ["🪢 Lassos", s.lassos],
    ["😬 Frôlés", s.nearMisses],
    ["🌈 Frénésies", s.fevers],
    ["Meilleur coup", s.bestHit.toLocaleString("fr-FR")],
    ["Durée", formatDuration(duration)],
  ];
  ui.overStats.replaceChildren(
    ...stats.map(([label, value]) => {
      const div = document.createElement("div");
      div.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
      return div;
    }),
  );
  renderLeaderboard(ui.overBoard, storage.getScores(settings.mode), rank);
  if (rank === 0) sfx.win();
  setPhase("over");
}

// ---- Main loop ----------------------------------------------------------------

let countdownStep = -1;
const COUNTDOWN = ["3", "2", "1", "GO!"];
const COUNTDOWN_STEP = 0.55;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  phaseTime += dt;
  const time = now / 1000;

  if (isDemo() || phase === "playing") {
    const demo = isDemo();
    let interval = demo ? 85 : tickDuration(game);
    acc += dt * 1000;
    while (acc >= interval && game.alive) {
      acc -= interval;
      if (demo || AUTOPILOT) queueDirection(game, autopilot(game));
      prevSnake = clone(game.snake);
      handleEvents(step(game), demo);
      if (!demo) rhythm();
      interval = demo ? 85 : tickDuration(game);
    }
    alpha = Math.min(1, acc / interval);
    // Restart the demo a short beat after the autopilot crashes.
    if (demo && !game.alive && acc > 900) newGame();
  } else if (phase === "countdown") {
    const idx = Math.floor(phaseTime / COUNTDOWN_STEP);
    if (idx !== countdownStep) {
      countdownStep = idx;
      if (idx < COUNTDOWN.length) {
        ui.countdown.textContent = COUNTDOWN[idx];
        ui.countdown.classList.remove("pop");
        void ui.countdown.offsetWidth; // restart CSS animation
        ui.countdown.classList.add("pop");
        idx < 3 ? sfx.tick() : sfx.go();
      }
    }
    if (idx >= COUNTDOWN.length - 1 && phaseTime >= (COUNTDOWN.length - 1) * COUNTDOWN_STEP) {
      startedAt = performance.now();
      acc = 0;
      setPhase("playing");
    }
  } else if (phase === "dying" && phaseTime > 1.2) {
    finishGame();
  }

  const dying = phase === "dying" ? phaseTime : 0;
  renderer.render(game, prevSnake, alpha, dt, time, { dying });
  updateHud();
  requestAnimationFrame(frame);
}

/** Per-tick music: frenzy bass line and a racing heartbeat under the chili. */
function rhythm() {
  if (!game.alive) return;
  if (game.fever > 0) sfx.feverBeat(game.tick);
  else if (game.spicy > 0 && game.tick % 5 === 0) sfx.heartbeat();
}

const EAT_COLORS = { apple: "#ff4d6d", golden: "#ffd23f", mouse: "#e2e8f0", chili: "#ff7a1a" };

function handleEvents(events, demo) {
  const head = game.snake[0];
  for (const e of events) {
    switch (e.type) {
      case "eat": {
        const big = e.kind !== "apple";
        renderer.burst(e.x, e.y, EAT_COLORS[e.kind], big ? 26 : 14, big ? 1.4 : 1);
        if (demo) break;
        const label = e.multiplier > 1 ? `+${e.points.toLocaleString("fr-FR")} ×${e.multiplier}` : `+${e.points}`;
        const color = e.lasso ? "#ffd23f" : e.fever ? `hsl(${(performance.now() / 4) % 360}, 95%, 70%)` : e.spicy ? "#ff9a3c" : e.kind === "golden" ? "#ffd23f" : e.multiplier > 1 ? "#5eead4" : "#fff";
        renderer.floatText(e.x, e.y - 0.6, label, color);
        if (e.kind === "golden") {
          sfx.golden();
          renderer.ripple(e.x, e.y, "#ffd23f");
          renderer.shake(0.25);
          renderer.flash("#ffd23f", 0.12);
        } else if (e.kind === "mouse") {
          sfx.mouse();
          renderer.shake(0.15);
        } else if (e.kind !== "chili" && !e.lasso) sfx.eat(e.multiplier);
        if (e.multiplier >= 15) renderer.shake(0.3);
        ui.score.parentElement.classList.remove("bump");
        void ui.score.offsetWidth;
        ui.score.parentElement.classList.add("bump");
        break;
      }
      case "lasso":
        renderer.lasso(e.cells);
        if (demo) break;
        sfx.lasso();
        renderer.ripple(e.x, e.y, "#ffd23f");
        renderer.shake(0.2);
        showBanner("LASSO !", `×${RULES.lassoMultiplier}`, "lasso");
        navigator.vibrate?.(30);
        break;
      case "nearMiss":
        if (demo) break;
        sfx.nearMiss();
        renderer.spark(e.hx, e.hy, e.x, e.y);
        renderer.floatText(e.hx, e.hy - 0.8, `Frôlé ! +${e.points}`, "#a5f3fc");
        break;
      case "feverStart":
        if (demo) break;
        sfx.feverStart();
        renderer.flash("#ffffff", 0.3);
        renderer.ripple(head.x, head.y, "#f0abfc");
        showBanner("FRÉNÉSIE !", "tous les points ×2", "fever");
        break;
      case "feverEnd":
        if (!demo) sfx.feverEnd();
        break;
      case "chiliSpawn":
        if (demo) break;
        sfx.chiliSpawn();
        showToast("Un piment ! Oseras-tu ? 🌶️");
        break;
      case "spicyStart":
        if (demo) break;
        sfx.spicyStart();
        renderer.flash("#ff5a00", 0.25);
        renderer.shake(0.35);
        showBanner("PIMENT !", "×3 · ça va vite !", "spicy");
        navigator.vibrate?.([20, 30, 20]);
        break;
      case "spicyEnd":
        if (demo) break;
        sfx.spicyEnd();
        showToast("Le piment retombe… 😮‍💨");
        break;
      case "levelUp":
        if (demo) break;
        sfx.levelUp();
        renderer.ripple(head.x, head.y, "#a0c431");
        renderer.flash("#a0c431", 0.12);
        showToast(`Niveau ${e.level} · ça accélère !`);
        break;
      case "mouseSpawn":
        if (!demo) {
          sfx.squeak();
          showToast("Une souris ! Attrape-la… ou piège-la 🪢");
        }
        break;
      case "mouseEscaped":
        if (!demo) sfx.squeak();
        break;
      case "die":
        renderer.burst(head.x, head.y, "#ff6b6b", 30, 1.6);
        if (demo) {
          acc = 0;
          break;
        }
        sfx.die();
        renderer.shake(0.9);
        renderer.flash("#ff2e4d", 0.35);
        navigator.vibrate?.([60, 40, 120]);
        setPhase("dying");
        break;
      case "win":
        if (demo) break;
        renderer.flash("#ffd23f", 0.5);
        setPhase("dying");
        break;
    }
  }
}

// ---- HUD & screens ------------------------------------------------------------

let hudCache = {};
function updateHud(force = false) {
  if (!game) return;
  const playing = !isDemo();
  const target = playing ? game.score : 0;
  shownScore = force ? target : shownScore + (target - shownScore) * 0.18;
  if (Math.abs(target - shownScore) < 1) shownScore = target;
  const best = Math.max(storage.bestScore(settings.mode), playing ? game.score : 0);

  setText("score", ui.score, Math.round(shownScore).toLocaleString("fr-FR"));
  setText("best", ui.best, best.toLocaleString("fr-FR"));
  setText("level", ui.level, playing ? game.level : "–");

  // Multiplier breakdown.
  const combo = playing ? comboMultiplier(game) : 1;
  const progress = playing ? comboProgress(game) : 0;
  const fever = playing && game.fever > 0;
  const spicy = playing && game.spicy > 0;
  const comboOn = combo > 1 && progress > 0;
  const total = playing ? multiplier(game) : 1;
  const totalText = `×${total}`;
  if (hudCache.total !== totalText && hudCache.total !== undefined && total > 1) {
    ui.multTotal.classList.remove("bump");
    void ui.multTotal.offsetWidth;
    ui.multTotal.classList.add("bump");
  }
  setText("total", ui.multTotal, totalText);
  setText("comboVal", ui.chipComboVal, `×${combo}`);
  toggle("multOn", ui.mult, "on", total > 1, force);
  toggle("hot", ui.mult, "hot", spicy, force);
  toggle("insane", ui.mult, "insane", total >= 15, force);
  toggle("comboOn", ui.chipCombo, "on", comboOn, force);
  toggle("feverOn", ui.chipFever, "on", fever, force);
  toggle("spicyOn", ui.chipSpicy, "on", spicy, force);
  ui.comboBar.style.transform = `scaleX(${progress})`;

  // Frenzy gauge: fills up, then drains while the frenzy lasts.
  const gauge = !playing ? 0 : fever ? game.fever / RULES.feverTicks : game.feverGauge;
  ui.feverFill.style.transform = `scaleX(${gauge})`;
  toggle("feverFull", ui.fever, "full", fever, force);
}

function toggle(key, el, cls, on, force) {
  if (hudCache[key] === on && !force) return;
  hudCache[key] = on;
  el.classList.toggle(cls, on);
}

// Banners play one after another so simultaneous events (a lasso that fills
// the frenzy gauge…) are all celebrated.
const bannerQueue = [];
function showBanner(title, subtitle, cls) {
  bannerQueue.push({ title, subtitle, cls });
  if (bannerQueue.length === 1) playBanner();
}

function playBanner() {
  const b = bannerQueue[0];
  if (!b) return;
  ui.banner.className = `banner b-${b.cls}`;
  ui.banner.innerHTML = `${b.title}<small>${b.subtitle}</small>`;
  void ui.banner.offsetWidth;
  ui.banner.classList.add("pop");
  clearTimeout(bannerTimer);
  // Hand over early when another banner is waiting.
  bannerTimer = setTimeout(() => {
    ui.banner.classList.remove("pop");
    bannerQueue.shift();
    playBanner();
  }, bannerQueue.length > 1 ? 700 : 1100);
}

function setText(key, el, value) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  el.textContent = value;
}

function refreshMenu() {
  ui.modeInputs.forEach((input) => (input.checked = input.value === settings.mode));
  ui.modeHint.textContent = MODES[settings.mode].hint;
  const best = storage.bestScore(settings.mode);
  ui.menuBest.textContent = best ? `Record : ${best.toLocaleString("fr-FR")}` : "Aucun record pour l'instant";
  hudCache = {};
}

function renderLeaderboard(list, scores, highlight) {
  if (!scores.length) {
    list.innerHTML = `<li class="empty">Pas encore de score</li>`;
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  list.replaceChildren(
    ...scores.map((s, i) => {
      const li = document.createElement("li");
      if (i === highlight) li.className = "current";
      const date = new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
      li.innerHTML = `<span class="rank">${medals[i] ?? i + 1}</span><span class="pts">${s.score.toLocaleString("fr-FR")}</span><span class="meta">niv. ${s.level} · ${date}</span>`;
      return li;
    }),
  );
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1600);
}

function animateNumber(el, to, duration) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))).toLocaleString("fr-FR");
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function updateMuteButton() {
  ui.muteBtn.setAttribute("aria-pressed", String(settings.muted));
  ui.muteBtn.setAttribute("aria-label", settings.muted ? "Activer le son" : "Couper le son");
  ui.muteBtn.classList.toggle("off", settings.muted);
}

function toggleMute() {
  settings.muted = !settings.muted;
  setMuted(settings.muted);
  storage.saveSettings(settings);
  updateMuteButton();
}

// ---- Wiring -----------------------------------------------------------------------

bindInput({
  surface: ui.board,
  dpad: $("#dpad"),
  onDirection(dir) {
    if (phase !== "playing" && phase !== "countdown") return false;
    queueDirection(game, dir);
    return true;
  },
  onPause(code) {
    if (phase === "help" && code === "Escape") setPhase("menu");
    else if (phase === "menu" && code === "Space") startGame();
    else if (phase === "over" && code === "Space") startGame();
    else if (phase === "paused" && code === "Escape") resume();
    else togglePause();
  },
  onConfirm() {
    if (phase === "menu" || phase === "over") startGame();
    else if (phase === "paused") resume();
  },
  onMute: toggleMute,
});

document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  ({
    play: startGame,
    resume,
    menu: showMenu,
    help: () => setPhase("help"),
    back: () => setPhase("menu"),
    pause: togglePause,
    mute: toggleMute,
  })[action]?.();
});

ui.modeInputs.forEach((input) =>
  input.addEventListener("change", () => {
    settings.mode = input.value;
    storage.saveSettings(settings);
    showMenu();
  }),
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("blur", pause);

// ---- Helpers ------------------------------------------------------------------------

function clone(snake) {
  return snake.map((s) => ({ x: s.x, y: s.y }));
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  return m ? `${m}m${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

if (AUTOPILOT) window.__snake = { get game() { return game; } };

updateMuteButton();
showMenu();
requestAnimationFrame(frame);
