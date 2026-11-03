(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fw:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fw:" + k, JSON.stringify(v)); } catch {} },
  };
  const setP = el => el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
  const soundById = id => SOUNDS.find(s => s.id === id);

  /* ============================ STATE + ENGINE ============================ */
  const state = Object.fromEntries(SOUNDS.map(s => [s.id, { on: false, vol: 0.5 }]));
  let playing = false, started = false, activeMix = null;      // activeMix: preset id, or "u:<name>"
  const anyOn = () => SOUNDS.some(s => state[s.id].on);
  const currentMix = () => Object.fromEntries(SOUNDS.filter(s => state[s.id].on).map(s => [s.id, +state[s.id].vol.toFixed(2)]));

  const MUSIC = new Set(SOUNDS.filter(s => s.group === "music").map(s => s.id));
  const QMUTE = new Set([...MUSIC, "binaural"]);       // silent while the Quran plays
  const pulse = Object.assign({ hz: 0, depth: 0.45 }, store.get("pulse", {}));
  const quranOn = () => qWant || quranActive();          // music never plays alongside the Quran
  function sync() {
    const vol = {}, lv = {}, q = quranOn();
    for (const s of SOUNDS) {
      const st = state[s.id], v = st.on && !(q && QMUTE.has(s.id)) ? st.vol : 0;
      vol[s.id] = playing ? v * v : 0; lv[s.id] = playing || !started ? v : 0;
    }
    document.body.classList.toggle("q-muted", q);
    Audio_.setVolumes(vol); Scene.set(lv); Audio_.setPulse(q || !playing ? 0 : pulse.hz, pulse.depth);
    store.set("pulse", pulse); paintPulse();
    store.set("mix", currentMix()); store.set("activeMix", activeMix);
    paintDockMix(); if (!$("#p-mixes").hidden) markActiveMix();
  }

  // iOS: Web Audio goes quiet with the silent switch on and pauses on lock; a silent <audio> keeps us a media page
  const keepAlive = (() => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" }))); a.loop = true; a.setAttribute("playsinline", ""); a.volume = 0.01; return a;
  })();

  /* Sound that should be playing but isn't: the browser suspended the audio (autoplay rules, the laptop slept,
     headphones were switched, another tab took the device). Any tap or key brings it back; if that doesn't
     happen on its own, say so instead of sitting silent. */
  const wantSound = () => playing || quranActive();
  const revive = () => { if (started && wantSound() && Audio_.state !== "running") Audio_.resume(); };
  ["pointerdown", "keydown", "touchend"].forEach(ev => addEventListener(ev, revive, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) revive(); });
  let checkT;
  const checkSound = () => { clearTimeout(checkT); checkT = setTimeout(() => { if (started && playing && Audio_.state !== "running" && Audio_.state !== "none") { Audio_.resume(); toast(t("tapForSound")); } }, 1800); };

  let suspendT;
  function setPlaying(on) {
    if (on && !anyOn()) applyMix(MIXES[0].mix, MIXES[0].id, false);
    playing = on; clearTimeout(suspendT);
    if (on) { Audio_.resume(); Audio_.setMaster(+mv.value); keepAlive.play().catch(() => {}); checkSound(); }
    else suspendT = setTimeout(() => { if (!playing && !quranActive()) { Audio_.suspend(); keepAlive.pause(); } }, 1600);
    document.body.classList.toggle("is-playing", on);
    $("#playBtn").setAttribute("aria-label", t(on ? "pauseSounds" : "play"));
    sync(); mediaMeta();
  }

  /* ============================ PANELS ============================ */
  let openName = null;
  function openPanel(name) {
    if (openName === name) name = null;
    openName = name;
    $$(".panel").forEach(p => (p.hidden = p.id !== "p-" + name));
    $$("[data-panel]").forEach(b => b.setAttribute("aria-expanded", b.dataset.panel === name));
    if (name === "mixes") renderMixes();
    if (name) unZen(); else armZen();
  }
  $$("[data-panel]").forEach(b => b.addEventListener("click", () => openPanel(b.dataset.panel)));
  document.addEventListener("pointerdown", e => { if (openName && !e.target.closest(".panel, .dock, .toast")) openPanel(null); });
  /* ---- the clock block can be resized and dragged anywhere; a plain click opens the Clock panel ---- */
  const focusBox = $("#focus"), L0 = Object.assign({ x: 0, y: 0, s: 1 }, store.get("layout", {}));
  let onLayout = () => {};                            // set once the clock face exists (Depth repositions the painted clock)
  let clockOp = store.get("clockOpacity", 1);                 // 0..1, how visible the clock / timer is
  const applyLayout = () => { focusBox.style.setProperty("--fx", L0.x + "px"); focusBox.style.setProperty("--fy", L0.y + "px"); focusBox.style.setProperty("--fs", L0.s); focusBox.style.setProperty("--fo", clockOp); onLayout(); };
  const clampLayout = () => { const mx = innerWidth / 2 - 60, my = innerHeight / 2 - 60; L0.x = Math.max(-mx, Math.min(mx, L0.x)); L0.y = Math.max(-my, Math.min(my, L0.y)); };
  /* one finger on the clock drags it; two fingers anywhere in the middle pinch it bigger or smaller;
     a trackpad pinch (ctrl + wheel) does the same on a laptop. A plain tap on the clock opens the Clock panel. */
  { const ck = $("#clock"), pts = new Map(); let drag = null, pinch = null;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const setScale = v => { L0.s = Math.max(0.5, Math.min(1.6, v)); const si = $("#clockSize"); if (si) { si.value = L0.s; setP(si); } applyLayout(); };
    focusBox.addEventListener("pointerdown", e => {
      if (e.target.closest("input, button, select")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { drag = null; pinch = { d: dist(), s: L0.s }; focusBox.classList.add("dragging"); }
      else if (pts.size === 1 && (e.target === ck || e.target.closest("#analog"))) { drag = { x: e.clientX, y: e.clientY, ox: L0.x, oy: L0.y, moved: false }; e.target.setPointerCapture(e.pointerId); }
    });
    addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) { setScale(pinch.s * dist() / pinch.d); return; }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; focusBox.classList.add("dragging"); L0.x = drag.ox + dx; L0.y = drag.oy + dy; clampLayout(); applyLayout();
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) { pinch = null; focusBox.classList.remove("dragging"); store.set("layout", L0); } return; }
      if (drag) { const moved = drag.moved; drag = null; focusBox.classList.remove("dragging"); if (moved) store.set("layout", L0); else if (e.type === "pointerup") openPanel("clock"); }
    };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
    focusBox.addEventListener("wheel", e => { if (!e.ctrlKey) return; e.preventDefault(); setScale(L0.s * Math.exp(-e.deltaY * 0.01)); clearTimeout(focusBox._w); focusBox._w = setTimeout(() => store.set("layout", L0), 300); }, { passive: false });
  }
  const sizeIn = $("#clockSize"); sizeIn.value = L0.s; setP(sizeIn);
  sizeIn.max = 1.6; sizeIn.addEventListener("input", () => { L0.s = +sizeIn.value; setP(sizeIn); applyLayout(); store.set("layout", L0); });
  const opIn = $("#clockOpacity"), paintOp = () => { opIn.value = clockOp; setP(opIn); const v = Math.round(clockOp * 100) + "%"; $("#opOut").textContent = LANG === "bn" ? v.replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]) : v; };
  opIn.addEventListener("input", () => { clockOp = +opIn.value; store.set("clockOpacity", clockOp); paintOp(); applyLayout(); });
  paintOp();
  $("#layoutReset").addEventListener("click", () => { Object.assign(L0, { x: 0, y: 0, s: 1 }); sizeIn.value = 1; setP(sizeIn); applyLayout(); store.set("layout", L0); });
  addEventListener("resize", () => { clampLayout(); applyLayout(); });
  applyLayout();

  /* ============================ SOUNDS PANEL ============================ */
  const groupsEl = $("#soundGroups"), tileOf = id => groupsEl.querySelector(`[data-id="${id}"]`);
  function buildSounds() {
    groupsEl.innerHTML = "";
    for (const g of GROUPS) {
      const sec = document.createElement("div"); sec.className = "group g-" + g.id;
      sec.innerHTML = `<h3></h3><div class="tiles"></div>`; sec.querySelector("h3").textContent = nameOf(g);
      if (g.id === "music") {
        const open = store.get("musicOpen", false) || SOUNDS.some(s => s.group === "music" && state[s.id].on);
        const btn = document.createElement("button"); btn.className = "music-toggle"; btn.setAttribute("aria-expanded", open);
        btn.innerHTML = `<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`; btn.querySelector("span").textContent = t("musicOpt");
        const note = document.createElement("p"); note.className = "music-note"; note.textContent = t("musicNote");
        const tiles = sec.querySelector(".tiles"); tiles.hidden = note.hidden = !open;
        btn.onclick = () => { const o = btn.getAttribute("aria-expanded") !== "true"; btn.setAttribute("aria-expanded", o); tiles.hidden = note.hidden = !o; store.set("musicOpen", o); };
        sec.insertBefore(note, tiles); sec.insertBefore(btn, note);
      }
      for (const s of SOUNDS.filter(x => x.group === g.id)) {
        const el = document.createElement("div"); el.className = "tile"; el.dataset.id = s.id;
        el.innerHTML = `<button class="tile-btn" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.id]}</svg><span></span></button><input type="range" min="0" max="1" step="0.01">`;
        el.querySelector("span").textContent = nameOf(s);
        el.querySelector(".tile-btn").addEventListener("click", () => toggle(s.id));
        const r = el.querySelector("input"); r.setAttribute("aria-label", nameOf(s));
        r.addEventListener("input", () => setVol(s.id, +r.value));
        sec.querySelector(".tiles").appendChild(el);
      }
      groupsEl.appendChild(sec);
    }
    SOUNDS.forEach(s => paintTile(s.id));
  }
  function paintTile(id) {
    const st = state[id], el = tileOf(id); if (!el) return;
    el.classList.toggle("on", st.on); el.style.setProperty("--lvl", st.vol * 100 + "%");
    el.querySelector(".tile-btn").setAttribute("aria-pressed", st.on);
    const r = el.querySelector("input"); r.value = st.vol; setP(r);
  }
  function toggle(id) {
    const st = state[id]; st.on = !st.on; activeMix = null;
    if (st.on && st.vol < 0.06) st.vol = 0.5;
    if (st.on && MUSIC.has(id) && quranOn()) toast(t("musicPausedQ"));
    paintTile(id);
    if (st.on && !playing && started) setPlaying(true); else if (!anyOn() && playing) setPlaying(false); else sync();
  }
  function setVol(id, v) {
    const st = state[id]; st.vol = v; activeMix = null;
    if (v === 0 && st.on) { st.on = false; }
    paintTile(id); sync();
  }
  function applyMix(mix, id, start = true, pul) {
    if (pul !== undefined) { pulse.hz = pul ? pul.hz : 0; if (pul) pulse.depth = pul.depth; }
    for (const s of SOUNDS) { const v = mix[s.id]; state[s.id].on = v > 0; if (v > 0) state[s.id].vol = v; paintTile(s.id); }
    activeMix = id || null;
    if (start && quranOn() && Object.keys(mix).some(k => MUSIC.has(k))) toast(t("musicPausedQ"));
    if (start && started && !playing) setPlaying(true); else sync();
  }
  $("#clearBtn").addEventListener("click", () => { SOUNDS.forEach(s => { state[s.id].on = false; paintTile(s.id); }); activeMix = null; if (playing) setPlaying(false); else sync(); });

  function paintPulse() {
    $$("#pulseSeg button").forEach(b => b.setAttribute("aria-checked", +b.dataset.hz === pulse.hz));
    const d = $("#pulseDepth"); if (document.activeElement !== d) d.value = pulse.depth; setP(d);
    $("#hzv").textContent = pulse.hz ? pulse.hz + " Hz" : ""; $(".pulse").classList.toggle("off", !pulse.hz);
  }
  $$("#pulseSeg button").forEach(b => b.addEventListener("click", () => {
    pulse.hz = +b.dataset.hz; activeMix = null;
    if (pulse.hz && !playing && started) setPlaying(true); else sync();
  }));
  $("#pulseDepth").addEventListener("input", e => { pulse.depth = +e.target.value; setP(e.target); sync(); });

  const mv = $("#masterVol"); mv.value = store.get("master", 0.8); setP(mv);
  mv.addEventListener("input", () => { setP(mv); store.set("master", +mv.value); Audio_.setMaster(+mv.value); });
  if (store.get("defV", 0) < 1) { store.set("space", 2); store.set("qSoft", true); store.set("defV", 1); }   // new defaults: Far, and the Quran soft
  let space = store.get("space", 2);
  const paintSpace = () => $$("#spaceSeg button").forEach(b => b.setAttribute("aria-checked", +b.dataset.v === space));
  $$("#spaceSeg button").forEach(b => b.addEventListener("click", () => { space = +b.dataset.v; store.set("space", space); paintSpace(); Audio_.setSpace(space); }));
  paintSpace();
  $("#playBtn").addEventListener("click", () => setPlaying(!playing));

  /* ============================ MIXES ============================ */
  let mixFilter = "nature";
  const userMixes = () => store.get("presets", []);
  const artOf = m => m.art || ["#8fa3b3", "#24323e"];
  const artCss = a => `linear-gradient(180deg, ${a[0]} 0%, ${a[0]} 50%, ${a[1]} 56%, ${a[1]} 100%)`;
  function mixLabel() {
    if (!activeMix) return null;
    if (activeMix.startsWith("u:")) return activeMix.slice(2);
    const m = MIXES.find(m => m.id === activeMix); return m ? nameOf(m) : null;
  }
  function paintDockMix() {
    const on = SOUNDS.filter(s => state[s.id].on), m = MIXES.find(x => x.id === activeMix);
    $("#mixName").textContent = on.length ? mixLabel() || t("yourMix") : t("tap");
    $("#mixSub").textContent = on.map(nameOf).join(" · ");
    $("#mixArt").style.background = artCss(m ? m.art : ["#56677a", "#1f2a35"]);
  }
  function renderMixes() {
    const cats = [["nature", "nature"], ["focus", "focusCat"], ["music", "music"]];
    if (userMixes().length) cats.push(["yours", "yours"]);
    const f = $("#mixFilters"); f.innerHTML = "";
    cats.forEach(([id, key]) => { const b = document.createElement("button"); b.textContent = t(key); b.setAttribute("aria-pressed", mixFilter === id); b.onclick = () => { mixFilter = id; renderMixes(); }; f.appendChild(b); });
    const grid = $("#mixGrid"); grid.innerHTML = "";
    if (mixFilter === "music") { const n = document.createElement("p"); n.className = "music-note"; n.style.gridColumn = "1 / -1"; n.textContent = t("musicNote"); grid.appendChild(n); }
    const card = (name, note, mix, art, id, del, pul) => {
      const c = document.createElement("button"); c.className = "mcard"; c.dataset.id = id;
      c.innerHTML = `<div class="m-art"><div class="ico">${Object.keys(mix).slice(0, 4).map(k => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`).join("")}</div></div><div class="m-body"><b></b><span></span></div>`;
      c.querySelector(".m-art").style.background = artCss(art);
      c.querySelector("b").textContent = name; c.querySelector(".m-body span").textContent = note;
      if (pul && pul.hz) { const hz = document.createElement("span"); hz.className = "m-hz"; hz.textContent = pul.hz + " Hz"; c.querySelector(".m-art").appendChild(hz); }
      c.addEventListener("click", e => { if (e.target.closest(".x")) return; applyMix(mix, id, true, pul || null); markActiveMix(); });
      if (del) { const x = document.createElement("span"); x.className = "x"; x.setAttribute("role", "button"); x.setAttribute("aria-label", "Delete " + name); x.textContent = "×"; x.onclick = del; c.appendChild(x); }
      grid.appendChild(c);
    };
    if (mixFilter !== "yours") MIXES.filter(m => m.cat === mixFilter).forEach(m => card(nameOf(m), LANG === "bn" ? m.noteBn : m.note, m.mix, m.art, m.id, null, m.pulse));
    if (mixFilter === "yours") userMixes().forEach((u, i) => card(u.name, Object.keys(u.mix).map(k => nameOf(soundById(k))).join(" · "), u.mix, artOf(u), "u:" + u.name,
      () => { const all = userMixes(); all.splice(i, 1); store.set("presets", all); if (activeMix === "u:" + u.name) activeMix = null; if (!all.length) mixFilter = "nature"; renderMixes(); paintDockMix(); }, u.pulse));
    markActiveMix();
  }
  const markActiveMix = () => $$("#mixGrid .mcard").forEach(c => c.classList.toggle("active", c.dataset.id === activeMix));
  $("#saveForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#presetName").value.trim(), mix = currentMix();
    if (!Object.keys(mix).length) return toast(t("turnOn"));
    if (!name) return $("#presetName").focus();
    const base = MIXES.find(m => m.id === activeMix);
    const all = userMixes().filter(u => u.name !== name); all.push({ name, mix, art: base ? base.art : null, pulse: pulse.hz ? { ...pulse } : null }); store.set("presets", all);
    $("#presetName").value = ""; activeMix = "u:" + name; renderMixes(); sync(); toast(`${t("saved")}: ${name}`);
  });
  const encodeMix = m => Object.entries(m).map(([k, v]) => `${k}-${Math.round(v * 100)}`).concat(pulse.hz ? [`hz${pulse.hz}-${Math.round(pulse.depth * 100)}`] : []).join(".");
  function decodeMix(h) {
    const m = /mix=([\w.-]+)/.exec(h); if (!m) return null;
    const out = {}; let pl = null;
    m[1].split(".").forEach(p => { const [k, v] = p.split("-"); if (/^hz\d+$/.test(k)) pl = { hz: Math.min(40, +k.slice(2)), depth: Math.min(70, +v || 45) / 100 }; else if (state[k] && +v > 0) out[k] = Math.min(100, +v) / 100; });
    if (!Object.keys(out).length) return null; Object.defineProperty(out, "pulse", { value: pl, enumerable: false }); return out;
  }
  $("#shareBtn").addEventListener("click", async () => {
    const mix = currentMix(); if (!Object.keys(mix).length) return toast(t("turnOn"));
    const url = `${location.origin}${location.pathname}#mix=${encodeMix(mix)}`;
    try { await navigator.clipboard.writeText(url); } catch { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
    toast(t("copied"));
  });

  /* ============================ TIMER ============================ */
  const T = Object.assign({ focus: 25, short: 5, long: 15, auto: true }, store.get("timer", {}));
  const saveT = () => store.set("timer", T);
  const F = { mode: "focus", remaining: T.focus * 60, endAt: 0, running: false, iv: null, done: store.get("cycle", 0) };
  const total = () => (F.mode === "focus" ? T.focus : F.mode === "long" ? T.long : T.short) * 60;
  /* lengths: a stepper per row (hold a button to run), with the value large and readable */
  function buildOpts(elId, key, step, min, max) {
    const box = $(elId); box.innerHTML = "";
    box.innerHTML = `<button class="stp" data-d="-1" aria-label="−"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button><output></output><button class="stp" data-d="1" aria-label="+"><svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg></button>`;
    box.querySelectorAll(".stp").forEach(b => {
      let rep = null;
      const once = () => { const v = T[key], d = +b.dataset.d, st = v < step || (d < 0 && v <= step) ? 1 : step;
        const nv = d > 0 ? (v < step ? v + 1 : Math.floor(v / st) * st + st) : (v <= step ? v - 1 : Math.ceil(v / st) * st - st); setLen(key, Math.max(min, Math.min(max, nv))); };
      const stop = () => { clearTimeout(rep); rep = null; };
      b.addEventListener("pointerdown", e => { e.preventDefault(); once(); const go = (ms) => (rep = setTimeout(() => { once(); go(Math.max(60, ms * 0.8)); }, ms)); go(420); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, stop));
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); once(); } });
    });
    paintOpts(elId, key);
  }
  function paintOpts(elId, key) {
    const o = $(elId).querySelector("output"), v = T[key];
    o.innerHTML = `<b></b><span></span>`; o.querySelector("b").textContent = LANG === "bn" ? bnDigits(v) : v; o.querySelector("span").textContent = t("min");
  }
  const OPTS = [["#optFocus", "focus", 5, 1, 240], ["#optShort", "short", 5, 1, 60], ["#optLong", "long", 5, 1, 90]];
  function setLen(key, v) {
    T[key] = v; saveT(); OPTS.forEach(o => paintOpts(o[0], o[1]));
    const affects = (key === "focus" && F.mode === "focus") || (key === "short" && F.mode === "break") || (key === "long" && F.mode === "long");
    if (affects && !F.running) { F.remaining = total(); paint(); }
  }
  const autoBreak = $("#autoBreak"); autoBreak.checked = T.auto; autoBreak.addEventListener("change", () => { T.auto = autoBreak.checked; saveT(); });

  const focusEl = $("#focus"), clock = $("#clock"), focusBtn = $("#focusBtn"), resetBtn = $("#resetBtn"), intent = $("#intent");
  intent.value = store.get("intent", "");
  intent.addEventListener("input", () => store.set("intent", intent.value));
  intent.addEventListener("keydown", e => { if (e.key === "Enter") { intent.blur(); if (!F.running) focusBtn.click(); } });
  /* Depth face: the scene paints the clock inside the sea; the DOM clock becomes an invisible handle on top of it */
  function depthClock() {
    const on = face === "depth"; document.body.classList.toggle("depth", on);
    Scene.setClock(on && started ? { text: clock.textContent, x: L0.x, y: L0.y, s: L0.s, o: clockOp } : null);
    placeHandle();
  }
  function placeHandle() {
    const r = face === "depth" && Scene.clockRect();
    if (r) Object.assign(clock.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    else ["left", "top", "width", "height"].forEach(k => (clock.style[k] = ""));
  }
  setInterval(placeHandle, 300); addEventListener("resize", () => setTimeout(placeHandle, 50)); onLayout = depthClock;
  function paint() { paintCore(); depthClock(); paintAnalog(); }
  function paintCore() {
    const digits = s => (face === "bangla" ? bnDigits(s) : s);
    if (CM === "clock") {
      const d = new Date(), H = d.getHours(), M = String(d.getMinutes()).padStart(2, "0");
      clock.textContent = digits(h24.checked ? `${String(H).padStart(2, "0")}:${M}` : `${H % 12 || 12}:${M}`);
      const g = d.toLocaleDateString(LANG === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const extra = [banglaDate(d), hijriDate(d)].filter(Boolean).join("  ·  ");
      const dl = $("#dateLine"); if (dl.dataset.k !== g + extra) { dl.dataset.k = g + extra; dl.innerHTML = ""; [g, extra].forEach(x => { const s = document.createElement("span"); s.textContent = x; dl.appendChild(s); }); }
      document.title = t("title"); return;
    }
    if (CM === "stopwatch") {
      const e = swElapsed();
      clock.textContent = digits(fmt(Math.floor(e)));
      $("#modeLabel").textContent = t("stopwatch"); $("#modeLabel").classList.remove("break"); focusEl.classList.remove("break-mode");
      $("#progFill").style.width = ((e % 60) / 60) * 100 + "%";
      focusBtn.textContent = t(SW.running ? "pause" : e > 0 ? "resume" : "startSW");
      resetBtn.hidden = e === 0; document.title = SW.running ? `${fmt(Math.floor(e))} · ${intent.value || t("stopwatch")}` : t("title"); return;
    }
    const TT = total();
    clock.textContent = digits(fmt(F.remaining));
    $("#progFill").style.width = (1 - F.remaining / TT) * 100 + "%";
    const ml = $("#modeLabel");
    ml.textContent = F.mode === "focus" ? t("focus") : `${t(F.mode === "long" ? "longBreak" : "break")} · ${t("breakHint")}`;
    ml.classList.toggle("break", F.mode !== "focus"); focusEl.classList.toggle("break-mode", F.mode !== "focus");
    focusBtn.textContent = t(F.running ? "pause" : F.remaining < TT ? "resume" : F.mode === "focus" ? "start" : "startBreak");
    resetBtn.hidden = !(F.running || F.remaining < TT || F.mode !== "focus");
    $$("#dots i").forEach((d, i) => d.classList.toggle("done", i < F.done));
    document.title = F.running ? `${fmt(F.remaining)} · ${F.mode === "focus" ? intent.value || t("focus") : t("break")}` : t("title");
  }
  let wake = null;
  const lockWake = async on => { try { if (on && "wakeLock" in navigator && !wake) wake = await navigator.wakeLock.request("screen"); else if (!on && wake) { await wake.release(); wake = null; } } catch {} };
  function startTimer() {
    F.running = true; F.endAt = Date.now() + F.remaining * 1000;
    clearInterval(F.iv); F.iv = setInterval(tick, 250);
    if (F.mode === "focus" && !playing && !quranActive() && started) setPlaying(true);
    lockWake(true); paint(); armZen();
  }
  function pauseTimer() { F.running = false; clearInterval(F.iv); F.remaining = Math.max(0, Math.round((F.endAt - Date.now()) / 1000)); lockWake(false); paint(); unZen(); }
  function tick() { F.remaining = Math.max(0, Math.round((F.endAt - Date.now()) / 1000)); if (F.remaining === 0) complete(); else paint(); }
  function complete() {
    clearInterval(F.iv); F.running = false; Audio_.chime(); unZen();
    if (F.mode === "focus") {
      logMinutes(T.focus); F.done++;
      const long = F.done >= 4; F.mode = long ? "long" : "break"; F.remaining = total();
      toast(t(long ? "doneLong" : "done")); notify(t("nDone"), t("nDoneB"));
      if (long) F.done = 0; store.set("cycle", F.done);
      if (T.auto) startTimer(); else { lockWake(false); paint(); }
    } else {
      F.mode = "focus"; F.remaining = total(); lockWake(false);
      toast(t("breakOver")); notify(t("nBreak"), t("nBreakB")); paint();
    }
  }
  focusBtn.addEventListener("click", () => {
    if (CM === "stopwatch") return SW.running ? swPause() : swStart();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    F.running ? pauseTimer() : startTimer();
  });
  resetBtn.addEventListener("click", () => { if (CM === "stopwatch") return swReset(); clearInterval(F.iv); F.running = false; F.mode = "focus"; F.remaining = total(); lockWake(false); unZen(); paint(); });
  function notify(title, body) { if (document.hidden && "Notification" in window && Notification.permission === "granted") try { new Notification(title, { body, icon: "brand/fw-icon-192.png", silent: true }); } catch {} }

  /* ---- clock modes: timer, stopwatch, clock ---- */
  let CM = store.get("cmode", "timer");
  const SW = { running: false, startAt: 0, acc: store.get("swAcc", 0), logged: 0 };
  const swElapsed = () => SW.acc + (SW.running ? (Date.now() - SW.startAt) / 1000 : 0);
  const h24 = $("#h24"); h24.checked = store.get("h24", !/am|pm/i.test(new Date(2020, 0, 1, 15).toLocaleTimeString()));
  h24.addEventListener("change", () => { store.set("h24", h24.checked); paint(); });
  const BN = "০১২৩৪৫৬৭৮৯", bnDigits = s => String(s).replace(/\d/g, d => BN[d]);
  function banglaDate(d) {         // Bangladesh's revised Bangla calendar (Pohela Boishakh = 14 April)
    const y = d.getFullYear(), sy = d >= new Date(y, 3, 14) ? y : y - 1;
    let days = Math.round((Date.UTC(y, d.getMonth(), d.getDate()) - Date.UTC(sy, 3, 14)) / 864e5);
    const leap = (sy + 1) % 4 === 0 && ((sy + 1) % 100 !== 0 || (sy + 1) % 400 === 0);
    const len = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
    let m = 0; while (days >= len[m]) days -= len[m++];
    const MB = ["বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন", "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র"];
    const ME = ["Boishakh", "Joishtho", "Asharh", "Srabon", "Bhadro", "Ashwin", "Kartik", "Ogrohayon", "Poush", "Magh", "Falgun", "Choitro"];
    return LANG === "bn" ? `${bnDigits(days + 1)} ${MB[m]} ${bnDigits(sy - 593)}` : `${days + 1} ${ME[m]} ${sy - 593}`;
  }
  function hijriDate(d) { try { return new Intl.DateTimeFormat(LANG === "bn" ? "bn-BD-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/\s?(AH|যুগ)$/, ""); } catch { return ""; } }
  function setMode(m) {
    if (m === CM) return;
    if (CM === "stopwatch" && SW.running) swPause();
    CM = m; store.set("cmode", m); paintMode(); paint(); armZen();
  }
  function paintMode() {
    $$("#modeSeg button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === CM));
    $("#timerOpts").hidden = CM !== "timer"; $("#clockOpts").hidden = CM !== "clock";
    focusEl.classList.toggle("clock-mode", CM === "clock"); focusEl.classList.toggle("sw-mode", CM === "stopwatch");
    $("#dateLine").hidden = CM !== "clock"; intent.hidden = CM === "clock";
  }
  $$("#modeSeg button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.v)));
  function swStart() { SW.running = true; SW.startAt = Date.now(); lockWake(true); if (!playing && !quranActive() && started) setPlaying(true); paint(); armZen(); }
  function swPause() { SW.acc = swElapsed(); SW.running = false; store.set("swAcc", SW.acc); lockWake(false); swLog(); paint(); unZen(); }
  function swLog() { const m = Math.floor(SW.acc / 60) - SW.logged; if (m > 0) { logMinutes(m); SW.logged += m; } }
  function swReset() { if (SW.running) swPause(); SW.acc = 0; SW.logged = 0; store.set("swAcc", 0); paint(); }
  setInterval(() => { if (CM !== "timer") paint(); }, 250);

  // [id, google font to load (if any), kind]. Fewer faces, each with one clear idea:
  // Depth stands in the sea, Serif is quiet and editorial, Light is thin and airy, Mono is a calm instrument,
  // Frosted sits on a real pane of frosted glass. Minimal, Dial and Ring are analog.
  const TIGHT = "Inter+Tight:wght@200;300;400";
  const FACES = [["depth", null, "d"], ["serif", null, "d"], ["light", TIGHT, "d"], ["mono", "DM+Mono:wght@300;400", "d"],
    ["frost", TIGHT, "d"], ["minimal", TIGHT, "a"], ["dial", TIGHT, "a"], ["ring", TIGHT, "a"]];
  if (store.get("faceV", 0) < 2) { store.set("face", "depth"); store.set("faceV", 2); }      // the redesign makes Depth the default once
  let face = store.get("face", "depth"); if (!FACES.some(f => f[0] === face)) face = "depth";    // older faces were retired
  const isAnalog = () => (FACES.find(f => f[0] === face) || [])[2] === "a";
  const loaded = new Set();
  const loadFont = f => { if (!f || loaded.has(f)) return; loaded.add(f); const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${f}&display=swap`; document.head.appendChild(l); };
  function buildFaces() {
    const box = $("#faces"); box.innerHTML = "";
    FACES.forEach(([id, font, kind]) => {
      loadFont(font);
      const b = document.createElement("button"); b.dataset.face = id; b.setAttribute("aria-pressed", id === face);
      b.innerHTML = kind === "a" ? `<span class="fprev">${analogSVG(id, true)}</span><small></small>`
        : id === "depth" ? `<span class="fprev"><b class="dpv">25<i></i></b></span><small></small>` : `<span class="fprev"><b>25</b></span><small></small>`;
      b.querySelector("small").textContent = t("faceNames")[id];
      b.onclick = () => { face = id; store.set("face", id); applyFace(); buildFaces(); paint(); };
      box.appendChild(b);
    });
  }
  function applyFace() {
    clock.dataset.face = face; loadFont((FACES.find(f => f[0] === face) || [])[1]);
    const a = isAnalog(), an = $("#analog");
    document.body.classList.toggle("analog-face", a); an.hidden = !a;
    if (a && an.dataset.kind !== face) { an.dataset.kind = face; an.innerHTML = analogSVG(face) + `<div class="an-digital"></div>`; }
    if (a) startAnalog();
  }

  /* ---- analog faces: Minimal (ticks and slim hands), Dial (an ivory wall clock), Ring (a progress ring).
     Clock mode shows the time; the timer shows what's left as a wedge (or the ring), like a kitchen timer;
     the stopwatch sweeps the seconds. ---- */
  function analogSVG(kind, mini) {
    let ticks = "";
    if (kind !== "ring") for (let i = 0; i < 60; i++) {
      const hr = i % 5 === 0; if (mini && !hr) continue;
      const a = i * 6 * Math.PI / 180, r1 = kind === "dial" ? 86 : 94, r0 = r1 - (hr ? (kind === "dial" ? 13 : 8) : 3);
      const p = r => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
      ticks += `<path class="${hr ? (i % 15 === 0 ? "tk-h tk-q" : "tk-h") : "tk-m"}" d="M${p(r0)} L${p(r1)}"/>`;
    }
    const base = kind === "dial" ? `<circle class="an-disc" r="97"/>` : kind === "ring" ? `<circle class="an-track" r="90"/>` : `<circle class="an-glass" r="99"/>`;
    const ring = kind === "ring" ? `<circle class="an-arc" r="90" transform="rotate(-90)" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="${mini ? 330 : 1000}"/>` : "";
    const wedge = kind === "ring" ? "" : `<path class="an-wedge" d=""/>`;
    const hands = kind === "ring" ? "" : mini
      ? `<g class="an-hands"><path class="an-h" d="M0 8 L0 -44" transform="rotate(300)"/><path class="an-m" d="M0 10 L0 -70" transform="rotate(60)"/><circle class="an-c" r="5"/></g>`
      : `<g class="an-hands"><path class="an-h" d="M0 12 L0 -48"/><path class="an-m" d="M0 14 L0 -74"/><path class="an-s" d="M0 20 L0 -82"/><circle class="an-c" r="${kind === "dial" ? 4.5 : 3.4}"/></g>`;
    return `<svg viewBox="-100 -100 200 200" class="an an-${kind}" aria-hidden="true">${base}${wedge}${ring}${ticks}${hands}</svg>`;
  }
  function wedgePath(f, kind) {
    const r = kind === "dial" ? 72 : 80; f = Math.max(0, Math.min(1, f));
    if (f <= 0.0005) return "";
    if (f >= 0.9995) return `M0 ${-r} A${r} ${r} 0 1 1 0 ${r} A${r} ${r} 0 1 1 0 ${-r} Z`;
    const a = f * 2 * Math.PI, x = (Math.sin(a) * r).toFixed(2), y = (-Math.cos(a) * r).toFixed(2);
    return `M0 0 L0 ${-r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  }
  let anRaf = 0;
  function startAnalog() { if (!anRaf) anRaf = requestAnimationFrame(analogLoop); }
  function analogLoop() { anRaf = 0; if (!isAnalog()) return; paintAnalog(); if (!document.hidden) startAnalog(); else setTimeout(startAnalog, 1000); }
  function paintAnalog() {
    if (!isAnalog()) return;
    const an = $("#analog"), svg = an.querySelector("svg"); if (!svg) return;
    const q = sel => svg.querySelector(sel);
    const rot = (sel, deg) => { const el = q(sel); if (el) el.setAttribute("transform", `rotate(${deg.toFixed(2)})`); };
    const show = (sel, on) => { const el = q(sel); if (el) el.style.display = on ? "" : "none"; };
    let frac = 0, text = "", wedge = "";
    if (CM === "clock") {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      rot(".an-h", h * 30); rot(".an-m", m * 6); rot(".an-s", s * 6); show(".an-h", 1); show(".an-m", 1); show(".an-s", 1);
      frac = m / 60; text = face === "ring" ? clock.textContent : "";
    } else if (CM === "stopwatch") {
      const e = swElapsed(); rot(".an-m", (e / 60) * 6); rot(".an-s", (e % 60) * 6); show(".an-h", 0); show(".an-m", 1); show(".an-s", 1);
      frac = (e % 60) / 60; text = clock.textContent;
    } else {
      const TT = total(), rem = F.running ? Math.max(0, (F.endAt - Date.now()) / 1000) : F.remaining, scale = TT <= 3600 ? 3600 : TT;
      wedge = wedgePath(rem / scale, face); show(".an-h", 0); show(".an-m", 0); show(".an-s", 0);
      frac = rem / TT; text = clock.textContent;
    }
    const w = q(".an-wedge"); if (w && w.getAttribute("d") !== wedge) w.setAttribute("d", wedge);
    const arc = q(".an-arc"); if (arc) arc.setAttribute("stroke-dashoffset", (1000 * (1 - frac)).toFixed(1));
    const dig = an.querySelector(".an-digital"); if (dig.textContent !== text) dig.textContent = text;
    an.dataset.mode = CM; an.classList.toggle("break", CM === "timer" && F.mode !== "focus");
  }

  /* ---- sky: Auto follows local time; the slider sets any hour, and the scene blends smoothly between them ---- */
  const OLD_SKY = { dawn: 6.5, day: 12, dusk: 18.3, night: 23 };
  let sky = store.get("sky", "auto"); if (OLD_SKY[sky]) sky = OLD_SKY[sky]; if (sky !== "auto" && !(sky >= 0 && sky <= 24)) sky = "auto";
  const skyIn = $("#skyHour"), skyAuto = $("#skyAuto");
  const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const phaseOf = h => t(h < 4.6 || h >= 20.5 ? "night" : h < 7.5 ? "dawn" : h < 17.4 ? "day" : "dusk");
  const hourLabel = h => { h = ((h % 24) + 24) % 24; const H = Math.floor(h), M = Math.floor((h - H) * 12) * 5, mm = String(M).padStart(2, "0");
    const s = h24.checked ? `${String(H).padStart(2, "0")}:${mm}` : `${H % 12 || 12}:${mm} ${H < 12 ? "AM" : "PM"}`; return LANG === "bn" ? bnDigits(s) : s; };
  function paintSky() {
    const auto = sky === "auto", h = auto ? nowHour() : sky;
    skyAuto.checked = auto; if (document.activeElement !== skyIn || auto) skyIn.value = h;
    $("#skyOut").textContent = `${hourLabel(h)} · ${phaseOf(h)}`;
    skyIn.closest(".sky-slider").classList.toggle("auto", auto);
    Scene.setHour(auto ? null : sky);
  }
  skyIn.addEventListener("input", () => { sky = +skyIn.value; store.set("sky", sky); paintSky(); });
  skyAuto.addEventListener("change", () => { sky = skyAuto.checked ? "auto" : +skyIn.value; store.set("sky", sky); paintSky(); });
  setInterval(() => sky === "auto" && paintSky(), 30000);
  paintSky();

  /* ---- zen (automatic, while focusing and idle) and hide (manual) ---- */
  let zenT, hintT;
  const unZen = () => { clearTimeout(zenT); document.body.classList.remove("zen"); };
  const focusing = () => CM === "clock" || (CM === "stopwatch" && SW.running) || (CM === "timer" && F.running && F.mode === "focus");
  function armZen() { unZen(); if (focusing() && !openName) zenT = setTimeout(() => { if (document.activeElement !== intent && !openName) document.body.classList.add("zen"); }, 5000); }
  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => focusing() && !uiOff && armZen(), { passive: true }));
  let uiOff = false;
  function hideUI() {
    openPanel(null); uiOff = true; document.body.classList.add("ui-off");
    const h = $("#hiddenHint"); h.classList.add("show"); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove("show"), 2600);
  }
  function showUI() { uiOff = false; document.body.classList.remove("ui-off"); $("#hiddenHint").classList.remove("show"); armZen(); }
  $("#hideBtn").addEventListener("click", e => { e.stopPropagation(); setTimeout(hideUI, 0); });
  addEventListener("pointerup", e => { if (uiOff && !e.target.closest("#hideBtn")) showUI(); });

  /* ---- stats (only in this browser) ---- */
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  function logMinutes(m) { const log = store.get("log", {}); log[dayKey()] = (log[dayKey()] || 0) + m; store.set("log", log); paintStats(); }
  function paintStats() {
    const log = store.get("log", {}), today = log[dayKey()] || 0;
    let streak = 0; const d = new Date(); if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (log[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
    const h = Math.floor(today / 60), m = today % 60, tm = `${h ? h + "h " : ""}${m}m`;
    $("#stats").innerHTML = today || streak ? (LANG === "bn" ? `${t("today")} <b>${tm}</b>` : `<b>${tm}</b> ${t("today")}`) + (streak > 1 ? ` · <b>${streak}</b> ${t("streak")}` : "") : "";
  }

  /* ============================ QURAN ============================ */
  // Two players: one shares the Web Audio graph (volume + soft mode) when the host allows it (CORS);
  // the plain one is the fallback and only has element volume.
  const qA = $("#qAudio"), qB = $("#qAudioPlain"), surahSel = $("#surahSel"), recSel = $("#reciterSel");
  const qVol = $("#qVol"), qNature = $("#qNature"), qSoft = $("#qSoft");
  SURAHS.forEach((n, i) => surahSel.add(new Option(`${i + 1}. ${n}`, i + 1)));
  RECITERS.forEach((r, i) => recSel.add(new Option(r.name, i)));
  surahSel.value = store.get("surah", 1); recSel.value = store.get("reciter", 0);
  if (store.get("defV", 0) < 2) { store.set("qVol", 0.25); store.set("qNature", 1); store.set("defV", 2); }   // recitation 25%, nature stays at 100%
  qVol.value = store.get("qVol", 0.25); qNature.value = store.get("qNature", 1); qSoft.checked = store.get("qSoft", true);
  [qVol, qNature].forEach(setP);
  let cur = qA, attempts = [], attemptIdx = 0, qWant = false, qBlocked = false, qTimer = null, graphOK = null;
  const quranActive = () => !cur.paused && !cur.ended;
  const qStatus = s => ($("#qStatus").textContent = s || "");
  const applyDuck = () => Audio_.setDuck(quranActive() ? +qNature.value : 1);
  function applyQuranOut() {
    Audio_.quranVolume(+qVol.value); qB.volume = +qVol.value; Audio_.quranSoft(qSoft.checked);
    $("#qSoftHint").textContent = t(qSoft.checked && cur === qB ? "qSoftNA" : "qSoftHint");
  }
  const armTimeout = () => { clearTimeout(qTimer); qTimer = setTimeout(() => cur.dispatchEvent(new Event("error")), 12000); };
  document.addEventListener("securitypolicyviolation", e => { if (/quranicaudio|islamic\.network/.test(e.blockedURI)) { qBlocked = true; qStatus(t("errBlocked")); } });

  function loadSurah(autoplay) {
    const s = +surahSel.value, r = RECITERS[+recSel.value];
    store.set("surah", s); store.set("reciter", +recSel.value);
    [qA, qB].forEach(el => { el.pause(); el.removeAttribute("src"); });
    attempts = quranSources(r, s).flatMap(url => graphOK === false ? [{ url, el: qB }] : [{ url, el: qA }, { url, el: qB }]);
    attemptIdx = 0; useAttempt();
    const seek = $("#qSeek"); seek.value = 0; setP(seek); $("#qCur").textContent = $("#qDur").textContent = "0:00";
    if (autoplay) playQuran();
  }
  function useAttempt() { const a = attempts[attemptIdx]; cur = a.el; cur.src = a.url; applyQuranOut(); }
  async function playQuran() {
    if (!started) await enter();
    if (!cur.getAttribute("src")) loadSurah(false);
    if (graphOK === null) graphOK = Audio_.attachQuran(qA);
    if (!graphOK && cur === qA) { attempts = attempts.filter(a => a.el === qB); attemptIdx = 0; useAttempt(); }
    Audio_.resume(); keepAlive.play().catch(() => {});
    qStatus(t("loading")); qWant = true; sync(); armTimeout();
    cur.play().catch(err => { if (err.name === "NotAllowedError") qStatus(t("errPlay")); });
  }
  function pauseQuran() { qWant = false; [qA, qB].forEach(el => el.pause()); sync(); }
  const qState = () => {
    document.body.classList.toggle("q-playing", quranActive());
    applyDuck(); mediaMeta(); sync();
  };
  [qA, qB].forEach(el => {
    const mine = f => e => { if (e.target === cur) f(e); };
    el.addEventListener("play", mine(qState));
    el.addEventListener("playing", mine(() => { qStatus(""); clearTimeout(qTimer); }));
    el.addEventListener("waiting", mine(() => qStatus(t("buffering"))));
    el.addEventListener("pause", mine(() => { qState(); if (!playing) keepAlive.pause(); }));
    el.addEventListener("canplay", mine(() => clearTimeout(qTimer)));
    el.addEventListener("error", mine(() => {
      clearTimeout(qTimer);
      if (!cur.getAttribute("src") || cur.readyState >= 3) return;
      if (attemptIdx < attempts.length - 1) { cur.pause(); attemptIdx++; useAttempt(); if (qWant) { armTimeout(); cur.play().catch(() => {}); } return; }
      qWant = false; qState(); qStatus(t(qBlocked ? "errBlocked" : "errLoad"));
    }));
    el.addEventListener("loadedmetadata", mine(() => ($("#qDur").textContent = fmt(cur.duration))));
    el.addEventListener("timeupdate", mine(() => { $("#qCur").textContent = fmt(cur.currentTime); if (cur.duration) { const s = $("#qSeek"); s.value = cur.currentTime / cur.duration * 100; setP(s); } }));
    el.addEventListener("ended", mine(() => {
      if ($("#qRepeat").checked) { cur.currentTime = 0; cur.play(); }
      else if ($("#qAuto").checked && +surahSel.value < 114) { surahSel.value = +surahSel.value + 1; loadSurah(true); }
      else qState();
    }));
  });
  $("#qPlay").addEventListener("click", () => (quranActive() ? pauseQuran() : playQuran()));
  $("#qPrev").addEventListener("click", () => { surahSel.value = Math.max(1, +surahSel.value - 1); loadSurah(quranActive()); });
  $("#qNext").addEventListener("click", () => { surahSel.value = Math.min(114, +surahSel.value + 1); loadSurah(quranActive()); });
  surahSel.addEventListener("change", () => loadSurah(quranActive()));
  recSel.addEventListener("change", () => loadSurah(quranActive()));
  $("#qSeek").addEventListener("input", e => { setP(e.target); if (cur.duration) cur.currentTime = e.target.value / 100 * cur.duration; });
  qVol.addEventListener("input", () => { setP(qVol); store.set("qVol", +qVol.value); applyQuranOut(); });
  qNature.addEventListener("input", () => { setP(qNature); store.set("qNature", +qNature.value); applyDuck(); });
  qSoft.addEventListener("change", () => { store.set("qSoft", qSoft.checked); applyQuranOut(); });
  $("#qRepeat").addEventListener("change", e => e.target.checked && ($("#qAuto").checked = false));
  $("#qAuto").addEventListener("change", e => e.target.checked && ($("#qRepeat").checked = false));

  /* ============================ CHROME ============================ */
  function toggleFs() { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} }
  $("#fsBtn").addEventListener("click", toggleFs);
  if (!document.documentElement.requestFullscreen) $("#fsBtn").hidden = true;

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (uiOff) return showUI(); if (openName) return openPanel(null); }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!started && (e.key === "Enter" || e.code === "Space") && e.target.tagName !== "BUTTON") { e.preventDefault(); return enter(); }
    if (uiOff) { showUI(); if (e.code !== "Space") return; }
    if (e.code === "Space" && e.target.tagName !== "BUTTON") { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === "f") toggleFs();
    else if (e.key === "h") hideUI();
    else if (e.key === "m") openPanel("mixes");
    else if (e.key === "s") openPanel("sounds");
    else if (e.key === "t" || e.key === "c") openPanel("clock");
  });

  function relabel() {
    applyI18n(); buildSounds(); buildFaces(); OPTS.forEach(o => buildOpts(...o)); if (openName === "mixes") renderMixes();
    paintDockMix(); paint(); paintStats(); sharedNote(); applyQuranOut(); paintSky(); paintOp(); if (!started && typeof buildPicks === "function") { greet(); buildPicks(); }
    $("#playBtn").setAttribute("aria-label", t(playing ? "pauseSounds" : "play"));
  }
  function setLang() { LANG = LANG === "en" ? "bn" : "en"; try { localStorage.setItem("fw:lang", LANG); } catch {} relabel(); }
  $("#langBtn").addEventListener("click", setLang); $("#introLang").addEventListener("click", setLang);

  function mediaMeta() {
    if (!("mediaSession" in navigator)) return;
    const s = +surahSel.value, art = [{ src: "brand/fw-icon-512.png", sizes: "512x512" }];
    navigator.mediaSession.metadata = new MediaMetadata(quranActive()
      ? { title: `Surah ${SURAHS[s - 1]}`, artist: RECITERS[+recSel.value].name, album: "Focus Waves", artwork: art }
      : { title: mixLabel() || t("yourMix"), artist: "Focus Waves", artwork: art });
  }
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => (qWant ? playQuran() : setPlaying(true)));
    ms.setActionHandler("pause", () => { pauseQuran(); if (playing) setPlaying(false); });
    ms.setActionHandler("nexttrack", () => $("#qNext").click());
    ms.setActionHandler("previoustrack", () => $("#qPrev").click());
  }

  let toastT;
  function toast(msg) {
    let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ============================ ENTER ============================ */
  const shared = decodeMix(location.hash);
  function sharedNote() { const n = $("#introShared"); if (!shared) return; n.hidden = false; n.textContent = t("sharedMix") + Object.keys(shared).map(k => nameOf(soundById(k))).join(", "); }
  async function enter() {
    if (started) return; started = true;
    try { await Audio_.init(); Audio_.setSpace(space); } catch (err) { console.error(err); toast(t("noAudio")); }
    Audio_.onEvent(Scene.event);
    $("#intro").classList.add("gone"); document.body.classList.remove("pre"); paint();
    if (shared) { applyMix(shared, null, false, shared.pulse); history.replaceState(null, "", location.pathname); toast(t("sharedLoaded")); }
    setPlaying(true);
  }
  $("#beginBtn").addEventListener("click", enter);

  /* ---- intro: wordmark letters, a greeting for the hour, and a choice of where to start ---- */
  { const w = $(".intro-word .w"); let i = 0;
    [["Focus", ""], [" ", "sp"], ["Waves", "acc"]].forEach(([txt, cls]) => {
      if (cls === "sp") { const s = document.createElement("span"); s.className = "sp"; w.appendChild(s); return; }
      [...txt].forEach(ch => { const s = document.createElement("span"); s.className = "ch" + (cls ? " " + cls : ""); s.textContent = ch; s.style.setProperty("--i", i++); w.appendChild(s); });
    });
  }
  function greet() { const h = new Date().getHours(); $("#greet").textContent = t(h >= 4 && h < 12 ? "gMorning" : h < 16 ? "gNoon" : h < 19 ? "gEvening" : "gNight"); }
  const PICKS = ["coxs", "borsha", "bhor", "sheet"];
  const mixHex = (a, b, f) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(b.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
  let picked = null;
  function buildPicks() {
    const box = $("#picks"); box.innerHTML = "";
    const last = store.get("mix", null), hasLast = !shared && last && Object.keys(last).length && !PICKS.includes(store.get("activeMix", ""));
    const items = (hasLast ? [{ id: "__last", name: t("lastMix"), mix: last, art: (MIXES.find(m => m.id === store.get("activeMix", "")) || {}).art || ["#7f8fa3", "#26323e"] }] : [])
      .concat(PICKS.map(id => MIXES.find(m => m.id === id)).map(m => ({ id: m.id, name: nameOf(m), mix: m.mix, art: m.art })));
    if (shared) return;
    if (!picked) picked = hasLast ? "__last" : (PICKS.includes(store.get("activeMix", "")) ? store.get("activeMix", "") : "coxs");
    items.slice(0, 4).forEach(it => {
      const b = document.createElement("button"); b.className = "pick"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", it.id === picked);
      b.innerHTML = `<i></i><span></span>`; b.querySelector("i").style.background = `linear-gradient(180deg, ${it.art[0]} 0%, ${mixHex(it.art[0], it.art[1], 0.3)} 56%, ${it.art[1]} 56%, ${mixHex(it.art[1], "#000000", 0.4)} 100%)`; b.querySelector("span").textContent = it.name;
      b.onclick = () => { picked = it.id; applyMix(it.mix, it.id === "__last" ? store.get("activeMix", null) : it.id, false, it.id === "__last" ? undefined : null); buildPicks(); };
      box.appendChild(b);
    });
  }

  /* ============================ INIT ============================ */
  const saved = store.get("mix", null);
  relabel();
  if (shared) applyMix(shared, null, false, shared.pulse);
  else if (saved && Object.keys(saved).length) applyMix(saved, store.get("activeMix", null), false);
  else applyMix(MIXES[0].mix, MIXES[0].id, false);
  if (cur && !cur.getAttribute("src")) { attempts = quranSources(RECITERS[+recSel.value], +surahSel.value).flatMap(url => [{ url, el: qA }, { url, el: qB }]); attemptIdx = 0; }
  F.remaining = total(); applyFace(); paintMode(); paint(); greet(); buildPicks();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
})();
