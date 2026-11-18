// Focus Room: the living sea from focus.freakingwaves.com, with the timer painted into it.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const human = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const ICON = {
    play: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
    sound: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    mute: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  };
  let timer = null, sound = null, stats = null;

  function paint() {
    if (!timer) return;
    const idle = !timer.running && timer.left === timer.total;
    Scene.setClock({ text: fmt(timer.left), x: 0, y: 0, s: 1, o: 1 });
    $('.mode').textContent = `${LABEL[timer.mode]}${timer.running ? '' : idle ? '' : ' · paused'}`;
    $('.task').textContent = timer.task || '';
    $('#t').innerHTML = timer.running ? `${ICON.pause} Pause` : `${ICON.play} ${idle ? `Start ${timer.mode === 'focus' ? 'focus' : 'break'}` : 'Resume'}`;
    if (sound) {
      $('#s').innerHTML = sound.playing && !sound.blocked ? ICON.sound : ICON.mute;
      $('#s').title = sound.blocked ? 'Click the Focus Waves sidebar once to turn the sound on' : sound.playing ? 'Pause sounds' : 'Play sounds';
      $('.now').textContent = sound.name || '';
    }
    if (stats) $('.today').textContent = `Today ${human(stats.todaySec)}`;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    vscode.postMessage({ type: 'room', action: b.dataset.a });
  });

  // Hide the controls after a few quiet seconds; any movement brings them back.
  let idleT;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 3500); };
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, wake));
  wake();

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'state') {
      if (m.timer) timer = m.timer;
      if (m.sound) { sound = m.sound; Scene.set(m.sound.levels || {}); }
      if (m.stats) stats = m.stats;
      paint();
    } else if (m.type === 'events') {
      for (const ev of m.events) Scene.event(ev);
    }
  });
  vscode.postMessage({ type: 'roomReady' });
})();
