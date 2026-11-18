// Focus Waves sidebar: timer, mixes and the live sound engine (audio.js + nature-worklet.js from the website).
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const human = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  const PULSES = [
    { id: 'off', name: 'Off', hz: 0 },
    { id: 'calm', name: 'Calm', hz: 6 },
    { id: 'flow', name: 'Flow', hz: 10 },
    { id: 'focus', name: 'Focus', hz: 14 },
    { id: 'deep', name: 'Deep', hz: 16 },
  ];
  const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const CATS = [{ id: 'focus', name: 'For focus' }, { id: 'nature', name: 'Nature' }, { id: 'music', name: 'Music' }];
  const LINKS = [
    { label: 'Website', url: 'https://freakingwaves.com' },
    { label: 'Portfolio', url: 'https://fahadmahmud.com' },
    { label: 'Facebook', url: 'https://www.facebook.com/fahadmahmud2004' },
    { label: 'Page', url: 'https://www.facebook.com/freakingw' },
    { label: 'Group', url: 'https://www.facebook.com/groups/freakingwaves' },
    { label: 'Telegram', url: 'https://t.me/freakingwaves' },
  ];

  const ui = Object.assign({ cat: 'focus', openGroups: {}, showSounds: false }, vscode.getState() || {});
  let sound = { mix: {}, master: 0.8, space: 1, pulse: { hz: 0, depth: 0.45 }, active: null, playing: false };
  let timer = { mode: 'focus', running: false, left: 1500, total: 1500, task: '' };
  let stats = { todaySec: 0, todaySessions: 0, streak: 0 };
  let engineState = 'idle'; // idle | starting | ok | error
  // Sound events (a wave breaking, thunder, a bird) go to the Focus Room so the sea reacts to what you hear.
  let roomOpen = false, evBuf = [];
  setInterval(() => { if (evBuf.length) { vscode.postMessage({ type: 'events', events: evBuf.splice(0, 40) }); evBuf.length = 0; } }, 150);

  const saveUi = () => vscode.setState({ cat: ui.cat, openGroups: ui.openGroups, showSounds: ui.showSounds });
  const blocked = () => sound.playing && engineState === 'ok' && Audio_.state !== 'running';
  const report = () => vscode.postMessage({ type: 'sound', sound: { ...sound, blocked: blocked() } });

  // ---------- engine ----------
  async function ensureEngine() {
    if (engineState === 'ok') return true;
    try {
      engineState = 'starting';
      await Audio_.init();
      engineState = 'ok';
      Audio_.onEvent((ev) => {
        if (!sound.playing) return;
        if (roomOpen) evBuf.push(ev); else if (typeof Scene !== 'undefined') Scene.event(ev);
      });
      Audio_.setMaster(sound.master);
      Audio_.setSpace(sound.space);
      return true;
    } catch (e) {
      engineState = 'error';
      vscode.postMessage({ type: 'diag', step: 'error', message: String(e && (e.stack || e.message) || e) });
      vscode.postMessage({ type: 'audioError', message: (e && e.message) || 'unknown error' });
      render();
      return false;
    }
  }

  function apply() {
    if (engineState !== 'ok') return;
    const vol = {};
    for (const s of SOUNDS) { const v = sound.playing ? (sound.mix[s.id] || 0) : 0; vol[s.id] = v * v; }
    Audio_.setVolumes(vol);
    Audio_.setPulse(sound.playing ? sound.pulse.hz : 0, sound.pulse.depth);
  }

  async function play() {
    if (!Object.keys(sound.mix).length) setMix(MIXES.find((m) => m.id === 'nCode') || MIXES[0], false);
    vscode.postMessage({ type: 'diag', step: 'play' });
    if (!(await ensureEngine())) return;
    vscode.postMessage({ type: 'diag', step: 'engine', state: Audio_.state });
    // Never wait forever on resume: if the browser holds the audio back, the first click in the panel starts it.
    await Promise.race([Audio_.resume(), new Promise((r) => setTimeout(r, 1500))]);
    sound.playing = true;
    apply(); report(); render();
    vscode.postMessage({ type: 'diag', step: 'playing', state: Audio_.state });
  }

  // VS Code, like a browser, holds sound back until you click inside the panel once. Any click or key here starts it.
  const revive = () => {
    if (!blocked()) return;
    Audio_.resume().then(() => { report(); render(); });
  };
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, revive, { capture: true }));
  setInterval(() => { if (sound.playing && engineState === 'ok') { const b = blocked(); if (b !== lastBlocked) { lastBlocked = b; report(); render(); } } }, 1000);
  let lastBlocked = false;
  function pause() {
    sound.playing = false;
    apply(); report(); render();
    setTimeout(() => { if (!sound.playing) Audio_.suspend(); }, 1600); // after the fade-out
  }

  function setMix(m, andPlay = true) {
    sound.mix = { ...m.mix };
    sound.active = m.id;
    sound.pulse = m.pulse ? { hz: m.pulse.hz, depth: m.pulse.depth } : { hz: 0, depth: sound.pulse.depth };
    apply(); report(); render();
    if (andPlay && !sound.playing) play();
  }

  // ---------- render ----------
  // The living sea card above everything. It is built once (the scene keeps its own canvas) and only its text changes.
  const card = document.getElementById('card');
  function paintCard() {
    const idle = !timer.running && timer.left === timer.total;
    const pct = timer.total ? Math.min(1, 1 - timer.left / timer.total) : 0;
    card.className = `card mode-${timer.mode}`;
    card.querySelector('.c-digits').textContent = fmt(timer.left);
    card.querySelector('.c-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    card.querySelector('.c-mode').textContent = `${MODE_LABEL[timer.mode]}${timer.running ? '' : idle ? '' : ' · paused'}`;
    card.querySelector('.c-line').textContent = timer.task || (timer.running ? (timer.mode === 'focus' ? 'Deep in it. Keep going.' : 'Breathe. Look away from the screen.') : idle ? 'Pick a mix and start your first block.' : 'Paused. Pick it up when you are ready.');
    card.querySelector('.c-bar').style.width = `${(pct * 100).toFixed(1)}%`;
  }
  card.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.act === 'room') vscode.postMessage({ type: 'openRoom' });
    else if (b && b.dataset.act === 'cardplay') vscode.postMessage({ type: 'timer', action: 'toggle' });
  });
  const sceneLevels = () => {
    const lv = {};
    for (const id in sound.mix) lv[id] = sound.playing && !blocked() ? sound.mix[id] : 0;
    return lv;
  };

  function render() {
    paintCard();
    if (typeof Scene !== 'undefined') { Scene.set(sceneLevels()); Scene.setPaused(roomOpen); }
    const active = MIXES.find((m) => m.id === sound.active);
    const idle = !timer.running && timer.left === timer.total;
    const pulseId = (PULSES.find((p) => p.hz === sound.pulse.hz) || PULSES[0]).id;
    const mixes = MIXES.filter((m) => m.cat === ui.cat);

    app.innerHTML = `
      <section class="timer mode-${timer.mode}">
        <div class="modes" role="tablist">
          ${['focus', 'short', 'long'].map((m) => `<button role="tab" class="mode ${timer.mode === m ? 'on' : ''}" data-mode="${m}" aria-selected="${timer.mode === m}">${MODE_LABEL[m]}</button>`).join('')}
        </div>
        <input id="task" class="task" type="text" maxlength="200" placeholder="What are you working on?" value="${esc(timer.task)}">
        <div class="row center">
          <button class="btn primary big" data-t="toggle">${timer.running ? 'Pause' : idle ? `Start ${timer.mode === 'focus' ? 'focus' : 'break'}` : 'Resume'}</button>
          <button class="btn icon" data-t="reset" title="Reset">${ic('reset')}</button>
          <button class="btn icon" data-t="skip" title="Skip to ${timer.mode === 'focus' ? 'break' : 'focus'}">${ic('skip')}</button>
        </div>
        <div class="today">Today <b>${human(stats.todaySec)}</b> · ${stats.todaySessions} session${stats.todaySessions === 1 ? '' : 's'}${stats.streak > 1 ? ` · ${stats.streak} day streak` : ''}</div>
      </section>

      ${blocked() ? `<button class="wake" data-act="wake">${ic('play')} Click here to turn the sound on</button>` : ''}
      <section class="player">
        <button class="play ${sound.playing ? 'on' : ''}" data-act="playpause" title="${sound.playing ? 'Pause sounds' : 'Play sounds'}">${ic(sound.playing ? 'pause' : 'play')}</button>
        <div class="now">
          <div class="now-name">${esc(active ? active.name : Object.keys(sound.mix).length ? 'Your mix' : 'Pick a mix')}</div>
          <div class="now-note">${engineState === 'error' ? 'Sound is not available here' : esc(active ? active.note : 'Every sound is made live. Nothing loops.')}</div>
        </div>
        <input class="vol" id="master" type="range" min="0" max="1" step="0.01" value="${sound.master}" title="Volume" aria-label="Volume" style="--p:${sound.master * 100}%">
      </section>

      <section class="block">
        <div class="tabs">${CATS.map((c) => `<button class="tab ${ui.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')}</div>
        <div class="mixes">
          ${mixes.map((m) => `
            <button class="mix ${sound.active === m.id ? 'on' : ''}" data-mix="${m.id}" title="${esc(m.name)}: ${esc(m.note)}">
              <span class="art" style="background:linear-gradient(${esc(m.art[0])} 0 52%, ${esc(m.art[1])} 52%)"></span>
              <span class="mix-name">${esc(m.name)}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="block">
        <div class="label">Focus pulse</div>
        <div class="seg">${PULSES.map((p) => `<button class="${pulseId === p.id ? 'on' : ''}" data-pulse="${p.hz}">${p.name}</button>`).join('')}</div>
        ${sound.pulse.hz ? `<label class="slider"><span>Intensity</span><input id="depth" type="range" min="0.1" max="0.7" step="0.01" value="${sound.pulse.depth}" style="--p:${((sound.pulse.depth - 0.1) / 0.6) * 100}%"></label>` : ''}
        <p class="hint">A gentle rhythm in the sound. Research on how brain rhythms follow sound is promising but not settled.</p>
        <div class="label">Distance</div>
        <div class="seg">${['Close', 'Room', 'Far'].map((n, i) => `<button class="${sound.space === i ? 'on' : ''}" data-space="${i}">${n}</button>`).join('')}</div>
      </section>

      <section class="block">
        <button class="fold" data-act="sounds">${ic(ui.showSounds ? 'down' : 'right')} Sounds <span class="count">${Object.keys(sound.mix).length} on</span></button>
        ${ui.showSounds ? GROUPS.map((g) => `
          <div class="group">
            <div class="label">${esc(g.name)}</div>
            ${SOUNDS.filter((s) => s.group === g.id).map((s) => {
              const v = sound.mix[s.id] || 0;
              return `<div class="snd ${v ? 'on' : ''}">
                <button class="snd-btn" data-snd="${s.id}" title="${v ? 'Turn off' : 'Turn on'} ${esc(s.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${ICONS[s.id] || ''}</svg><span>${esc(s.name)}</span></button>
                <input type="range" min="0" max="1" step="0.01" value="${v || 0.5}" data-vol="${s.id}" aria-label="${esc(s.name)} volume" style="--p:${(v || 0.5) * 100}%" ${v ? '' : 'class="dim"'}>
              </div>`;
            }).join('')}
          </div>`).join('') + '<button class="btn ghost small" data-act="alloff">Turn everything off</button>' : ''}
      </section>

      <footer class="foot">
        <div><b>Focus Waves</b> by Fahad Mahmud · <a href="#" data-link="https://focus.freakingwaves.com">Full website</a></div>
        <div class="links">${LINKS.map((l) => `<a href="#" data-link="${l.url}">${l.label}</a>`).join('')}</div>
      </footer>`;
  }

  function ic(n) {
    const P = {
      play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
      pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
      reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
      skip: '<path d="M5 6l8 6-8 6z"/><path d="M17 6v12"/>',
      right: '<path d="M9 6l6 6-6 6"/>',
      screen: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M3 13.5c2.5-2 5-2 7.5 0s5 2 7.5 0 2.25-1.4 3-1.2M8.5 20.5h7"/>',
      down: '<path d="M6 9l6 6 6-6"/>',
    };
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  }

  // ---------- events ----------
  app.addEventListener('click', (e) => {
    const b = e.target.closest('button, a');
    if (!b) return;
    const d = b.dataset;
    if (d.link) { e.preventDefault(); vscode.postMessage({ type: 'link', url: d.link }); return; }
    if (d.mode) return vscode.postMessage({ type: 'timer', action: 'mode', mode: d.mode });
    if (d.t) return vscode.postMessage({ type: 'timer', action: d.t });
    if (d.cat) { ui.cat = d.cat; saveUi(); return render(); }
    if (d.mix) { const m = MIXES.find((x) => x.id === d.mix); if (m) setMix(m); return; }
    if (d.pulse !== undefined) { sound.pulse = { hz: +d.pulse, depth: sound.pulse.depth || 0.45 }; sound.active = null; apply(); report(); return render(); }
    if (d.space !== undefined) { sound.space = +d.space; if (engineState === 'ok') Audio_.setSpace(sound.space); report(); return render(); }
    if (d.snd) {
      const id = d.snd;
      if (sound.mix[id]) delete sound.mix[id];
      else { const r = app.querySelector(`[data-vol="${id}"]`); sound.mix[id] = r ? +r.value : 0.5; }
      sound.active = null; apply(); report(); render();
      if (Object.keys(sound.mix).length && !sound.playing) play();
      return;
    }
    switch (d.act) {
      case 'wake': return;
      case 'room': return vscode.postMessage({ type: 'openRoom' });
      case 'playpause': return sound.playing && !blocked() ? pause() : play();
      case 'sounds': ui.showSounds = !ui.showSounds; saveUi(); return render();
      case 'alloff': sound.mix = {}; sound.active = null; pause(); return;
    }
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.type === 'range') t.style.setProperty('--p', `${((t.value - t.min) / (t.max - t.min)) * 100}%`);
    if (t.id === 'master') { sound.master = +t.value; if (engineState === 'ok') Audio_.setMaster(sound.master); }
    if (t.id === 'depth') { sound.pulse.depth = +t.value; sound.active = null; apply(); }
    if (t.dataset.vol) {
      const id = t.dataset.vol;
      sound.mix[id] = +t.value; sound.active = null; t.classList.remove('dim');
      t.closest('.snd').classList.add('on');
      apply();
      if (!sound.playing) play();
    }
  });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type === 'range') { report(); if (t.dataset.vol || t.id === 'depth') render(); }
    if (t.id === 'task') vscode.postMessage({ type: 'task', task: t.value });
  });
  app.addEventListener('keydown', (e) => { if (e.target.id === 'task' && e.key === 'Enter') e.target.blur(); });

  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (m.type === 'init') {
      sound = { ...sound, ...m.sound, playing: false };
      timer = m.timer; stats = m.stats || stats; roomOpen = !!m.room;
      render();
    } else if (m.type === 'timer') {
      timer = m.timer; if (m.stats) stats = m.stats;
      // Update the clock in place while typing a task, so the field keeps focus.
      if (document.activeElement && document.activeElement.id === 'task') {
        paintCard();
      } else render();
    } else if (m.type === 'room') {
      roomOpen = m.open;
      if (typeof Scene !== 'undefined') Scene.setPaused(roomOpen);
    } else if (m.type === 'task') {
      timer.task = m.task; render();
    } else if (m.type === 'cmd') {
      if (m.cmd === 'play') await play();
      else if (m.cmd === 'pause') pause();
      else if (m.cmd === 'mix') { const mx = MIXES.find((x) => x.id === m.id); if (mx) setMix(mx); }
      else if (m.cmd === 'volume') { sound.master = Math.max(0, Math.min(1, sound.master + m.delta)); if (engineState === 'ok') Audio_.setMaster(sound.master); report(); render(); }
      else if (m.cmd === 'chime') { if (await ensureEngine()) { await Audio_.resume(); Audio_.chime(); if (!sound.playing) setTimeout(() => { if (!sound.playing) Audio_.suspend(); }, 3500); } }
    }
  });

  render();
  vscode.postMessage({ type: 'ready' });
})();
