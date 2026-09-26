// Keyboard, swipe and on-screen D-pad input, all funnelled into `onDirection`.
// Keys use `event.code` (physical position), so ZQSD on AZERTY and WASD on
// QWERTY both work out of the box, along with the arrow keys.

const KEY_DIRS = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

export function bindInput({ surface, dpad, onDirection, onPause, onConfirm, onMute }) {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEY_DIRS[e.code];
    if (dir) {
      // Only swallow the key when the game used it (keeps menus keyboard-navigable).
      if (onDirection(dir)) e.preventDefault();
    } else if (e.code === "Space" || e.code === "KeyP" || e.code === "Escape") {
      e.preventDefault();
      onPause(e.code);
    } else if (e.code === "Enter") {
      // Let focused buttons handle Enter natively.
      if (document.activeElement?.tagName === "BUTTON") return;
      e.preventDefault();
      onConfirm();
    } else if (e.code === "KeyM") {
      onMute();
    }
  });

  // Swipe: a direction fires as soon as the finger travels far enough, and the
  // origin resets so a single continuous gesture can chain several turns.
  let origin = null;
  const threshold = () => Math.max(18, surface.clientWidth / 18);
  surface.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    origin = { x: e.clientX, y: e.clientY };
  });
  surface.addEventListener("pointermove", (e) => {
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold()) return;
    onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    origin = { x: e.clientX, y: e.clientY };
  });
  const end = () => (origin = null);
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);

  // D-pad reacts on pointerdown: no 300ms click delay, feels instant.
  dpad.querySelectorAll("[data-dir]").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("pressed");
      navigator.vibrate?.(8);
      onDirection(btn.dataset.dir);
    });
    const release = () => btn.classList.remove("pressed");
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
  });
}
