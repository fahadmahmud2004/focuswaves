/* =========================================================
   Audio engine: one AudioWorklet synthesises every nature sound live.
   worklet ─dry─┐
           ─wet─┴─ convolver (generated room) ─┐
                                               ├─ master ─ limiter ─ duck (Quran) ─ out
   ========================================================= */
const Audio_ = (() => {
  let ctx, node, master, duck, ready = null;
  const listeners = [];

  function impulse(c, secs = 2.8) {         // a soft outdoor space, generated (no file)
    const n = Math.floor(c.sampleRate * secs), ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * t);
        d[i] = lp * Math.pow(1 - t, 3.2) * (i < 600 ? i / 600 : 1);
      }
    }
    return ir;
  }

  async function init() {
    if (ready) return ready;
    ready = (async () => {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
      await ctx.audioWorklet.addModule("nature-worklet.js");
      node = new AudioWorkletNode(ctx, "nature", { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });
      master = ctx.createGain(); duck = ctx.createGain();
      const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -9; lim.knee.value = 8; lim.ratio.value = 8; lim.attack.value = 0.004; lim.release.value = 0.25;
      node.connect(master, 0); node.connect(verb, 1); verb.connect(wet).connect(master);
      master.connect(lim).connect(duck).connect(ctx.destination);
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
    setVolumes(vol) { node && node.port.postMessage({ vol }); },   // { id: 0..1 }, already curved
    setMaster(v) { master && master.gain.setTargetAtTime(v, ctx.currentTime, 0.08); },
    fadeMaster(v, secs) { master && master.gain.setTargetAtTime(v, ctx.currentTime, secs / 3); },
    setDuck(v) { duck && duck.gain.setTargetAtTime(v, ctx.currentTime, 0.5); },
    onEvent(f) { listeners.push(f); },
    chime() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [[523.25, 0], [783.99, 0.16], [659.25, 0.34]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o2.frequency.value = f * 2.01;
        g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 2.6);
        const g2 = ctx.createGain(); g2.gain.value = 0.25;
        o.connect(g); o2.connect(g2).connect(g); g.connect(ctx.destination);
        o.start(t + d); o2.start(t + d); o.stop(t + d + 2.7); o2.stop(t + d + 2.7);
      });
    },
  };
})();
