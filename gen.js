/* Sound generators — run inside audio-worker.js (off the main thread). */
/* ---------- procedural generators ----------
   Each fill(out, sr, ch) writes `out.length` samples for channel `ch`. */
const rnd = () => Math.random() * 2 - 1;

function pinkGen() {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = rnd();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;    b5 = -0.7616 * b5 - w * 0.016898;
    const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    return o * 0.11;
  };
}
function brownGen() {
  let last = 0;
  return () => { last = (last + 0.02 * rnd()) / 1.02; return last * 3.5; };
}
// one-pole lowpass / highpass helpers
function lp(fc, sr) { const a = Math.exp(-2 * Math.PI * fc / sr); let y = 0; return x => (y = (1 - a) * x + a * y); }
function hp(fc, sr) { const l = lp(fc, sr); return x => x - l(x); }
// resonant state-variable bandpass with variable cutoff
function svf() {
  let low = 0, band = 0;
  return (x, fc, sr, q) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 6) / sr);
    low += f * band; const high = x - low - q * band; band += f * high;
    return band;
  };
}

const GENERATORS = {
  rain(out, sr) {
    const p = pinkGen(), h = hp(600, sr), l = lp(9000, sr), body = brownGen();
    const drops = [];
    for (let i = 0; i < out.length; i++) {
      if (Math.random() < 90 / sr) {               // new drop = damped resonator
        const f = 1800 + Math.random() * 4500, r = Math.exp(-1 / ((0.004 + Math.random() * 0.01) * sr));
        drops.push({ c1: 2 * r * Math.cos(2 * Math.PI * f / sr), c2: r * r, y1: (0.02 + Math.random() * 0.07) * Math.sin(2 * Math.PI * f / sr), y2: 0, n: 0 });
      }
      let d = 0;
      for (let k = drops.length - 1; k >= 0; k--) {
        const dr = drops[k], y = dr.c1 * dr.y1 - dr.c2 * dr.y2;
        dr.y2 = dr.y1; dr.y1 = y; d += y;
        if (++dr.n > sr * 0.08) drops.splice(k, 1);
      }
      out[i] = l(h(p())) * 0.9 + body() * 0.12 + d;
    }
  },
  storm(out, sr) {
    GENERATORS.rain(out, sr);
    const b = brownGen(), l = lp(120, sr);
    let env = 0, peak = 0;
    for (let i = 0; i < out.length; i++) {
      if (peak === 0 && Math.random() < 0.07 / sr) peak = 0.5 + Math.random() * 0.9; // thunder roll
      if (peak > 0) { env += (peak - env) * 0.0004; if (env > peak * 0.95) peak = 0; }
      else env *= 0.999995;
      out[i] = out[i] * 1.15 + l(b()) * (0.35 + env * 2.2);
    }
  },
  wind(out, sr, ch) {
    const f = svf(), ph = ch * 1.7;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      const fc = 380 + 220 * Math.sin(2 * Math.PI * t / 9 + ph) + 120 * Math.sin(2 * Math.PI * t / 3.7 + ph * 2);
      const g = 0.55 + 0.3 * Math.sin(2 * Math.PI * t / 13 + ph) + 0.15 * Math.sin(2 * Math.PI * t / 5.3);
      out[i] = f(rnd(), fc, sr, 0.35) * g * 0.9;
    }
  },
  waves(out, sr, ch) {
    const b = brownGen(), p = pinkGen(), l = lp(900, sr), h = hp(1500, sr), period = 9;
    const off = ch * 0.35;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr + off;
      const x = (t % period) / period;               // 0..1 within a wave
      const env = x < 0.55 ? Math.pow(x / 0.55, 2.2) : Math.exp(-(x - 0.55) * 6); // swell then wash out
      out[i] = l(b()) * (0.25 + env * 0.9) + h(p()) * env * env * 0.55;
    }
  },
  fire(out, sr) {
    const b = brownGen(), l = lp(500, sr);
    let crack = 0, cAmp = 0;
    for (let i = 0; i < out.length; i++) {
      if (Math.random() < 9 / sr) { crack = 1; cAmp = 0.2 + Math.random() * 0.8; }
      if (Math.random() < 1.2 / sr) { crack = 1; cAmp = 1.3; } // occasional pop
      const c = crack > 0.001 ? rnd() * crack * cAmp : 0;
      crack *= 0.993;
      out[i] = l(b()) * 0.55 + c * 0.5;
    }
  },
  stream(out, sr) {
    const p = pinkGen(), f = svf(), bubbles = [];
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      if (Math.random() < 30 / sr) bubbles.push({ f: 500 + Math.random() * 900, a: 0.03 + Math.random() * 0.06, t: 0, d: 0.015 + Math.random() * 0.03 });
      let s = 0;
      for (let k = bubbles.length - 1; k >= 0; k--) {
        const bb = bubbles[k], tt = bb.t / sr;
        s += bb.a * Math.sin(2 * Math.PI * bb.f * (1 + tt * 18) * tt) * Math.exp(-tt / bb.d);
        if (++bb.t > sr * bb.d * 5) bubbles.splice(k, 1);
      }
      const fc = 1400 + 500 * Math.sin(t * 2.3) + 300 * Math.sin(t * 7.1);
      out[i] = f(p(), fc, sr, 0.8) * 1.2 + s;
    }
  },
  night(out, sr, ch) {
    const b = brownGen(), l = lp(300, sr);
    const carrier = 4300 + ch * 260, chirpEvery = 0.9 + ch * 0.13;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, ct = (t + ch * 0.31) % chirpEvery;
      let gate = 0;
      for (let k = 0; k < 3; k++) { const s = k * 0.045; if (ct >= s && ct < s + 0.028) gate = Math.sin(Math.PI * (ct - s) / 0.028); }
      const far = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / 17 + ch);
      out[i] = Math.sin(2 * Math.PI * carrier * t) * gate * 0.16 * (0.5 + far * 0.5) + l(b()) * 0.2;
    }
  },
  fan(out, sr) {
    const b = brownGen(), p = pinkGen(), l = lp(700, sr);
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      const blade = 1 + 0.08 * Math.sin(2 * Math.PI * 14 * t);
      out[i] = (l(b()) * 0.52 + p() * 0.14) * blade + Math.sin(2 * Math.PI * 100 * t) * 0.006;
    }
  },
  white(out) { for (let i = 0; i < out.length; i++) out[i] = rnd() * 0.17; },
  pink(out)  { const p = pinkGen();  for (let i = 0; i < out.length; i++) out[i] = p() * 0.58; },
  brown(out) { const b = brownGen(); for (let i = 0; i < out.length; i++) out[i] = b() * 0.5; },
};

