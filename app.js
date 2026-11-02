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

  function sync() {
    const vol = {}, lv = {};
    for (const s of SOUNDS) { const st = state[s.id], v = st.on ? st.vol : 0; vol[s.id] = playing ? v * v : 0; lv[s.id] = playing || !started ? v : 0; }
    Audio_.setVolumes(vol); Scene.set(lv);
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

  let suspendT;
  function setPlaying(on) {
    if (on && !anyOn()) applyMix(MIXES[0].mix, MIXES[0].id, false);
    playing = on; clearTimeout(suspendT);
    if (on) { Audio_.resume(); Audio_.setMaster(+mv.value); keepAlive.play().catch(() => {}); }
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
  $("#clock").addEventListener("click", () => openPanel("timer"));

  /* ============================ SOUNDS PANEL ============================ */
  const groupsEl = $("#soundGroups"), tileOf = id => groupsEl.querySelector(`[data-id="${id}"]`);
  function buildSounds() {
    groupsEl.innerHTML = "";
    for (const g of GROUPS) {
      const sec = document.createElement("div"); sec.className = "group";
      sec.innerHTML = `<h3></h3><div class="tiles"></div>`; sec.querySelector("h3").textContent = nameOf(g);
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
    paintTile(id);
    if (st.on && !playing && started) setPlaying(true); else if (!anyOn() && playing) setPlaying(false); else sync();
  }
  function setVol(id, v) {
    const st = state[id]; st.vol = v; activeMix = null;
    if (v === 0 && st.on) { st.on = false; }
    paintTile(id); sync();
  }
  function applyMix(mix, id, start = true) {
    for (const s of SOUNDS) { const v = mix[s.id]; state[s.id].on = v > 0; if (v > 0) state[s.id].vol = v; paintTile(s.id); }
    activeMix = id || null;
    if (start && started && !playing) setPlaying(true); else sync();
  }
  $("#clearBtn").addEventListener("click", () => { SOUNDS.forEach(s => { state[s.id].on = false; paintTile(s.id); }); activeMix = null; if (playing) setPlaying(false); else sync(); });

  const mv = $("#masterVol"); mv.value = store.get("master", 0.8); setP(mv);
  mv.addEventListener("input", () => { setP(mv); store.set("master", +mv.value); Audio_.setMaster(+mv.value); });
  let space = store.get("space", 1);
  const paintSpace = () => $$("#spaceSeg button").forEach(b => b.setAttribute("aria-checked", +b.dataset.v === space));
  $$("#spaceSeg button").forEach(b => b.addEventListener("click", () => { space = +b.dataset.v; store.set("space", space); paintSpace(); Audio_.setSpace(space); }));
  paintSpace();
  $("#playBtn").addEventListener("click", () => setPlaying(!playing));

  /* ============================ MIXES ============================ */
  let mixFilter = "all";
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
    const cats = [["all", "all"], ["nature", "nature"], ["music", "music"], ["focus", "focusCat"]];
    if (userMixes().length) cats.push(["yours", "yours"]);
    const f = $("#mixFilters"); f.innerHTML = "";
    cats.forEach(([id, key]) => { const b = document.createElement("button"); b.textContent = t(key); b.setAttribute("aria-pressed", mixFilter === id); b.onclick = () => { mixFilter = id; renderMixes(); }; f.appendChild(b); });
    const grid = $("#mixGrid"); grid.innerHTML = "";
    const card = (name, note, mix, art, id, del) => {
      const c = document.createElement("button"); c.className = "mcard"; c.dataset.id = id;
      c.innerHTML = `<div class="m-art"><div class="ico">${Object.keys(mix).slice(0, 4).map(k => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`).join("")}</div></div><div class="m-body"><b></b><span></span></div>`;
      c.querySelector(".m-art").style.background = artCss(art);
      c.querySelector("b").textContent = name; c.querySelector(".m-body span").textContent = note;
      c.addEventListener("click", e => { if (e.target.closest(".x")) return; applyMix(mix, id); markActiveMix(); });
      if (del) { const x = document.createElement("span"); x.className = "x"; x.setAttribute("role", "button"); x.setAttribute("aria-label", "Delete " + name); x.textContent = "×"; x.onclick = del; c.appendChild(x); }
      grid.appendChild(c);
    };
    if (mixFilter !== "yours") MIXES.filter(m => mixFilter === "all" || m.cat === mixFilter).forEach(m => card(nameOf(m), LANG === "bn" ? m.noteBn : m.note, m.mix, m.art, m.id));
    if (mixFilter === "all" || mixFilter === "yours") userMixes().forEach((u, i) => card(u.name, Object.keys(u.mix).map(k => nameOf(soundById(k))).join(" · "), u.mix, artOf(u), "u:" + u.name,
      () => { const all = userMixes(); all.splice(i, 1); store.set("presets", all); if (activeMix === "u:" + u.name) activeMix = null; if (!all.length) mixFilter = "all"; renderMixes(); paintDockMix(); }));
    markActiveMix();
  }
  const markActiveMix = () => $$("#mixGrid .mcard").forEach(c => c.classList.toggle("active", c.dataset.id === activeMix));
  $("#saveForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#presetName").value.trim(), mix = currentMix();
    if (!Object.keys(mix).length) return toast(t("turnOn"));
    if (!name) return $("#presetName").focus();
    const base = MIXES.find(m => m.id === activeMix);
    const all = userMixes().filter(u => u.name !== name); all.push({ name, mix, art: base ? base.art : null }); store.set("presets", all);
    $("#presetName").value = ""; activeMix = "u:" + name; renderMixes(); sync(); toast(`${t("saved")}: ${name}`);
  });
  const encodeMix = m => Object.entries(m).map(([k, v]) => `${k}-${Math.round(v * 100)}`).join(".");
  function decodeMix(h) {
    const m = /mix=([\w.-]+)/.exec(h); if (!m) return null;
    const out = {}; m[1].split(".").forEach(p => { const [k, v] = p.split("-"); if (state[k] && +v > 0) out[k] = Math.min(100, +v) / 100; });
    return Object.keys(out).length ? out : null;
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
  function buildOpts(elId, key, presets, max) {
    const box = $(elId); box.innerHTML = "";
    presets.forEach(v => { const b = document.createElement("button"); b.textContent = v; b.dataset.v = v; b.onclick = () => setLen(key, v); box.appendChild(b); });
    const inp = document.createElement("input"); inp.type = "number"; inp.min = 1; inp.max = max; inp.inputMode = "numeric"; inp.placeholder = "…"; inp.setAttribute("aria-label", t("custom"));
    inp.addEventListener("change", () => { const v = Math.round(+inp.value); if (v >= 1 && v <= max) setLen(key, v); });
    box.appendChild(inp);
    paintOpts(elId, key, presets);
  }
  function paintOpts(elId, key, presets) {
    const box = $(elId), v = T[key], isPreset = presets.includes(v);
    box.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.v === v));
    const inp = box.querySelector("input"); inp.classList.toggle("on", !isPreset); if (!isPreset) inp.value = v; else if (document.activeElement !== inp) inp.value = "";
  }
  const OPTS = [["#optFocus", "focus", [15, 25, 45, 60, 90], 240], ["#optShort", "short", [5, 10, 15], 60], ["#optLong", "long", [15, 20, 30], 90]];
  function setLen(key, v) {
    T[key] = v; saveT(); OPTS.forEach(o => paintOpts(o[0], o[1], o[2]));
    const affects = (key === "focus" && F.mode === "focus") || (key === "short" && F.mode === "break") || (key === "long" && F.mode === "long");
    if (affects && !F.running) { F.remaining = total(); paint(); }
  }
  const autoBreak = $("#autoBreak"); autoBreak.checked = T.auto; autoBreak.addEventListener("change", () => { T.auto = autoBreak.checked; saveT(); });

  const focusEl = $("#focus"), clock = $("#clock"), focusBtn = $("#focusBtn"), resetBtn = $("#resetBtn"), intent = $("#intent");
  intent.value = store.get("intent", "");
  intent.addEventListener("input", () => store.set("intent", intent.value));
  intent.addEventListener("keydown", e => { if (e.key === "Enter") { intent.blur(); if (!F.running) focusBtn.click(); } });
  function paint() {
    const TT = total();
    clock.textContent = fmt(F.remaining);
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
  focusBtn.addEventListener("click", () => { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); F.running ? pauseTimer() : startTimer(); });
  resetBtn.addEventListener("click", () => { clearInterval(F.iv); F.running = false; F.mode = "focus"; F.remaining = total(); lockWake(false); unZen(); paint(); });
  function notify(title, body) { if (document.hidden && "Notification" in window && Notification.permission === "granted") try { new Notification(title, { body, icon: "brand/icon-192.png", silent: true }); } catch {} }

  /* ---- zen (automatic, while focusing and idle) and hide (manual) ---- */
  let zenT, hintT;
  const unZen = () => { clearTimeout(zenT); document.body.classList.remove("zen"); };
  function armZen() { unZen(); if (F.running && F.mode === "focus" && !openName) zenT = setTimeout(() => { if (document.activeElement !== intent && !openName) document.body.classList.add("zen"); }, 5000); }
  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => F.running && !uiOff && armZen(), { passive: true }));
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
  qVol.value = store.get("qVol", 0.9); qNature.value = store.get("qNature", 0.35); qSoft.checked = store.get("qSoft", false);
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
    qStatus(t("loading")); qWant = true; armTimeout();
    cur.play().catch(err => { if (err.name === "NotAllowedError") qStatus(t("errPlay")); });
  }
  function pauseQuran() { qWant = false; [qA, qB].forEach(el => el.pause()); }
  const qState = () => {
    document.body.classList.toggle("q-playing", quranActive());
    applyDuck(); mediaMeta();
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
      qState(); qStatus(t(qBlocked ? "errBlocked" : "errLoad"));
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
    else if (e.key === "t") openPanel("timer");
  });

  function relabel() {
    applyI18n(); buildSounds(); OPTS.forEach(o => buildOpts(...o)); if (openName === "mixes") renderMixes();
    paintDockMix(); paint(); paintStats(); sharedNote(); applyQuranOut();
    $("#playBtn").setAttribute("aria-label", t(playing ? "pauseSounds" : "play"));
  }
  function setLang() { LANG = LANG === "en" ? "bn" : "en"; try { localStorage.setItem("fw:lang", LANG); } catch {} relabel(); }
  $("#langBtn").addEventListener("click", setLang); $("#introLang").addEventListener("click", setLang);

  function mediaMeta() {
    if (!("mediaSession" in navigator)) return;
    const s = +surahSel.value, art = [{ src: "brand/icon-512.png", sizes: "512x512" }];
    navigator.mediaSession.metadata = new MediaMetadata(quranActive()
      ? { title: `Surah ${SURAHS[s - 1]}`, artist: RECITERS[+recSel.value].name, album: "FocusWaves", artwork: art }
      : { title: mixLabel() || t("yourMix"), artist: "FocusWaves", artwork: art });
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
    $("#intro").classList.add("gone"); document.body.classList.remove("pre");
    if (shared) { applyMix(shared, null, false); history.replaceState(null, "", location.pathname); toast(t("sharedLoaded")); }
    setPlaying(true);
  }
  $("#beginBtn").addEventListener("click", enter);

  /* ============================ INIT ============================ */
  const saved = store.get("mix", null);
  relabel();
  if (shared) applyMix(shared, null, false);
  else if (saved && Object.keys(saved).length) applyMix(saved, store.get("activeMix", null), false);
  else applyMix(MIXES[0].mix, MIXES[0].id, false);
  if (cur && !cur.getAttribute("src")) { attempts = quranSources(RECITERS[+recSel.value], +surahSel.value).flatMap(url => [{ url, el: qA }, { url, el: qB }]); attemptIdx = 0; }
  F.remaining = total(); paint();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
})();
