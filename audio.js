/* =========================================================
   Audio engine. One AudioWorklet synthesises every sound live.
   worklet ─dry─ space LP ─┐
           ─wet─ reverb ───┴─ master ─ duck (while Quran plays) ─┐
   Quran <audio> ─ volume ─ soft LP ─┬───────────────────────────┼─ limiter ─ out
                                     └─ reverb send (soft mode) ─┘
   ========================================================= */
const Audio_ = (() => {
  let ctx, node, master, duck, out, dryLP, wet, verb, ready = null;
  const listeners = [];
  const q = { src: null, el: null, gain: null, lp: null, send: null, vol: 0.25, soft: true };

  function impulse(c, secs = 3.2) {          // a soft, open space, generated (no file)
    const n = Math.floor(c.sampleRate * secs), ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.42 * t); d[i] = lp * Math.pow(1 - t, 3) * (i < 900 ? i / 900 : 1); }
    }
    return ir;
  }

  async function init() {
    if (ready) return ready;
    ready = (async () => {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
      await ctx.audioWorklet.addModule("nature-worklet.js");
      node = new AudioWorkletNode(ctx, "nature", { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });
      master = ctx.createGain(); duck = ctx.createGain(); out = ctx.createGain();
      dryLP = ctx.createBiquadFilter(); dryLP.type = "lowpass"; dryLP.frequency.value = 18000; dryLP.Q.value = 0.5;
      verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
      wet = ctx.createGain(); wet.gain.value = 0.5;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.25;
      node.connect(dryLP, 0); dryLP.connect(master);
      node.connect(verb, 1); verb.connect(wet).connect(master);
      master.connect(duck).connect(out); out.connect(lim).connect(ctx.destination);
      node.port.onmessage = e => e.data.events && e.data.events.forEach(ev => listeners.forEach(f => f(ev)));
      return ctx;
    })();
    return ready;
  }

  return {
    init,
    get ctx() { return ctx; },
    resume() { return ctx && ctx.state !== "running" ? ctx.resume() : Promise.resolve(); },
    suspend() { return ctx && ctx.state === "running" ? ctx.suspend() : Promise.resolve(); },
    setVolumes(vol) { node && node.port.postMessage({ vol }); },
    setPulse(hz, depth) { node && node.port.postMessage({ pulse: { hz, depth } }); },
    setMaster(v) { master && master.gain.setTargetAtTime(v, ctx.currentTime, 0.08); },
    setDuck(v) { duck && duck.gain.setTargetAtTime(v, ctx.currentTime, 0.6); },
    // 0 = right next to you, 1 = room, 2 = far away
    setSpace(s) {
      if (!ctx) return;
      const T = ctx.currentTime, f = [18000, 7500, 2600][s], w = [0.3, 0.6, 1.1][s];
      dryLP.frequency.setTargetAtTime(f, T, 0.4); wet.gain.setTargetAtTime(w, T, 0.4);
    },
    onEvent(f) { listeners.push(f); },

    /* Quran: routed through Web Audio when the host allows it (CORS), so it gets a real
       volume and the soft mode. Returns false when the element must play on its own. */
    attachQuran(el) {
      if (!ctx || q.src) return !!q.src;
      try {
        q.el = el; q.src = ctx.createMediaElementSource(el);
        q.gain = ctx.createGain(); q.lp = ctx.createBiquadFilter(); q.lp.type = "lowpass"; q.lp.Q.value = 0.4;
        q.send = ctx.createGain();
        q.src.connect(q.gain).connect(q.lp).connect(out); q.lp.connect(q.send).connect(verb);
        this.quranVolume(q.vol); this.quranSoft(q.soft);
        return true;
      } catch { q.src = null; return false; }
    },
    quranVolume(v) { q.vol = v; if (q.gain) q.gain.gain.setTargetAtTime(v * 1.0, ctx.currentTime, 0.1); else if (q.el) q.el.volume = v; },
    quranSoft(on) {
      q.soft = on;
      if (!q.lp) return;
      const T = ctx.currentTime;
      q.lp.frequency.setTargetAtTime(on ? 3200 : 20000, T, 0.5);
      q.send.gain.setTargetAtTime(on ? 0.45 : 0.08, T, 0.5);
    },
    chime() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [[523.25, 0], [783.99, 0.16], [659.25, 0.34]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
        o.frequency.value = f; o2.frequency.value = f * 2.01; g2.gain.value = 0.25;
        g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 2.6);
        o.connect(g); o2.connect(g2).connect(g); g.connect(ctx.destination);
        o.start(t + d); o2.start(t + d); o.stop(t + d + 2.7); o2.stop(t + d + 2.7);
      });
    },
  };
})();
