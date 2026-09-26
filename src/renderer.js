// Canvas renderer: interpolates between simulation ticks for buttery-smooth
// motion at any refresh rate, and owns all purely visual effects (particles,
// floating texts, screen shake, flashes, ripples).

const TAU = Math.PI * 2;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

export class Renderer {
  constructor(canvas, { cols, rows }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.wrap = false;
    this.cell = 20;
    this.particles = [];
    this.floaters = [];
    this.ripples = [];
    this.shakeAmount = 0;
    this.flashAlpha = 0;
    this.flashColor = "#fff";
    this.mousePos = null;
    this.foodSpawn = { key: "", t: 0 };

    this.apple = loadImage("images/apple.svg");
    this.mouseImg = loadImage("images/mouse.svg");
    this.goldenApple = null;
    this.apple.addEventListener("load", () => this.buildGoldenApple());

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setWrap(wrap) {
    this.wrap = wrap;
    this.buildBackground();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.canvas.clientWidth;
    if (!w) return;
    this.cell = w / this.cols;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.cell * this.rows * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.buildBackground();
    this.buildGoldenApple();
  }

  // ---- Cached layers -------------------------------------------------------

  buildBackground() {
    const { cols, rows, cell } = this;
    const bg = document.createElement("canvas");
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const g = bg.getContext("2d");
    g.scale(this.dpr, this.dpr);
    const W = cols * cell;
    const H = rows * cell;

    g.fillStyle = "#0c1710";
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = (x + y) % 2 ? "#10200f" : "#132614";
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Tiny dots at grid intersections for texture.
    g.fillStyle = "rgba(160, 196, 49, 0.07)";
    for (let y = 1; y < rows; y++) {
      for (let x = 1; x < cols; x++) {
        g.beginPath();
        g.arc(x * cell, y * cell, Math.max(0.8, cell * 0.05), 0, TAU);
        g.fill();
      }
    }
    // Soft vignette.
    const v = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);

    // Edges: solid glowing walls in classic, dashed portals in portal mode.
    g.lineWidth = Math.max(2, cell * 0.12);
    if (this.wrap) {
      g.strokeStyle = "rgba(94, 234, 212, 0.55)";
      g.setLineDash([cell * 0.5, cell * 0.5]);
      g.shadowColor = "#5eead4";
    } else {
      g.strokeStyle = "rgba(160, 196, 49, 0.35)";
      g.shadowColor = "#a0c431";
    }
    g.shadowBlur = cell * 0.6;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
    this.background = bg;
  }

  buildGoldenApple() {
    if (!this.apple.complete || !this.apple.naturalWidth) return;
    const size = Math.ceil(this.cell * 1.3 * this.dpr);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.drawImage(this.apple, 0, 0, size, size);
    g.globalCompositeOperation = "source-atop";
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "rgba(255, 240, 150, 0.9)");
    grad.addColorStop(0.5, "rgba(255, 196, 0, 0.85)");
    grad.addColorStop(1, "rgba(200, 120, 0, 0.9)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.goldenApple = c;
  }

  // ---- Effects API ---------------------------------------------------------

  burst(gx, gy, color, count = 16, speed = 1) {
    if (reducedMotion.matches) count = Math.ceil(count / 3);
    const { cell } = this;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = (0.5 + Math.random()) * cell * 5 * speed;
      this.particles.push({
        x: (gx + 0.5) * cell,
        y: (gy + 0.5) * cell,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1,
        decay: 1.4 + Math.random(),
        size: cell * (0.08 + Math.random() * 0.12),
        color,
      });
    }
  }

  floatText(gx, gy, text, color) {
    const { cell } = this;
    // Keep the label inside the board even when eating along an edge.
    const x = Math.min(Math.max((gx + 0.5) * cell, cell * 2.5), (this.cols - 2.5) * cell);
    const y = Math.max((gy + 0.5) * cell, cell);
    this.floaters.push({ x, y, text, color, life: 1 });
  }

  ripple(gx, gy, color) {
    this.ripples.push({ x: (gx + 0.5) * this.cell, y: (gy + 0.5) * this.cell, r: 0, life: 1, color });
  }

  shake(amount) {
    if (!reducedMotion.matches) this.shakeAmount = Math.max(this.shakeAmount, amount * this.cell);
  }

  flash(color, alpha = 0.35) {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  clearEffects() {
    this.particles.length = 0;
    this.floaters.length = 0;
    this.ripples.length = 0;
    this.mousePos = null;
  }

  // ---- Frame ---------------------------------------------------------------

  render(state, prevSnake, alpha, dt, time, { dying = 0 } = {}) {
    const { ctx, cell } = this;
    const W = this.cols * cell;
    const H = this.rows * cell;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shakeAmount > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shakeAmount, (Math.random() - 0.5) * this.shakeAmount);
      this.shakeAmount *= Math.pow(0.001, dt);
    } else this.shakeAmount = 0;

    if (this.background) ctx.drawImage(this.background, 0, 0, W, H);

    if (state) {
      this.drawFood(state, time);
      this.drawMouse(state, dt, time);
      this.drawSnake(state, prevSnake, alpha, time, dying);
    }
    this.drawEffects(dt);
    ctx.restore();

    if (this.flashAlpha > 0.01) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this.flashAlpha *= Math.pow(0.02, dt);
    }
  }

  drawFood(state, time) {
    const f = state.food;
    if (!f) return;
    const { ctx, cell } = this;
    const key = `${f.x},${f.y}`;
    if (this.foodSpawn.key !== key) this.foodSpawn = { key, t: time };
    const age = Math.min(1, (time - this.foodSpawn.t) / 0.35);
    const pop = easeOutBack(age);

    const cx = (f.x + 0.5) * cell;
    const cy = (f.y + 0.5) * cell + Math.sin(time * 3) * cell * 0.06;
    const golden = f.kind === "golden";

    // Glow halo.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.2);
    glow.addColorStop(0, golden ? "rgba(255, 210, 60, 0.55)" : "rgba(221, 46, 68, 0.35)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - cell * 1.2, cy - cell * 1.2, cell * 2.4, cell * 2.4);

    const size = cell * (golden ? 1.2 : 1.05) * pop * (1 + Math.sin(time * 6) * 0.03);
    const img = golden ? this.goldenApple : this.apple;
    if (img && (img.width || img.naturalWidth)) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);

    if (golden) {
      // Orbiting sparkles.
      ctx.fillStyle = "#fff6c2";
      for (let i = 0; i < 3; i++) {
        const a = time * 2 + (i * TAU) / 3;
        const r = cell * 0.75;
        drawSparkle(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cell * 0.12 * (1 + Math.sin(time * 8 + i) * 0.4));
      }
    }
  }

  drawMouse(state, dt, time) {
    const m = state.mouse;
    const { ctx, cell } = this;
    if (!m) {
      this.mousePos = null;
      return;
    }
    if (!this.mousePos || Math.hypot(this.mousePos.x - m.x, this.mousePos.y - m.y) > 2) {
      this.mousePos = { x: m.x, y: m.y, born: time };
    }
    const k = Math.min(1, dt * 14);
    this.mousePos.x += (m.x - this.mousePos.x) * k;
    this.mousePos.y += (m.y - this.mousePos.y) * k;

    const cx = (this.mousePos.x + 0.5) * cell;
    const cy = (this.mousePos.y + 0.5) * cell;
    const ratio = m.ttl / m.maxTtl;
    const urgent = ratio < 0.3;
    if (urgent && Math.floor(time * 8) % 2 === 0) ctx.globalAlpha = 0.45;

    const pop = easeOutBack(Math.min(1, (time - this.mousePos.born) / 0.3));
    const wobble = Math.sin(time * 18) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);
    const size = cell * 1.05 * pop;
    if (this.mouseImg.complete) ctx.drawImage(this.mouseImg, -size / 2, -size / 2, size, size);
    ctx.restore();

    // Countdown ring.
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.strokeStyle = urgent ? "#ff5a6e" : "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawSnake(state, prevSnake, alpha, time, dying) {
    const { ctx, cell } = this;
    const snake = state.snake;
    if (!state.alive) alpha = 1;
    const center = (c) => ({ x: (c.x + 0.5) * cell, y: (c.y + 0.5) * cell });
    const lerp = (from, to) => {
      // Snap instead of interpolating across a portal edge.
      if (!from || Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) return center(to);
      return center({ x: from.x + (to.x - from.x) * alpha, y: from.y + (to.y - from.y) * alpha });
    };
    // Only the head and the tail tip slide between cells; every other point
    // sits on a real cell centre, so corners stay crisp while moving.
    const pts = [lerp(snake[1] ?? prevSnake?.[0], snake[0])];
    for (let i = 1; i < snake.length; i++) pts.push(center(snake[i]));
    const tail = snake[snake.length - 1];
    const prevTail = prevSnake?.[prevSnake.length - 1];
    if (snake.length > 1 && prevTail) pts.push(lerp(prevTail, tail));
    const n = pts.length;
    const connected = (a, b) => Math.abs(a.x - b.x) <= cell * 1.01 && Math.abs(a.y - b.y) <= cell * 1.01;

    const dead = !state.alive && !state.won;
    const blink = dead && Math.floor(dying * 10) % 2 === 0;
    const color = (t) => {
      if (dead) return blink ? "#ff6b6b" : `hsl(0, 0%, ${55 - t * 20}%)`;
      return `hsl(${80 + t * 70}, ${75 - t * 15}%, ${55 - t * 17}%)`;
    };
    const width = (t) => cell * (0.8 - t * 0.28);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Glow pass.
    ctx.strokeStyle = dead ? "rgba(255,80,80,0.18)" : "rgba(160,196,49,0.16)";
    ctx.lineWidth = cell * 1.15;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      if (connected(pts[i - 1], pts[i])) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Body, tail to head, with a colour gradient and tapering width.
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1);
      const a = pts[i];
      const b = pts[i - 1];
      ctx.strokeStyle = color(t);
      ctx.lineWidth = width(t);
      ctx.beginPath();
      if (connected(a, b)) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + 0.01, a.y);
      }
      ctx.stroke();
    }

    // Scale pattern: a darker dot on each body cell.
    ctx.fillStyle = dead ? "rgba(0,0,0,0.15)" : "rgba(10, 40, 10, 0.22)";
    for (let i = 1; i < n - 1; i++) {
      const s = width(i / (n - 1)) * 0.14;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, s, 0, TAU);
      ctx.fill();
    }

    this.drawHead(state, pts, time, dead, color(0));
  }

  drawHead(state, pts, time, dead, headColor) {
    const { ctx, cell } = this;
    const h = pts[0];
    let angle;
    if (pts.length > 1 && Math.hypot(h.x - pts[1].x, h.y - pts[1].y) > 0.5 && Math.hypot(h.x - pts[1].x, h.y - pts[1].y) <= cell * 1.01) {
      angle = Math.atan2(h.y - pts[1].y, h.x - pts[1].x);
    } else {
      angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[state.dir];
    }
    const r = cell * 0.5;

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(angle);

    // Tongue flick.
    const flick = (time % 1.6) / 1.6;
    if (!dead && flick < 0.12) {
      const len = r * (0.9 + Math.sin((flick / 0.12) * Math.PI) * 0.7);
      ctx.strokeStyle = "#e71b3f";
      ctx.lineWidth = Math.max(1.2, cell * 0.07);
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 0);
      ctx.lineTo(r * 0.6 + len, 0);
      ctx.moveTo(r * 0.6 + len, 0);
      ctx.lineTo(r * 0.6 + len + r * 0.3, -r * 0.2);
      ctx.moveTo(r * 0.6 + len, 0);
      ctx.lineTo(r * 0.6 + len + r * 0.3, r * 0.2);
      ctx.stroke();
    }

    // Head shape: slightly elongated.
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.ellipse(r * 0.1, 0, r * 1.02, r * 0.9, 0, 0, TAU);
    ctx.fill();
    // Specular highlight.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(r * 0.1, -r * 0.35, r * 0.6, r * 0.25, 0, 0, TAU);
    ctx.fill();

    // Eyes: pupils look at the food, and the snake blinks now and then.
    const target = state.food;
    const blinking = (time % 3.7) < 0.12;
    for (const side of [-1, 1]) {
      const ex = r * 0.35;
      const ey = side * r * 0.45;
      if (dead) {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        const s = r * 0.2;
        ctx.beginPath();
        ctx.moveTo(ex - s, ey - s);
        ctx.lineTo(ex + s, ey + s);
        ctx.moveTo(ex + s, ey - s);
        ctx.lineTo(ex - s, ey + s);
        ctx.stroke();
        continue;
      }
      if (blinking) {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = Math.max(1.2, cell * 0.06);
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.2, ey);
        ctx.lineTo(ex + r * 0.2, ey);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.3, 0, TAU);
      ctx.fill();
      let lx = 1;
      let ly = 0;
      if (target) {
        const wx = (target.x + 0.5) * cell - h.x;
        const wy = (target.y + 0.5) * cell - h.y;
        const la = Math.atan2(wy, wx) - angle;
        lx = Math.cos(la);
        ly = Math.sin(la);
      }
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(ex + lx * r * 0.12, ey + ly * r * 0.12, r * 0.16, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEffects(dt) {
    const { ctx, cell } = this;

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.life -= dt * 1.2;
      if (rp.life <= 0) {
        this.ripples.splice(i, 1);
        continue;
      }
      rp.r += dt * cell * 22;
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = rp.life;
      ctx.lineWidth = cell * 0.2 * rp.life;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, TAU);
      ctx.stroke();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, TAU);
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt * 0.9;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      f.y -= dt * cell * 2;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `700 ${Math.round(cell * 0.9)}px Handjet, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, cell * 0.15);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawSparkle(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 2);
  ctx.quadraticCurveTo(x, y, x + s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + s * 2);
  ctx.quadraticCurveTo(x, y, x - s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - s * 2);
  ctx.fill();
}
