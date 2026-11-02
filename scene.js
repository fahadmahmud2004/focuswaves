/* =========================================================
   The living sea. Follows the visitor's local time of day, reacts to the
   mix (levels) and to individual sound events from the audio engine:
   lightning before thunder, foam when a wave breaks, sparks on a pop,
   drips from the tin roof, birds crossing when they sing.
   ========================================================= */
const Scene = (() => {
  const cv = document.getElementById("scene"), g = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, t = 0, last = performance.now();
  const KEYS = ["rain", "tinroof", "thunder", "waves", "wind", "birds", "stream", "fire", "crickets", "frogs", "fan", "lofi", "piano", "pad", "white", "pink", "brown"];
  const target = {}, lvl = {};
  KEYS.forEach(k => (target[k] = lvl[k] = 0));
  let windNow = 0.3, foam = 0, flash = 0, bolt = null, hourOverride = null;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  /* ---------- palette by hour ---------- */
  const KF = [
    [0,    "#050a14", "#0f2236", "#0b1c2b", "#030d16", 1],
    [4.6,  "#0a1226", "#2a2c4e", "#13233a", "#050e18", 0.9],
    [6.2,  "#2c4878", "#efae86", "#3a5675", "#0b1d2e", 0.25],
    [8.5,  "#3a76ae", "#b5d8e6", "#2c6b88", "#0c3245", 0],
    [16,   "#3a71a6", "#c0dae4", "#2a6782", "#0b3043", 0],
    [18.1, "#33497a", "#f1a272", "#3a5270", "#0d2133", 0.12],
    [19.5, "#161f3d", "#584063", "#192940", "#07131d", 0.6],
    [21,   "#060d1b", "#14283d", "#0c1d2c", "#030d16", 1],
    [24,   "#050a14", "#0f2236", "#0b1c2b", "#030d16", 1],
  ];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const KFc = KF.map(k => [k[0], hex(k[1]), hex(k[2]), hex(k[3]), hex(k[4]), k[5]]);
  const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function palette(hour) {
    let i = 0; while (KFc[i + 1][0] < hour) i++;
    const a = KFc[i], b = KFc[i + 1], f = (hour - a[0]) / (b[0] - a[0]);
    return { top: mix(a[1], b[1], f), hor: mix(a[2], b[2], f), far: mix(a[3], b[3], f), near: mix(a[4], b[4], f), night: a[5] + (b[5] - a[5]) * f };
  }
  const GREY = [46, 54, 62];
  const R = Math.random, rr = (a, b) => a + R() * (b - a);

  /* ---------- particles & actors ---------- */
  const stars = Array.from({ length: 220 }, () => ({ x: R(), y: R() * 0.58, r: R() * 1.3 + 0.25, p: R() * 6.28, s: 0.4 + R() * 2 }));
  const drops = Array.from({ length: 900 }, () => ({ x: R(), y: R(), l: 0.6 + R() * 0.8, v: 0.85 + R() * 0.5 }));
  const ripples = [], spray = [], sparks = [], drips = [], flocks = [], meteors = [];
  const embers = Array.from({ length: 110 }, () => newEmber(true));
  function newEmber(any) { return { x: rr(0.12, 0.88), y: any ? R() : 1.03, v: rr(0.03, 0.08), s: R() * 6.28, r: rr(0.7, 2), life: any ? R() : 0 }; }
  const flies = Array.from({ length: 60 }, () => ({ x: R(), y: rr(0.62, 0.95), a: R() * 6.28, sp: rr(0.01, 0.03), ph: R() * 6.28, hz: rr(0.3, 0.9) }));
  function cloudSprite(w, h, seed) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"), img = x.createImageData(w, h), G = 64, grid = [];
    for (let o = 0; o < 5; o++) { const n = (G >> (4 - o)) + 2; grid.push(Array.from({ length: n * n }, () => R())); }
    const noise = (u, v) => {
      let s = 0, a = 0.55;
      for (let o = 0; o < 5; o++) {
        const n = (G >> (4 - o)) + 2, gx = u * (n - 2), gy = v * (n - 2), ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, g = grid[o];
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (i, j) => g[(j % n) * n + (i % n)];
        s += a * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy); a *= 0.5;
      }
      return s;
    };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h, dx = (u - 0.5) * 2, dy = (v - 0.58) * 2.4;
      const fall = Math.max(0, 1 - (dx * dx + dy * dy * (dy > 0 ? 2.2 : 1)));
      const d = Math.max(0, noise(u, v) * 1.25 - 0.42) * fall * 2.1;
      const k = (j * w + i) * 4, shade = 255 - 70 * v;
      img.data[k] = shade; img.data[k + 1] = shade; img.data[k + 2] = shade + 6; img.data[k + 3] = Math.min(255, d * 255);
    }
    x.putImageData(img, 0, 0); return c;
  }
  const sprites = [0, 1, 2, 3].map(i => cloudSprite(320, 120, i));
  const clouds = Array.from({ length: 7 }, (_, i) => ({ x: R() * 1.3 - 0.15, y: rr(0.04, 0.34), s: rr(0.8, 1.7), d: rr(0.5, 1.2), sp: sprites[i % 4] }));
  const trees = Array.from({ length: 90 }, () => ({ h: rr(0.4, 1), w: rr(0.6, 1.4), palm: R() < 0.18 }));

  const grain = document.createElement("canvas"); grain.width = grain.height = 160;
  { const gc = grain.getContext("2d"), d = gc.createImageData(160, 160); for (let i = 0; i < d.data.length; i += 4) { const v = R() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } gc.putImageData(d, 0, 0); }
  const grainPat = g.createPattern(grain, "repeat");

  function makeBolt(near) {
    const x0 = rr(0.15, 0.85) * W, yEnd = H * 0.6 * rr(0.75, 1);
    const segs = [], step = 18 + 10 * (1 - near);
    function branch(x, y, dir, depth, len) {
      const pts = [[x, y]];
      while (y < yEnd && len-- > 0) {
        x += rr(-14, 14) + dir * 4; y += rr(step * 0.6, step * 1.2); pts.push([x, y]);
        if (depth < 2 && R() < 0.12) branch(x, y, R() < 0.5 ? -1 : 1, depth + 1, (len * 0.4) | 0);
      }
      segs.push({ pts, w: depth ? 1 : 2.4 });
    }
    branch(x0, 0, 0, 0, 80);
    return { segs, life: 1, near };
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduce) draw(0);
  }
  addEventListener("resize", resize);
  addEventListener("pointermove", e => { if (e.pointerType === "mouse") { par.tx = (e.clientX / W - 0.5) * 2; par.ty = (e.clientY / H - 0.5) * 2; } });

  function draw(dt) {
    t += dt;
    for (const k of KEYS) lvl[k] += (target[k] - lvl[k]) * Math.min(1, dt * 1.2);
    par.x += (par.tx - par.x) * Math.min(1, dt * 2); par.y += (par.ty - par.y) * Math.min(1, dt * 2);
    const now = new Date(), hour = hourOverride ?? now.getHours() + now.getMinutes() / 60;
    const P = palette(hour);
    const wet = Math.min(1, lvl.rain * 0.7 + lvl.thunder * 0.9 + lvl.tinroof * 0.6);
    const overcast = Math.min(1, wet * 0.85);
    const night = P.night;
    const sky = c => mix(c, GREY, overcast * 0.55);
    const horizon = H * 0.6 + par.y * 4;

    /* sky */
    const sg = g.createLinearGradient(0, 0, 0, horizon);
    sg.addColorStop(0, rgb(sky(P.top))); sg.addColorStop(1, rgb(sky(P.hor)));
    g.fillStyle = sg; g.fillRect(0, 0, W, horizon + 2);

    /* stars + meteors */
    const starA = night * (1 - overcast * 0.95);
    if (starA > 0.02) {
      g.fillStyle = "#fff";
      for (const s of stars) { g.globalAlpha = starA * (0.35 + 0.65 * Math.sin(t * s.s + s.p) ** 2); g.fillRect(s.x * W - par.x * 3, s.y * H - par.y * 2, s.r, s.r); }
      g.globalAlpha = 1;
      if (!reduce && R() < dt / 35 * starA) meteors.push({ x: rr(0.1, 0.9) * W, y: rr(0.05, 0.3) * H, vx: rr(-1, 1) > 0 ? 520 : -520, vy: 210, life: 1 });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 1.4;
      if (m.life <= 0) { meteors.splice(i, 1); continue; }
      const lg = g.createLinearGradient(m.x, m.y, m.x - m.vx * 0.18, m.y - m.vy * 0.18);
      lg.addColorStop(0, `rgba(255,255,255,${m.life * 0.9})`); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = lg; g.lineWidth = 1.4; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 0.18, m.y - m.vy * 0.18); g.stroke();
    }

    /* sun / moon */
    const isNight = night > 0.5, narrow = W < 700;
    const bx = W * (narrow ? 0.82 : 0.8) - par.x * 6, by = narrow ? H * 0.17 : horizon - H * (isNight ? 0.31 : 0.21);
    const bodyA = 1 - overcast * 0.9;
    if (bodyA > 0.04) {
      const gc = isNight ? [222, 230, 255] : mix([255, 206, 150], [255, 246, 228], 1 - P.night * 2);
      const glow = g.createRadialGradient(bx, by, 0, bx, by, H * 0.34);
      glow.addColorStop(0, rgb(gc, 0.32 * bodyA)); glow.addColorStop(1, rgb(gc, 0));
      g.fillStyle = glow; g.fillRect(0, 0, W, horizon);
      const r = narrow ? 13 : isNight ? 16 : 22;
      g.fillStyle = rgb(gc, 0.96 * bodyA); g.beginPath(); g.arc(bx, by, r, 0, 6.283); g.fill();
      if (isNight) { g.fillStyle = `rgba(150,160,190,${0.3 * bodyA})`; [[-5, -4, 4], [4, 5, 3], [6, -6, 2]].forEach(([x, y, q]) => { g.beginPath(); g.arc(bx + x * r / 16, by + y * r / 16, q * r / 16, 0, 6.283); g.fill(); }); }
    }

    /* clouds */
    const ca = (isNight ? 0.16 : 0.5) + overcast * 0.35, cs = Math.max(W, 900) / 900;
    for (const c of clouds) {
      c.x += dt * c.d * (0.0025 + windNow * lvl.wind * 0.025 + lvl.thunder * 0.008);
      const w = c.sp.width * c.s * cs, h = c.sp.height * c.s * cs;
      if (c.x * W > W + 40) { c.x = -w / W - 0.05; c.y = rr(0.04, 0.34); }
      g.globalAlpha = ca * (0.6 + 0.4 * c.d / 1.2);
      g.drawImage(c.sp, c.x * W - par.x * 10 * c.d, c.y * H - h / 2, w, h);
    }
    g.globalAlpha = 1;
    if (overcast > 0.05) { g.fillStyle = `rgba(60,68,78,${overcast * 0.25})`; g.fillRect(0, 0, W, horizon); }

    /* lightning */
    if (flash > 0.01) { g.fillStyle = `rgba(225,232,255,${flash * 0.32})`; g.fillRect(0, 0, W, horizon); }
    if (bolt) {
      bolt.life -= dt * 4.5;
      if (bolt.life <= 0) bolt = null;
      else {
        const a = (bolt.life > 0.5 ? 1 : bolt.life * 2) * (0.6 + 0.4 * (R() < 0.7));
        g.save(); g.shadowColor = "rgba(200,215,255,.9)"; g.shadowBlur = 18; g.lineCap = "round"; g.lineJoin = "round";
        for (const s of bolt.segs) { g.strokeStyle = `rgba(240,245,255,${a})`; g.lineWidth = s.w; g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
        g.restore();
      }
    }

    /* birds crossing */
    if (!isNight && lvl.birds > 0.05 && flocks.length < 2 && R() < dt / 14 * lvl.birds) spawnFlock();
    for (let i = flocks.length - 1; i >= 0; i--) {
      const f = flocks[i]; f.x += f.vx * dt; f.y += Math.sin(t * 0.7 + f.ph) * 4 * dt;
      if (f.x < -200 || f.x > W + 200) { flocks.splice(i, 1); continue; }
      g.strokeStyle = `rgba(20,28,38,${0.55 * (1 - night)})`; g.lineCap = "round";
      for (const b of f.birds) {
        const x = f.x + b.dx, y = f.y + b.dy, s = b.s * 7, w = Math.sin(t * b.hz * 6.28 + b.ph) * 0.7;
        g.lineWidth = 1.3 * b.s; g.beginPath(); g.moveTo(x - s, y - s * w); g.quadraticCurveTo(x - s * 0.4, y - s * 0.25, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.25, x + s, y - s * w); g.stroke();
      }
    }

    /* the far bank: a line of trees appears when the mix sounds like a village or forest */
    const land = Math.max(0, Math.min(1, lvl.birds * 1.1 + lvl.stream * 0.9 + lvl.frogs * 0.7 + lvl.crickets * 0.5 - lvl.waves * 0.9));
    if (land > 0.02) {
      const tc = mix(mix(P.far, [18, 34, 26], 0.6), GREY, overcast * 0.3), step = W / (trees.length - 1);
      g.fillStyle = rgb(mix(tc, [4, 8, 10], night * 0.6), land); g.beginPath(); g.moveTo(0, horizon + 2);
      trees.forEach((tr, i) => {
        const x = i * step - par.x * 3, th = (tr.palm ? 26 : 14) * tr.h * (0.6 + land * 0.4) * (H / 820);
        if (tr.palm) { g.lineTo(x - 1, horizon - th * 0.7); g.lineTo(x - 7, horizon - th * 0.78); g.lineTo(x, horizon - th); g.lineTo(x + 7, horizon - th * 0.8); g.lineTo(x + 1, horizon - th * 0.7); }
        else g.quadraticCurveTo(x - step * 0.5, horizon - th * 1.3, x, horizon - th * (0.5 + 0.5 * tr.w / 1.4));
      });
      g.lineTo(W, horizon + 2); g.closePath(); g.fill();
    }

    /* sea */
    const LAYERS = 7, amp = 0.55 + lvl.waves * 2.3 + lvl.thunder * 1.1 + lvl.wind * windNow * 1.2;
    const far = mix(P.far, GREY, overcast * 0.35), near = P.near;
    foam = Math.max(0, foam - dt * 0.45);
    for (let i = 0; i < LAYERS; i++) {
      const f = i / (LAYERS - 1), depth = Math.pow(f, 1.7);
      const y0 = horizon + depth * (H - horizon) * 0.92, A = (1.4 + f * 14) * amp * (1 + foam * f * 0.6);
      const k = 0.012 / (0.4 + f * 1.4), sp = 0.3 + f * 0.6 + lvl.waves * 0.35, ox = -par.x * (2 + f * 18);
      g.beginPath(); g.moveTo(0, H);
      for (let x = -10; x <= W + 10; x += 8) {
        const y = y0 + Math.sin((x + ox) * k + t * sp + i * 1.9) * A + Math.sin((x + ox) * k * 2.3 - t * sp * 0.7 + i) * A * 0.33;
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      g.fillStyle = rgb(mix(far, near, f)); g.fill();
      const fa = (lvl.waves * 0.4 + lvl.thunder * 0.2 + foam * 0.9) * f;
      if (fa > 0.03) { g.strokeStyle = `rgba(255,255,255,${Math.min(0.75, fa * 0.45)})`; g.lineWidth = 1 + f * 1.5; g.stroke(); }
    }
    // spray thrown up when a wave breaks
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i]; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.9;
      if (p.life <= 0) { spray.splice(i, 1); continue; }
      g.fillStyle = `rgba(255,255,255,${p.life * 0.6})`; g.fillRect(p.x, p.y, p.r, p.r);
    }

    /* mist on the horizon */
    const mg = g.createLinearGradient(0, horizon - 40, 0, horizon + 50);
    const mc = mix(sky(P.hor), [255, 255, 255], 0.15);
    mg.addColorStop(0, rgb(mc, 0)); mg.addColorStop(0.5, rgb(mc, 0.16 + overcast * 0.2 + lvl.stream * 0.08)); mg.addColorStop(1, rgb(mc, 0));
    g.fillStyle = mg; g.fillRect(0, horizon - 40, W, 90);

    /* moon / sun path on the water */
    if (bodyA > 0.04) {
      for (let i = 0; i < 40; i++) {
        const f = i / 40, y = horizon + 4 + Math.pow(f, 1.6) * (H - horizon) * 0.9;
        const w = (6 + f * 80) * (0.6 + 0.4 * Math.sin(t * 1.6 + i * 2.1));
        const a = (1 - f) * 0.34 * bodyA * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.3));
        g.fillStyle = isNight ? `rgba(220,230,255,${a})` : `rgba(255,236,200,${a})`;
        g.fillRect(bx - w / 2 + Math.sin(t + i) * 6, y, w, 1.5 + f * 2.2);
      }
    }

    /* rain ripples on the sea */
    if (wet > 0.05 && !reduce) {
      const n = Math.min(4, (lvl.rain + lvl.thunder + lvl.tinroof * 0.5) * 40 * dt + R());
      for (let k = 0; k < (n | 0) && ripples.length < 160; k++) { const f = R(); ripples.push({ x: R() * W, y: horizon + Math.pow(f, 1.5) * (H - horizon), r: 0, max: 3 + f * 16, life: 1 }); }
    }
    g.lineWidth = 1;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const p = ripples[i]; p.r += p.max * dt * 2.2; p.life -= dt * 2.2;
      if (p.life <= 0) { ripples.splice(i, 1); continue; }
      g.strokeStyle = `rgba(220,235,245,${p.life * 0.25})`; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.28, 0, 0, 6.283); g.stroke();
    }

    /* fireflies (crickets / frogs at dusk and night) */
    const ff = Math.min(1, lvl.crickets + lvl.frogs) * Math.max(0.15, night);
    if (ff > 0.03) {
      const n = Math.round(flies.length * ff);
      for (let i = 0; i < n; i++) {
        const f = flies[i]; f.a += (R() - 0.5) * dt * 2; f.x += Math.cos(f.a) * f.sp * dt; f.y += Math.sin(f.a) * f.sp * dt * 0.6;
        if (f.x < 0) f.x = 1; if (f.x > 1) f.x = 0; if (f.y < 0.55) f.a = 1.57; if (f.y > 0.97) f.a = -1.57;
        const glow = Math.max(0, Math.sin(t * f.hz * 6.28 + f.ph)) ** 3 * ff;
        if (glow < 0.02) continue;
        const x = f.x * W - par.x * 14, y = f.y * H;
        const rg = g.createRadialGradient(x, y, 0, x, y, 9); rg.addColorStop(0, `rgba(222,255,150,${glow})`); rg.addColorStop(1, "rgba(222,255,150,0)");
        g.fillStyle = rg; g.fillRect(x - 9, y - 9, 18, 18);
      }
    }

    /* fire: warm glow, embers, sparks from pops */
    if (lvl.fire > 0.02) {
      const fl = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
      const fg = g.createRadialGradient(W / 2, H * 1.18, 0, W / 2, H * 1.18, H * 0.8);
      fg.addColorStop(0, `rgba(255,128,48,${0.48 * lvl.fire * fl})`); fg.addColorStop(1, "rgba(255,110,40,0)");
      g.fillStyle = fg; g.fillRect(0, 0, W, H);
      const n = Math.round(embers.length * lvl.fire);
      for (let i = 0; i < n; i++) {
        const e = embers[i]; e.y -= e.v * dt; e.s += dt * 2; e.life += dt * 0.22;
        if (e.y < 0.35 || e.life > 1.2) Object.assign(e, newEmber(false));
        const a = Math.max(0, Math.sin(Math.min(1, e.life) * Math.PI)) * lvl.fire;
        g.fillStyle = `rgba(255,${150 + (e.r * 40) | 0},80,${a})`; g.beginPath(); g.arc(e.x * W + Math.sin(e.s) * 12, e.y * H, e.r, 0, 6.283); g.fill();
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.vy += 120 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.1;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      g.fillStyle = `rgba(255,${180 + (s.life * 60) | 0},90,${s.life})`; g.beginPath(); g.arc(s.x, s.y, 1.6 * s.life + 0.4, 0, 6.283); g.fill();
    }

    /* coconut palms on the shore, swaying with the wind (wide screens only) */
    if (W >= 760) {
      const sway = 0.03 + lvl.wind * windNow * 0.12 + lvl.thunder * 0.05, col = rgb(mix([6, 10, 14], P.near, 0.25), 0.94);
      palm(W * 0.02, H * 1.02, H * 0.6, 0.2, sway, col, 1);
      palm(W * 0.17, H * 1.03, H * 0.4, -0.08, sway * 1.2, col, 0.68);
    }

    /* rain streaks, slanted by the live wind */
    const rainAmt = Math.min(1, lvl.rain * 0.55 + lvl.thunder * 0.6 + lvl.tinroof * 0.45);
    if (rainAmt > 0.02) {
      const n = Math.round(drops.length * rainAmt), slant = 0.1 + lvl.wind * windNow * 0.55 + lvl.thunder * 0.12, len = 16 + rainAmt * 10;
      g.strokeStyle = isNight ? "rgba(185,205,232,.26)" : "rgba(235,242,250,.34)"; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y += d.v * dt * 1.15; d.x += d.v * dt * slant * 1.15 * (H / W);
        if (d.y > 1) { d.y -= 1.06; d.x = R() * 1.3 - 0.15; }
        if (d.x > 1.08) d.x -= 1.16;
        const x = d.x * W, y = d.y * H, l = len * d.l;
        g.moveTo(x, y); g.lineTo(x - slant * l, y - l);
      }
      g.stroke();
    }

    /* tin roof edge: you're sitting under the eave of a tin-roofed verandah */
    if (lvl.tinroof > 0.02) {
      const a = Math.min(1, lvl.tinroof * 2.2), eave = 26 + 8 * a, wl = 22;
      g.save(); g.globalAlpha = a;
      g.fillStyle = "#14110f"; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, eave);
      for (let x = W; x >= -wl; x -= wl / 2) g.quadraticCurveTo(x - wl / 4, eave + (((x / (wl / 2)) | 0) % 2 ? 5 : -1), x - wl / 2, eave);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1;
      for (let x = 0; x < W; x += wl) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, eave); g.stroke(); }
      g.restore();
      if (!reduce && R() < dt * 3 * lvl.tinroof) drips.push({ x: (Math.round(R() * W / wl)) * wl, y: eave + 4, vy: 0, l: rr(6, 12) });
      g.strokeStyle = "rgba(220,235,250,.5)"; g.lineWidth = 1.5;
      for (let i = drips.length - 1; i >= 0; i--) {
        const d = drips[i]; d.vy += 1600 * dt; d.y += d.vy * dt;
        if (d.y > H + 20) { drips.splice(i, 1); continue; }
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x, d.y - d.l); g.stroke();
      }
    } else drips.length = 0;

    /* film grain for the noise colours */
    const gr = Math.min(0.08, (lvl.white + lvl.pink + lvl.brown + lvl.fan * 0.5) * 0.045);
    if (gr > 0.004) {
      g.save(); g.globalAlpha = gr; g.globalCompositeOperation = "overlay";
      g.translate((R() * 160) | 0, (R() * 160) | 0); g.fillStyle = grainPat; g.fillRect(-160, -160, W + 320, H + 320); g.restore();
    }
    flash *= Math.pow(0.015, dt);
  }

  function palm(x0, y0, len, lean, sway, col, sc) {
    const s = Math.sin(t * 0.8 + x0) * sway, bend = lean + s * 0.35;
    const tx = x0 + Math.sin(bend) * len, ty = y0 - Math.cos(bend) * len, cx = x0 + Math.sin(lean) * len * 0.15 + 30 * sc, cy = y0 - len * 0.55;
    g.fillStyle = col;
    // tapered, slightly curved trunk
    const q = u => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * tx, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * ty];
    const left = [], right = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, [px, py] = q(u), [nx, ny] = q(Math.min(1, u + 0.01)), dx = nx - px, dy = ny - py, d = Math.hypot(dx, dy) || 1;
      const w = (11 - 5.5 * u) * sc, ox = -dy / d * w, oy = dx / d * w;
      left.push([px + ox, py + oy]); right.push([px - ox, py - oy]);
    }
    g.beginPath(); left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); right.reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill();
    // fronds: filled, tapered, drooping leaves with notches so the leaflets read
    for (let k = 0; k < 11; k++) {
      const side = k % 2 ? 1 : -1, spread = (k / 10 - 0.5) * 3.3;
      const a = -Math.PI / 2 + spread + s * (1.2 + Math.abs(spread) * 0.3) + Math.sin(t * 1.6 + k * 1.7) * sway * 0.5;
      const L = (150 + ((k * 37) % 60)) * sc, droop = (0.42 + Math.abs(spread) * 0.25) * L;
      const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + droop, mx = tx + Math.cos(a) * L * 0.55, my = ty + Math.sin(a) * L * 0.55 - 6 * sc;
      const P = u => [(1 - u) * (1 - u) * tx + 2 * (1 - u) * u * mx + u * u * ex, (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * my + u * u * ey];
      const top = [], bot = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20, [px, py] = P(u), [nx, ny] = P(Math.min(1, u + 0.02)), dx = nx - px, dy = ny - py, d = Math.hypot(dx, dy) || 1;
        const notch = i % 2 ? 0.5 : 1, w = 15 * sc * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.8 * notch;
        top.push([px - dy / d * w * 0.55, py + dx / d * w * 0.55]); bot.push([px + dy / d * w, py - dx / d * w]);
      }
      g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); bot.reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill();
    }
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(tx + (i - 1.5) * 5 * sc, ty + 7 * sc + (i % 2) * 3 * sc, 5.5 * sc, 0, 6.283); g.fill(); }   // coconuts
  }

  function spawnFlock() {
    const dir = R() < 0.5 ? 1 : -1, n = 3 + ((R() * 5) | 0), s = rr(0.6, 1.2);
    flocks.push({
      x: dir > 0 ? -120 : W + 120, y: rr(0.12, 0.38) * H, vx: dir * rr(38, 75) * s, ph: R() * 6,
      birds: Array.from({ length: n }, (_, i) => ({ dx: -dir * i * rr(14, 22) * s, dy: (i % 2 ? 1 : -1) * i * rr(5, 9) * s, s: s * rr(0.8, 1.1), hz: rr(2.2, 3.2), ph: R() * 6 })),
    });
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) draw(dt);
    requestAnimationFrame(loop);
  }
  resize();
  if (reduce) setInterval(() => draw(1), 3000); else requestAnimationFrame(loop);

  return {
    set(levels) { for (const k of KEYS) target[k] = levels[k] || 0; },
    event(e) {
      if (reduce) return;
      if (e.ev === "flash") { flash = Math.max(flash, 0.35 + e.near * 0.65); if (e.near > 0.35 && lvl.thunder > 0.08) bolt = makeBolt(e.near); setTimeout(() => (flash = Math.max(flash, 0.5 * e.near)), 120); }
      else if (e.ev === "wave") {
        foam = Math.min(1.4, foam + e.size * lvl.waves * 1.3);
        const n = Math.round(30 * e.size * lvl.waves);
        for (let i = 0; i < n; i++) spray.push({ x: R() * W, y: H * rr(0.82, 0.98), vx: rr(-30, 30), vy: -rr(60, 200) * e.size, r: rr(1, 2.4), life: rr(0.6, 1) });
      } else if (e.ev === "pop" && lvl.fire > 0.05) {
        const x = W * (0.5 + e.x * 0.35);
        for (let i = 0; i < 14; i++) sparks.push({ x, y: H * 0.97, vx: rr(-90, 90), vy: -rr(160, 420), life: 1 });
      } else if (e.ev === "drip" && lvl.tinroof > 0.05) drips.push({ x: W * (0.5 + e.x * 0.5), y: 30, vy: 0, l: 12 });
      else if (e.ev === "bird" && lvl.birds > 0.1 && flocks.length < 3 && R() < 0.5) spawnFlock();
      else if (e.ev === "wind") windNow = e.v;
    },
    setHour(h) { hourOverride = h; },
  };
})();
