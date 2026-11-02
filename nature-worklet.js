/* =====================================================================
   Focus Waves nature engine (AudioWorklet)
   Every sound is synthesised live, sample by sample. Nothing is a loop,
   so nothing repeats: rain drops, waves, gusts, birds and crackles are all
   random events with slowly drifting character.
   Output 0 = dry stereo, output 1 = reverb send (stereo).
   ===================================================================== */
const SR = sampleRate;
const TAU = Math.PI * 2;
const rnd = () => Math.random() * 2 - 1;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => rnd() + rnd() + rnd();
const panG = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

/* ---------- building blocks ---------- */
class Drift {            // smooth random walk around a mean (Ornstein-Uhlenbeck), updated per block
  constructor(mean, spread, secs) { this.m = mean; this.s = spread; this.v = mean + gauss() * spread * 0.5; this.k = 128 / (secs * SR); }
  next() { this.v += (this.m - this.v) * this.k + this.s * Math.sqrt(2 * this.k) * gauss() * 0.58; return this.v; }
}
class LP { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = Math.exp(-TAU * fc / SR); } run(x) { return (this.y = x + (this.y - x) * this.a); } }
class HP { constructor(fc) { this.l = new LP(fc); } set(fc) { this.l.set(fc); } run(x) { return x - this.l.run(x); } }
class SVF {              // zero-delay-feedback state variable filter, stable under modulation
  constructor(fc = 1000, q = 0.7) { this.s1 = 0; this.s2 = 0; this.set(fc, q); this.lp = this.bp = this.hp = 0; }
  set(fc, q = this.q) {
    this.q = q; const g = Math.tan(Math.PI * clamp(fc, 20, SR * 0.45) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(x) {
    const v3 = x - this.s2, v1 = this.a1 * this.s1 + this.a2 * v3, v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2; return v1;
  }
}
class Pink {
  constructor() { this.b = [0, 0, 0, 0, 0, 0, 0]; }
  run() {
    const w = rnd(), b = this.b;
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856; b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
    const o = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362; b[6] = w * 0.115926; return o * 0.11;
  }
}
class Brown { constructor() { this.y = 0; } run() { this.y = (this.y + 0.02 * rnd()) / 1.02; return this.y * 3.5; } }
class Poisson {          // random event clock: fires on average `rate` times a second
  constructor(rate) { this.rate = rate; this.t = this.draw(); }
  draw() { return -Math.log(1 - Math.random()) * SR / Math.max(this.rate, 1e-4); }
  tick() { if (--this.t <= 0) { this.t = this.draw(); return true; } return false; }
}
class Res {              // struck two-pole resonator (a drop, a ping, a click)
  constructor() { this.on = false; this.y1 = this.y2 = 0; this.n = 0; this.gl = this.gr = 0.7; }
  strike(f, decay, amp, pan = 0) {
    const r = Math.exp(-1 / (decay * SR)), w = TAU * clamp(f, 20, SR * 0.45) / SR;
    this.c1 = 2 * r * Math.cos(w); this.c2 = r * r; this.y1 = amp * Math.sin(w); this.y2 = 0;
    this.n = Math.ceil(decay * SR * 7); this.on = true; [this.gl, this.gr] = panG(pan);
  }
  run() { const y = this.c1 * this.y1 - this.c2 * this.y2; this.y2 = this.y1; this.y1 = y; if (--this.n <= 0) this.on = false; return y; }
}
class Pool {
  constructor(n) { this.v = Array.from({ length: n }, () => new Res()); this.i = 0; }
  strike(f, d, a, p) { const v = this.v[this.i]; this.i = (this.i + 1) % this.v.length; v.strike(f, d, a, p); }
  run(o) { let l = 0, r = 0; for (const v of this.v) if (v.on) { const y = v.run(); l += y * v.gl; r += y * v.gr; } o[0] = l; o[1] = r; }
}
const tmp = [0, 0];
const TBL = new Float32Array(4097); for (let i = 0; i <= 4096; i++) TBL[i] = Math.sin(TAU * i / 4096);
const fsin = ph => { const x = (ph - Math.floor(ph)) * 4096, i = x | 0; return TBL[i] + (TBL[i + 1] - TBL[i]) * (x - i); };   // ph in cycles
const PADT = new Float32Array(4097); for (let i = 0; i <= 4096; i++) { const x = TAU * i / 4096; PADT[i] = (Math.sin(x) + 0.35 * Math.sin(2 * x) + 0.15 * Math.sin(3 * x) + 0.06 * Math.sin(4 * x)) / 1.3; }
const ftab = (T, ph) => { const x = (ph - Math.floor(ph)) * 4096, i = x | 0; return T[i] + (T[i + 1] - T[i]) * (x - i); };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
class Bursts {           // short decaying noise bursts: the body of a rain drop, a click, a tick
  constructor(n) { this.b = Array.from({ length: n }, () => ({ n: 0 })); this.i = 0; }
  add(len, amp, pan, decay = 0.8) { const b = this.b[this.i]; this.i = (this.i + 1) % this.b.length; b.n = len | 0; b.a = amp; b.d = decay; [b.gl, b.gr] = panG(pan); }
  run(o) { let l = 0, r = 0; for (const b of this.b) if (b.n > 0) { const x = rnd() * b.a; l += x * b.gl; r += x * b.gr; b.a *= b.d; b.n--; } o[0] = l; o[1] = r; }
}

/* ---------- generators: render(n, L, R, WL, WR) adds into the buffers ---------- */
class Rain {
  constructor() {
    this.lp = [new LP(6000), new LP(6000)]; this.hp = [new HP(450), new HP(450)];
    this.body = new Brown(); this.bodyLp = new LP(200);
    this.int = new Drift(1, 0.28, 9); this.bright = new Drift(5600, 1200, 12);
    this.drops = new Bursts(48); this.patter = new Poisson(300);
    this.shape = [new SVF(2600, 0.55), new SVF(2900, 0.55)];
    this.leaf = new Bursts(16); this.leafP = new Poisson(30); this.leafF = [new SVF(1500, 1.2), new SVF(1650, 1.2)];
    this.plop = new Pool(6); this.plopP = new Poisson(1.5);
  }
  render(n, L, R, WL, WR) {
    const I = clamp(this.int.next(), 0.35, 1.6), br = clamp(this.bright.next(), 3200, 8500);
    this.lp[0].set(br); this.lp[1].set(br * 0.94);
    this.patter.rate = 200 + 260 * I; this.leafP.rate = 15 + 30 * I;
    for (let i = 0; i < n; i++) {
      if (this.patter.tick()) this.drops.add(rand(10, 50), rand(0.05, 0.22) * I, rnd(), rand(0.7, 0.88));
      if (this.leafP.tick()) this.leaf.add(rand(40, 120), rand(0.15, 0.4), rnd() * 0.9, 0.93);
      if (this.plopP.tick()) this.plop.strike(rand(500, 1100), rand(0.008, 0.016), rand(0.03, 0.07), rnd() * 0.7);
      this.drops.run(tmp); const dl = this.shape[0].run(tmp[0]) * 0.9 + tmp[0] * 0.25, dr = this.shape[1].run(tmp[1]) * 0.9 + tmp[1] * 0.25;
      this.leaf.run(tmp); const ll = this.leafF[0].run(tmp[0]) * 0.5, lr = this.leafF[1].run(tmp[1]) * 0.5;
      this.plop.run(tmp);
      const a = this.hp[0].run(this.lp[0].run(rnd())), b = this.hp[1].run(this.lp[1].run(rnd()));
      const body = this.bodyLp.run(this.body.run()) * 0.2;
      const l = dl + ll + tmp[0], r = dr + lr + tmp[1];
      L[i] += a * 0.28 * I + l + body; R[i] += b * 0.28 * I + r + body;
      WL[i] += l * 0.25; WR[i] += r * 0.25;
    }
  }
}

class TinRoof {
  constructor(p) {
    this.p = p; this.drops = new Bursts(40); this.pois = new Poisson(70); this.rate = new Drift(70, 25, 10);
    const modes = [[930, 26, 1], [1580, 30, 0.75], [2310, 32, 0.55], [3270, 34, 0.4], [4480, 34, 0.28]];
    this.modes = [0, 1].map(c => modes.map(([f, q, g]) => ({ f: new SVF(f * (c ? 1.035 : 1), q), g })));
    this.tick = [new SVF(3800, 0.7), new SVF(4100, 0.7)];
    this.rum = new Brown(); this.rumLp = new LP(150);
    this.drips = Array.from({ length: 4 }, () => ({ x: rand(-0.85, 0.85), iv: rand(0.6, 2.2), t: rand(0, 1) * SR }));
    this.bub = []; this.splash = new Bursts(6);
  }
  render(n, L, R, WL, WR) {
    this.pois.rate = clamp(this.rate.next(), 25, 150);
    for (let i = 0; i < n; i++) {
      if (this.pois.tick()) this.drops.add(rand(6, 30), rand(0.08, 0.3), rnd() * 0.95, rand(0.6, 0.8));
      for (const d of this.drips) if (--d.t <= 0) {
        d.t = d.iv * SR * rand(0.75, 1.35);
        // a gutter drop landing in a puddle: a tiny bubble that rises in pitch, plus a splash
        this.bub.push({ ph: 0, f: rand(700, 1300), k: Math.pow(rand(1.25, 1.6), 1 / (0.05 * SR)), a: rand(0.07, 0.12), d: Math.exp(-1 / (0.02 * SR)), n: 0.06 * SR, g: panG(d.x) });
        this.splash.add(rand(60, 140), 0.12, d.x, 0.96);
        if (Math.random() < 0.5) this.p.emit({ ev: "drip", x: d.x });
      }
      this.drops.run(tmp); const xl = tmp[0], xr = tmp[1];
      let ml = 0, mr = 0;
      for (const m of this.modes[0]) { m.f.run(xl); ml += m.f.bp * m.f.k * m.g; }
      for (const m of this.modes[1]) { m.f.run(xr); mr += m.f.bp * m.f.k * m.g; }
      const tl = this.tick[0].run(xl) * 0.35, tr = this.tick[1].run(xr) * 0.35;
      let bl = 0, br = 0;
      for (let k = this.bub.length - 1; k >= 0; k--) { const b = this.bub[k]; b.ph += b.f / SR; b.f *= b.k; const y = fsin(b.ph) * b.a; b.a *= b.d; bl += y * b.g[0]; br += y * b.g[1]; if (--b.n <= 0) this.bub.splice(k, 1); }
      this.splash.run(tmp);
      const rum = this.rumLp.run(this.rum.run()) * 0.25;
      const l = ml * 2.2 + tl + bl + tmp[0] * 0.3, r = mr * 2.2 + tr + br + tmp[1] * 0.3;
      L[i] += l + rum; R[i] += r + rum; WL[i] += l * 0.35; WR[i] += r * 0.35;
    }
  }
}

class Thunder {
  constructor(p) {
    this.p = p; this.wait = rand(5, 14) * SR; this.ev = null;
    this.b = [new Brown(), new Brown()]; this.f = [new SVF(150, 0.6), new SVF(150, 0.6)];
    this.body = [new SVF(380, 0.8), new SVF(420, 0.8)]; this.roll = new Drift(0, 0.35, 0.35);
    this.crk = new Bursts(24); this.crkF = [new HP(700), new HP(700)];
  }
  render(n, L, R, WL, WR) {
    if (!this.ev) {
      this.wait -= n;
      if (this.wait <= 0) {
        const dist = Math.random() ** 0.8, delay = (0.25 + dist * 3.5) * SR;
        this.p.emit({ ev: "flash", near: 1 - dist });
        const bumps = Array.from({ length: 4 + ((Math.random() * 5) | 0) }, (_, k) => ({ t0: k === 0 ? 0 : rand(0.15, 5) * SR, at: rand(0.08, 0.6) * SR, dc: rand(0.7, 2.8) * SR, a: k === 0 ? 1 : rand(0.25, 0.85) }));
        this.ev = { t: -delay, dist, bumps, len: rand(7, 13) * SR, pan: rnd() * 0.5, dp: rnd() * 0.3 / SR, crack: dist < 0.4 ? 1 - dist : 0 };
        this.wait = rand(20, 75) * SR;
      }
      return;
    }
    const e = this.ev, near = 1 - e.dist, roll = 0.62 + 0.38 * clamp(this.roll.next(), -1, 1);
    const fc = 55 + 260 * near; this.f[0].set(fc); this.f[1].set(fc * 1.12);
    for (let i = 0; i < n; i++) {
      const t = e.t++; if (t < 0) continue;
      let env = 0;
      for (const b of e.bumps) { const d = t - b.t0; if (d > 0) env += b.a * (d < b.at ? (d / b.at) ** 1.5 : Math.exp(-(d - b.at) / b.dc)); }
      env *= roll * (1.25 - e.dist * 0.6);
      // the crack: a fast, thinning crackle in the first half second
      if (e.crack && t < 0.6 * SR && Math.random() < 0.02 * (1 - t / (0.6 * SR))) this.crk.add(rand(20, 160), rand(0.3, 1) * e.crack, rnd() * 0.4 + e.pan, 0.97);
      this.crk.run(tmp); const cl = this.crkF[0].run(tmp[0]) * 0.6, cr = this.crkF[1].run(tmp[1]) * 0.6;
      this.f[0].run(this.b[0].run()); this.f[1].run(this.b[1].run());
      const bl = this.body[0].run(this.f[0].lp) * near * 0.5, br = this.body[1].run(this.f[1].lp) * near * 0.5;
      e.pan = clamp(e.pan + e.dp, -0.8, 0.8); const [gl, gr] = panG(e.pan);
      const l = (this.f[0].lp * 1.5 + bl) * env, r = (this.f[1].lp * 1.5 + br) * env;
      L[i] += l * gl * 1.4 + cl; R[i] += r * gr * 1.4 + cr;
      WL[i] += l * 0.6 + cl * 0.8; WR[i] += r * 0.6 + cr * 0.8;
    }
    if (e.t > e.len) this.ev = null;
  }
}

class Waves {
  constructor(p) {
    this.p = p; this.bed = [new Pink(), new Pink()]; this.bedF = [new LP(380), new LP(400)]; this.bedLvl = new Drift(1, 0.25, 7);
    this.voices = []; this.wait = rand(0.3, 1.5) * SR;
  }
  spawn() {
    const size = rand(0.45, 1), Tr = rand(1.8, 3.2) * SR, Tf = rand(4, 7) * SR * (0.7 + 0.4 * size);
    this.voices.push({
      t: 0, Tr, Tf, size, pan: rand(-0.5, 0.5), peaked: false,
      src: [new Pink(), new Pink()], f: [new SVF(300, 0.5), new SVF(320, 0.5)],
      fz: [new SVF(4000, 0.6), new SVF(4300, 0.6)], grain: new LP(28), peb: new Bursts(10), pebP: new Poisson(0),
    });
    this.wait = rand(3.5, 8.5) * SR;
  }
  render(n, L, R, WL, WR) {
    this.wait -= n; if (this.wait <= 0 && this.voices.length < 3) this.spawn();
    const bed = clamp(this.bedLvl.next(), 0.5, 1.5) * 0.32;
    for (let i = 0; i < n; i++) { L[i] += this.bedF[0].run(this.bed[0].run()) * bed; R[i] += this.bedF[1].run(this.bed[1].run()) * bed; }
    for (const v of this.voices) {
      const [gl, gr] = panG(v.pan), s = v.size;
      const env = t => t < v.Tr ? 0.5 - 0.5 * Math.cos(Math.PI * t / v.Tr) : Math.max(0, 1 - (t - v.Tr) / v.Tf) ** 2.2;
      const e0 = env(v.t);
      v.f[0].set(260 + 2100 * e0 * s); v.f[1].set(280 + 2000 * e0 * s);
      const fall = v.t > v.Tr ? (v.t - v.Tr) / v.Tf : 0;
      v.pebP.rate = fall > 0.45 && fall < 0.95 ? 70 * s * (1 - fall) : 0;
      if (!v.peaked && v.t >= v.Tr) { v.peaked = true; this.p.emit({ ev: "wave", size: s }); }
      for (let i = 0; i < n; i++) {
        const t = v.t++, e = env(t);
        v.f[0].run(v.src[0].run()); v.f[1].run(v.src[1].run());
        let l = v.f[0].lp * e * s * 1.3, r = v.f[1].lp * e * s * 1.3;
        if (t > v.Tr) {                                   // foam fizzing as the water slides back
          const g = 0.4 + Math.abs(v.grain.run(rnd() * 3)), fz = e * s * 0.16 * g;
          v.fz[0].run(rnd()); v.fz[1].run(rnd()); l += v.fz[0].bp * fz; r += v.fz[1].bp * fz;
          if (v.pebP.rate > 0 && v.pebP.tick()) v.peb.add(rand(4, 14), rand(0.02, 0.06), rnd() * 0.6, 0.75);
          v.peb.run(tmp); l += tmp[0]; r += tmp[1];
        }
        L[i] += l * gl * 1.3; R[i] += r * gr * 1.3; WL[i] += l * 0.2; WR[i] += r * 0.2;
      }
    }
    this.voices = this.voices.filter(v => v.t < v.Tr + v.Tf);
  }
}

class Wind {
  constructor(p) {
    this.p = p; this.g = new Drift(0.45, 0.28, 3.5); this.gr = 0.45; this.f = [new SVF(400, 0.85), new SVF(400, 0.85)];
    this.w = new SVF(1100, 16); this.wf = new Drift(1, 0.15, 5); this.k = 0; this.lvl = 0.45;
  }
  render(n, L, R) {
    const g = clamp(this.g.next(), 0.05, 1.1); this.gr += (g - this.gr) * 0.02; this.lvl = g;
    this.f[0].set(200 + 720 * g); this.f[1].set(210 + 700 * this.gr);
    this.w.set((750 + 850 * g) * clamp(this.wf.next(), 0.8, 1.2));
    const al = 0.2 + 1.05 * g ** 1.5, ar = 0.2 + 1.05 * this.gr ** 1.5, wh = Math.max(0, g - 0.62) * 0.5;
    for (let i = 0; i < n; i++) {
      const l = this.f[0].run(rnd()) * al, r = this.f[1].run(rnd()) * ar, w = this.w.run(rnd()) * wh;
      L[i] += l + w * 0.8; R[i] += r + w * 0.6;
    }
    if (++this.k % 48 === 0) this.p.emit({ ev: "wind", v: g });
  }
}

/* birds: each bird has its own voice, distance, side of the field and song */
function songFor(b) {
  const N = [];
  const add = (dur, f0, f1, amp = 1, trill = 0, gap = 0) => { N.push({ dur, f0, f1, amp, trill }); if (gap) N.push({ dur: gap, rest: true }); };
  switch (b.type) {
    case "koel": {      // the Asian koel: "ku-oo", repeated, climbing and hurrying
      let k = b.f, gap = 0.9;
      for (let i = 0, n = 4 + ((Math.random() * 4) | 0); i < n; i++) {
        add(0.16, k, k * 1.05, 0.8, 0, 0.05); add(0.34, k * 1.22, k * 1.42, 1, 0, gap);
        k *= 1.045; gap *= 0.86;
      }
      break;
    }
    case "dove": {      // spotted dove: soft "ku-kroo-kroo"
      const f = b.f;
      for (let i = 0, n = 2 + ((Math.random() * 2) | 0); i < n; i++) { add(0.12, f, f * 1.02, 0.6, 0, 0.08); add(0.32, f * 1.12, f * 0.98, 1, 6, 0.1); add(0.22, f * 1.05, f * 0.95, 0.8, 6, 1.1); }
      break;
    }
    case "chirp": for (let i = 0, n = 3 + ((Math.random() * 6) | 0); i < n; i++) add(rand(0.035, 0.07), b.f * rand(1.25, 1.5), b.f * rand(0.8, 0.95), rand(0.6, 1), 0, rand(0.05, 0.13)); break;
    case "trill": add(rand(0.5, 1.2), b.f, b.f * rand(0.85, 0.97), 1, rand(24, 38)); break;
    default: {          // warbler: a little improvised melody
      let f = b.f;
      for (let i = 0, n = 6 + ((Math.random() * 7) | 0); i < n; i++) { const nf = clamp(f * rand(0.8, 1.25), 2200, 6200); add(rand(0.05, 0.14), f, nf, rand(0.5, 1), Math.random() < 0.2 ? 30 : 0, rand(0.01, 0.04)); f = nf; }
    }
  }
  return N;
}
class Birds {
  constructor(p) {
    this.p = p; this.leaf = new Pink(); this.leafF = new SVF(3200, 0.7); this.leafA = new Drift(0.5, 0.3, 4);
    const types = ["warble", "chirp", "trill", "warble", "chirp", "dove", "koel"];
    const base = { warble: [2600, 4200], chirp: [3500, 5200], trill: [3800, 5600], dove: [430, 560], koel: [720, 880] };
    this.birds = types.map(type => ({
      type, f: rand(...base[type]), pan: rnd() * 0.9, dist: type === "koel" ? rand(0.5, 0.8) : rand(0.15, 0.9),
      wait: rand(0.5, type === "koel" ? 25 : 8) * SR, lp: new LP(9000), song: null,
    }));
    this.birds.forEach(b => b.lp.set(9500 - b.dist * 6000));
  }
  render(n, L, R, WL, WR) {
    const la = clamp(this.leafA.next(), 0.1, 1) * 0.035;
    for (let i = 0; i < n; i++) { this.leafF.run(this.leaf.run()); const x = this.leafF.bp * la; L[i] += x; R[i] += x * 0.9; }
    for (const b of this.birds) {
      if (!b.song) {
        b.wait -= n;
        if (b.wait <= 0) {
          b.song = { notes: songFor(b), i: 0, t: 0, ph: 0 };
          b.wait = (b.type === "koel" ? rand(25, 60) : b.type === "dove" ? rand(12, 30) : rand(3, 14)) * SR;
          if (b.type !== "dove" && Math.random() < 0.3) this.p.emit({ ev: "bird", x: b.pan });
        }
        continue;
      }
      const s = b.song, [gl, gr] = panG(b.pan), vol = (1.15 - b.dist) * (b.type === "koel" ? 0.22 : b.type === "dove" ? 0.2 : 0.09);
      for (let i = 0; i < n; i++) {
        const note = s.notes[s.i];
        if (!note) { b.song = null; break; }
        const len = note.dur * SR, x = s.t / len;
        if (!note.rest) {
          const f = note.f0 + (note.f1 - note.f0) * x;
          s.ph += TAU * f / SR;
          let env = Math.sin(Math.PI * x); env *= env;
          if (note.trill) env *= 0.5 + 0.5 * Math.sin(TAU * note.trill * s.t / SR);
          const y = b.lp.run(Math.sin(s.ph) * env * note.amp * vol);
          L[i] += y * gl; R[i] += y * gr; WL[i] += y * b.dist * 0.7; WR[i] += y * b.dist * 0.7;
        }
        if (++s.t >= len) { s.t = 0; s.i++; }
      }
    }
  }
}

class Stream {
  constructor() {
    this.pk = [new Pink(), new Pink()]; this.f = [new SVF(1800, 0.6), new SVF(1900, 0.6)];
    this.fc = new Drift(1800, 450, 2); this.amp = new Drift(1, 0.25, 1.5); this.rate = new Drift(110, 40, 3);
    this.bub = Array.from({ length: 18 }, () => ({ on: false })); this.bi = 0; this.pois = new Poisson(100);
    this.low = new Brown(); this.lowLp = new LP(280);
  }
  render(n, L, R, WL, WR) {
    const fc = clamp(this.fc.next(), 900, 3200), a = clamp(this.amp.next(), 0.5, 1.5);
    this.f[0].set(fc); this.f[1].set(fc * 1.07); this.pois.rate = clamp(this.rate.next(), 40, 200);
    for (let i = 0; i < n; i++) {
      if (this.pois.tick()) {
        const b = this.bub[this.bi]; this.bi = (this.bi + 1) % this.bub.length;
        const f0 = rand(380, 1500), life = rand(0.012, 0.045) * SR;
        b.on = true; b.ph = 0; b.w = TAU * f0 / SR; b.dw = Math.pow(rand(1.2, 1.7), 1 / life); b.a = rand(0.04, 0.12); b.d = Math.exp(-1 / (life * 0.45)); b.n = life;
        [b.gl, b.gr] = panG(rnd() * 0.6);
      }
      let l = 0, r = 0;
      for (const b of this.bub) if (b.on) { b.ph += b.w; b.w *= b.dw; const y = Math.sin(b.ph) * b.a; b.a *= b.d; l += y * b.gl; r += y * b.gr; if (--b.n <= 0) b.on = false; }
      this.f[0].run(this.pk[0].run()); this.f[1].run(this.pk[1].run());
      const lo = this.lowLp.run(this.low.run()) * 0.12;
      L[i] += this.f[0].bp * 1.1 * a + l + lo; R[i] += this.f[1].bp * 1.1 * a + r + lo;
      WL[i] += l * 0.2; WR[i] += r * 0.2;
    }
  }
}

class Fire {
  constructor(p) {
    this.p = p; this.b = new Brown(); this.bLp = new LP(320); this.flick = new Drift(1, 0.3, 0.8);
    this.pk = new Pink(); this.mid = new SVF(700, 0.5); this.rate = new Drift(9, 4, 4); this.crk = new Poisson(9); this.pop = new Poisson(0.22);
    this.bursts = []; this.queue = []; this.hp = [new HP(1400), new HP(1400)]; this.res = new Pool(6);
    this.hiss = 0; this.hissT = rand(10, 30) * SR; this.hissF = new SVF(5500, 0.8);
  }
  render(n, L, R, WL, WR) {
    const fl = clamp(this.flick.next(), 0.5, 1.6); this.crk.rate = clamp(this.rate.next(), 2, 18);
    if ((this.hissT -= n) <= 0) { this.hissT = rand(15, 45) * SR; this.hiss = rand(2, 4) * SR; this.hissLen = this.hiss; }
    for (let i = 0; i < n; i++) {
      if (this.crk.tick()) {                    // a crackle is a little cluster of clicks
        const p = rnd() * 0.8, c = 1 + ((Math.random() * 6) | 0); let off = 0;
        for (let k = 0; k < c; k++) { off += rand(0.001, 0.014) * SR; this.queue.push({ at: off | 0, a: rand(0.15, 0.6), p }); }
      }
      if (this.pop.tick()) { const p = rnd() * 0.7; this.res.strike(rand(350, 900), 0.008, 0.3, p); this.bursts.push({ n: 120, a: 0.5, d: 0.95, g: panG(p) }); this.p.emit({ ev: "pop", x: p }); }
      for (let k = this.queue.length - 1; k >= 0; k--) { const q = this.queue[k]; if (--q.at <= 0) { this.bursts.push({ n: (rand(8, 50)) | 0, a: q.a, d: rand(0.8, 0.93), g: panG(q.p) }); this.queue.splice(k, 1); } }
      let cl = 0, cr = 0;
      for (let k = this.bursts.length - 1; k >= 0; k--) { const b = this.bursts[k], x = rnd() * b.a; cl += x * b.g[0]; cr += x * b.g[1]; b.a *= b.d; if (--b.n <= 0) this.bursts.splice(k, 1); }
      this.res.run(tmp);
      const base = this.bLp.run(this.b.run()) * 0.55 * fl, m = this.mid.run(this.pk.run()) * 0.12 * fl;
      let h = 0; if (this.hiss > 0) { const x = 1 - this.hiss / this.hissLen; h = this.hissF.run(rnd()) * Math.sin(Math.PI * x) * 0.05; this.hiss--; }
      const l = this.hp[0].run(cl) + tmp[0], r = this.hp[1].run(cr) + tmp[1];
      L[i] += base + m + l + h; R[i] += base * 0.95 + m + r + h;
      WL[i] += l * 0.15; WR[i] += r * 0.15;
    }
  }
}

class Crickets {
  constructor() {
    this.c = Array.from({ length: 6 }, () => ({
      f: rand(3900, 5200), per: 1 / rand(1.4, 3.2), pulses: 2 + ((Math.random() * 3) | 0), pl: rand(0.012, 0.022), pg: rand(0.012, 0.028),
      t: Math.random(), ph: 0, a: rand(0.015, 0.05), pan: rnd() * 0.9, on: true, sw: rand(10, 40),
    }));
    this.c.forEach(c => { [c.gl, c.gr] = panG(c.pan); c.dph = TAU * c.f / SR; c.slot = c.pl + c.pg; });
    this.air = new Brown(); this.airLp = new LP(200);
    this.ch = new SVF(4600, 2); this.chAm = 0;
  }
  render(n, L, R, WL, WR) {
    for (const c of this.c) { c.sw -= n / SR; if (c.sw <= 0) { c.on = !c.on; c.sw = c.on ? rand(15, 50) : rand(2, 9); } }
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      for (const c of this.c) {
        c.t += 1 / SR; if (c.t >= c.per) c.t -= c.per;
        if (!c.on || c.t >= c.pulses * c.slot) continue;
        const k = (c.t / c.slot) | 0, x = c.t - k * c.slot;
        if (x < c.pl) {
          c.ph += c.dph;
          const e = Math.sin(Math.PI * x / c.pl), y = Math.sin(c.ph) * e * e * c.a;
          l += y * c.gl; r += y * c.gr;
        }
      }
      this.chAm += 1 / SR;
      const chorus = this.ch.run(rnd()) * (0.5 + 0.5 * Math.sin(TAU * 31 * this.chAm)) * 0.01;
      const a = this.airLp.run(this.air.run()) * 0.07;
      L[i] += l + chorus + a; R[i] += r + chorus + a; WL[i] += l * 0.3; WR[i] += r * 0.3;
    }
  }
}

class Frogs {
  constructor() {
    this.f = Array.from({ length: 6 }, (_, i) => ({
      type: i < 4 ? "croak" : "peep", pool: new Pool(4), pan: rnd() * 0.9, dist: rand(0.2, 0.9),
      f1: rand(280, 620), rate: rand(18, 34), wait: rand(0.5, 8) * SR, bout: null,
    }));
  }
  render(n, L, R, WL, WR) {
    for (const fr of this.f) {
      if (!fr.bout) {
        fr.wait -= n;
        if (fr.wait <= 0) {
          const k = fr.type === "croak" ? 2 + ((Math.random() * 6) | 0) : 3 + ((Math.random() * 6) | 0);
          fr.bout = { k, t: 0, len: (fr.type === "croak" ? rand(0.15, 0.38) : 0.06) * SR, gap: (fr.type === "croak" ? rand(0.18, 0.45) : rand(0.12, 0.3)) * SR, nextPulse: 0 };
          fr.wait = rand(3, 13) * SR;
        }
      }
      const amp = (1.1 - fr.dist) * (fr.type === "croak" ? 0.28 : 0.06), g = panG(fr.pan);
      for (let i = 0; i < n; i++) {
        const b = fr.bout;
        if (b) {
          if (b.t < b.len) {
            if (fr.type === "croak") {
              if (--b.nextPulse <= 0) { b.nextPulse = SR / fr.rate; const e = Math.sin(Math.PI * b.t / b.len); fr.pool.strike(fr.f1, 0.004, amp * e, fr.pan); fr.pool.strike(fr.f1 * 2.3, 0.0025, amp * e * 0.6, fr.pan); }
            } else if (b.t === 0) fr.pool.strike(rand(1700, 2600), 0.02, amp, fr.pan);
          }
          if (++b.t >= b.len + b.gap) { b.t = 0; if (--b.k <= 0) fr.bout = null; }
        }
        fr.pool.run(tmp);
        L[i] += tmp[0]; R[i] += tmp[1]; WL[i] += (tmp[0] + tmp[1]) * fr.dist * 0.35; WR[i] += (tmp[0] + tmp[1]) * fr.dist * 0.35;
      }
    }
  }
}

class Fan {
  constructor() { this.b = [new Brown(), new Brown()]; this.lp = [new LP(650), new LP(620)]; this.pk = new Pink(); this.blade = new Drift(12.5, 0.35, 6); this.ph = 0; this.hum = 0; }
  render(n, L, R) {
    const bf = this.blade.next();
    for (let i = 0; i < n; i++) {
      this.ph += TAU * bf / SR; this.hum += TAU * 50 / SR;
      const m = 1 + 0.07 * Math.sin(this.ph) + 0.02 * Math.sin(this.ph * 2.01), p = this.pk.run() * 0.12;
      const h = Math.sin(this.hum) * 0.004 + Math.sin(this.hum * 2) * 0.003;
      L[i] += (this.lp[0].run(this.b[0].run()) * 0.5 + p) * m + h; R[i] += (this.lp[1].run(this.b[1].run()) * 0.5 + p) * m + h;
    }
  }
}
class Noise {
  constructor(kind) { this.kind = kind; this.g = kind === "pink" ? [new Pink(), new Pink()] : kind === "brown" ? [new Brown(), new Brown()] : null; }
  render(n, L, R) {
    for (let i = 0; i < n; i++) {
      if (this.kind === "white") { L[i] += rnd() * 0.17; R[i] += rnd() * 0.17; }
      else { const s = this.kind === "pink" ? 0.55 : 0.48; L[i] += this.g[0].run() * s; R[i] += this.g[1].run() * s; }
    }
  }
}

/* ---- extra nature voices ---- */
class Gulls {            // seagulls: a few "kee-ow" calls, near and far, now and then
  constructor(p) { this.p = p; this.calls = []; this.wait = rand(1, 5) * SR; this.lp = [new LP(7000), new LP(7000)]; }
  render(n, L, R, WL, WR) {
    this.wait -= n;
    if (this.wait <= 0) {
      const dist = rand(0.2, 0.9), pan = rnd() * 0.8, k = 1 + ((Math.random() * 4) | 0), f0 = rand(1700, 2400);
      for (let i = 0; i < k; i++) this.calls.push({ t: -((i * rand(0.28, 0.45)) * SR | 0), len: rand(0.22, 0.38) * SR, f0: f0 * rand(0.95, 1.05), f1: f0 * rand(0.55, 0.7), ph: 0, a: (1.1 - dist) * 0.06, g: panG(pan), dist });
      if (Math.random() < 0.4) this.p.emit({ ev: "bird", x: pan });
      this.wait = rand(4, 16) * SR;
    }
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0, w = 0;
      for (const c of this.calls) {
        if (c.t++ < 0) continue;
        const x = c.t / c.len; if (x >= 1) continue;
        const f = c.f0 + (c.f1 - c.f0) * x * x; c.ph += f / SR;
        const env = Math.sin(Math.PI * Math.min(1, x * 1.3)) ** 1.5;
        const y = (fsin(c.ph) + 0.5 * fsin(c.ph * 2) + 0.3 * fsin(c.ph * 3) + 0.15 * fsin(c.ph * 4) + rnd() * 0.15) * env * c.a;
        l += y * c.g[0]; r += y * c.g[1]; w += y * c.dist;
      }
      L[i] += this.lp[0].run(l); R[i] += this.lp[1].run(r); WL[i] += w * 0.6; WR[i] += w * 0.6;
    }
    this.calls = this.calls.filter(c => c.t < c.len);
  }
}
class Leaves {           // a canopy rustling as gusts pass through it
  constructor() { this.pk = [new Pink(), new Pink()]; this.f = [new SVF(3200, 0.8), new SVF(3500, 0.8)]; this.g = new Drift(0.4, 0.3, 2.5); this.b = new Bursts(20); this.bp = new Poisson(6); this.bf = [new SVF(4200, 1.2), new SVF(4500, 1.2)]; }
  render(n, L, R) {
    const g = clamp(this.g.next(), 0.05, 1.1); this.bp.rate = 3 + 22 * g; this.f[0].set(2400 + 1800 * g); this.f[1].set(2600 + 1700 * g);
    for (let i = 0; i < n; i++) {
      if (this.bp.tick()) this.b.add(rand(800, 4000), rand(0.05, 0.16) * g, rnd(), 0.9995);
      this.b.run(tmp);
      L[i] += this.f[0].run(this.pk[0].run()) * 0.5 * g + this.bf[0].run(tmp[0]) * 0.6;
      R[i] += this.f[1].run(this.pk[1].run()) * 0.5 * g + this.bf[1].run(tmp[1]) * 0.6;
    }
  }
}
class Cicadas {          // the summer-afternoon drone: buzzing swells that rise and fall
  constructor() {
    this.c = Array.from({ length: 4 }, () => this.make(true)); this.f = Array.from({ length: 4 }, () => new SVF(5000, 4));
  }
  make(any) { return { t: any ? rand(0, 8) * SR : 0, len: rand(5, 14) * SR, f: rand(3800, 6200), am: rand(90, 220), ph: 0, a: rand(0.04, 0.09), g: panG(rnd() * 0.9), rest: rand(1, 6) * SR }; }
  render(n, L, R, WL, WR) {
    this.c.forEach((c, k) => this.f[k].set(c.f, 5));
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      this.c.forEach((c, k) => {
        c.t++;
        if (c.t > c.len + c.rest) { Object.assign(c, this.make(false)); this.f[k].set(c.f, 5); }
        const x = c.t / c.len; if (x > 1) return;
        const env = Math.sin(Math.PI * x) ** 0.6 * (x < 0.85 ? 1 : (1 - x) / 0.15);
        c.ph += c.am / SR;
        const y = this.f[k].run(rnd()) * (0.55 + 0.45 * fsin(c.ph)) * env * c.a * 3;
        l += y * c.g[0]; r += y * c.g[1];
      });
      L[i] += l; R[i] += r; WL[i] += l * 0.2; WR[i] += r * 0.2;
    }
  }
}
class Owl {              // a spotted owlet / owl: soft "hoo ... hoo-hoo" from the trees
  constructor() { this.wait = rand(3, 12) * SR; this.notes = []; this.lp = new LP(1200); }
  render(n, L, R, WL, WR) {
    this.wait -= n;
    if (this.wait <= 0) {
      const f = rand(330, 430), pan = rnd() * 0.8, dist = rand(0.3, 0.85), pat = Math.random() < 0.5 ? [0.45, 0.25, 0.3] : [0.5, 0.6];
      let at = 0; const g = panG(pan);
      pat.forEach((d, i) => { this.notes.push({ t: -(at * SR | 0), len: d * SR, f: f * (i === 0 ? 1 : 0.97), ph: 0, a: (1.1 - dist) * 0.12, g, dist }); at += d + rand(0.12, 0.3); });
      this.wait = rand(14, 40) * SR;
    }
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0, w = 0;
      for (const o of this.notes) {
        if (o.t++ < 0) continue;
        const x = o.t / o.len; if (x >= 1) continue;
        o.ph += o.f * (1 + 0.012 * Math.sin(o.t / SR * 34)) / SR;
        const env = Math.sin(Math.PI * x) ** 1.4, y = (fsin(o.ph) + 0.12 * fsin(o.ph * 2)) * env * o.a;
        l += y * o.g[0]; r += y * o.g[1]; w += y * o.dist;
      }
      L[i] += l; R[i] += r; WL[i] += w * 0.9; WR[i] += w * 0.9;
    }
    this.notes = this.notes.filter(o => o.t < o.len);
  }
}

/* ===================== MUSIC ===================== */
const Q = { maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], min7: [0, 3, 7, 10], min9: [0, 3, 7, 10, 14], dom9: [0, 4, 7, 10, 14], m11: [0, 3, 7, 10, 17], add9: [0, 4, 7, 14] };
const PROGS = [
  [[2, "min9"], [7, "dom9"], [0, "maj9"], [9, "min9"]],
  [[0, "maj9"], [9, "min9"], [5, "maj9"], [7, "dom9"]],
  [[5, "maj9"], [4, "min7"], [2, "min9"], [0, "maj9"]],
  [[9, "min9"], [5, "maj9"], [0, "add9"], [7, "dom9"]],
  [[0, "maj9"], [5, "maj9"], [2, "m11"], [7, "dom9"]],
];
const PENTA = [0, 2, 4, 7, 9];
class Harmony {
  constructor() { this.key = pick([57, 58, 60, 62, 55]); this.bpm = rand(70, 80); this.prog = pick(PROGS); this.bar = 0; this.t = 0; this.cycles = 0; this.updateLen(); }
  updateLen() { this.beat = 60 / this.bpm * SR; this.barLen = this.beat * 4; }
  advance(n) {
    this.t += n;
    if (this.t >= this.barLen) {
      this.t -= this.barLen; this.bar++;
      if (this.bar % this.prog.length === 0 && ++this.cycles % 6 === 0) this.prog = pick(PROGS.filter(p => p !== this.prog));
    }
  }
  chord(bar = this.bar) { const [r, q] = this.prog[bar % this.prog.length]; return { root: this.key + r, tones: Q[q].map(x => this.key + r + x) }; }
}
const EP_DEC = Math.exp(-1 / (1.6 * SR)), EP_REL = Math.exp(-1 / (0.25 * SR)), EP_IDX = Math.exp(-1 / (0.25 * SR)), EP_ATT = 0.004 * SR;
class EP {               // a soft electric piano voice (2-op FM)
  constructor(f, amp, dur, bright = 1.6) { this.f = f / SR; this.a = amp; this.t = 0; this.dur = dur * SR; this.ph = 0; this.mph = 0; this.idx = bright; this.dec = 1; this.done = false; }
  run(wow) {
    const t = this.t++;
    this.dec *= t > this.dur ? EP_REL : EP_DEC; this.idx *= EP_IDX;
    if (this.dec < 0.004) { this.done = true; return 0; }
    const env = (t < EP_ATT ? t / EP_ATT : 1) * this.dec, f = this.f * wow;
    this.mph += f; this.ph += f; if (this.ph > 1) { this.ph -= 1; this.mph -= Math.floor(this.mph); }
    return fsin(this.ph + (0.25 + this.idx) * fsin(this.mph) / TAU) * env * this.a;
  }
}
class Lofi {
  constructor(p) {
    this.p = p; this.h = p.harmony; this.step = -1; this.stepT = 0; this.voices = []; this.bass = null; this.drums = []; this.dropBars = 0;
    this.lp = [new LP(3800), new LP(3800)]; this.lp2 = [new LP(5200), new LP(5200)];
    this.vin = new Bursts(6); this.vinP = new Poisson(5); this.hiss = new Pink(); this.hissHp = new HP(2500); this.wowPh = Math.random();
    this.hatF = new HP(7000); this.snF = new SVF(1900, 0.8);
  }
  trigger(step) {
    const h = this.h, swing = step % 4 === 2;
    const at = swing ? h.beat * 0.09 : 0;                     // lazy, swung eighths
    const bar = h.bar, ch = h.chord(bar), drums = this.dropBars <= 0;
    const add = (fn, delay = 0) => this.drums.push({ t: -(at + delay) | 0, fn });
    if (step === 0) {
      if (bar % 16 === 15 && Math.random() < 0.3) this.dropBars = 4; else if (this.dropBars > 0) this.dropBars--;
      this.voices.forEach(v => (v.dur = Math.min(v.dur, v.t)));
      ch.tones.forEach((m, k) => this.voices.push(Object.assign(new EP(mtof(m + 12 * (m < this.h.key + 2 ? 1 : 0)), 0.07 * rand(0.8, 1), this.h.barLen / SR * 1.1), { t: -(k * rand(0.012, 0.03) * SR) | 0 })));
      this.bassNote(ch.root - 24, 0);
      if (Math.random() < 0.55) this.melody(ch);
    }
    if (step === 10 && Math.random() < 0.3) ch.tones.slice(1).forEach((m, k) => this.voices.push(Object.assign(new EP(mtof(m + 12), 0.035, 0.5, 1), { t: -(at + k * 0.015 * SR) | 0 })));
    if (step === 8 && Math.random() < 0.6) this.bassNote(ch.root - 24 + (Math.random() < 0.5 ? 7 : 0), at);
    if (step === 14 && Math.random() < 0.3) this.bassNote(h.chord(bar + 1).root - 25, at);
    if (!drums) return;
    if (step === 0 || step === 10 || (step === 7 && Math.random() < 0.35)) add(t => { const f = 45 + 85 * Math.exp(-t / (0.03 * SR)); this.kph = (this.kph || 0) + f / SR; return fsin(this.kph) * Math.exp(-t / (0.2 * SR)) * 0.55; });
    if (step === 4 || step === 12) add(t => { const e = Math.exp(-t / (0.09 * SR)); return this.snF.run(rnd()) * e * 0.5 + fsin(t * 185 / SR) * Math.exp(-t / (0.04 * SR)) * 0.18; });
    if (step % 2 === 0 || Math.random() < 0.12) { const v = rand(0.4, 0.85) * (step % 4 === 0 ? 1 : 0.7); add(t => this.hatF.run(rnd()) * Math.exp(-t / (0.022 * SR)) * v * 0.16); }
  }
  bassNote(m, delay) { this.bass = { f: mtof(m), t: -(delay | 0), ph: 0 }; }
  melody(ch) {
    const notes = 2 + ((Math.random() * 3) | 0), base = this.h.key + 12;
    for (let i = 0; i < notes; i++) {
      const m = base + pick(PENTA) + (Math.random() < 0.3 ? 12 : 0);
      this.voices.push(Object.assign(new EP(mtof(m), 0.05, 0.35, 2.2), { t: -((rand(1, 3.5) * this.h.beat + i * this.h.beat * 0.5) | 0) }));
    }
  }
  render(n, L, R, WL, WR) {
    const h = this.h, stepLen = h.beat / 4;
    for (let i = 0; i < n; i++) {
      const s = Math.floor(h.t / stepLen) % 16;              // the shared clock moves in process(); follow it
      if (s !== this.step) { this.step = s; this.trigger(s); }
      this.wowPh += 0.45 / SR; const wow = 1 + 0.0028 * fsin(this.wowPh);
      let m = 0;
      for (const v of this.voices) if (v.t < 0) v.t++; else m += v.run(wow);
      let b = 0;
      if (this.bass) { const bs = this.bass; if (bs.t++ >= 0) { bs.ph += bs.f / SR; const e = Math.min(1, bs.t / (0.01 * SR)) * Math.exp(-bs.t / (0.7 * SR)); b = (fsin(bs.ph) + 0.25 * fsin(bs.ph * 2)) * e * 0.3; } }
      let d = 0;
      for (const dr of this.drums) { if (dr.t < 0) dr.t++; else d += dr.fn(dr.t++); }
      if (this.vinP.tick()) this.vin.add(rand(2, 8), rand(0.05, 0.2), rnd(), 0.6);
      this.vin.run(tmp); const hs = this.hissHp.run(this.hiss.run()) * 0.012;
      const l = this.lp2[0].run(this.lp[0].run(m * 1.0 + d)) + b, r = this.lp2[1].run(this.lp[1].run(m * 0.96 + d)) + b;
      L[i] += l + tmp[0] * 0.5 + hs; R[i] += r + tmp[1] * 0.5 + hs;
      WL[i] += m * 0.25; WR[i] += m * 0.25;
    }
    this.voices = this.voices.filter(v => !v.done); this.drums = this.drums.filter(dr => dr.t < 0.6 * SR);
  }
}
class Piano {            // sparse, unhurried notes that drift over the harmony
  constructor(p) { this.h = p.harmony; this.voices = []; this.wait = rand(0.5, 2) * SR; }
  note(m, v, pan) {
    const f0 = mtof(m), parts = [];
    for (let k = 1; k <= 4; k++) parts.push({ f: f0 * k * Math.sqrt(1 + 0.0004 * k * k) / SR, a: v * Math.pow(k, -1.3) * (k === 1 ? 1 : 0.6), d: Math.exp(-1 / (3 / Math.pow(k, 0.8) * SR)), ph: Math.random() });
    if (this.voices.length >= 8) this.voices.shift();
    this.voices.push({ parts, t: 0, g: panG(pan), ham: v * 0.25 });
  }
  render(n, L, R, WL, WR) {
    this.wait -= n;
    if (this.wait <= 0) {
      const ch = this.h.chord(), pool = ch.tones.map(m => m + 12).concat(PENTA.map(x => this.h.key + 12 + x));
      const m = pick(pool), v = rand(0.05, 0.11), pan = rnd() * 0.5;
      this.note(m, v, pan);
      if (Math.random() < 0.3) this.note(pick(pool) + (Math.random() < 0.5 ? 12 : -12), v * 0.7, -pan);
      this.wait = rand(1.1, 3.6) * SR;
    }
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      for (const v of this.voices) {
        let y = 0; for (const p of v.parts) { p.ph += p.f; if (p.ph > 1) p.ph -= 1; y += fsin(p.ph) * p.a; p.a *= p.d; }
        if (v.t < 200) y += rnd() * v.ham * (1 - v.t / 200);
        v.t++; l += y * v.g[0]; r += y * v.g[1];
      }
      L[i] += l; R[i] += r; WL[i] += l * 0.9; WR[i] += r * 0.9;
    }
    this.voices = this.voices.filter(v => v.parts[0].a > 0.0015);
  }
}
class Pad {              // slow, warm chords that breathe; follows the harmony every two bars
  constructor(p) { this.h = p.harmony; this.cur = null; this.old = []; this.breath = new Drift(1, 0.2, 5); this.lp = [new LP(2400), new LP(2300)]; }
  chordVoices(bar) {
    const ch = this.h.chord(bar - (bar % 2));
    return ch.tones.slice(0, 4).map((m, k) => {
      const f = mtof(k === 0 ? m - 12 : m);
      return [-1, 1].map(d => ({ f: f * Math.pow(2, d * 3.5 / 1200) / SR, ph: Math.random(), pan: d * 0.5 }));
    }).flat();
  }
  render(n, L, R, WL, WR) {
    const key = this.h.bar - (this.h.bar % 2);
    if (!this.cur || this.cur.key !== key) { if (this.cur) this.old.push(this.cur); this.cur = { key, v: this.chordVoices(this.h.bar), a: 0 }; }
    const br = clamp(this.breath.next(), 0.6, 1.3), fade = n / (3.5 * SR);
    this.cur.a = Math.min(1, this.cur.a + fade); this.old.forEach(o => (o.a -= fade)); this.old = this.old.filter(o => o.a > 0);
    const all = [this.cur, ...this.old];
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      for (const c of all) for (const v of c.v) {
        v.ph += v.f; if (v.ph > 1) v.ph -= 1;
        const y = ftab(PADT, v.ph) * c.a * 0.036 * br;
        l += y * (0.5 - v.pan * 0.5); r += y * (0.5 + v.pan * 0.5);
      }
      l = this.lp[0].run(l); r = this.lp[1].run(r);
      L[i] += l; R[i] += r; WL[i] += l * 0.8; WR[i] += r * 0.8;
    }
  }
}

const MAKERS = {
  rain: p => new Rain(p), tinroof: p => new TinRoof(p), thunder: p => new Thunder(p), waves: p => new Waves(p),
  wind: p => new Wind(p), birds: p => new Birds(p), stream: p => new Stream(p), fire: p => new Fire(p),
  crickets: p => new Crickets(p), frogs: p => new Frogs(p), fan: p => new Fan(p),
  gulls: p => new Gulls(p), leaves: () => new Leaves(), cicadas: () => new Cicadas(), owl: () => new Owl(),
  lofi: p => new Lofi(p), piano: p => new Piano(p), pad: p => new Pad(p),
  white: () => new Noise("white"), pink: () => new Noise("pink"), brown: () => new Noise("brown"),
};

// output trims so every sound sits at a similar loudness at the same slider position
const TRIM = { gulls: 5, leaves: 5.5, cicadas: 0.6, owl: 3, lofi: 0.7, piano: 1.9, pad: 2.4, birds: 2.8, frogs: 2.4, crickets: 2.2, wind: 1.25, waves: 0.85, tinroof: 2.4, thunder: 3.3, stream: 1.35 };

class NatureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gens = {}; this.gain = {}; this.target = {};
    this.buf = [new Float32Array(128), new Float32Array(128), new Float32Array(128), new Float32Array(128)];
    this.events = []; this.harmony = new Harmony();
    this.port.onmessage = e => {
      const { vol } = e.data;
      if (vol) for (const id in vol) { if (!MAKERS[id]) continue; this.target[id] = vol[id]; if (!this.gens[id] && vol[id] > 0) { this.gens[id] = MAKERS[id](this); this.gain[id] = 0; } }
    };
  }
  emit(e) { this.events.push(e); }
  process(_in, outputs) {
    const [dL, dR] = outputs[0], [wL, wR] = outputs[1], n = dL.length;
    const [L, R, WL, WR] = this.buf, step = n / (SR * 1.2);   // 1.2 s fades
    this.harmony.advance(n);
    for (const id in this.gens) {
      const tgt = this.target[id] || 0, g0 = this.gain[id];
      if (g0 === 0 && tgt === 0) continue;
      L.fill(0, 0, n); R.fill(0, 0, n); WL.fill(0, 0, n); WR.fill(0, 0, n);
      this.gens[id].render(n, L, R, WL, WR);
      const g1 = g0 < tgt ? Math.min(tgt, g0 + step) : Math.max(tgt, g0 - step);
      this.gain[id] = g1;
      const trim = TRIM[id] || 1;
      for (let i = 0; i < n; i++) {
        const g = (g0 + (g1 - g0) * (i / n)) * trim;
        dL[i] += L[i] * g; dR[i] += R[i] * g; wL[i] += WL[i] * g; wR[i] += WR[i] * g;
      }
    }
    if (this.events.length) { this.port.postMessage({ events: this.events }); this.events = []; }
    return true;
  }
}
registerProcessor("nature", NatureProcessor);
