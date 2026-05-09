(() => {
  "use strict";

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d", { alpha: true }));

  const elScore = document.getElementById("score");
  const elBest = document.getElementById("best");
  const elPhase = document.getElementById("phase");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const help = document.getElementById("help");

  const btnStart = document.getElementById("btnStart");
  const btnHow = document.getElementById("btnHow");
  const btnCloseHelp = document.getElementById("btnCloseHelp");
  const btnRestart = document.getElementById("btnRestart");

  const btnMusic = document.getElementById("btnMusic");
  const btnSfx = document.getElementById("btnSfx");

  const W = canvas.width;
  const H = canvas.height;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  const STORAGE_BEST = "flappy-blob.best";
  const STORAGE_MUSIC = "flappy-blob.music";
  const STORAGE_SFX = "flappy-blob.sfx";

  const bestInit = Number(localStorage.getItem(STORAGE_BEST) || "0") || 0;

  const Colors = {
    ink: "rgba(0,0,0,.0)",
    cloud: "rgba(255,255,255,.07)",
    cloud2: "rgba(255,255,255,.045)",
    gold: "#f5d06a",
    gold2: "#f2b74f",
    ember: "#fb7185",
    sky: "#60a5fa",
    mana: "#a78bfa",
    ok: "#34d399",
    heart: "#fb7185",
    heartDim: "rgba(255,255,255,.16)",
    bolt: "#fef08a",
  };

  const World = {
    groundY: H - 64,
    ceilingY: 26,
    leftSafeX: 150,
  };

  const PlayerCfg = {
    x: 170,
    r: 22,
    gravity: 1200,
    flapVy: -420,
    maxVy: 760,
    hurtInvulnMs: 380,
    meteorStunMs: 100,
    zeusStunMs: 250,
  };

  const CoinCfg = {
    r: 13,
    respawnHideMs: 250,
    minY: 54,
    maxY: H - 118,
  };

  const MeteorCfg = {
    minR: 14,
    maxR: 24,
    speed: 170,
    spawnEveryMs: 1150,
    jitter: 260,
  };

  const ZeusCfg = {
    threshold: 25,
    chargeSpeed: 240,
    spawnEveryMs: 820,
    jitter: 300,
    r: 14,
  };

  /** @type {{x:number,y:number,vy:number,lives:number,stunUntil:number,invulnUntil:number,stage:number,flapQueued:boolean}} */
  let player;

  /** @type {{x:number,y:number,visible:boolean,hideUntil:number}} */
  let coin;

  /** @type {{x:number,y:number,r:number,vx:number,spin:number,seed:number}} */
  let meteors = [];

  /** @type {{x:number,y:number,r:number,vx:number,phase:number,seed:number}} */
  let charges = [];

  let score = 0;
  let best = bestInit;
  let running = false;
  let dead = false;
  let inZeus = false;
  let zeusArriveAt = -Infinity;

  let lastNow = 0;
  let meteorNextAt = 0;
  let chargeNextAt = 0;
  let shakeT = 0;

  function setOverlayVisible(v) {
    overlay.hidden = !v;
  }

  function setHelpVisible(v) {
    help.hidden = !v;
  }

  function updateUi() {
    elScore.textContent = String(score);
    elBest.textContent = String(best);
    elPhase.textContent = inZeus ? "Zeus" : "Meteors";
  }

  function reset() {
    score = 0;
    inZeus = false;
    running = false;
    dead = false;
    meteors = [];
    charges = [];
    shakeT = 0;
    zeusArriveAt = -Infinity;

    player = {
      x: PlayerCfg.x,
      y: H * 0.52,
      vy: 0,
      lives: 3,
      stunUntil: 0,
      invulnUntil: 0,
      stage: 3,
      flapQueued: false,
    };

    coin = {
      x: player.x,
      y: clamp(player.y - 140, CoinCfg.minY, CoinCfg.maxY),
      visible: true,
      hideUntil: 0,
    };

    meteorNextAt = 0;
    chargeNextAt = 0;

    overlayTitle.textContent = "Press Space to flap";
    overlaySub.innerHTML =
      "Collect <b>coins</b>, dodge <b>meteors</b> — at <b>25</b> score, Zeus takes over.";
    setOverlayVisible(true);
    updateUi();
    draw(0, 0);
  }

  function start() {
    if (dead) reset();
    running = true;
    dead = false;
    setOverlayVisible(false);
    audio.ensureStarted();
    if (audio.musicEnabled) audio.musicStart();
  }

  function gameOver() {
    running = false;
    dead = true;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_BEST, String(best));
    }
    audio.sfxGameOver();
    audio.musicStop();
    overlayTitle.textContent = `Game Over · Score ${score}`;
    overlaySub.innerHTML = `High score: <b>${best}</b>. Press <b>R</b> to try again.`;
    setOverlayVisible(true);
    updateUi();
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function hitPlayer(stunMs, kind) {
    const now = performance.now();
    if (now < player.invulnUntil) return;
    player.lives = Math.max(0, player.lives - 1);
    player.stage = player.lives;
    player.stunUntil = now + stunMs;
    player.invulnUntil = now + PlayerCfg.hurtInvulnMs;
    player.vy = Math.min(player.vy + 180, PlayerCfg.maxVy);
    shakeT = 1;
    if (kind === "meteor") audio.sfxHitMeteor();
    else audio.sfxHitZeus();
    if (player.lives <= 0) gameOver();
  }

  function coinRespawn() {
    coin.visible = true;
    coin.x = player.x;
    coin.y = rand(CoinCfg.minY, CoinCfg.maxY);
  }

  function collectCoin() {
    score += 1;
    audio.sfxCoin();
    updateUi();

    if (!inZeus && score >= ZeusCfg.threshold) {
      inZeus = true;
      zeusArriveAt = performance.now();
      meteors = [];
      meteorNextAt = Infinity;
      overlaySub.innerHTML = "Zeus has arrived. The sky crackles with wrath.";
      audio.sfxZeusArrive();
    }

    coin.visible = false;
    coin.hideUntil = performance.now() + CoinCfg.respawnHideMs;
    window.setTimeout(() => {
      if (!dead) coinRespawn();
    }, CoinCfg.respawnHideMs);
  }

  function spawnMeteor(now) {
    const r = rand(MeteorCfg.minR, MeteorCfg.maxR);
    meteors.push({
      x: W + r + 10,
      y: rand(World.ceilingY + 40, World.groundY - 50),
      r,
      vx: -MeteorCfg.speed * rand(0.92, 1.08),
      spin: rand(-3.8, 3.8),
      seed: rand(0, 9999),
    });
    meteorNextAt = now + MeteorCfg.spawnEveryMs + rand(-MeteorCfg.jitter, MeteorCfg.jitter);
  }

  function spawnCharge(now) {
    charges.push({
      x: W + 40,
      y: rand(World.ceilingY + 36, World.groundY - 60),
      r: ZeusCfg.r,
      vx: -ZeusCfg.chargeSpeed * rand(0.94, 1.10),
      phase: rand(0, Math.PI * 2),
      seed: rand(0, 9999),
    });
    chargeNextAt = now + ZeusCfg.spawnEveryMs + rand(-ZeusCfg.jitter, ZeusCfg.jitter);
  }

  function step(dt, now) {
    if (!running || dead) return;

    // Input → flap
    if (player.flapQueued) {
      player.flapQueued = false;
      if (now >= player.stunUntil) {
        player.vy = PlayerCfg.flapVy;
        audio.sfxFlap();
      } else {
        audio.sfxStunClick();
      }
    }

    // Physics
    player.vy = clamp(player.vy + PlayerCfg.gravity * dt, -1000, PlayerCfg.maxVy);
    player.y += player.vy * dt;

    if (player.y + PlayerCfg.r >= World.groundY) return gameOver();
    if (player.y - PlayerCfg.r <= World.ceilingY) {
      player.y = World.ceilingY + PlayerCfg.r;
      player.vy = Math.max(player.vy, 0);
    }

    // Coin pickup (coin roughly aligned with player's Y axis)
    if (coin.visible) {
      const d2 = dist2(player.x, player.y, coin.x, coin.y);
      const rr = (PlayerCfg.r + CoinCfg.r) * (PlayerCfg.r + CoinCfg.r);
      if (d2 <= rr) collectCoin();
    } else if (now >= coin.hideUntil && !dead) {
      coinRespawn();
    }

    // Obstacles
    if (!inZeus) {
      if (now >= meteorNextAt) spawnMeteor(now);
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.seed += m.spin * dt;
        if (m.x < -m.r - 60) {
          meteors.splice(i, 1);
          continue;
        }
        const d2 = dist2(player.x, player.y, m.x, m.y);
        const rr = (PlayerCfg.r + m.r * 0.92) * (PlayerCfg.r + m.r * 0.92);
        if (d2 <= rr) hitPlayer(PlayerCfg.meteorStunMs, "meteor");
      }
    } else {
      if (now >= chargeNextAt) spawnCharge(now);
      for (let i = charges.length - 1; i >= 0; i--) {
        const c = charges[i];
        c.x += c.vx * dt;
        c.phase += dt * 6.2;
        c.y += Math.sin(c.phase) * 35 * dt;
        if (c.x < -80) {
          charges.splice(i, 1);
          continue;
        }
        const d2 = dist2(player.x, player.y, c.x, c.y);
        const rr = (PlayerCfg.r + c.r) * (PlayerCfg.r + c.r);
        if (d2 <= rr) hitPlayer(PlayerCfg.zeusStunMs, "zeus");
      }
    }

    // Keep coin in the same general "lane" (Y axis focus) but randomize visible Y on respawn.
    // Coin X stays fixed; difficulty comes from timing around stuns.
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawHeart(x, y, s, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-1.1, -1.1, -3.0, -0.2, -2.2, 1.3);
    ctx.bezierCurveTo(-1.6, 2.4, -0.4, 3.2, 0, 3.6);
    ctx.bezierCurveTo(0.4, 3.2, 1.6, 2.4, 2.2, 1.3);
    ctx.bezierCurveTo(3.0, -0.2, 1.1, -1.1, 0, 0);
    ctx.closePath();
    ctx.fillStyle = filled ? Colors.heart : Colors.heartDim;
    ctx.shadowColor = filled ? "rgba(251,113,133,.55)" : "rgba(0,0,0,0)";
    ctx.shadowBlur = filled ? 10 : 0;
    ctx.fill();
    ctx.restore();
  }

  function drawHearts() {
    const pad = 16;
    const baseX = pad + 18;
    const y = pad + 20;
    const s = 6.2;
    for (let i = 0; i < 3; i++) {
      drawHeart(baseX + i * 36, y, s, i < player.lives);
    }
  }

  function drawCoin(t) {
    if (!coin.visible) return;
    const bob = Math.sin(t * 0.0045) * 3.5;
    const x = coin.x;
    const y = coin.y + bob;
    const r = CoinCfg.r;

    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 56);
    glow.addColorStop(0, "rgba(245,208,106,.34)");
    glow.addColorStop(0.6, "rgba(245,208,106,.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 80, y - 80, 160, 160);

    // cartoon coin: thick outline + simple highlights
    ctx.shadowColor = "rgba(245,208,106,.65)";
    ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, "#ffe9a5");
    g.addColorStop(0.35, Colors.gold);
    g.addColorStop(1, Colors.gold2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMeteor(m, t) {
    const x = m.x;
    const y = m.y;
    const r = m.r;
    const a = m.seed;
    ctx.save();
    const tail = ctx.createLinearGradient(x + r * 1.6, y, x - r * 2.2, y);
    tail.addColorStop(0, "rgba(251,113,133,.0)");
    tail.addColorStop(0.2, "rgba(251,113,133,.10)");
    tail.addColorStop(1, "rgba(251,113,133,.0)");
    ctx.fillStyle = tail;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x - r * 2.3, y - r * 0.5, r * 3.2, r);
    ctx.globalAlpha = 1;

    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.shadowColor = "rgba(251,113,133,.25)";
    ctx.shadowBlur = 10;

    // cartoon meteor: warm rock + crater dots + thick outline
    const rock = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.2, 0, 0, r * 1.35);
    rock.addColorStop(0, "rgba(255,255,255,.20)");
    rock.addColorStop(0.25, "rgba(251,113,133,.18)");
    rock.addColorStop(1, "rgba(0,0,0,.06)");
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,.32)";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // craters
    ctx.fillStyle = "rgba(0,0,0,.10)";
    ctx.beginPath();
    ctx.arc(-r * 0.2, r * 0.1, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.22, -r * 0.18, r * 0.13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.28, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawCharge(c, t) {
    const x = c.x;
    const y = c.y;
    const r = c.r;

    ctx.save();
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.01 + c.seed);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 70);
    glow.addColorStop(0, `rgba(254,240,138,${0.26 * pulse})`);
    glow.addColorStop(0.6, `rgba(96,165,250,${0.10 * pulse})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 90, y - 90, 180, 180);

    // cartoon lightning charge: outlined orb + bolt glyph
    ctx.shadowColor = "rgba(254,240,138,.75)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = Colors.bolt;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.92 + 0.08 * pulse), 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,.34)";
    ctx.beginPath();
    ctx.arc(x, y, r * (0.92 + 0.08 * pulse), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 8);
    ctx.lineTo(x + 4, y - 1);
    ctx.lineTo(x - 1, y + 4);
    ctx.lineTo(x + 6, y + 10);
    ctx.stroke();

    ctx.restore();
  }

  function drawZeus(t) {
    if (!inZeus) return;

    const zx = W - 150;
    const zy = 104;
    const bob = Math.sin(t * 0.0032) * 4;
    const flap = Math.sin(t * 0.01) * 0.8;
    const outline = "rgba(0,0,0,.34)";

    ctx.save();

    // flying cloud mount (cartoon)
    ctx.translate(0, bob);
    ctx.shadowColor = "rgba(167,139,250,.20)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255,255,255,.085)";
    ctx.beginPath();
    ctx.arc(zx - 54, zy + 16, 34, 0, Math.PI * 2);
    ctx.arc(zx - 12, zy + 8, 44, 0, Math.PI * 2);
    ctx.arc(zx + 40, zy + 16, 30, 0, Math.PI * 2);
    ctx.arc(zx + 12, zy + 26, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // wings (tiny angel wings on cloud)
    ctx.save();
    ctx.translate(zx - 72, zy + 8);
    ctx.rotate(-0.25 + flap * 0.05);
    ctx.fillStyle = "rgba(255,255,255,.20)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(-14, 6, 14, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(zx + 70, zy + 8);
    ctx.rotate(0.25 - flap * 0.05);
    ctx.fillStyle = "rgba(255,255,255,.20)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(14, 6, 14, 8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.restore();

    // Zeus body (cartoon)
    const headX = zx + 8;
    const headY = zy - 22;
    const headR = 15;

    // toga
    ctx.fillStyle = "rgba(255,255,255,.18)";
    roundRect(zx - 2, zy - 8, 38, 44, 14);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // belt
    ctx.fillStyle = "rgba(245,208,106,.32)";
    roundRect(zx + 2, zy + 14, 30, 10, 6);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // head
    ctx.fillStyle = "rgba(255,255,255,.20)";
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // laurel crown
    ctx.strokeStyle = "rgba(245,208,106,.75)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(headX, headY - 3, headR * 0.85, 1.1 * Math.PI, 1.9 * Math.PI);
    ctx.stroke();

    // beard (big fluffy)
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.arc(headX - 8, headY + 14, 10, 0, Math.PI * 2);
    ctx.arc(headX + 4, headY + 16, 12, 0, Math.PI * 2);
    ctx.arc(headX + 16, headY + 14, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // face
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.arc(headX - 5, headY - 2, 2.2, 0, Math.PI * 2);
    ctx.arc(headX + 5, headY - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(headX, headY + 4, 4.8, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // arms
    ctx.strokeStyle = outline;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(zx + 4, zy + 6);
    ctx.lineTo(zx - 10, zy + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(zx + 30, zy + 6);
    ctx.lineTo(zx + 50, zy + 22);
    ctx.stroke();

    // lightning bolt in hand
    ctx.save();
    ctx.translate(zx + 54, zy + 22);
    ctx.rotate(0.35 + flap * 0.04);
    ctx.shadowColor = "rgba(254,240,138,.75)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(254,240,138,.92)";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -4);
    ctx.lineTo(2, -4);
    ctx.lineTo(12, 14);
    ctx.lineTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.restore();

    // label
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.font = '900 12px "Space Grotesk", system-ui';
    ctx.fillText("ZEUS", zx - 10, zy - 60);

    // Zeus arrival flash: only TWO quick pulses, once.
    const since = t - zeusArriveAt;
    if (Number.isFinite(since) && since >= 0 && since < 900) {
      const pulse = (start, dur) => {
        const x = (since - start) / dur;
        if (x <= 0 || x >= 1) return 0;
        // smooth bump
        return Math.sin(Math.PI * x);
      };
      const p = Math.max(pulse(90, 220), pulse(460, 240));
      if (p > 0) {
        ctx.globalAlpha = 0.22 * p;
        ctx.fillStyle = "rgba(254,240,138,.55)";
        ctx.fillRect(-2, -2, W + 4, H + 4);
      }
    }
    ctx.restore();
  }

  function drawBlob(t) {
    const x = player.x;
    const y = player.y;
    const r = PlayerCfg.r;

    const now = performance.now();
    const inv = now < player.invulnUntil;
    const stun = now < player.stunUntil;
    const blink = inv ? (Math.sin(t * 0.05) > 0 ? 0.35 : 1) : 1;

    ctx.save();
    ctx.globalAlpha = blink;

    // aura
    const aura = ctx.createRadialGradient(x, y, 0, x, y, 70);
    aura.addColorStop(0, `rgba(96,165,250,${stun ? 0.10 : 0.14})`);
    aura.addColorStop(0.6, "rgba(167,139,250,.08)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(x - 90, y - 90, 180, 180);

    // body fill depends on lives
    const body = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.2, x, y, r * 1.35);
    if (player.stage === 3) {
      body.addColorStop(0, "rgba(255,255,255,.20)");
      body.addColorStop(0.25, "rgba(96,165,250,.38)");
      body.addColorStop(1, "rgba(167,139,250,.30)");
    } else if (player.stage === 2) {
      body.addColorStop(0, "rgba(255,255,255,.18)");
      body.addColorStop(0.25, "rgba(96,165,250,.28)");
      body.addColorStop(1, "rgba(251,113,133,.22)");
    } else {
      body.addColorStop(0, "rgba(255,255,255,.14)");
      body.addColorStop(0.25, "rgba(251,113,133,.24)");
      body.addColorStop(1, "rgba(0,0,0,.08)");
    }

    ctx.shadowColor = stun ? "rgba(254,240,138,.35)" : "rgba(96,165,250,.24)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // tiny "wings"
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.95, y + 3, r * 0.55, r * 0.34, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + r * 0.95, y + 3, r * 0.55, r * 0.34, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // face
    const tilt = clamp(player.vy / 900, -0.7, 0.7);
    ctx.translate(x, y);
    ctx.rotate(tilt * 0.35);
    ctx.translate(-x, -y);

    ctx.fillStyle = "rgba(0,0,0,.55)";
    const ex = r * 0.42;
    const ey = -r * 0.20;
    const er = r * 0.12;
    ctx.beginPath();
    ctx.arc(x - ex, y + ey, er, 0, Math.PI * 2);
    ctx.arc(x + ex, y + ey, er, 0, Math.PI * 2);
    ctx.fill();

    // mouth changes with stage
    ctx.strokeStyle = "rgba(0,0,0,.52)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (player.stage === 3) {
      ctx.arc(x, y + r * 0.2, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (player.stage === 2) {
      ctx.moveTo(x - r * 0.24, y + r * 0.3);
      ctx.lineTo(x + r * 0.24, y + r * 0.3);
    } else {
      ctx.arc(x, y + r * 0.28, r * 0.24, 1.15 * Math.PI, 1.85 * Math.PI);
    }
    ctx.stroke();

    // damage marks
    if (player.stage <= 2) {
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.1, y - r * 0.55);
      ctx.lineTo(x + r * 0.25, y - r * 0.32);
      ctx.stroke();
    }
    if (player.stage <= 1) {
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.75, y - r * 0.05);
      ctx.lineTo(x - r * 0.20, y + r * 0.20);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,.10)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x - r * (0.66 - i * 0.12), y - r * (0.02 - i * 0.06));
        ctx.lineTo(x - r * (0.58 - i * 0.12), y + r * (0.14 - i * 0.06));
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawBackdrop(t) {
    ctx.save();
    // cartoon sky gradient (more saturated)
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "rgba(96,165,250,.18)");
    sky.addColorStop(0.45, "rgba(167,139,250,.12)");
    sky.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // distant castle silhouettes
    const horizonY = World.groundY - 52;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    roundRect(40, horizonY - 34, 86, 34, 8);
    ctx.fill();
    roundRect(78, horizonY - 64, 28, 32, 10);
    ctx.fill();
    roundRect(118, horizonY - 52, 26, 20, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(80, horizonY - 64);
    ctx.lineTo(92, horizonY - 82);
    ctx.lineTo(104, horizonY - 64);
    ctx.closePath();
    ctx.fill();

    roundRect(W - 190, horizonY - 28, 110, 28, 8);
    ctx.fill();
    roundRect(W - 150, horizonY - 60, 36, 34, 12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W - 150, horizonY - 60);
    ctx.lineTo(W - 132, horizonY - 84);
    ctx.lineTo(W - 114, horizonY - 60);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // fluffy clouds with outlines
    const drift = Math.sin(t * 0.00022) * 20;
    const outline = "rgba(0,0,0,.22)";
    function cloud(cx, cy, s) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.beginPath();
      ctx.arc(-36, 8, 24, 0, Math.PI * 2);
      ctx.arc(-10, 0, 32, 0, Math.PI * 2);
      ctx.arc(26, 8, 22, 0, Math.PI * 2);
      ctx.arc(6, 18, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.restore();
    }
    cloud(220 + drift, 96, 1.15);
    cloud(520 - drift * 0.65, 160, 1.35);
    cloud(720 + drift * 0.9, 118, 1.25);

    // ridge + ground (slightly more cartoony)
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.moveTo(0, World.groundY);
    ctx.bezierCurveTo(W * 0.2, World.groundY - 44, W * 0.5, World.groundY - 22, W * 0.75, World.groundY - 54);
    ctx.bezierCurveTo(W * 0.9, World.groundY - 72, W, World.groundY - 40, W, World.groundY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.fillRect(0, World.groundY, W, H - World.groundY);

    // runes on ground with chunkier strokes
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = "rgba(245,208,106,.28)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const x = 52 + i * 92;
      const y = World.groundY + 22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y - 8);
      ctx.lineTo(x + 38, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(t) {
    drawHearts();

    // stun indicator
    const now = performance.now();
    if (now < player.stunUntil && running && !dead) {
      const left = player.stunUntil - now;
      const p = clamp(left / 260, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(0,0,0,.22)";
      roundRect(16, 58, 150, 18, 9);
      ctx.fill();
      ctx.fillStyle = "rgba(254,240,138,.55)";
      roundRect(16, 58, 150 * (1 - p), 18, 9);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.70)";
      ctx.font = '800 12px "Space Grotesk", system-ui';
      ctx.fillText("STUNNED", 22, 71);
      ctx.restore();
    }

    // phase hint
    if (inZeus && running && !dead) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,.18)";
      roundRect(W - 190, 16, 174, 32, 16);
      ctx.fill();
      ctx.fillStyle = "rgba(254,240,138,.78)";
      ctx.font = '900 12px "Space Grotesk", system-ui';
      ctx.fillText("ZEUS PHASE", W - 168, 36);
      ctx.restore();
    } else if (!inZeus && score >= 20 && running && !dead) {
      const k = clamp((score - 20) / 5, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(0,0,0,.18)";
      roundRect(W - 250, 16, 234, 32, 16);
      ctx.fill();
      ctx.fillStyle = `rgba(167,139,250,${0.35 + 0.35 * k})`;
      ctx.font = '900 12px "Space Grotesk", system-ui';
      ctx.fillText(`ZEUS INCOMING: ${Math.max(0, ZeusCfg.threshold - score)}`, W - 228, 36);
      ctx.restore();
    }
  }

  function draw(t, dt) {
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      const s = shakeT * shakeT;
      sx = (Math.random() - 0.5) * 10 * s;
      sy = (Math.random() - 0.5) * 10 * s;
      shakeT = Math.max(0, shakeT - dt * 3.2);
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBackdrop(t);

    // coin + obstacles + player
    drawCoin(t);
    for (const m of meteors) drawMeteor(m, t);
    for (const c of charges) drawCharge(c, t);
    drawZeus(t);
    drawBlob(t);
    drawHud(t);
    ctx.restore();
  }

  function onFlap() {
    if (!running) start();
    player.flapQueued = true;
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === " " || k === "spacebar") {
      e.preventDefault();
      return onFlap();
    }
    if (k === "r") {
      e.preventDefault();
      reset();
      return;
    }
    if (k === "h") {
      e.preventDefault();
      setHelpVisible(!help.hidden);
    }
  }

  function onPointerDown(e) {
    e.preventDefault?.();
    onFlap();
  }

  function frame(now) {
    if (!lastNow) lastNow = now;
    const dtMs = now - lastNow;
    lastNow = now;
    const dt = clamp(dtMs / 1000, 0, 0.05);

    step(dt, now);
    draw(now, dt);
    requestAnimationFrame(frame);
  }

  const audio = (() => {
    let ctxA = null;
    let master = null;
    let musicBus = null;
    let sfxBus = null;
    let musicTimer = null;
    let musicStep = 0;
    let lastChord = 0;

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
      master.gain.value = 0.85;
      musicBus.gain.value = 0.18;
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
      else if (running && !dead) musicStart();
    }

    function setSfxEnabled(v) {
      sfxEnabled = !!v;
      localStorage.setItem(STORAGE_SFX, sfxEnabled ? "1" : "0");
      btnSfx.setAttribute("aria-pressed", sfxEnabled ? "true" : "false");
    }

    function envGain(g, t0, a, d) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, a), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    }

    function tone(freq, dur, type, gain, bus, detune = 0, lp = 1400) {
      if (!ctxA || !bus) return;
      const o = ctxA.createOscillator();
      const g = ctxA.createGain();
      const f = ctxA.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      f.Q.value = 0.75;
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const t0 = ctxA.currentTime;
      envGain(g, t0, gain, dur);
      o.connect(f);
      f.connect(g);
      g.connect(bus);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    function noiseBurst(dur, gain, bus, hp = 500) {
      if (!ctxA || !bus) return;
      const n = ctxA.createBufferSource();
      const b = ctxA.createBuffer(1, Math.floor(ctxA.sampleRate * dur), ctxA.sampleRate);
      const data = b.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      n.buffer = b;
      const f = ctxA.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hp;
      const g = ctxA.createGain();
      const t0 = ctxA.currentTime;
      envGain(g, t0, gain, dur);
      n.connect(f);
      f.connect(g);
      g.connect(bus);
      n.start(t0);
      n.stop(t0 + dur + 0.03);
    }

    function sfxFlap() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(420, 0.08, "triangle", 0.22, sfxBus, -6, 1600);
      noiseBurst(0.06, 0.10, sfxBus, 1200);
    }

    function sfxCoin() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(880, 0.09, "sine", 0.18, sfxBus, 0, 2200);
      tone(1320, 0.07, "triangle", 0.12, sfxBus, 5, 2400);
    }

    function sfxHitMeteor() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(200, 0.18, "sawtooth", 0.22, sfxBus, -14, 900);
      noiseBurst(0.10, 0.12, sfxBus, 450);
    }

    function sfxHitZeus() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(520, 0.12, "square", 0.20, sfxBus, 0, 2200);
      tone(260, 0.18, "sawtooth", 0.15, sfxBus, -12, 1200);
      noiseBurst(0.12, 0.14, sfxBus, 900);
    }

    function sfxStunClick() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(140, 0.06, "sine", 0.12, sfxBus, -18, 1000);
    }

    function sfxZeusArrive() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(220, 0.24, "sawtooth", 0.22, sfxBus, -8, 900);
      tone(330, 0.22, "triangle", 0.16, sfxBus, 6, 1400);
      noiseBurst(0.18, 0.10, sfxBus, 600);
    }

    function sfxGameOver() {
      if (!sfxEnabled) return;
      ensureStarted();
      tone(196, 0.26, "sawtooth", 0.26, sfxBus, -10, 950);
      tone(130, 0.30, "triangle", 0.22, sfxBus, -16, 800);
      noiseBurst(0.12, 0.08, sfxBus, 420);
    }

    // Simple medieval-ish loop: minor drone + plucked notes
    const scale = [0, 2, 3, 5, 7, 8, 10]; // natural minor degrees
    function musicTick() {
      if (!ctxA || !musicEnabled) return;
      const base = 146.83; // D3
      const t = ctxA.currentTime;

      // drone every bar
      if (musicStep % 8 === 0) {
        tone(base, 0.42, "sine", 0.045, musicBus, -4, 520);
        tone(base * Math.pow(2, 7 / 12), 0.32, "triangle", 0.030, musicBus, -2, 720);
      }

      // pluck
      const deg = scale[musicStep % scale.length];
      const oct = musicStep % 14 < 7 ? 1 : 2;
      const freq = base * Math.pow(2, (deg + oct * 12) / 12);
      tone(freq, 0.14, "triangle", 0.032, musicBus, 0, 1800);
      tone(freq * 2, 0.08, "sine", 0.014, musicBus, 0, 2400);

      // occasional chord sparkle
      if (musicStep - lastChord >= 12) {
        lastChord = musicStep;
        tone(base * Math.pow(2, (0 + 24) / 12), 0.22, "sine", 0.015, musicBus, 0, 1400);
        tone(base * Math.pow(2, (3 + 24) / 12), 0.22, "sine", 0.013, musicBus, 0, 1400);
        tone(base * Math.pow(2, (7 + 24) / 12), 0.22, "sine", 0.012, musicBus, 0, 1400);
      }

      musicStep++;
    }

    function musicStart() {
      if (!musicEnabled) return;
      ensureStarted();
      if (!ctxA || musicTimer) return;
      musicStep = 0;
      lastChord = 0;
      musicTimer = window.setInterval(musicTick, 240);
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
      sfxFlap,
      sfxCoin,
      sfxHitMeteor,
      sfxHitZeus,
      sfxStunClick,
      sfxZeusArrive,
      sfxGameOver,
      setMusicEnabled,
      setSfxEnabled,
    };
  })();

  // UI events
  btnStart.addEventListener("click", start);
  btnHow.addEventListener("click", () => setHelpVisible(true));
  btnCloseHelp.addEventListener("click", () => setHelpVisible(false));
  btnRestart.addEventListener("click", () => reset());

  window.addEventListener("keydown", onKey, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });

  // Init
  elBest.textContent = String(best);
  updateUi();
  reset();
  requestAnimationFrame(frame);
})();
