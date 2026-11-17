/* =========================================================
   Your island. Every finished focus session grows one thing on a small island
   out in the sea: a bush, a coconut palm, a bamboo hut or a nouka, by how long
   the session was. Total time at sea unlocks a pier, a lighthouse and lanterns.
   Also: the Island panel (today, goal, what grows, stats), the card at the end
   of a session, the weekly review and the breathing guide during breaks.
   Everything stays in this browser, like the rest of the site.
   ========================================================= */
const Journey = (() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fw:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fw:" + k, JSON.stringify(v)); } catch {} },
  };
  const BN = "০১২৩৪৫৬৭৮৯", num = s => (LANG === "bn" ? String(s).replace(/\d/g, d => BN[d]) : String(s));
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const dur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60;
    return num(LANG === "bn" ? (h ? `${h} ঘ ${r} মি` : `${r} মি`) : (h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`)); };
  const hourName = h => LANG === "bn" ? num(`${h % 12 || 12}টা`) : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- what grows ---------- */
  const KINDS = [{ k: "bush", from: 1 }, { k: "palm", from: 20 }, { k: "hut", from: 45 }, { k: "boat", from: 75 }];
  const kindFor = min => (min >= 75 ? "boat" : min >= 45 ? "hut" : min >= 20 ? "palm" : "bush");
  const MILESTONES = [{ id: "pier", h: 3 }, { id: "lighthouse", h: 10 }, { id: "lanterns", h: 25 }];

  /* ---------- data: real, or a preview set when the page is opened with #island-demo (never saved) ---------- */
  const demo = /island-demo/.test(location.hash);
  const J = demo ? makeDemo() : Object.assign({ sessions: [], goal: 120 }, store.get("journey", {}));
  const save = () => { if (!demo) store.set("journey", J); };
  function makeDemo() {
    let s = 4242; const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const out = [], log = {}, now = Date.now();
    for (let d = 20; d >= 0; d--) {
      if (r() < 0.2 && d) continue;
      const n = d === 0 ? 1 : 1 + Math.floor(r() * 3); let hour = [9, 10, 10, 15, 21, 20][Math.floor(r() * 6)];
      for (let i = 0; i < n; i++) {
        const min = [25, 25, 50, 15, 45, 90, 30][Math.floor(r() * 7)], at = new Date(now - d * 864e5); at.setHours(hour, Math.floor(r() * 50), 0, 0);
        out.push({ t: at.getTime(), min, away: Math.round(r() < 0.5 ? 0 : r() * min * 6), k: kindFor(min), seed: Math.floor(r() * 1e9), intent: "" });
        log[dayKey(at)] = (log[dayKey(at)] || 0) + min; hour = Math.min(23, hour + 1 + Math.floor(min / 60));
      }
    }
    return { sessions: out, goal: 120, log };
  }
  const minuteLog = () => (demo ? J.log : store.get("log", {}));
  const totalMin = () => Object.values(minuteLog()).reduce((a, b) => a + b, 0);
  const todayMin = () => minuteLog()[dayKey()] || 0;
  function streak() { const log = minuteLog(), d = new Date(); let n = 0; if (!log[dayKey(d)]) d.setDate(d.getDate() - 1); while (log[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }
  const reached = () => { const h = totalMin() / 60; return Object.fromEntries(MILESTONES.map(m => [m.id, h >= m.h])); };

  /* ---------- the session in progress ---------- */
  let cur = null, running = false;
  const state = () => ({ items: J.sessions.map(s => ({ k: s.k, seed: s.seed })), grow: cur ? cur.grow : null, ms: reached() });
  const push = () => { lastState = state(); Scene.setIsland(lastState); };
  function begin(min) { if (cur) return; cur = { min, away: 0, hiddenAt: 0, grow: { k: kindFor(min), p: 0, seed: Math.floor(Math.random() * 1e9) } }; push(); }
  function progress(p, min) {
    if (!cur) return;
    const k = kindFor(min || cur.min); if (k !== cur.grow.k) { cur.grow.k = k; cur.min = min; }
    cur.grow.p = Math.max(0, Math.min(1, p));        // the scene holds this same object, so it grows on the next frame
  }
  let lastState = null;
  function setRunning(on) { running = on; if (!cur) return; if (!on && cur.hiddenAt) { cur.away += Date.now() - cur.hiddenAt; cur.hiddenAt = 0; } else if (on && document.hidden) cur.hiddenAt = Date.now(); }
  document.addEventListener("visibilitychange", () => {
    if (!cur || !running) return;
    if (document.hidden) cur.hiddenAt = Date.now();
    else if (cur.hiddenAt) { cur.away += Date.now() - cur.hiddenAt; cur.hiddenAt = 0; }
  });
  function cancel() { cur = null; running = false; refresh(); }
  function complete(min, intent) {
    if (cur && cur.hiddenAt) { cur.away += Date.now() - cur.hiddenAt; cur.hiddenAt = 0; }
    const before = reached();
    const s = { t: Date.now(), min, away: Math.round((cur ? cur.away : 0) / 1000), k: kindFor(min), seed: cur ? cur.grow.seed : Math.floor(Math.random() * 1e9), intent: (intent || "").slice(0, 60) };
    if (demo) { J.log[dayKey()] = (J.log[dayKey()] || 0) + min; }
    J.sessions.push(s); if (J.sessions.length > 2000) J.sessions.splice(0, J.sessions.length - 2000); save();
    cur = null; running = false;
    // logMinutes (app.js) runs before this, so milestones already include this session
    const after = reached(), unlocked = MILESTONES.find(m => after[m.id] && !before[m.id]);
    refresh(); showDone(s, unlocked);
    return s;
  }
  function refresh() { lastState = state(); Scene.setIsland(lastState); if (H.open === "island") render(); }

  /* ---------- glue to app.js ---------- */
  const H = { openModal: () => {}, toast: () => {}, copy: async () => {}, open: null, view: "island", openPanel: () => {} };
  function init(hooks) { Object.assign(H, hooks); lastState = state(); Scene.setIsland(lastState); breathLoop(); if (demo) setTimeout(() => H.toast(t("isDemo")), 1200); }
  const itemName = k => t("it_" + k), msName = id => t("ms_" + id);

  /* ---------- small canvas renders (island scenes share the sea's palette) ---------- */
  function sizeCanvas(cv) { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (!r.width) return false; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); return true; }
  function paintIsland(cv, st, hour, zoom) { if (cv.width < 4 && !sizeCanvas(cv)) return; Scene.renderIsland(cv, st, hour, zoom); }

  /* ---------- the Island panel ---------- */
  let heroT = null;
  function onPanel(name) {
    H.open = name; clearInterval(heroT);
    if (name !== "island") return;
    render();
    heroT = setInterval(() => { const cv = $("#isHero"); if (!cv || $("#p-island").hidden) return clearInterval(heroT); paintIsland(cv, lastState); }, 120);
  }
  function render() {
    const box = $("#isBody"); if (!box) return;
    $$seg();
    box.innerHTML = H.view === "stats" ? statsHTML() : islandHTML();
    requestAnimationFrame(() => {
      box.querySelectorAll("canvas[data-kind]").forEach(cv => { sizeCanvas(cv); paintIsland(cv, { items: [{ k: cv.dataset.kind, seed: 5 }], grow: null, ms: {} }, undefined, 2.3); });
      const hero = $("#isHero"); if (hero) { sizeCanvas(hero); paintIsland(hero, lastState); }
    });
  }
  function $$seg() { document.querySelectorAll("#isSeg button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === H.view)); }
  function ring(v, goal) {
    const C = 2 * Math.PI * 30, p = Math.min(1, v / goal);
    return `<svg viewBox="0 0 72 72" class="is-ring" aria-hidden="true"><circle cx="36" cy="36" r="30" class="tr"/><circle cx="36" cy="36" r="30" class="fg" stroke-dasharray="${C * p} ${C}"/></svg>`;
  }
  function islandHTML() {
    const tot = totalMin(), n = J.sessions.length, today = todayMin(), st = streak();
    const next = MILESTONES.find(m => tot / 60 < m.h), prev = next ? (MILESTONES[MILESTONES.indexOf(next) - 1] || { h: 0 }) : null;
    const counts = Object.fromEntries(KINDS.map(x => [x.k, J.sessions.filter(s => s.k === x.k).length]));
    return `
    <div class="is-hero"><canvas id="isHero" aria-label="${esc(t("isTitle"))}"></canvas>
      <div class="is-cap">${n ? `<b>${num(n)}</b> ${t(n === 1 ? "isThing" : "isThings")} · <b>${dur(tot)}</b> ${t("isAtSea")}` : esc(t("isEmpty"))}</div></div>
    <div class="is-today">
      <div class="is-ringbox">${ring(today, J.goal)}<span>${Math.round(Math.min(1, today / J.goal) * 100) >= 100 ? "✓" : num(Math.round(today / J.goal * 100)) + "%"}</span></div>
      <div class="is-tt"><b>${dur(today)}</b> <span>${t("isOf")} ${dur(J.goal)} ${t("isToday")}</span>
        <small>${st > 1 ? `${num(st)} ${t("streak")}` : t(today ? "isKeep" : "isStart")}</small></div>
      <div class="is-goal"><span>${t("isGoal")}</span><div class="t-step mini"><button class="stp" data-goal="-15" aria-label="−"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button><output>${dur(J.goal)}</output><button class="stp" data-goal="15" aria-label="+"><svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg></button></div></div>
    </div>
    ${next ? `<div class="is-next"><div class="is-nl"><span>${t("isNext")}: <b>${esc(msName(next.id))}</b></span><span>${dur(next.h * 60 - tot)} ${t("isToGo")}</span></div>
      <div class="is-bar"><i style="width:${Math.max(2, (tot / 60 - prev.h) / (next.h - prev.h) * 100)}%"></i></div></div>`
      : `<div class="is-next"><div class="is-nl"><span>${t("isAllMs")}</span></div></div>`}
    <h3 class="sub">${t("isGrows")}</h3>
    <div class="is-kinds">${KINDS.map(x => `<div class="is-kind"><canvas data-kind="${x.k}" aria-hidden="true"></canvas><b>${esc(itemName(x.k))}</b><span>${num(x.from === 1 ? "1–19" : x.from + "+")} ${t("min")}${counts[x.k] ? ` · ${num(counts[x.k])}` : ""}</span></div>`).join("")}</div>
    <h3 class="sub">${t("isMs")}</h3>
    <div class="is-ms">${MILESTONES.map(m => `<div class="${tot / 60 >= m.h ? "on" : ""}"><b>${esc(msName(m.id))}</b><span>${num(m.h)} ${t("isHours")}</span></div>`).join("")}</div>
    <div class="p-foot"><button class="text-btn" data-review>${t("rvOpen")} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
      <span class="hint flush">${t(demo ? "isDemo" : "isLocal")}</span></div>`;
  }

  /* ---------- stats ---------- */
  function days(n) { const out = [], log = minuteLog(); for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); out.push({ d, m: log[dayKey(d)] || 0 }); } return out; }
  const DN_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DN_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];
  const DF_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], DF_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
  const dn = i => (LANG === "bn" ? DN_BN : DN_EN)[i];
  function hours(list) { const h = new Array(24).fill(0); list.forEach(s => (h[new Date(s.t).getHours()] += s.min)); let b = 0; h.forEach((v, i) => v > h[b] && (b = i)); return { h, best: b }; }
  function weekInfo() {
    const wk = days(7), prev = days(14).slice(0, 7), since = Date.now() - 7 * 864e5;
    const ss = J.sessions.filter(s => s.t >= since), focusSec = ss.reduce((a, s) => a + s.min * 60, 0), away = ss.reduce((a, s) => a + s.away, 0);
    return { wk, total: wk.reduce((a, x) => a + x.m, 0), prev: prev.reduce((a, x) => a + x.m, 0), ss, present: focusSec ? Math.max(0, 1 - away / focusSec) : null, hrs: hours(J.sessions.filter(s => s.t >= Date.now() - 28 * 864e5)) };
  }
  function statsHTML() {
    const w = weekInfo(), mx = Math.max(60, ...w.wk.map(x => x.m)), top = Math.ceil(mx / 60) * 60, Hh = 96;
    const y = m => 10 + Hh - (m / top) * Hh, bw = 28, gap = (316 - 7 * bw) / 6;
    let bars = `<svg viewBox="0 0 340 130" role="img" aria-label="${esc(t("stWeek"))}">`;
    [0, top / 2, top].forEach(v => (bars += `<line class="gl" x1="24" x2="340" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 3}">${num(v / 60)}${LANG === "bn" ? "ঘ" : "h"}</text>`));
    w.wk.forEach((x, i) => { const X = 24 + i * (bw + gap); bars += `<rect class="${i === 6 ? "bt" : "bb"}" x="${X}" y="${y(x.m)}" width="${bw}" height="${Math.max(0, 10 + Hh - y(x.m))}" rx="5"><title>${dur(x.m)}</title></rect><text x="${X + bw / 2}" y="126" text-anchor="middle">${dn(x.d.getDay())}</text>`; });
    bars += "</svg>";
    // 16 weeks
    const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - (7 * 15 + start.getDay()));
    const log = minuteLog(); let hm = `<svg viewBox="0 0 300 124" class="hm" role="img" aria-label="${esc(t("st16"))}">`;
    [1, 3, 5].forEach(r => (hm += `<text x="0" y="${r * 17 + 11}">${dn(r)}</text>`));
    for (let c = 0; c < 16; c++) for (let r = 0; r < 7; r++) {
      const d = new Date(start); d.setDate(start.getDate() + c * 7 + r); if (d > new Date()) continue;
      const m = log[dayKey(d)] || 0, cls = m <= 0 ? "h0" : m < 30 ? "h1" : m < 60 ? "h2" : m < 120 ? "h3" : "h4";
      hm += `<rect class="${cls}" x="${32 + c * 17}" y="${r * 17}" width="14" height="14" rx="3"><title>${d.toLocaleDateString(LANG === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short" })}: ${dur(m)}</title></rect>`;
    }
    hm += "</svg>";
    const hx = Math.max(1, ...w.hrs.h); let hs = `<svg viewBox="0 0 340 96" role="img" aria-label="${esc(t("stHours"))}">`;
    w.hrs.h.forEach((v, i) => { const h = (v / hx) * 64; hs += `<rect class="${i === w.hrs.best && v ? "bt" : "bb"}" x="${4 + i * 14}" y="${72 - h}" width="10" height="${Math.max(1.5, h)}" rx="2"/>`; });
    [0, 6, 12, 18].forEach(h => (hs += `<text x="${4 + h * 14}" y="90">${hourName(h)}</text>`)); hs += "</svg>";
    const recent = J.sessions.slice(-6).reverse();
    const ch = w.prev ? Math.round((w.total - w.prev) / w.prev * 100) : null;
    return `
    <div class="st-tiles">
      <div><span>${t("stThisWeek")}</span><b>${dur(w.total)}</b><small>${ch == null ? "&nbsp;" : `${ch >= 0 ? "+" : "−"}${num(Math.abs(ch))}% ${t("stVsLast")}`}</small></div>
      <div><span>${t("stSessions")}</span><b>${num(w.ss.length)}</b><small>${t("stLast7")}</small></div>
      <div><span>${t("stBestHour")}</span><b>${J.sessions.length ? hourName(w.hrs.best) : "–"}</b><small>${t("stLast28")}</small></div>
      <div><span>${t("stPresent")}</span><b>${w.present == null ? "–" : num(Math.round(w.present * 100)) + "%"}</b><small>${t("stPresentHint")}</small></div>
    </div>
    <h3 class="sub">${t("stWeek")}</h3><div class="st-chart">${bars}</div>
    <h3 class="sub">${t("st16")}</h3><div class="st-chart">${hm}</div>
    <h3 class="sub">${t("stHours")}</h3><div class="st-chart">${hs}</div>
    ${insights(w).map(x => `<p class="st-in">${esc(x)}</p>`).join("")}
    ${recent.length ? `<h3 class="sub">${t("stRecent")}</h3><div class="st-list">${recent.map(s => `<div><span class="k k-${s.k}"></span><span class="grow">${esc(s.intent || itemName(s.k))}<small>${new Date(s.t).toLocaleDateString(LANG === "bn" ? "bn-BD" : "en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${new Date(s.t).toLocaleTimeString(LANG === "bn" ? "bn-BD" : "en-GB", { hour: "numeric", minute: "2-digit" })}</small></span><b>${dur(s.min)}</b></div>`).join("")}</div>` : ""}
    <div class="p-foot"><button class="text-btn" data-review>${t("rvOpen")} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>`;
  }
  function insights(w) {
    const out = [], bn = LANG === "bn", s28 = J.sessions.filter(s => s.t >= Date.now() - 28 * 864e5);
    if (s28.length < 3) return [t("stFew")];
    const tot = s28.reduce((a, s) => a + s.min, 0), b = w.hrs.best, win = [b - 1, b, b + 1].reduce((a, h) => a + (w.hrs.h[(h + 24) % 24] || 0), 0);
    out.push(bn ? `তোমার ফোকাসের ${num(Math.round(win / tot * 100))}% হয় ${hourName((b + 23) % 24)} থেকে ${hourName((b + 2) % 24)} এর মধ্যে। কঠিন কাজগুলো এই সময়ে রাখো।`
      : `${Math.round(win / tot * 100)}% of your focus lands between ${hourName((b + 23) % 24)} and ${hourName((b + 2) % 24)}. Put the hard work there.`);
    const clean = s28.filter(s => s.away < 30).length;
    out.push(bn ? `গত চার সপ্তাহে ${num(clean)}টা সেশনে তুমি অন্য কোথাও যাওনি।` : `${clean} of your last ${s28.length} sessions went by without leaving this tab.`);
    return out;
  }

  /* ---------- end of a session ---------- */
  function showDone(s, unlocked) {
    const today = todayMin(), present = s.min ? Math.max(0, 1 - s.away / (s.min * 60)) : 1;
    $("#doneKick").textContent = t("dnKick");
    $("#doneTitle").textContent = t("dnGrew").replace("{item}", LANG === "bn" ? itemName(s.k) : itemName(s.k).toLowerCase());
    $("#doneLead").textContent = (s.intent ? t("dnOn").replace("{m}", dur(s.min)).replace("{task}", s.intent) : t("dnPlain").replace("{m}", dur(s.min))) + " " +
      (s.away < 30 ? t("dnStayed") : t("dnAway").replace("{p}", num(Math.round(present * 100))));
    $("#doneStats").innerHTML = [[dur(s.min), t("dnFocus")], [dur(today), t("isToday")], [num(J.sessions.length), t("dnGrown")], [num(Math.max(1, streak())), t("dnStreak")]]
      .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    const un = $("#doneUnlock"); un.hidden = !unlocked; if (unlocked) un.textContent = t("dnUnlock").replace("{ms}", msName(unlocked.id)).replace("{h}", num(unlocked.h));
    $("#doneHint").textContent = t("dnBreak");
    H.openModal("done");
    const cv = $("#doneArt"); requestAnimationFrame(() => { sizeCanvas(cv); const st = state(); st.grow = null; paintIsland(cv, st); });
    H.lastDone = s;
  }
  async function shareDone() {
    const s = H.lastDone; if (!s) return;
    const txt = t("dnShareTxt").replace("{m}", dur(s.min)).replace("{item}", LANG === "bn" ? itemName(s.k) : itemName(s.k).toLowerCase()) + " https://focus.freakingwaves.com";
    if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    await H.copy(txt); H.toast(t("dnCopied"));
  }

  /* ---------- weekly review: five cards, tap through ---------- */
  let RV = null;
  function openReview() {
    const w = weekInfo(), bn = LANG === "bn", best = w.wk.reduce((a, x) => (x.m > a.m ? x : a), w.wk[0]);
    const grew = KINDS.map(x => [x.k, w.ss.filter(s => s.k === x.k).length]).filter(x => x[1]);
    const slides = [
      { k: t("rvK1"), big: dur(w.total), body: w.ss.length ? (bn ? `${num(w.ss.length)}টা সেশন। গত সপ্তাহে ছিল ${dur(w.prev)}।` : `${w.ss.length} sessions. Last week was ${dur(w.prev)}.`) : t("rvNone") },
      { k: t("rvK2"), big: best.m ? (bn ? DF_BN : DF_EN)[best.d.getDay()] : "–", body: best.m ? (bn ? `${dur(best.m)} ফোকাস। ওই দিন কী আলাদা ছিল, মনে রেখো।` : `${dur(best.m)} of focus. Worth remembering what was different that day.`) : t("rvNone") },
      { k: t("rvK3"), big: J.sessions.length ? hourName(w.hrs.best) : "–", body: t("rvB3") },
      { k: t("rvK4"), big: "", art: true, body: grew.length ? grew.map(([k, n]) => `${num(n)} × ${itemName(k)}`).join(" · ") : t("rvNone") },
      { k: t("rvK5"), big: "", body: J.sessions.length ? (bn ? `${hourName(w.hrs.best)} এর কাছাকাছি তিনটা লম্বা সেশন রাখো। প্রতিদিন অল্প হলেও বসো, স্ট্রিক নিজেই আসবে।` : `Book three long sessions near ${hourName(w.hrs.best)}. Sit down every day, even briefly. The streak takes care of itself.`) : t("rvStart"), last: true },
    ];
    RV = { slides, i: 0 }; H.openModal("review"); paintSlide();
  }
  function paintSlide() {
    const s = RV.slides[RV.i];
    $("#rvBars").innerHTML = RV.slides.map((_, i) => `<i class="${i < RV.i ? "done" : i === RV.i ? "on" : ""}"><b></b></i>`).join("");
    $("#rvBody").innerHTML = `<p class="rv-k">${esc(s.k)}</p>${s.big ? `<p class="rv-big">${esc(s.big)}</p>` : ""}${s.art ? `<canvas id="rvArt" class="rv-art"></canvas>` : ""}<p class="rv-p">${esc(s.body)}</p>`;
    $("#rvNext").textContent = t(s.last ? "rvDone" : "rvNext");
    if (s.art) requestAnimationFrame(() => { const cv = $("#rvArt"); sizeCanvas(cv); paintIsland(cv, Object.assign(state(), { grow: null })); });
  }
  function nextSlide() { if (!RV) return; if (RV.i < RV.slides.length - 1) { RV.i++; paintSlide(); } else { $("#m-review").hidden = true; RV = null; } }

  /* ---------- breathing guide during breaks: 4 in, 4 hold, 4 out, 4 hold ---------- */
  function breathLoop() {
    const el = $("#breathTxt"); if (!el) return;
    let last = -1;
    setInterval(() => { if (!document.body.classList.contains("breathing")) { last = -1; return; }
      const ph = Math.floor((Date.now() / 1000 % 16) / 4); if (ph !== last) { last = ph; el.textContent = t(["brIn", "brHold", "brOut", "brHold"][ph]); } }, 200);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goal]"); if (g) { J.goal = Math.max(15, Math.min(720, J.goal + +g.dataset.goal)); save(); render(); return; }
    if (e.target.closest("[data-review]")) return openReview();
    const sg = e.target.closest("#isSeg button"); if (sg) { H.view = sg.dataset.v; render(); return; }
    if (e.target.closest("#rvNext") || e.target.closest("#rvBody")) return nextSlide();
    if (e.target.closest("#doneShare")) return shareDone();
    if (e.target.closest("#doneIsland")) { $("#m-done").hidden = true; H.view = "island"; H.openPanel("island"); }
  });

  return { init, begin, progress: (p, min) => { progress(p, min); }, setRunning, cancel, complete, onPanel, refresh, relabel: () => { if (H.open === "island") render(); }, todayMin, streak };
})();
