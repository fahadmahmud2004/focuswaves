// Renders seamless stereo loops off the main thread so the page never freezes.
importScripts("gen.js");
onmessage = e => {
  const { id, seconds, sr } = e.data;
  const n = Math.floor(seconds * sr), fade = Math.floor(sr), chans = [];
  for (let c = 0; c < 2; c++) {
    const tmp = new Float32Array(n + fade);
    GENERATORS[id](tmp, sr, c);
    const out = tmp.slice(0, n);
    for (let i = 0; i < fade; i++) {            // equal-power crossfade tail → head
      const t = i / fade;
      out[i] = tmp[i] * Math.sin(t * Math.PI / 2) + tmp[n + i] * Math.cos(t * Math.PI / 2);
    }
    chans.push(out);
  }
  postMessage({ id, chans }, chans.map(c => c.buffer));
};
