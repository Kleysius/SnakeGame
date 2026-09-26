// Thin, failure-proof wrapper around localStorage (private mode, quotas and
// disabled storage must never break the game).

const KEY_SCORES = "snake.scores.v2";
const KEY_SETTINGS = "snake.settings.v2";
const MAX_SCORES = 5;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: silently keep in-memory state only */
  }
}

export function getScores(mode) {
  const all = read(KEY_SCORES, {});
  return Array.isArray(all[mode]) ? all[mode] : [];
}

export function bestScore(mode) {
  return getScores(mode)[0]?.score ?? 0;
}

/** Records a score and returns its rank (0-based) or -1 if it didn't make the board. */
export function addScore(mode, entry) {
  if (entry.score <= 0) return -1;
  const all = read(KEY_SCORES, {});
  const list = Array.isArray(all[mode]) ? all[mode] : [];
  const record = { ...entry, id: Date.now() };
  list.push(record);
  list.sort((a, b) => b.score - a.score);
  all[mode] = list.slice(0, MAX_SCORES);
  write(KEY_SCORES, all);
  return all[mode].indexOf(record);
}

export function getSettings() {
  return { muted: false, mode: "classic", ...read(KEY_SETTINGS, {}) };
}

export function saveSettings(settings) {
  write(KEY_SETTINGS, settings);
}
