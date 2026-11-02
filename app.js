(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fw:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fw:" + k, JSON.stringify(v)); } catch {} },
  };
  const setP = el => el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");

  /* =================================================================
     AUDIO ENGINE
     sources → per-sound gain → master (user volume) → duck (Quran) → out
     ================================================================= */
  let ctx = null, master = null, duck = null, playing = false;
  const SOUNDS = [...BUILTIN_SOUNDS, ...CUSTOM_SOUNDS.map(s => ({ ...s, custom: true }))];
  const state = Object.fromEntries(SOUNDS.map(s => [s.id, { vol: 0.5, on: false }]));
  const curve = v => v * v;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); duck = ctx.createGain();
      master.gain.value = +$("#masterVol").value;
      master.connect(duck).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Loops are rendered in a Web Worker so the page never freezes.
  let worker = null; const pending = {};
  function renderInWorker(def) {
    if (!worker) {
      worker = new Worker("audio-worker.js");
      worker.onmessage = e => { const { id, chans } = e.data; pending[id].resolve(chans); delete pending[id]; };
      worker.onerror = e => { Object.values(pending).forEach(p => p.reject(e)); };
    }
    return new Promise((resolve, reject) => {
      pending[def.id] = { resolve, reject };
      worker.postMessage({ id: def.id, seconds: def.seconds, sr: ctx.sampleRate });
    });
  }

  async function getBuffer(def) {
    const st = state[def.id];
    if (st.buffer) return st.buffer;
    st.loading ||= (async () => {
      if (def.custom) {
        const res = await fetch(def.file);
        if (!res.ok) throw new Error("Could not load " + def.file);
        return ctx.decodeAudioData(await res.arrayBuffer());
      }
      const chans = await renderInWorker(def);
      const buf = ctx.createBuffer(2, chans[0].length, ctx.sampleRate);
      chans.forEach((c, i) => buf.copyToChannel(c, i));
      return buf;
    })();
    try { st.buffer = await st.loading; } finally { st.loading = null; }
    return st.buffer;
  }

  async function startSound(id) {
    const def = SOUNDS.find(s => s.id === id), st = state[id];
    if (st.src || st.starting) return;
    st.starting = true; ensureCtx();
    tile(id).classList.add("loading");
    try {
      const buf = await getBuffer(def);
      if (!st.on || !playing) return;
      st.gain = ctx.createGain();
      st.gain.gain.setValueAtTime(0, ctx.currentTime);
      st.gain.gain.linearRampToValueAtTime(curve(st.vol), ctx.currentTime + 1.2);
      st.gain.connect(master);
      st.src = ctx.createBufferSource();
      st.src.buffer = buf; st.src.loop = true; st.src.connect(st.gain);
      st.src.start(0, Math.random() * buf.duration);
    } catch (e) {
      console.error(e); st.on = false; render(id); toast(`${t("cantLoad")}: ${nameOf(def)}`);
    } finally { st.starting = false; tile(id).classList.remove("loading"); }
  }

  function stopSound(id, fade = 0.6) {
    const st = state[id];
    if (!st.src) return;
    const { src, gain } = st, t = ctx.currentTime;
    st.src = st.gain = null;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.05);
  }

  // iOS mutes Web Audio when the silent switch is on and suspends it on lock.
  // Playing a silent <audio> alongside moves the page into the "media playback" category.
  const keepAlive = (() => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, "data"); v.setUint32(40, n, true); for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    a.loop = true; a.setAttribute("playsinline", ""); a.volume = 0.01;
    return a;
  })();

  function setPlaying(on, { auto = false } = {}) {
    if (on && !anyOn()) applyMix(BUILTIN_PRESETS[0].mix, "p:0", false);
    if (on && quranActive() && !qUnder.checked) pauseQuran();
    playing = on; ensureCtx();
    if (on) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(+$("#masterVol").value, ctx.currentTime);
      keepAlive.play().catch(() => {});
      SOUNDS.forEach(s => state[s.id].on && startSound(s.id));
    } else {
      SOUNDS.forEach(s => stopSound(s.id));
      if (!quranActive()) keepAlive.pause();
    }
    document.body.classList.toggle("is-playing", on);
    $("#playBtn").setAttribute("aria-label", t(on ? "pauseSounds" : "play"));
    updateMeta(); syncScene();
  }
  const anyOn = () => SOUNDS.some(s => state[s.id].on);

  function applyDuck() {
    if (!duck) return;
    const v = quranActive() && qUnder.checked ? +qUnderLvl.value : 1;
    duck.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  }

  /* ============================ SOUND DOCK ============================ */
  const grid = $("#grid");
  const tile = id => grid.querySelector(`[data-id="${id}"]`);
  SOUNDS.forEach(s => {
    const el = document.createElement("div");
    el.className = "snd"; el.dataset.id = s.id;
    el.innerHTML = `
      <button class="snd-btn" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.icon] || ICONS.note}</svg>
        <span class="snd-name"></span>
      </button>
      <input type="range" min="0" max="1" step="0.01">`;
    grid.appendChild(el);
    el.querySelector(".snd-btn").addEventListener("click", () => toggle(s.id));
    el.querySelector("input").addEventListener("input", e => {
      const st = state[s.id]; st.vol = +e.target.value; setP(e.target);
      if (st.gain) st.gain.gain.setTargetAtTime(curve(st.vol), ctx.currentTime, 0.05);
      mixLabel = null; saveCurrent(); updateMeta(); syncScene();
    });
  });

  function toggle(id) {
    const st = state[id];
    st.on = !st.on; mixLabel = null;
    if (st.on) { if (st.vol < 0.05) st.vol = 0.5; playing ? startSound(id) : setPlaying(true); }
    else { if (playing) stopSound(id); if (!anyOn() && playing) setPlaying(false); }
    render(id); saveCurrent(); updateMeta(); syncScene();
  }

  function render(id) {
    const st = state[id], el = tile(id), r = el.querySelector("input"), def = SOUNDS.find(s => s.id === id);
    el.querySelector(".snd-name").textContent = nameOf(def);
    r.setAttribute("aria-label", nameOf(def));
    el.classList.toggle("on", st.on);
    el.querySelector(".snd-btn").setAttribute("aria-pressed", st.on);
    r.value = st.vol; setP(r);
  }

  let mixLabel = store.get("mixLabel", null);
  function applyMix(mix, label, start = true) {
    SOUNDS.forEach(s => {
      const st = state[s.id], v = mix[s.id], was = st.on;
      st.on = v > 0; if (v > 0) st.vol = v;
      if (playing) {
        if (st.on && !was) startSound(s.id);
        else if (!st.on && was) stopSound(s.id, 1.2);
        else if (st.gain) st.gain.gain.setTargetAtTime(curve(st.vol), ctx.currentTime, 0.4);
      }
      render(s.id);
    });
    mixLabel = label || null; saveCurrent();
    if (start && !playing) setPlaying(true); else { updateMeta(); syncScene(); }
  }
  const currentMix = () => Object.fromEntries(SOUNDS.filter(s => state[s.id].on).map(s => [s.id, state[s.id].vol]));
  // built-in mixes are stored as "p:<index>" so the name follows the language
  const labelText = () => mixLabel?.startsWith("p:") ? nameOf(BUILTIN_PRESETS[+mixLabel.slice(2)]) : mixLabel;
  const saveCurrent = () => { store.set("mix", currentMix()); store.set("mixLabel", mixLabel); };

  function updateMeta() {
    const on = SOUNDS.filter(s => state[s.id].on);
    $("#mixName").textContent = on.length ? (labelText() || t("yourMix")) : t("sounds");
    $("#mixSub").textContent = on.length ? on.map(nameOf).join(" · ") : t("tap");
  }
  function syncScene() {
    const lv = {};
    SOUNDS.forEach(s => (lv[s.id] = playing && state[s.id].on ? state[s.id].vol : 0));
    Scene.set(lv);
  }

  $("#playBtn").addEventListener("click", () => setPlaying(!playing));
  const mv = $("#masterVol");
  mv.value = store.get("master", 0.8); setP(mv);
  mv.addEventListener("input", () => { setP(mv); store.set("master", +mv.value); if (master) master.gain.setTargetAtTime(+mv.value, ctx.currentTime, 0.05); });

  /* ============================ MIXES ============================ */
  const mixesBtn = $("#mixesBtn"), mixesEl = $("#mixes");
  mixesBtn.addEventListener("click", () => {
    const open = mixesEl.hidden; mixesEl.hidden = !open; mixesBtn.setAttribute("aria-expanded", open);
  });
  function renderPresets() {
    const list = $("#presetList"); list.innerHTML = "";
    const user = store.get("presets", []);
    const add = (p, idx) => {
      const c = document.createElement("span"); c.className = "chip";
      const b = document.createElement("button"); b.textContent = nameOf(p);
      b.addEventListener("click", () => applyMix(p.mix, idx == null ? "p:" + BUILTIN_PRESETS.indexOf(p) : p.name));
      c.appendChild(b);
      if (idx != null) {
        const x = document.createElement("button"); x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Delete " + p.name);
        x.addEventListener("click", () => { user.splice(idx, 1); store.set("presets", user); renderPresets(); });
        c.appendChild(x);
      }
      list.appendChild(c);
    };
    BUILTIN_PRESETS.forEach(p => add(p));
    user.forEach((p, i) => add(p, i));
  }
  $("#saveForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#presetName").value.trim(), mix = currentMix();
    if (!Object.keys(mix).length) return toast(t("turnOn"));
    if (!name) return $("#presetName").focus();
    const user = store.get("presets", []); user.push({ name, mix }); store.set("presets", user);
    $("#presetName").value = ""; mixLabel = name; saveCurrent(); updateMeta(); renderPresets(); toast(`${t("saved")}: ${name}`);
  });

  /* ============================ FOCUS SESSION ============================ */
  const BREAK = { 25: 5, 50: 10, 90: 15 };
  const F = { mode: "focus", len: store.get("len", 25), remaining: 0, endAt: 0, running: false, iv: null };
  F.remaining = F.len * 60;
  const focusEl = $(".focus"), clock = $("#clock"), focusBtn = $("#focusBtn"), resetBtn = $("#resetBtn");
  const intent = $("#intent");
  intent.value = store.get("intent", "");
  intent.addEventListener("input", () => store.set("intent", intent.value));
  intent.addEventListener("keydown", e => { if (e.key === "Enter") { intent.blur(); if (!F.running) focusBtn.click(); } });

  document.querySelectorAll("#lengths button").forEach(b => {
    b.setAttribute("aria-checked", +b.dataset.min === F.len);
    b.addEventListener("click", () => {
      if (F.running) return;
      F.len = +b.dataset.min; store.set("len", F.len);
      document.querySelectorAll("#lengths button").forEach(x => x.setAttribute("aria-checked", x === b));
      F.mode = "focus"; F.remaining = F.len * 60; paint();
    });
  });

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function paint() {
    const total = (F.mode === "focus" ? F.len : BREAK[F.len]) * 60;
    clock.textContent = fmt(F.remaining);
    $("#ringFill").style.width = (1 - F.remaining / total) * 100 + "%";
    $("#modeLabel").textContent = t(F.mode === "focus" ? "focus" : "break");
    $("#modeLabel").classList.toggle("break", F.mode === "break");
    focusBtn.textContent = t(F.running ? "pause" : F.remaining < total ? "resume" : F.mode === "focus" ? "start" : "startBreak");
    resetBtn.hidden = !(F.running || F.remaining < total || F.mode === "break");
    focusEl.classList.toggle("running", F.running || F.remaining < total);
    document.title = F.running ? `${fmt(F.remaining)} · ${F.mode === "focus" ? (intent.value || t("focus")) : t("break").split(" · ")[0]}` : t("title");
  }
  function startTimer() {
    F.running = true; F.endAt = Date.now() + F.remaining * 1000;
    clearInterval(F.iv); F.iv = setInterval(tick, 250);
    if (F.mode === "focus" && !playing && !quranActive()) setPlaying(true);
    paint();
  }
  function pauseTimer() { F.running = false; clearInterval(F.iv); F.remaining = Math.max(0, Math.round((F.endAt - Date.now()) / 1000)); paint(); }
  function tick() {
    F.remaining = Math.max(0, Math.round((F.endAt - Date.now()) / 1000));
    if (F.remaining === 0) complete(); else paint();
  }
  function complete() {
    clearInterval(F.iv); F.running = false; chime();
    if (F.mode === "focus") {
      logMinutes(F.len);
      F.mode = "break"; F.remaining = BREAK[F.len] * 60;
      toast(t("done")); notify(t("nTitleDone"), t("nBodyDone"));
      startTimer();
    } else {
      F.mode = "focus"; F.remaining = F.len * 60;
      toast(t("breakOver")); notify(t("nTitleBreak"), t("nBodyBreak"));
      paint();
    }
  }
  focusBtn.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    F.running ? pauseTimer() : startTimer();
  });
  resetBtn.addEventListener("click", () => { clearInterval(F.iv); F.running = false; F.mode = "focus"; F.remaining = F.len * 60; paint(); });

  function chime() {
    ensureCtx();
    const t = ctx.currentTime;
    [[528, 0], [792, 0.18], [660, 0.36]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 2.2);
      o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 2.3);
    });
  }
  function notify(title, body) {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body, icon: "brand/icon-192.png", silent: true }); } catch {}
    }
  }

  /* ---- stats: minutes today + day streak (stored only in this browser) ---- */
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  function logMinutes(m) { const log = store.get("log", {}); log[dayKey()] = (log[dayKey()] || 0) + m; store.set("log", log); paintStats(); }
  function paintStats() {
    const log = store.get("log", {}), today = log[dayKey()] || 0;
    let streak = 0; const d = new Date();
    if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (log[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
    const h = Math.floor(today / 60), m = today % 60;
    $("#stats").innerHTML = today || streak
      ? (LANG === "bn"
        ? `${t("today")} <b>${h ? h + t("h") + " " : ""}${m}${t("m")}</b>${streak > 1 ? ` · <b>${streak}</b> ${t("streak")}` : ""}`
        : `<b>${h ? h + "h " : ""}${m}m</b> today${streak > 1 ? ` · <b>${streak}</b> day streak` : ""}`) : "";
  }

  /* ============================ QURAN ============================ */
  const qAudio = $("#qAudio"), surahSel = $("#surahSel"), recSel = $("#reciterSel");
  const qUnder = $("#qUnder"), qUnderLvl = $("#qUnderLvl");
  SURAHS.forEach((n, i) => surahSel.add(new Option(`${i + 1}. ${n}`, i + 1)));
  RECITERS.forEach((r, i) => recSel.add(new Option(r.name, i)));
  surahSel.value = store.get("surah", 1); recSel.value = store.get("reciter", 0);
  qUnder.checked = store.get("qUnder", true);
  qUnderLvl.value = store.get("qUnderLvl", 0.3); setP(qUnderLvl);
  $("#qUnderLvlWrap").hidden = !qUnder.checked;

  const quranActive = () => !qAudio.paused && !qAudio.ended;
  const pad3 = n => String(n).padStart(3, "0");
  const qStatus = t => ($("#qStatus").textContent = t || "");

  function loadSurah(autoplay) {
    const s = +surahSel.value, r = RECITERS[+recSel.value];
    store.set("surah", s); store.set("reciter", +recSel.value);
    qAudio.src = `${QURAN_BASE}${r.path}/${pad3(s)}.mp3`;
    const seek = $("#qSeek"); seek.value = 0; setP(seek);
    $("#qCur").textContent = $("#qDur").textContent = "0:00";
    $("#qminiTitle").textContent = `Surah ${SURAHS[s - 1]} · ${r.name}`;
    $("#qmini").hidden = false;
    if (autoplay) playQuran();
  }
  function playQuran() {
    if (!qAudio.getAttribute("src")) loadSurah(false);
    ensureCtx();
    if (playing && !qUnder.checked) setPlaying(false);
    qStatus(t("loading"));
    qAudio.play().catch(err => { if (err.name !== "AbortError") qStatus(t("errPlay")); });
  }
  function pauseQuran() { if (quranActive()) qAudio.pause(); }

  $("#qPlay").addEventListener("click", () => (quranActive() ? pauseQuran() : playQuran()));
  $("#qminiToggle").addEventListener("click", () => (quranActive() ? pauseQuran() : playQuran()));
  $("#qPrev").addEventListener("click", () => { surahSel.value = Math.max(1, +surahSel.value - 1); loadSurah(quranActive()); });
  $("#qNext").addEventListener("click", () => { surahSel.value = Math.min(114, +surahSel.value + 1); loadSurah(quranActive()); });
  surahSel.addEventListener("change", () => loadSurah(quranActive()));
  recSel.addEventListener("change", () => loadSurah(quranActive()));

  qUnder.addEventListener("change", () => {
    store.set("qUnder", qUnder.checked); $("#qUnderLvlWrap").hidden = !qUnder.checked;
    if (quranActive() && !qUnder.checked && playing) setPlaying(false);
    applyDuck();
  });
  qUnderLvl.addEventListener("input", () => { setP(qUnderLvl); store.set("qUnderLvl", +qUnderLvl.value); applyDuck(); });

  const qState = () => {
    document.body.classList.toggle("q-playing", quranActive());
    $("#qPlay").setAttribute("aria-label", quranActive() ? "Pause recitation" : "Play recitation");
    $("#qminiToggle").setAttribute("aria-label", quranActive() ? "Pause recitation" : "Play recitation");
    applyDuck();
  };
  qAudio.addEventListener("play", () => { keepAlive.play().catch(() => {}); qState(); });
  qAudio.addEventListener("playing", () => qStatus(""));
  qAudio.addEventListener("waiting", () => qStatus(t("buffering")));
  qAudio.addEventListener("pause", () => { qState(); if (!playing) keepAlive.pause(); });
  qAudio.addEventListener("error", () => { qState(); if (qAudio.getAttribute("src")) qStatus(t("errLoad")); });
  qAudio.addEventListener("loadedmetadata", () => ($("#qDur").textContent = fmt(qAudio.duration)));
  qAudio.addEventListener("timeupdate", () => {
    $("#qCur").textContent = fmt(qAudio.currentTime);
    if (qAudio.duration) { const s = $("#qSeek"); s.value = qAudio.currentTime / qAudio.duration * 100; setP(s); }
  });
  $("#qSeek").addEventListener("input", e => { setP(e.target); if (qAudio.duration) qAudio.currentTime = e.target.value / 100 * qAudio.duration; });
  qAudio.addEventListener("ended", () => {
    if ($("#qRepeat").checked) { qAudio.currentTime = 0; qAudio.play(); }
    else if ($("#qAuto").checked && +surahSel.value < 114) { surahSel.value = +surahSel.value + 1; loadSurah(true); }
    else qState();
  });
  $("#qRepeat").addEventListener("change", e => e.target.checked && ($("#qAuto").checked = false));
  $("#qAuto").addEventListener("change", e => e.target.checked && ($("#qRepeat").checked = false));

  // sheet open/close
  const sheet = $("#quranSheet"), backdrop = $("#sheetBackdrop");
  let lastFocus = null;
  function openSheet() { lastFocus = document.activeElement; sheet.hidden = backdrop.hidden = false; $("#quranOpen").setAttribute("aria-expanded", true); $("#qPlay").focus(); }
  function closeSheet() { sheet.hidden = backdrop.hidden = true; $("#quranOpen").setAttribute("aria-expanded", false); lastFocus?.focus(); }
  $("#quranOpen").addEventListener("click", openSheet);
  $("#qminiTitle").addEventListener("click", openSheet);
  $("#quranClose").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !sheet.hidden) return closeSheet();
    if (e.code !== "Space" || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
    e.preventDefault();
    if (!sheet.hidden) $("#qPlay").click(); else setPlaying(!playing);
  });

  /* ============================ MEDIA SESSION ============================ */
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => (qAudio.getAttribute("src") && !playing ? playQuran() : setPlaying(true)));
    ms.setActionHandler("pause", () => { pauseQuran(); if (playing) setPlaying(false); });
    ms.setActionHandler("nexttrack", () => $("#qNext").click());
    ms.setActionHandler("previoustrack", () => $("#qPrev").click());
    const meta = () => {
      const s = +surahSel.value;
      ms.metadata = new MediaMetadata(quranActive()
        ? { title: `Surah ${SURAHS[s - 1]}`, artist: RECITERS[+recSel.value].name, album: "Al-Qur'an" }
        : { title: labelText() || "FocusWaves", artist: "FocusWaves · Freaking Waves" });
    };
    qAudio.addEventListener("play", meta); document.addEventListener("click", meta);
  }

  /* ============================ TOAST ============================ */
  let toastT;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3000);
  }

  /* ============================ LANGUAGE ============================ */
  $("#langBtn").addEventListener("click", () => {
    LANG = LANG === "bn" ? "en" : "bn";
    try { localStorage.setItem("fw:lang", LANG); } catch {}
    applyI18n(); SOUNDS.forEach(s => render(s.id)); renderPresets(); updateMeta(); paint(); paintStats();
    $("#playBtn").setAttribute("aria-label", t(playing ? "pauseSounds" : "play"));
  });

  /* ============================ INIT ============================ */
  applyI18n();
  const saved = store.get("mix", null);
  SOUNDS.forEach(s => { if (saved && saved[s.id]) Object.assign(state[s.id], { on: true, vol: saved[s.id] }); render(s.id); });
  renderPresets(); updateMeta(); paint(); paintStats(); syncScene();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
})();
