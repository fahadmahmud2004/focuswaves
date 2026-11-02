/* =========================================================
   LIVING SEA — a canvas scene that reacts to the sound mix
   and follows the visitor's local time of day.
   Scene.set({ rain, storm, waves, ... })  levels 0..1
   ========================================================= */
const Scene = (() => {
  const cv = document.getElementById("scene"), g = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, t = 0, last = performance.now(), flash = 0;
  const target = {}, lvl = {};
  const KEYS = ["rain", "storm", "waves", "wind", "stream", "fire", "night", "fan", "white", "pink", "brown"];
  KEYS.forEach(k => (target[k] = lvl[k] = 0));
  lvl.waves = target.waves = 0.25; // a calm sea even in silence

  /* ---- sky keyframes by hour: [hour, skyTop, skyHorizon, seaFar, seaNear, night] ---- */
  const KF = [
    [0,    "#050b16", "#10243a", "#0b1d2c", "#04101a", 1],
    [4.8,  "#0b1328", "#2b2f52", "#14243a", "#060f1a", 0.9],
    [6.3,  "#2f4b7c", "#f0b48c", "#3b5878", "#0c1f30", 0.2],
    [8.5,  "#3a78b0", "#b7dbe8", "#2f6f8c", "#0d3448", 0],
    [16,   "#3c74aa", "#c3dde6", "#2c6a86", "#0c3246", 0],
    [18.2, "#36507e", "#f3a877", "#3c5674", "#0e2235", 0.1],
    [19.6, "#17213f", "#5b4466", "#1a2a42", "#08141f", 0.6],
    [21,   "#070e1c", "#152a40", "#0d1f2e", "#04101a", 1],
    [24,   "#050b16", "#10243a", "#0b1d2c", "#04101a", 1],
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
  const GREY = [44, 54, 64], GREY2 = [70, 80, 90];

  /* ---- particles ---- */
  const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28, s: 0.5 + Math.random() * 2 }));
  const drops = Array.from({ length: 700 }, () => ({ x: Math.random(), y: Math.random(), l: 12 + Math.random() * 16, v: 0.9 + Math.random() * 0.5 }));
  const embers = Array.from({ length: 90 }, () => newEmber(true));
  function newEmber(any) { return { x: 0.15 + Math.random() * 0.7, y: any ? Math.random() : 1.02, v: 0.03 + Math.random() * 0.06, s: Math.random() * 6.28, r: 0.8 + Math.random() * 1.8, life: Math.random() }; }
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.3, w: 0.25 + Math.random() * 0.3, h: 0.04 + Math.random() * 0.05 }));

  // film-grain tile for noise sounds
  const grain = document.createElement("canvas"); grain.width = grain.height = 128;
  { const gc = grain.getContext("2d"), d = gc.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } gc.putImageData(d, 0, 0); }
  const grainPat = g.createPattern(grain, "repeat");

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduce) draw(0);
  }
  addEventListener("resize", resize);

  function draw(dt) {
    t += dt;
    for (const k of KEYS) lvl[k] += (target[k] - lvl[k]) * Math.min(1, dt * 1.5);
    const now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
    const P = palette(hour);
    const overcast = Math.min(1, lvl.rain * 0.55 + lvl.storm * 0.9);
    const night = Math.min(1, Math.max(P.night, lvl.night * 0.85));
    const darken = (c, extra = 0) => mix(mix(c, GREY, overcast * 0.6), [3, 7, 14], Math.max(0, night - P.night) * 0.8 + extra);
    const horizon = H * 0.6;

    // sky
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgb(darken(P.top))); sky.addColorStop(1, rgb(darken(P.hor)));
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);

    // stars
    const starA = night * (1 - overcast * 0.9);
    if (starA > 0.02) {
      g.fillStyle = "#fff";
      for (const s of stars) {
        g.globalAlpha = starA * (0.45 + 0.55 * Math.sin(t * s.s + s.p) ** 2);
        g.fillRect(s.x * W, s.y * H, s.r, s.r);
      }
      g.globalAlpha = 1;
    }

    // sun or moon (sits low on the horizon line, gives the reflection)
    const isNight = night > 0.5;
    const narrow = W < 700;
    const bx = W * (narrow ? 0.84 : 0.83), by = narrow ? H * 0.17 : horizon - H * (isNight ? 0.3 : 0.2);
    const bodyA = 1 - overcast * 0.85;
    if (bodyA > 0.05) {
      const glow = g.createRadialGradient(bx, by, 0, bx, by, H * 0.3);
      const gc = isNight ? [220, 230, 255] : mix([255, 214, 160], [255, 245, 225], 1 - P.night);
      glow.addColorStop(0, rgb(gc, 0.35 * bodyA)); glow.addColorStop(1, rgb(gc, 0));
      g.fillStyle = glow; g.fillRect(0, 0, W, horizon);
      g.fillStyle = rgb(gc, 0.95 * bodyA);
      g.beginPath(); g.arc(bx, by, narrow ? 14 : isNight ? 17 : 22, 0, 6.283); g.fill();
      if (isNight) { g.fillStyle = `rgba(150,160,190,${0.35 * bodyA})`; [[-5, -4, 4], [4, 5, 3], [6, -6, 2]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(bx + dx, by + dy, r, 0, 6.283); g.fill(); }); }
    }

    // clouds drift with the wind
    const cloudA = 0.06 + overcast * 0.35 + lvl.wind * 0.05;
    for (const c of clouds) {
      c.x += dt * (0.004 + lvl.wind * 0.03 + lvl.storm * 0.01);
      if (c.x - c.w > 1) c.x = -c.w;
      const cx = c.x * W, cy = c.y * H, rx = c.w * W, ry = c.h * H;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      const col = mix(night > 0.5 ? [40, 50, 70] : [235, 240, 245], GREY2, overcast);
      cg.addColorStop(0, rgb(col, cloudA)); cg.addColorStop(1, rgb(col, 0));
      g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
      g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, rx, 0, 6.283); g.fill(); g.restore();
    }

    // sea: layered swells, far to near
    const LAYERS = 7, amp = 0.5 + lvl.waves * 2.4 + lvl.storm * 1.2 + lvl.wind * 0.6;
    const far = darken(P.far), near = darken(P.near, 0);
    for (let i = 0; i < LAYERS; i++) {
      const f = i / (LAYERS - 1), depth = Math.pow(f, 1.7);
      const y0 = horizon + depth * (H - horizon) * 0.92;
      const A = (1.5 + f * 14) * amp, k = 0.012 / (0.4 + f * 1.4), sp = 0.35 + f * 0.6 + lvl.waves * 0.4;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) {
        const y = y0 + Math.sin(x * k + t * sp + i * 1.9) * A + Math.sin(x * k * 2.3 - t * sp * 0.7 + i) * A * 0.35;
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      g.fillStyle = rgb(mix(far, near, f)); g.fill();
      // foam on crests when the sea is lively
      const foam = (lvl.waves * 0.5 + lvl.storm * 0.3) * f;
      if (foam > 0.03) { g.strokeStyle = `rgba(255,255,255,${foam * 0.35})`; g.lineWidth = 1 + f; g.stroke(); }
    }

    // light path on the water
    if (bodyA > 0.05) {
      const n = 36;
      for (let i = 0; i < n; i++) {
        const f = i / n, y = horizon + 4 + Math.pow(f, 1.6) * (H - horizon) * 0.9;
        const w = (6 + f * 70) * (0.6 + 0.4 * Math.sin(t * 1.7 + i * 2.1));
        const a = (1 - f) * 0.35 * bodyA * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.3)) * (0.6 + lvl.stream * 0.8);
        g.fillStyle = isNight ? `rgba(220,230,255,${a})` : `rgba(255,236,200,${a})`;
        g.fillRect(bx - w / 2 + Math.sin(t + i) * 6, y, w, 1.5 + f * 2);
      }
    }

    // fire: warm glow + embers rising from below
    if (lvl.fire > 0.02) {
      const fg = g.createRadialGradient(W / 2, H * 1.15, 0, W / 2, H * 1.15, H * 0.75);
      fg.addColorStop(0, `rgba(255,140,60,${0.45 * lvl.fire})`); fg.addColorStop(1, "rgba(255,120,40,0)");
      g.fillStyle = fg; g.fillRect(0, 0, W, H);
      const n = Math.round(embers.length * lvl.fire);
      for (let i = 0; i < n; i++) {
        const e = embers[i];
        e.y -= e.v * dt; e.s += dt * 2; e.life += dt * 0.25;
        if (e.y < 0.35 || e.life > 1.2) Object.assign(e, newEmber(false), { life: 0 });
        const a = Math.max(0, Math.sin(Math.min(1, e.life) * Math.PI)) * lvl.fire;
        g.fillStyle = `rgba(255,${150 + (e.r * 40) | 0},80,${a})`;
        g.beginPath(); g.arc(e.x * W + Math.sin(e.s) * 12, e.y * H, e.r, 0, 6.283); g.fill();
      }
    }

    // rain
    const rainAmt = Math.min(1, lvl.rain + lvl.storm);
    if (rainAmt > 0.02) {
      const n = Math.round(drops.length * Math.min(1, lvl.rain * 0.5 + lvl.storm * 0.9));
      const slant = 0.12 + lvl.wind * 0.35 + lvl.storm * 0.15;
      g.strokeStyle = night > 0.5 ? "rgba(190,210,235,.28)" : "rgba(235,242,250,.38)"; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y += d.v * dt * 1.1; d.x += d.v * dt * slant * 1.1 * (H / W);
        if (d.y > 1) { d.y -= 1.05; d.x = Math.random() * 1.2 - 0.1; }
        if (d.x > 1.05) d.x -= 1.1;
        const x = d.x * W, y = d.y * H;
        g.moveTo(x, y); g.lineTo(x - slant * d.l, y - d.l);
      }
      g.stroke();
    }

    // lightning
    if (lvl.storm > 0.05 && !reduce && Math.random() < lvl.storm * dt * 0.12) flash = 1;
    if (flash > 0.01) { g.fillStyle = `rgba(230,235,255,${flash * 0.28})`; g.fillRect(0, 0, W, H); flash *= Math.pow(0.02, dt); if (flash < 0.5 && Math.random() < 0.05) flash = 0.8; }

    // grain for noise / fan
    const gr = Math.min(0.09, (lvl.white + lvl.pink + lvl.brown + lvl.fan * 0.6) * 0.05);
    if (gr > 0.004) {
      g.save(); g.globalAlpha = gr; g.globalCompositeOperation = "overlay";
      g.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
      g.fillStyle = grainPat; g.fillRect(-128, -128, W + 256, H + 256); g.restore();
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) draw(dt);
    requestAnimationFrame(loop);
  }
  resize();
  if (reduce) setInterval(() => draw(1), 4000); else requestAnimationFrame(loop);

  return {
    set(levels) { for (const k of KEYS) target[k] = levels[k] || 0; if (!(levels.waves > 0)) target.waves = Math.max(target.waves, 0.25); },
    redraw() { if (reduce) draw(1); },
  };
})();
