// Global tuning knobs. Everything gameplay-related lives here so balancing
// the game never requires digging through logic or rendering code.

export const GRID = { cols: 22, rows: 22 };

export const MODES = {
  classic: { id: "classic", label: "Classique", wrap: false, hint: "Les murs sont mortels" },
  portal: { id: "portal", label: "Portail", wrap: true, hint: "Traverse les bords du plateau" },
};

export const ITEMS = {
  apple: { points: 150, grow: 1 },
  golden: { points: 500, grow: 3 },
  mouse: { points: 350, grow: 2 },
  chili: { points: 100, grow: 1 },
};

export const RULES = {
  startLength: 3,
  itemsPerLevel: 5,
  // Eating again within this many ticks keeps the combo alive.
  comboWindow: 28,
  maxCombo: 5,
  goldenChance: 0.08,
  mouseChance: 0.35,
  mouseLifetime: 55, // ticks
  mouseMoveEvery: 4, // ticks
  maxQueuedTurns: 3,

  // 🌶️ Chili: optional risk. Eat it → faster snake, but every point ×3.
  chiliChance: 0.2,
  chiliMinLevel: 2,
  chiliLifetime: 60, // ticks before it withers
  spicyTicks: 55,
  spicyMultiplier: 3,
  spicySpeed: 0.72, // tick duration factor while spicy

  // 🪢 Lasso: close your body around an item to capture it remotely.
  lassoMaxPocket: 20, // max cells of the enclosed pocket
  lassoMultiplier: 3,

  // 😬 Near miss: brushing past your own body (not the neck).
  nearMissPoints: 30,
  nearMissMinIndex: 4,
  nearMissCooldown: 6, // ticks

  // 🌈 Frenzy: gauge filled by bold play; when full every point is doubled.
  feverTicks: 75,
  feverMultiplier: 2,
  feverGain: { eat: 0.12, nearMiss: 0.07, lasso: 0.3 },
};

// Tick duration in ms for a given level: starts relaxed, speeds up, capped.
export function tickInterval(level) {
  return Math.max(58, 135 - (level - 1) * 9);
}
