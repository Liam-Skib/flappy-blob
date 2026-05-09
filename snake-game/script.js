(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });

  const elScore = document.getElementById("score");
  const elBest = document.getElementById("best");
  const elSpeed = document.getElementById("speed");

  const hud = document.getElementById("hud");
  const hudTitle = document.getElementById("hudTitle");
  const help = document.getElementById("help");

  const diffEasy = document.getElementById("diffEasy");
  const diffMedium = document.getElementById("diffMedium");
  const diffHard = document.getElementById("diffHard");

  const btnMusic = document.getElementById("btnMusic");
  const btnSfx = document.getElementById("btnSfx");

  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnStart = document.getElementById("btnStart");
  const btnShowHelp = document.getElementById("btnShowHelp");
  const btnCloseHelp = document.getElementById("btnCloseHelp");

  const tUp = document.getElementById("tUp");
  const tDown = document.getElementById("tDown");
  const tLeft = document.getElementById("tLeft");
  const tRight = document.getElementById("tRight");

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const choice = (arr) => arr[(Math.random() * arr.length) | 0];

  const Difficulties = {
    easy: { label: "Easy", grid: 10, tickMs: 135 },
    medium: { label: "Medium", grid: 12, tickMs: 110 },
    hard: { label: "Hard", grid: 16, tickMs: 82 },
  };

  let difficultyKey = "medium";
  let GRID = Difficulties[difficultyKey].grid;
  let CELL = canvas.width / GRID;
  let BASE_TICK_MS = Difficulties[difficultyKey].tickMs;

  const STORAGE_BEST = "neon-snake.best";
  const STORAGE_DIFF = "neon-snake.diff";
  const STORAGE_MUSIC = "neon-snake.music";
  const STORAGE_SFX = "neon-snake.sfx";

  const bestInit = Number(localStorage.getItem(STORAGE_BEST) || "0") || 0;
  let best = bestInit;
  elBest.textContent = String(best);

  const Colors = {
    a: "#7c3aed",
    b: "#22d3ee",
    c: "#f472b6",
    ok: "#34d399",
    warn: "#fb7185",
    ink: "rgba(0,0,0,.0)",
  };

  /** @type {{x:number,y:number}[]} */
  let snake = [];
  /** @type {{x:number,y:number}[]} */
  let prevSnake = [];
  /** @type {{x:number,y:number}} */
  let dir = { x: 1, y: 0 };
  /** @type {{x:number,y:number} | null} */
  let nextDir = null;

  let food = { x: 10, y: 10 };
  let score = 0;
  let speedMult = 1;
  let running = false;
  let paused = false;
  let dead = false;

  let lastTickAt = 0;
  let accMs = 0;
  let tickMs = BASE_TICK_MS;

  /** @type {{x:number,y:number,life:number,seed:number,color:string}[]} */
  const particles = [];
  /** @type {{x:number,y:number,life:number}[]} */
  const sparks = [];

  let pointerActive = false;
  let pointerStart = { x: 0, y: 0 };
  let pointerLast = { x: 0, y: 0 };

  function setHudVisible(v) {
    hud.hidden = !v;
  }

  function setHelpVisible(v) {
    help.hidden = !v;
  }

  function updateUi() {
    elScore.textContent = String(score);
    elBest.textContent = String(best);
    elSpeed.textContent = Difficulties[difficultyKey]?.label || "Medium";
    btnPause.textContent = paused ? "Resume" : "Pause";
    btnPause.setAttribute("aria-pressed", paused ? "true" : "false");
  }

  function setPressed(el, pressed) {
    el?.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function applyDifficultyUi() {
    setPressed(diffEasy, difficultyKey === "easy");
    setPressed(diffMedium, difficultyKey === "medium");
    setPressed(diffHard, difficultyKey === "hard");
  }

  function setDifficulty(key) {
    if (!Difficulties[key]) return;
    difficultyKey = key;
    localStorage.setItem(STORAGE_DIFF, key);
    GRID = Difficulties[key].grid;
    CELL = canvas.width / GRID;
    BASE_TICK_MS = Difficulties[key].tickMs;
    tickMs = BASE_TICK_MS / speedMult;
    applyDifficultyUi();
    resetGame();
  }

  function resetGame() {
    score = 0;
    speedMult = 1;
    running = false;
    paused = false;
    dead = false;
    nextDir = null;
    dir = { x: 1, y: 0 };
    snake = [
      { x: 8, y: 12 },
      { x: 7, y: 12 },
      { x: 6, y: 12 },
      { x: 5, y: 12 },
    ];
    // Re-center snake for different grids
    const dx = Math.floor(GRID / 2) - snake[0].x;
    const dy = Math.floor(GRID / 2) - snake[0].y;
    snake = snake.map((p) => ({ x: clamp(p.x + dx, 0, GRID - 1), y: clamp(p.y + dy, 0, GRID - 1) }));
    prevSnake = snake.map((p) => ({ x: p.x, y: p.y }));
    particles.length = 0;
    sparks.length = 0;
    accMs = 0;
    tickMs = BASE_TICK_MS;
    spawnFood();
    hudTitle.textContent = "Press Space to start";
    setHudVisible(true);
    updateUi();
    draw(0, 1);
  }

  function start() {
    if (dead) resetGame();
    running = true;
    paused = false;
    dead = false;
    setHudVisible(false);
    updateUi();
    audio.ensureStarted();
    if (audio.musicEnabled) audio.musicStart();
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      hudTitle.textContent = "Paused";
      setHudVisible(true);
      audio.musicStop();
    } else {
      setHudVisible(false);
      if (audio.musicEnabled) audio.musicStart();
    }
    updateUi();
  }

  function gameOver() {
    running = false;
    paused = false;
    dead = true;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_BEST, String(best));
    }
    audio.sfxGameOver();
    audio.musicStop();
    hudTitle.textContent = `Game Over · Score ${score}`;
    setHudVisible(true);
    updateUi();
  }

  function spawnFood() {
    const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
    /** @type {{x:number,y:number}[]} */
    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    food = free.length ? choice(free) : { x: 0, y: 0 };
    burst(food.x + 0.5, food.y + 0.5, 26, Colors.b);
  }

  function burst(cx, cy, count, color) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx + rand(-0.1, 0.1),
        y: cy + rand(-0.1, 0.1),
        life: rand(0.35, 0.9),
        seed: rand(0, Math.PI * 2),
        color,
      });
    }
  }

  function sparkle(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      sparks.push({ x: cx + rand(-0.1, 0.1), y: cy + rand(-0.1, 0.1), life: rand(0.2, 0.5) });
    }
  }

  function applyInput() {
    if (!nextDir) return;
    const nd = nextDir;
    nextDir = null;
    if (snake.length > 1) {
      if (nd.x === -dir.x && nd.y === -dir.y) return;
    }
    dir = nd;
  }

  function step() {
    prevSnake = snake.map((p) => ({ x: p.x, y: p.y }));
    applyInput();
    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;

    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      burst(head.x + 0.5, head.y + 0.5, 60, Colors.warn);
      sparkle(head.x + 0.5, head.y + 0.5, 28);
      return gameOver();
    }

    for (let i = 0; i < snake.length; i++) {
      const p = snake[i];
      if (p.x === nx && p.y === ny) {
        burst(nx + 0.5, ny + 0.5, 80, Colors.warn);
        sparkle(nx + 0.5, ny + 0.5, 36);
        return gameOver();
      }
    }

    snake.unshift({ x: nx, y: ny });

    const ate = nx === food.x && ny === food.y;
    if (ate) {
      score += 1;
      speedMult = clamp(1 + score * 0.04, 1, 2.05);
      tickMs = BASE_TICK_MS / speedMult;
      burst(nx + 0.5, ny + 0.5, 54, Colors.ok);
      sparkle(nx + 0.5, ny + 0.5, 24);
      audio.sfxEat();
      spawnFood();
    } else {
      snake.pop();
    }
    updateUi();
  }

  function drawGrid(t) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    const pulse = 0.35 + 0.15 * Math.sin(t * 0.0011);
    for (let i = 1; i < GRID; i++) {
      const x = i * CELL;
      const y = i * CELL;
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + pulse * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFood(t) {
    const cx = (food.x + 0.5) * CELL;
    const cy = (food.y + 0.5) * CELL;
    const r = CELL * (0.26 + 0.03 * Math.sin(t * 0.006));

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL * 0.85);
    glow.addColorStop(0, "rgba(34,211,238,.35)");
    glow.addColorStop(0.55, "rgba(124,58,237,.20)");
    glow.addColorStop(1, "rgba(0,0,0,0)");

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(food.x * CELL - CELL, food.y * CELL - CELL, CELL * 3, CELL * 3);

    ctx.shadowColor = "rgba(34,211,238,.75)";
    ctx.shadowBlur = 22;
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, Colors.b);
    g.addColorStop(0.55, Colors.a);
    g.addColorStop(1, Colors.c);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const k = clamp(t, 0, 1);
    return 1 - Math.pow(1 - k, 3);
  }

  function drawSnake(t, alpha) {
    if (!snake.length) return;

    const a = easeOutCubic(alpha);
    const n = snake.length;
    /** @type {{x:number,y:number}[]} */
    const renderPts = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = snake[i];
      const q = prevSnake[i] || p;
      let x = lerp(q.x, p.x, a);
      let y = lerp(q.y, p.y, a);

      renderPts[i] = { x, y };
    }

    const head = renderPts[0];
    const tail = renderPts[renderPts.length - 1];

    const pathGlow = ctx.createLinearGradient(
      (tail.x + 0.5) * CELL,
      (tail.y + 0.5) * CELL,
      (head.x + 0.5) * CELL,
      (head.y + 0.5) * CELL,
    );
    pathGlow.addColorStop(0, "rgba(124,58,237,.95)");
    pathGlow.addColorStop(0.5, "rgba(34,211,238,.95)");
    pathGlow.addColorStop(1, "rgba(244,114,182,.95)");

    const r = CELL * 0.22;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = pathGlow;
    ctx.shadowColor = "rgba(34,211,238,.35)";
    ctx.shadowBlur = 18;
    ctx.lineWidth = CELL * 0.56;
    ctx.beginPath();
    ctx.moveTo((renderPts[renderPts.length - 1].x + 0.5) * CELL, (renderPts[renderPts.length - 1].y + 0.5) * CELL);
    for (let i = renderPts.length - 2; i >= 0; i--) {
      ctx.lineTo((renderPts[i].x + 0.5) * CELL, (renderPts[i].y + 0.5) * CELL);
    }
    ctx.stroke();

    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 8;
    for (let i = renderPts.length - 1; i >= 0; i--) {
      const p = renderPts[i];
      const cx = (p.x + 0.5) * CELL;
      const cy = (p.y + 0.5) * CELL;
      const k = 1 - i / Math.max(1, renderPts.length - 1);
      const rr = r + k * CELL * 0.12;
      const g = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.2, cx, cy, rr * 1.6);
      g.addColorStop(0, "rgba(255,255,255,.25)");
      g.addColorStop(0.25, "rgba(255,255,255,.10)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 1.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 1.12, 0, Math.PI * 2);
      ctx.fill();
    }

    const hx = (head.x + 0.5) * CELL;
    const hy = (head.y + 0.5) * CELL;
    ctx.shadowColor = "rgba(244,114,182,.55)";
    ctx.shadowBlur = 22;
    const hg = ctx.createLinearGradient(hx - CELL * 0.3, hy - CELL * 0.3, hx + CELL * 0.3, hy + CELL * 0.3);
    hg.addColorStop(0, Colors.c);
    hg.addColorStop(1, Colors.b);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, CELL * 0.26, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,.65)";
    const eyeOff = CELL * 0.11;
    ctx.beginPath();
    ctx.arc(
      hx +
        eyeOff * (dir.y !== 0 ? 1 : 0) +
        eyeOff * (dir.x === 1 ? 1 : dir.x === -1 ? -1 : 0),
      hy -
        eyeOff * (dir.x !== 0 ? 1 : 0) -
        eyeOff * (dir.y === 1 ? 1 : dir.y === -1 ? -1 : 0),
      CELL * 0.06,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      hx -
        eyeOff * (dir.y !== 0 ? 1 : 0) +
        eyeOff * (dir.x === 1 ? 1 : dir.x === -1 ? -1 : 0),
      hy +
        eyeOff * (dir.x !== 0 ? 1 : 0) -
        eyeOff * (dir.y === 1 ? 1 : dir.y === -1 ? -1 : 0),
      CELL * 0.06,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  function drawParticles(dt) {
    const step = dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= step;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const k = p.life;
      const a = p.seed;
      const sp = 2.2 + (1 - k) * 1.4;
      p.x += Math.cos(a) * sp * step;
      p.y += Math.sin(a) * sp * step;

      const px = p.x * CELL;
      const py = p.y * CELL;
      const r = CELL * (0.16 + (1 - k) * 0.08);

      ctx.save();
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 18 * clamp(k, 0, 1);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      g.addColorStop(0, p.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= step;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const k = s.life;
      const px = s.x * CELL;
      const py = s.y * CELL;
      ctx.save();
      ctx.globalAlpha = clamp(k * 2, 0, 1);
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - CELL * 0.18, py);
      ctx.lineTo(px + CELL * 0.18, py);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py - CELL * 0.18);
      ctx.lineTo(px, py + CELL * 0.18);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw(t, alpha) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bg = ctx.createRadialGradient(
      canvas.width * 0.55,
      canvas.height * 0.12,
      20,
      canvas.width * 0.55,
      canvas.height * 0.55,
      canvas.width * 0.9,
    );
    bg.addColorStop(0, "rgba(255,255,255,.04)");
    bg.addColorStop(0.35, "rgba(124,58,237,.06)");
    bg.addColorStop(0.65, "rgba(34,211,238,.05)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(t);
    drawFood(t);
    drawSnake(t, alpha);
  }

  function frame(now) {
    if (!lastTickAt) lastTickAt = now;
    const dtMs = now - lastTickAt;
    lastTickAt = now;
    const dt = clamp(dtMs / 1000, 0, 0.05);

    if (running && !paused) {
      accMs += dtMs;
      while (accMs >= tickMs) {
        step();
        accMs -= tickMs;
        if (!running) break;
      }
    }

    const alpha = running && !paused ? clamp(accMs / tickMs, 0, 1) : 1;
    draw(now, alpha);
    drawParticles(dt);
    requestAnimationFrame(frame);
  }

  function setDirection(x, y) {
    nextDir = { x, y };
    if (!running) {
      start();
    }
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === " " || k === "spacebar") {
      e.preventDefault();
      if (!running) start();
      else togglePause();
      return;
    }
    if (k === "p") return togglePause();
    if (k === "r") return resetGame();
    if (k === "arrowup" || k === "w") return setDirection(0, -1);
    if (k === "arrowdown" || k === "s") return setDirection(0, 1);
    if (k === "arrowleft" || k === "a") return setDirection(-1, 0);
    if (k === "arrowright" || k === "d") return setDirection(1, 0);
  }

  function bindButton(btn, x, y) {
    btn.addEventListener("click", () => setDirection(x, y));
  }

  function swipeDir(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    return dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse") return;
    pointerActive = true;
    pointerStart = { x: e.clientX, y: e.clientY };
    pointerLast = pointerStart;
  }

  function onPointerMove(e) {
    if (!pointerActive) return;
    pointerLast = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp() {
    if (!pointerActive) return;
    pointerActive = false;
    const dx = pointerLast.x - pointerStart.x;
    const dy = pointerLast.y - pointerStart.y;
    const d = Math.hypot(dx, dy);
    if (d < 18) return;
    const s = swipeDir(dx, dy);
    setDirection(s.x, s.y);
  }

  btnPause.addEventListener("click", togglePause);
  btnRestart.addEventListener("click", resetGame);
  btnStart.addEventListener("click", start);
  btnShowHelp.addEventListener("click", () => setHelpVisible(true));
  btnCloseHelp.addEventListener("click", () => setHelpVisible(false));

  diffEasy.addEventListener("click", () => setDifficulty("easy"));
  diffMedium.addEventListener("click", () => setDifficulty("medium"));
  diffHard.addEventListener("click", () => setDifficulty("hard"));

  bindButton(tUp, 0, -1);
  bindButton(tDown, 0, 1);
  bindButton(tLeft, -1, 0);
  bindButton(tRight, 1, 0);

  window.addEventListener("keydown", onKey, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onPointerUp, { passive: true });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: true });

  const audio = (() => {
    let ctxA = null;
    let master = null;
    let musicBus = null;
    let sfxBus = null;
    let musicTimer = null;
    let step = 0;

    let musicEnabled = (localStorage.getItem(STORAGE_MUSIC) || "0") === "1";
    let sfxEnabled = (localStorage.getItem(STORAGE_SFX) || "1") === "1";

    function ensureStarted() {
      if (ctxA) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctxA = new AC();
      master = ctxA.createGain();
      musicBus = ctxA.createGain();
      sfxBus = ctxA.createGain();
      master.gain.value = 0.75;
      musicBus.gain.value = 0.22;
      sfxBus.gain.value = 0.55;
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(ctxA.destination);
    }

    function setMusicEnabled(v) {
      musicEnabled = !!v;
      localStorage.setItem(STORAGE_MUSIC, musicEnabled ? "1" : "0");
      btnMusic.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
      if (!musicEnabled) musicStop();
      else if (running && !paused) musicStart();
    }

    function setSfxEnabled(v) {
      sfxEnabled = !!v;
      localStorage.setItem(STORAGE_SFX, sfxEnabled ? "1" : "0");
      btnSfx.setAttribute("aria-pressed", sfxEnabled ? "true" : "false");
    }

    function tone(freq, dur, type, gain, bus, detune = 0) {
      if (!ctxA || !bus) return;
      const o = ctxA.createOscillator();
      const g = ctxA.createGain();
      const f = ctxA.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = Math.max(400, freq * 3.2);
      f.Q.value = 0.7;
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const t0 = ctxA.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(f);
      f.connect(g);
      g.connect(bus);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    function sfxEat() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(660, 0.08, "triangle", 0.22, sfxBus);
      tone(990, 0.06, "sine", 0.16, sfxBus, 6);
    }

    function sfxGameOver() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(220, 0.22, "sawtooth", 0.26, sfxBus);
      tone(140, 0.28, "triangle", 0.20, sfxBus, -12);
    }

    function musicTick() {
      if (!ctxA || !musicEnabled) return;
      const scale = [0, 3, 7, 10]; // minor-ish
      const base = 196; // G3
      const n = scale[step % scale.length];
      const oct = step % 8 < 4 ? 1 : 2;
      const freq = base * Math.pow(2, (n + oct * 12) / 12);
      tone(freq, 0.16, "triangle", 0.07, musicBus);
      if (step % 4 === 0) {
        tone(base * 0.5, 0.28, "sine", 0.05, musicBus);
        tone(base * 0.5 * Math.pow(2, 7 / 12), 0.22, "sine", 0.03, musicBus);
      }
      step++;
    }

    function musicStart() {
      if (!musicEnabled) return;
      ensureStarted();
      if (!ctxA) return;
      if (musicTimer) return;
      step = 0;
      musicTimer = window.setInterval(musicTick, 220);
    }

    function musicStop() {
      if (!musicTimer) return;
      clearInterval(musicTimer);
      musicTimer = null;
    }

    btnMusic.addEventListener("click", () => setMusicEnabled(!musicEnabled));
    btnSfx.addEventListener("click", () => setSfxEnabled(!sfxEnabled));
    btnMusic.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
    btnSfx.setAttribute("aria-pressed", sfxEnabled ? "true" : "false");

    return {
      ensureStarted,
      get musicEnabled() {
        return musicEnabled;
      },
      musicStart,
      musicStop,
      sfxEat,
      sfxGameOver,
      setMusicEnabled,
      setSfxEnabled,
    };
  })();

  // Load persisted difficulty
  const savedDiff = localStorage.getItem(STORAGE_DIFF);
  if (savedDiff && Difficulties[savedDiff]) {
    difficultyKey = savedDiff;
    GRID = Difficulties[difficultyKey].grid;
    CELL = canvas.width / GRID;
    BASE_TICK_MS = Difficulties[difficultyKey].tickMs;
    tickMs = BASE_TICK_MS;
  }
  applyDifficultyUi();

  resetGame();
  requestAnimationFrame(frame);
})();

