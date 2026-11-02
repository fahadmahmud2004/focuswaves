(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fw:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fw:" + k, JSON.stringify(v)); } catch {} },
  };
  const setP = el => el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* ============================ STATE ============================ */
  const state = Object.fromEntries(SOUNDS.map(s => [s.id, { on: false, vol: 0.5 }]));
  let playing = false, started = false, activeMix = null;   // activeMix: preset id, or "u:<name>"
  const anyOn = () => SOUNDS.some(s => state[s.id].on);
  const currentMix = () => Object.fromEntries(SOUNDS.filter(s => state[s.id].on).map(s => [s.id, +state[s.id].vol.toFixed(2)]));

  function sync() {
    const vol = {}, lv = {};
    for (const s of SOUNDS) { const st = state[s.id], v = st.on ? st.vol : 0; vol[s.id] = playing ? v * v : 0; lv[s.id] = playing || !started ? v : 0; }
    Audio_.setVolumes(vol); Scene.set(lv);
    store.set("mix", currentMix()); store.set("activeMix", activeMix);
    updateTitle(); renderMixCards(false);
  }

  /* iOS: Web Audio goes quiet with the silent switch on and stops on lock; a silent <audio> keeps the page a media page */
  const keepAlive = (() => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" }))); a.loop = true; a.setAttribute("playsinline", ""); a.volume = 0.01; return a;
  })();

  let suspendT;
  function setPlaying(on) {
    if (on && !anyOn()) applyMix(MIXES[0].mix, MIXES[0].id, false);
    if (on && quranActive() && !qUnder.checked) pauseQuran();
    playing = on; clearTimeout(suspendT);
    if (on) { Audio_.resume(); Audio_.setMaster(+mv.value); keepAlive.play().catch(() => {}); }
    else suspendT = setTimeout(() => { if (!playing && !quranActive()) { Audio_.suspend(); keepAlive.pause(); } }, 1600);
    document.body.classList.toggle("is-playing", on);
    $("#playBtn").setAttribute("aria-label", t(on ? "pauseSounds" : "play"));
    sync(); mediaMeta();
  }

  /* ============================ FADERS ============================ */
  const faders = $("#faders"), fd = id => faders.querySelector(`[data-id="${id}"]`);
  SOUNDS.forEach(s => {
    const el = document.createElement("div");
    el.className = "fd"; el.dataset.id = s.id;
    el.innerHTML = `<button class="fd-ico" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.id]}</svg></button>
      <div class="fd-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><div class="fd-fill"></div></div>
      <span class="fd-name"></span>`;
    faders.appendChild(el);
    el.querySelector(".fd-ico").addEventListener("click", () => toggle(s.id));
    const tr = el.querySelector(".fd-track");
    const setFrom = e => {
      const r = tr.getBoundingClientRect(), v = Math.round(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) * 50) / 50;
      setVol(s.id, v);
    };
    tr.addEventListener("pointerdown", e => { tr.setPointerCapture(e.pointerId); setFrom(e); tr.onpointermove = setFrom; });
    tr.addEventListener("pointerup", () => (tr.onpointermove = null));
    tr.addEventListener("pointercancel", () => (tr.onpointermove = null));
    tr.addEventListener("keydown", e => {
      const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
      if (d != null) { e.preventDefault(); setVol(s.id, Math.min(1, Math.max(0, state[s.id].vol + d))); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(s.id); }
    });
  });
  function paintFader(id) {
    const st = state[id], el = fd(id), def = SOUNDS.find(s => s.id === id);
    el.classList.toggle("on", st.on);
    el.querySelector(".fd-ico").setAttribute("aria-pressed", st.on);
    el.querySelector(".fd-ico").setAttribute("aria-label", nameOf(def));
    el.querySelector(".fd-fill").style.height = st.vol * 100 + "%";
    const tr = el.querySelector(".fd-track");
    tr.setAttribute("aria-valuenow", Math.round(st.vol * 100)); tr.setAttribute("aria-label", nameOf(def));
    el.querySelector(".fd-name").textContent = nameOf(def);
  }
  function toggle(id) {
    const st = state[id]; st.on = !st.on; activeMix = null;
    if (st.on && st.vol < 0.06) st.vol = 0.5;
    paintFader(id);
    if (st.on && !playing && started) setPlaying(true);
    else if (!anyOn() && playing) setPlaying(false);
    else sync();
  }
  function setVol(id, v) {
    const st = state[id]; st.vol = v; activeMix = null;
    if (v > 0 && !st.on) { st.on = true; if (!playing && started) { paintFader(id); return setPlaying(true); } }
    if (v === 0 && st.on) st.on = false;
    paintFader(id); sync();
  }
  function applyMix(mix, id, start = true) {
    for (const s of SOUNDS) { const v = mix[s.id]; state[s.id].on = v > 0; if (v > 0) state[s.id].vol = v; paintFader(s.id); }
    activeMix = id || null;
    if (start && started && !playing) setPlaying(true); else sync();
  }

  /* ============================ MIXES ============================ */
  const mixLabel = () => {
    if (!activeMix) return null;
    if (activeMix.startsWith("u:")) return activeMix.slice(2);
    const m = MIXES.find(m => m.id === activeMix); return m ? nameOf(m) : null;
  };
  function updateTitle() {
    const on = SOUNDS.filter(s => state[s.id].on);
    $("#mixName").textContent = on.length ? (mixLabel() || t("yourMix")) : t("sounds");
    $("#mixSub").textContent = !on.length ? t("tap") : on.map(nameOf).join(" · ");
  }
  let cardsKey = "";
  function renderMixCards(force = true) {
    const user = store.get("presets", []), key = LANG + activeMix + user.length;
    if (!force && key === cardsKey) return; cardsKey = key;
    const box = $("#mixCards"); box.innerHTML = "";
    const card = (name, note, mix, id, del) => {
      const b = document.createElement("button"); b.className = "mcard" + (activeMix === id ? " active" : "");
      b.innerHTML = `<b></b><span></span><div class="ico">${Object.keys(mix).slice(0, 4).map(k => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`).join("")}</div>`;
      b.querySelector("b").textContent = name; b.querySelector("span").textContent = note;
      b.addEventListener("click", e => { if (e.target.closest(".x")) return; applyMix(mix, id); });
      if (del) { const x = document.createElement("span"); x.className = "x"; x.setAttribute("role", "button"); x.setAttribute("aria-label", "Delete " + name); x.textContent = "×"; x.addEventListener("click", del); b.appendChild(x); }
      box.appendChild(b);
    };
    MIXES.forEach(m => card(nameOf(m), LANG === "bn" ? m.noteBn : m.note, m.mix, m.id));
    user.forEach((u, i) => card(u.name, Object.keys(u.mix).map(k => nameOf(SOUNDS.find(s => s.id === k))).join(" · "), u.mix, "u:" + u.name,
      () => { user.splice(i, 1); store.set("presets", user); if (activeMix === "u:" + u.name) activeMix = null; renderMixCards(); updateTitle(); }));
  }
  const mixesBtn = $("#mixesBtn"), mixesEl = $("#mixes");
  mixesBtn.addEventListener("click", () => { const open = mixesEl.hidden; mixesEl.hidden = !open; mixesBtn.setAttribute("aria-expanded", open); if (open) renderMixCards(); });
  $("#saveForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#presetName").value.trim(), mix = currentMix();
    if (!Object.keys(mix).length) return toast(t("turnOn"));
    if (!name) return $("#presetName").focus();
    const user = store.get("presets", []).filter(u => u.name !== name); user.push({ name, mix }); store.set("presets", user);
    $("#presetName").value = ""; activeMix = "u:" + name; renderMixCards(); sync(); toast(`${t("saved")}: ${name}`);
  });
  // share: the mix travels in the link, e.g. focus.freakingwaves.com/#mix=rain-60.waves-30
  const encodeMix = m => Object.entries(m).map(([k, v]) => `${k}-${Math.round(v * 100)}`).join(".");
  function decodeMix(h) {
    const m = /mix=([\w.-]+)/.exec(h); if (!m) return null;
    const out = {}; m[1].split(".").forEach(p => { const [k, v] = p.split("-"); if (state[k] && +v > 0) out[k] = Math.min(100, +v) / 100; });
    return Object.keys(out).length ? out : null;
  }
  $("#shareBtn").addEventListener("click", async () => {
    const mix = currentMix(); if (!Object.keys(mix).length) return toast(t("turnOn"));
    const url = `${location.origin}${location.pathname}#mix=${encodeMix(mix)}`;
    try { await navigator.clipboard.writeText(url); }
    catch { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
    toast(t("copied"));
  });

  /* ============================ PLAY / MASTER ============================ */
  $("#playBtn").addEventListener("click", () => setPlaying(!playing));
  const mv = $("#masterVol"); mv.value = store.get("master", 0.8); setP(mv);
  mv.addEventListener("input", () => { setP(mv); store.set("master", +mv.value); Audio_.setMaster(+mv.value); });

  /* ============================ FOCUS SESSIONS ============================ */
  const SHORT = { 25: 5, 50: 10, 90: 15 }, LONG = { 25: 15, 50: 20, 90: 25 };
  const F = { mode: "focus", len: store.get("len", 25), remaining: 0, endAt: 0, running: false, iv: null, done: store.get("cycle", 0) };
  if (!SHORT[F.len]) F.len = 25;
  F.remaining = F.len * 60;
  const focusEl = $("#focus"), clock = $("#clock"), focusBtn = $("#focusBtn"), resetBtn = $("#resetBtn"), intent = $("#intent");
  intent.value = store.get("intent", "");
  intent.addEventListener("input", () => store.set("intent", intent.value));
  intent.addEventListener("keydown", e => { if (e.key === "Enter") { intent.blur(); if (!F.running) focusBtn.click(); } });
  $$("#lengths button").forEach(b => {
    b.setAttribute("aria-checked", +b.dataset.min === F.len);
    b.addEventListener("click", () => {
      if (F.running) return;
      F.len = +b.dataset.min; store.set("len", F.len);
      $$("#lengths button").forEach(x => x.setAttribute("aria-checked", x === b));
      F.mode = "focus"; F.remaining = F.len * 60; paint();
    });
  });
  const total = () => (F.mode === "focus" ? F.len : F.mode === "long" ? LONG[F.len] : SHORT[F.len]) * 60;
  function paint() {
    const T = total();
    clock.textContent = fmt(F.remaining);
    $("#progFill").style.width = (1 - F.remaining / T) * 100 + "%";
    const ml = $("#modeLabel");
    ml.textContent = F.mode === "focus" ? t("focus") : `${t(F.mode === "long" ? "longBreak" : "break")} · ${t("breakHint")}`;
    ml.classList.toggle("break", F.mode !== "focus"); focusEl.classList.toggle("break-mode", F.mode !== "focus");
    focusBtn.textContent = t(F.running ? "pause" : F.remaining < T ? "resume" : F.mode === "focus" ? "start" : "startBreak");
    resetBtn.hidden = !(F.running || F.remaining < T || F.mode !== "focus");
    focusEl.classList.toggle("running", F.running || F.remaining < T);
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
      logMinutes(F.len); F.done++;
      const long = F.done >= 4;
      F.mode = long ? "long" : "break"; F.remaining = total();
      toast(t(long ? "doneLong" : "done")); notify(t("nDone"), t("nDoneB"));
      if (long) F.done = 0;
      store.set("cycle", F.done); startTimer();
    } else {
      F.mode = "focus"; F.remaining = F.len * 60; lockWake(false);
      toast(t("breakOver")); notify(t("nBreak"), t("nBreakB")); paint();
    }
  }
  focusBtn.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    F.running ? pauseTimer() : startTimer();
  });
  resetBtn.addEventListener("click", () => { clearInterval(F.iv); F.running = false; F.mode = "focus"; F.remaining = F.len * 60; lockWake(false); unZen(); paint(); });
  function notify(title, body) { if (document.hidden && "Notification" in window && Notification.permission === "granted") try { new Notification(title, { body, icon: "brand/icon-192.png", silent: true }); } catch {} }

  /* ---- zen: while a focus session runs and you're not touching anything, the interface steps aside ---- */
  let zenT;
  const unZen = () => { clearTimeout(zenT); document.body.classList.remove("zen"); };
  function armZen() { unZen(); if (F.running && F.mode === "focus" && sheet.hidden && mixesEl.hidden) zenT = setTimeout(() => { if (document.activeElement !== intent) document.body.classList.add("zen"); }, 5000); }
  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => F.running && armZen(), { passive: true }));

  /* ---- stats (kept only in this browser) ---- */
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
  const qAudio = $("#qAudio"), surahSel = $("#surahSel"), recSel = $("#reciterSel"), qUnder = $("#qUnder"), qUnderLvl = $("#qUnderLvl");
  SURAHS.forEach((n, i) => surahSel.add(new Option(`${i + 1}. ${n}`, i + 1)));
  RECITERS.forEach((r, i) => recSel.add(new Option(r.name, i)));
  surahSel.value = store.get("surah", 1); recSel.value = store.get("reciter", 0);
  qUnder.checked = store.get("qUnder", true); qUnderLvl.value = store.get("qUnderLvl", 0.3); setP(qUnderLvl);
  $("#qUnderLvlWrap").hidden = !qUnder.checked;
  const quranActive = () => !qAudio.paused && !qAudio.ended;
  const qStatus = s => ($("#qStatus").textContent = s || "");
  let qSources = [], qSrcIdx = 0, qWantPlay = false, qBlocked = false, qTimer = null;
  document.addEventListener("securitypolicyviolation", e => { if (/quranicaudio|islamic\.network/.test(e.blockedURI)) { qBlocked = true; qStatus(t("errBlocked")); } });
  const applyDuck = () => Audio_.setDuck(quranActive() && qUnder.checked ? +qUnderLvl.value : 1);
  const armTimeout = () => { clearTimeout(qTimer); qTimer = setTimeout(() => qAudio.dispatchEvent(new Event("error")), 12000); };

  function loadSurah(autoplay) {
    const s = +surahSel.value, r = RECITERS[+recSel.value];
    store.set("surah", s); store.set("reciter", +recSel.value);
    qSources = quranSources(r, s); qSrcIdx = 0; qAudio.src = qSources[0];
    const seek = $("#qSeek"); seek.value = 0; setP(seek);
    $("#qCur").textContent = $("#qDur").textContent = "0:00";
    $("#qminiTitle").textContent = `${SURAHS[s - 1]} · ${r.name}`; $("#qmini").hidden = false;
    if (autoplay) playQuran();
  }
  async function playQuran() {
    if (!qAudio.getAttribute("src")) loadSurah(false);
    if (!started) await enter();
    if (playing && !qUnder.checked) setPlaying(false);
    Audio_.resume(); keepAlive.play().catch(() => {});
    qStatus(t("loading")); qWantPlay = true; armTimeout();
    qAudio.play().catch(err => { if (err.name === "NotAllowedError") qStatus(t("errPlay")); });
  }
  function pauseQuran() { qWantPlay = false; if (quranActive()) qAudio.pause(); }
  $("#qPlay").addEventListener("click", () => (quranActive() ? pauseQuran() : playQuran()));
  $("#qminiToggle").addEventListener("click", () => (quranActive() ? pauseQuran() : playQuran()));
  $("#qPrev").addEventListener("click", () => { surahSel.value = Math.max(1, +surahSel.value - 1); loadSurah(quranActive()); });
  $("#qNext").addEventListener("click", () => { surahSel.value = Math.min(114, +surahSel.value + 1); loadSurah(quranActive()); });
  surahSel.addEventListener("change", () => loadSurah(quranActive()));
  recSel.addEventListener("change", () => loadSurah(quranActive()));
  qUnder.addEventListener("change", () => { store.set("qUnder", qUnder.checked); $("#qUnderLvlWrap").hidden = !qUnder.checked; if (quranActive() && !qUnder.checked && playing) setPlaying(false); applyDuck(); });
  qUnderLvl.addEventListener("input", () => { setP(qUnderLvl); store.set("qUnderLvl", +qUnderLvl.value); applyDuck(); });
  const qState = () => {
    document.body.classList.toggle("q-playing", quranActive());
    ["#qPlay", "#qminiToggle"].forEach(s => $(s).setAttribute("aria-label", t("playQ")));
    applyDuck(); mediaMeta();
  };
  qAudio.addEventListener("play", qState);
  qAudio.addEventListener("playing", () => { qStatus(""); clearTimeout(qTimer); });
  qAudio.addEventListener("waiting", () => qStatus(t("buffering")));
  qAudio.addEventListener("pause", () => { qState(); if (!playing) keepAlive.pause(); });
  qAudio.addEventListener("loadstart", () => qWantPlay && armTimeout());
  qAudio.addEventListener("canplay", () => clearTimeout(qTimer));
  qAudio.addEventListener("error", () => {
    clearTimeout(qTimer);
    if (!qAudio.getAttribute("src") || qAudio.readyState >= 3) return;
    if (qSrcIdx < qSources.length - 1) { qAudio.src = qSources[++qSrcIdx]; if (qWantPlay) { armTimeout(); qAudio.play().catch(() => {}); } return; }
    qState(); qStatus(t(qBlocked ? "errBlocked" : "errLoad"));
  });
  qAudio.addEventListener("loadedmetadata", () => ($("#qDur").textContent = fmt(qAudio.duration)));
  qAudio.addEventListener("timeupdate", () => { $("#qCur").textContent = fmt(qAudio.currentTime); if (qAudio.duration) { const s = $("#qSeek"); s.value = qAudio.currentTime / qAudio.duration * 100; setP(s); } });
  $("#qSeek").addEventListener("input", e => { setP(e.target); if (qAudio.duration) qAudio.currentTime = e.target.value / 100 * qAudio.duration; });
  qAudio.addEventListener("ended", () => {
    if ($("#qRepeat").checked) { qAudio.currentTime = 0; qAudio.play(); }
    else if ($("#qAuto").checked && +surahSel.value < 114) { surahSel.value = +surahSel.value + 1; loadSurah(true); }
    else qState();
  });
  $("#qRepeat").addEventListener("change", e => e.target.checked && ($("#qAuto").checked = false));
  $("#qAuto").addEventListener("change", e => e.target.checked && ($("#qRepeat").checked = false));

  const sheet = $("#quranSheet"), backdrop = $("#sheetBackdrop"); let lastFocus = null;
  function openSheet() { lastFocus = document.activeElement; unZen(); sheet.hidden = backdrop.hidden = false; $("#qPlay").focus(); }
  function closeSheet() { sheet.hidden = backdrop.hidden = true; lastFocus?.focus(); armZen(); }
  $("#quranOpen").addEventListener("click", openSheet); $("#qminiTitle").addEventListener("click", openSheet);
  $("#quranClose").addEventListener("click", closeSheet); backdrop.addEventListener("click", closeSheet);

  /* ============================ CHROME ============================ */
  $("#fsBtn").addEventListener("click", toggleFs);
  function toggleFs() { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} }
  if (!document.documentElement.requestFullscreen) $("#fsBtn").hidden = true;

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (!sheet.hidden) return closeSheet(); if (!mixesEl.hidden) return mixesBtn.click(); }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!started && (e.key === "Enter" || e.code === "Space") && e.target.tagName !== "BUTTON") { e.preventDefault(); return enter(); }
    if (e.code === "Space" && e.target.tagName !== "BUTTON" && !e.target.classList.contains("fd-track")) { e.preventDefault(); !sheet.hidden ? $("#qPlay").click() : setPlaying(!playing); }
    else if (e.key === "f") toggleFs();
  });

  function setLang() {
    LANG = LANG === "en" ? "bn" : "en"; try { localStorage.setItem("fw:lang", LANG); } catch {}
    applyI18n(); SOUNDS.forEach(s => paintFader(s.id)); renderMixCards(); updateTitle(); paint(); paintStats(); sharedNote();
    $("#playBtn").setAttribute("aria-label", t(playing ? "pauseSounds" : "play"));
  }
  $("#langBtn").addEventListener("click", setLang); $("#introLang").addEventListener("click", setLang);

  function mediaMeta() {
    if (!("mediaSession" in navigator)) return;
    const s = +surahSel.value;
    navigator.mediaSession.metadata = new MediaMetadata(quranActive()
      ? { title: `Surah ${SURAHS[s - 1]}`, artist: RECITERS[+recSel.value].name, album: "FocusWaves", artwork: [{ src: "brand/icon-512.png", sizes: "512x512" }] }
      : { title: mixLabel() || t("yourMix"), artist: "FocusWaves", artwork: [{ src: "brand/icon-512.png", sizes: "512x512" }] });
  }
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => (qAudio.getAttribute("src") && !playing ? playQuran() : setPlaying(true)));
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
  function sharedNote() {
    const n = $("#introShared");
    if (!shared) return;
    n.hidden = false; n.textContent = t("sharedMix") + Object.keys(shared).map(k => nameOf(SOUNDS.find(s => s.id === k))).join(", ");
  }
  async function enter() {
    if (started) return;
    started = true;
    try { await Audio_.init(); } catch (err) { console.error(err); toast(t("noAudio")); }
    Audio_.onEvent(Scene.event);
    $("#intro").classList.add("gone"); document.body.classList.remove("pre");
    if (shared) { applyMix(shared, null, false); history.replaceState(null, "", location.pathname); toast(t("sharedLoaded")); }
    setPlaying(true);
  }
  $("#beginBtn").addEventListener("click", enter);

  /* ============================ INIT ============================ */
  applyI18n();
  const saved = store.get("mix", null);
  if (shared) applyMix(shared, null, false);
  else if (saved && Object.keys(saved).length) { applyMix(saved, store.get("activeMix", null), false); }
  else applyMix(MIXES[0].mix, MIXES[0].id, false);
  SOUNDS.forEach(s => paintFader(s.id));
  updateTitle(); paint(); paintStats(); sharedNote(); sync();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
})();
