// Focus Waves for VS Code: a focus timer in the status bar, and live nature sounds that play while you code.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const DEFAULT_SOUND = { mix: { waves: 0.6, pink: 0.35 }, master: 0.8, space: 1, pulse: { hz: 0, depth: 0.45 }, active: null, playing: false };

function loadCatalog(extensionPath) {
  try {
    const code = fs.readFileSync(path.join(extensionPath, 'media', 'engine', 'sounds.js'), 'utf8');
    return vm.runInNewContext(`${code};({ SOUNDS, GROUPS, MIXES })`, {});
  } catch {
    return { SOUNDS: [], GROUPS: [], MIXES: [] };
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmt = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};
const human = (sec) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const cfg = () => vscode.workspace.getConfiguration('focuswaves');
const minutesFor = (mode) => ({
  focus: cfg().get('focusMinutes', 25),
  short: cfg().get('shortBreakMinutes', 5),
  long: cfg().get('longBreakMinutes', 15),
}[mode] || 25);
const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };

class FocusWaves {
  constructor(context) {
    this.context = context;
    this.catalog = loadCatalog(context.extensionPath);
    const g = context.globalState;
    this.sound = { ...DEFAULT_SOUND, ...(g.get('fw.sound') || {}), playing: false };
    this.timer = {
      mode: 'focus', running: false, endsAt: 0, remaining: minutesFor('focus') * 60, cycle: 0, task: '',
      ...(g.get('fw.timer') || {}),
    };
    // A session left running when VS Code closed: keep the time it had left, paused.
    if (this.timer.running) {
      this.timer.remaining = Math.max(0, Math.round((this.timer.endsAt - Date.now()) / 1000));
      this.timer.running = false;
      if (!this.timer.remaining) this.timer.remaining = minutesFor(this.timer.mode) * 60;
    }
    this.stats = g.get('fw.stats') || {};
    this.view = null;
    this.viewReady = false;
    this.queue = [];
    this.zenByUs = false;
    this.dndByUs = false;
    this.lastTick = 0;
    this.room = null;
  }

  // ---------- persistence ----------
  saveTimer() { this.context.globalState.update('fw.timer', this.timer); }
  saveSound() { const { playing, blocked, ...rest } = this.sound; this.context.globalState.update('fw.sound', rest); }
  saveStats() {
    const keys = Object.keys(this.stats).sort();
    while (keys.length > 400) delete this.stats[keys.shift()];
    this.context.globalState.update('fw.stats', this.stats);
  }
  day(key = today()) {
    if (!this.stats[key]) this.stats[key] = { sec: 0, sessions: 0 };
    return this.stats[key];
  }
  streak() {
    let n = 0;
    const d = new Date();
    if (!(this.stats[today()] && this.stats[today()].sec >= 60)) d.setDate(d.getDate() - 1);
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (this.stats[k] && this.stats[k].sec >= 60) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }
  summary() {
    const t = this.stats[today()] || { sec: 0, sessions: 0 };
    let week = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      week += (this.stats[k] || {}).sec || 0;
      d.setDate(d.getDate() - 1);
    }
    return { todaySec: t.sec, todaySessions: t.sessions, weekSec: week, streak: this.streak() };
  }

  // ---------- timer ----------
  left() {
    return this.timer.running ? Math.max(0, (this.timer.endsAt - Date.now()) / 1000) : this.timer.remaining;
  }

  start(mode) {
    if (mode && mode !== this.timer.mode) {
      this.timer.mode = mode;
      this.timer.remaining = minutesFor(mode) * 60;
    }
    if (!this.timer.remaining) this.timer.remaining = minutesFor(this.timer.mode) * 60;
    this.timer.running = true;
    this.timer.endsAt = Date.now() + this.timer.remaining * 1000;
    this.lastTick = Date.now();
    if (this.timer.mode === 'focus') {
      if (cfg().get('soundWithFocus', true) && !this.sound.playing) this.post({ type: 'cmd', cmd: 'play' }, true);
      this.enterQuiet();
    } else {
      this.leaveQuiet();
    }
    this.saveTimer();
    this.ensureTicking();
    this.refresh();
  }

  pause() {
    if (!this.timer.running) return;
    this.account();
    this.timer.remaining = Math.round(this.left());
    this.timer.running = false;
    this.saveTimer();
    this.leaveQuiet();
    this.refresh();
  }

  toggle() {
    if (this.timer.running) this.pause();
    else this.start();
  }

  reset() {
    this.account();
    this.timer.running = false;
    this.timer.remaining = minutesFor(this.timer.mode) * 60;
    this.saveTimer();
    this.leaveQuiet();
    this.refresh();
  }

  setMode(mode) {
    this.account();
    this.timer.mode = mode;
    this.timer.running = false;
    this.timer.remaining = minutesFor(mode) * 60;
    this.saveTimer();
    this.leaveQuiet();
    this.refresh();
  }

  skip() {
    this.account();
    const next = this.nextMode(false);
    this.timer.running = false;
    this.timer.mode = next;
    this.timer.remaining = minutesFor(next) * 60;
    this.saveTimer();
    this.leaveQuiet();
    this.refresh();
  }

  nextMode(countThis) {
    if (this.timer.mode !== 'focus') return 'focus';
    const every = cfg().get('longBreakEvery', 4);
    const cycle = this.timer.cycle + (countThis ? 1 : 0);
    return cycle > 0 && cycle % every === 0 ? 'long' : 'short';
  }

  // Add focused time since the last tick to today's total.
  account() {
    if (!this.timer.running || this.timer.mode !== 'focus') { this.lastTick = Date.now(); return; }
    const now = Date.now();
    const sec = Math.max(0, Math.min(now, this.timer.endsAt) - this.lastTick) / 1000;
    this.lastTick = now;
    if (sec > 0 && sec < 3600) { this.day().sec += sec; this.saveStats(); }
  }

  ensureTicking() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 1000);
  }

  tick() {
    if (!this.timer.running) { clearInterval(this.interval); this.interval = null; return; }
    // Write focused time every 15 s so a crash loses little.
    if (this.timer.mode === 'focus' && Date.now() - this.lastTick > 15000) this.account();
    if (this.left() <= 0) return this.complete();
    this.paintStatus();
    this.post({ type: 'timer', timer: this.timerState() });
    this.postRoom();
  }

  async complete() {
    this.account();
    const finished = this.timer.mode;
    if (finished === 'focus') {
      this.day().sessions += 1;
      this.saveStats();
      this.timer.cycle += 1;
    }
    const next = finished === 'focus' ? this.nextMode(false) : 'focus';
    this.timer.running = false;
    this.timer.mode = next;
    this.timer.remaining = minutesFor(next) * 60;
    this.saveTimer();
    this.leaveQuiet();
    if (cfg().get('chime', true)) this.post({ type: 'cmd', cmd: 'chime' }, true);
    this.refresh();

    const auto = finished === 'focus' ? cfg().get('autoStartBreaks', false) : cfg().get('autoStartFocus', false);
    if (auto) { this.start(); return; }
    const s = this.summary();
    if (finished === 'focus') {
      const msg = `Focus session done. ${human(s.todaySec)} focused today. Time for a ${next === 'long' ? 'long' : 'short'} break.`;
      const pick = await vscode.window.showInformationMessage(msg, `Start ${minutesFor(next)} min break`, 'Keep focusing');
      if (pick && pick.startsWith('Start')) this.start(next);
      else if (pick === 'Keep focusing') this.start('focus');
    } else {
      const pick = await vscode.window.showInformationMessage('Break is over. Ready for the next session?', 'Start focus');
      if (pick) this.start('focus');
    }
  }

  async enterQuiet() {
    if (cfg().get('zenModeDuringFocus', false) && !this.zenByUs) {
      this.zenByUs = true;
      await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    }
    if (cfg().get('quietNotificationsDuringFocus', false) && !this.dndByUs) {
      this.dndByUs = true;
      await vscode.commands.executeCommand('notifications.toggleDoNotDisturbMode').then(undefined, () => { this.dndByUs = false; });
    }
  }

  async leaveQuiet() {
    if (this.zenByUs) {
      this.zenByUs = false;
      await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    }
    if (this.dndByUs) {
      this.dndByUs = false;
      await vscode.commands.executeCommand('notifications.toggleDoNotDisturbMode').then(undefined, () => {});
    }
  }

  timerState() {
    return { ...this.timer, left: Math.round(this.left()), total: minutesFor(this.timer.mode) * 60, next: this.nextMode(false) };
  }

  // ---------- status bar ----------
  createStatus() {
    this.timerItem = vscode.window.createStatusBarItem('focuswaves.timer', vscode.StatusBarAlignment.Left, 40);
    this.timerItem.name = 'Focus Waves Timer';
    this.soundItem = vscode.window.createStatusBarItem('focuswaves.sound', vscode.StatusBarAlignment.Left, 39);
    this.soundItem.name = 'Focus Waves Sound';
    this.soundItem.command = 'focuswaves.toggleSound';
    this.context.subscriptions.push(this.timerItem, this.soundItem);
    this.paintStatus();
  }

  paintStatus() {
    if (!this.timerItem) return;
    const show = cfg().get('showInStatusBar', true);
    const t = this.timer;
    const s = this.summary();
    const icon = t.mode === 'focus' ? (t.running ? '$(pulse)' : '$(debug-pause)') : '$(coffee)';
    const idle = !t.running && t.remaining === minutesFor(t.mode) * 60;
    this.timerItem.text = idle && t.mode === 'focus' ? '$(play) Focus' : `${icon} ${fmt(this.left())}`;
    this.timerItem.command = idle ? 'focuswaves.startFocus' : 'focuswaves.toggleTimer';
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['focuswaves.toggleTimer', 'focuswaves.resetTimer', 'focuswaves.skip', 'focuswaves.setTask', 'focuswaves.open', 'focuswaves.openRoom'] };
    md.appendMarkdown(`**Focus Waves** · ${MODE_LABEL[t.mode]}${t.running ? '' : ' (paused)'}\n\n`);
    if (t.task) md.appendMarkdown(`Working on: ${t.task.replace(/[\\`*_[\]<>]/g, '\\$&')}\n\n`);
    md.appendMarkdown(`Today: ${human(s.todaySec)} · ${s.todaySessions} session${s.todaySessions === 1 ? '' : 's'}${s.streak > 1 ? ` · ${s.streak} day streak` : ''}\n\n`);
    md.appendMarkdown('[$(debug-pause) Pause/Resume](command:focuswaves.toggleTimer) · [$(debug-restart) Reset](command:focuswaves.resetTimer) · [$(debug-step-over) Skip](command:focuswaves.skip) · [$(edit) Task](command:focuswaves.setTask) · [$(layout-sidebar-left) Open](command:focuswaves.open) · [$(screen-full) Focus Room](command:focuswaves.openRoom)');
    this.timerItem.tooltip = md;
    this.timerItem.backgroundColor = t.running && t.mode === 'focus' && this.left() < 60 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;

    const name = this.mixName();
    this.soundItem.text = this.sound.playing ? (this.sound.blocked ? '$(unmute) Click panel for sound' : `$(unmute) ${name}`) : '$(mute) Sounds';
    this.soundItem.tooltip = this.sound.blocked
      ? 'VS Code needs one click inside the Focus Waves panel before it can play sound. After that the status bar controls work on their own.'
      : this.sound.playing ? `Playing "${name}". Click to pause.` : 'Play your Focus Waves sounds';
    if (show) { this.timerItem.show(); this.soundItem.show(); } else { this.timerItem.hide(); this.soundItem.hide(); }
  }

  mixName() {
    const m = this.catalog.MIXES.find((x) => x.id === this.sound.active);
    if (m) return m.name;
    const ids = Object.keys(this.sound.mix || {});
    if (!ids.length) return 'Silence';
    const names = ids.map((id) => (this.catalog.SOUNDS.find((s) => s.id === id) || { name: id }).name);
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  }

  refresh() {
    this.paintStatus();
    this.post({ type: 'timer', timer: this.timerState(), stats: this.summary() });
    this.postRoom();
  }

  // ---------- Focus Room (the living sea in an editor tab) ----------
  roomState() {
    const live = this.sound.playing && !this.sound.blocked;
    return {
      type: 'state',
      timer: this.timerState(),
      stats: this.summary(),
      sound: { playing: this.sound.playing, blocked: !!this.sound.blocked, name: this.sound.playing ? this.mixName() : '', levels: live ? this.sound.mix : {} },
    };
  }

  postRoom() {
    if (this.room) this.room.webview.postMessage(this.roomState());
  }

  openRoom() {
    if (this.room) { this.room.reveal(); return; }
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel('focuswaves.room', 'Focus Room', vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media],
    });
    panel.iconPath = vscode.Uri.joinPath(media, 'icon.png');
    const nonce = crypto.randomBytes(16).toString('base64');
    const u = (...p) => panel.webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
    panel.webview.html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; img-src ${panel.webview.cspSource} data: blob:; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${u('room.css')}">
<title>Focus Room</title>
</head>
<body>
<canvas id="scene" aria-hidden="true"></canvas>
<div class="vignette" aria-hidden="true"></div>
<div class="top"><div class="brand">Focus <i>Waves</i></div></div>
<div class="mode"></div>
<div class="today"></div>
<div class="task"></div>
<div class="dock">
  <button class="main" id="t" data-a="timer"></button>
  <button id="s" data-a="sound" title="Sounds"></button>
  <span class="now"></span>
  <span class="sep"></span>
  <button data-a="mix" title="Choose a mix">Mixes</button>
  <button data-a="zen" title="Zen Mode: hide everything else">Zen</button>
</div>
<script nonce="${nonce}" src="${u('engine', 'scene.js')}"></script>
<script nonce="${nonce}" src="${u('room.js')}"></script>
</body>
</html>`;
    panel.webview.onDidReceiveMessage((m) => {
      if (m.type === 'roomReady') this.postRoom();
      else if (m.type === 'room') {
        if (m.action === 'timer') this.toggle();
        else if (m.action === 'sound') vscode.commands.executeCommand('focuswaves.toggleSound');
        else if (m.action === 'mix') vscode.commands.executeCommand('focuswaves.pickMix');
        else if (m.action === 'zen') vscode.commands.executeCommand('workbench.action.toggleZenMode');
      }
    });
    panel.onDidDispose(() => { this.room = null; this.post({ type: 'room', open: false }); });
    this.room = panel;
    this.post({ type: 'room', open: true });
  }

  // ---------- webview ----------
  async post(msg, reveal = false) {
    if (this.view && this.viewReady) {
      this.view.webview.postMessage(msg);
      return;
    }
    if (!reveal) return;
    this.queue.push(msg);
    // The sound engine lives in the sidebar view; open it so it can start.
    await vscode.commands.executeCommand('focuswaves.panel.focus');
  }

  resolveWebviewView(view) {
    this.view = view;
    this.viewReady = false;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    view.webview.onDidReceiveMessage((m) => this.receive(m));
    view.onDidDispose(() => {
      this.view = null; this.viewReady = false;
      if (this.sound.playing) { this.sound.playing = false; this.paintStatus(); }
    });
  }

  receive(m) {
    switch (m.type) {
      case 'ready':
        this.viewReady = true;
        this.view.webview.postMessage({ type: 'init', sound: this.sound, timer: this.timerState(), stats: this.summary(), room: !!this.room });
        for (const q of this.queue.splice(0)) this.view.webview.postMessage(q);
        break;
      case 'sound':
        {
          const wasBlocked = this.sound.blocked;
          this.sound = { ...this.sound, ...m.sound };
          this.saveSound();
          this.paintStatus();
          this.postRoom();
          // Sound is waiting for one click in the panel: bring the panel up so the button is in view.
          if (this.sound.blocked && !wasBlocked && this.view && !this.view.visible) this.view.show(true);
        }
        break;
      case 'timer':
        if (m.action === 'start') this.start();
        else if (m.action === 'pause') this.pause();
        else if (m.action === 'toggle') this.toggle();
        else if (m.action === 'reset') this.reset();
        else if (m.action === 'skip') this.skip();
        else if (m.action === 'mode') this.setMode(m.mode);
        break;
      case 'task':
        this.timer.task = String(m.task || '').slice(0, 200);
        this.saveTimer();
        this.paintStatus();
        break;
      case 'openRoom':
        this.openRoom();
        break;
      case 'events':
        if (this.room) this.room.webview.postMessage({ type: 'events', events: m.events });
        break;
      case 'diag':
        this.diag = (this.diag || []).concat(m).slice(-20);
        break;
      case 'audioError':
        vscode.window.showWarningMessage(`Focus Waves could not start its sound engine here (${m.message}). The timer still works.`);
        break;
      case 'link':
        if (/^https:\/\/[\w.-]+(\/[\w./?=&%-]*)?$/.test(String(m.url))) vscode.env.openExternal(vscode.Uri.parse(m.url));
        break;
    }
  }

  html(webview, media) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const u = (...p) => webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' ${webview.cspSource}; media-src ${webview.cspSource} blob: data:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${u('panel.css')}">
<title>Focus Waves</title>
</head>
<body>
<div id="card" class="card">
  <canvas id="scene" aria-hidden="true"></canvas>
  <div class="c-shade" aria-hidden="true"></div>
  <div class="c-top">
    <span class="c-mode pill"></span>
    <button class="pill c-full" data-act="room" title="Open the Focus Room in a full tab"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>Full screen</button>
  </div>
  <button class="c-center" data-act="cardplay" title="Start or pause the timer">
    <span class="c-digits" aria-live="polite"></span>
    <span class="c-date"></span>
    <span class="c-line"></span>
  </button>
  <div class="c-progress"><span class="c-bar"></span></div>
</div>
<div id="app"></div>
<script nonce="${nonce}">window.FW_WORKLET_URL = ${JSON.stringify(String(u('engine', 'nature-worklet.js')))};</script>
<script nonce="${nonce}" src="${u('engine', 'sounds.js')}"></script>
<script nonce="${nonce}" src="${u('engine', 'audio.js')}"></script>
<script nonce="${nonce}" src="${u('engine', 'scene.js')}"></script>
<script nonce="${nonce}" src="${u('panel.js')}"></script>
</body>
</html>`;
  }
}

let fwInstance = null;

function activate(context) {
  const fw = new FocusWaves(context);
  fwInstance = fw;
  fw.createStatus();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('focuswaves.panel', fw, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('focuswaves')) return;
      // New session lengths apply to a timer that has not started yet.
      if (!fw.timer.running && fw.timer.remaining > 0 && !fw._touched) fw.timer.remaining = minutesFor(fw.timer.mode) * 60;
      fw.refresh();
    }),
  );

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('focuswaves.startFocus', () => fw.start('focus'));
  reg('focuswaves.startBreak', () => fw.start('short'));
  reg('focuswaves.toggleTimer', () => fw.toggle());
  reg('focuswaves.resetTimer', () => fw.reset());
  reg('focuswaves.skip', () => fw.skip());
  reg('focuswaves.setTask', async () => {
    const task = await vscode.window.showInputBox({ title: 'Focus Waves', prompt: 'What are you working on?', value: fw.timer.task, placeHolder: 'e.g. Fix the login bug' });
    if (task === undefined) return;
    fw.timer.task = task.trim();
    fw.saveTimer();
    fw.refresh();
    fw.post({ type: 'task', task: fw.timer.task });
  });
  reg('focuswaves.toggleSound', () => {
    if (fw.sound.blocked) return vscode.commands.executeCommand('focuswaves.panel.focus');
    return fw.post({ type: 'cmd', cmd: fw.sound.playing ? 'pause' : 'play' }, !fw.sound.playing);
  });
  reg('focuswaves.volumeUp', () => fw.post({ type: 'cmd', cmd: 'volume', delta: 0.1 }, false));
  reg('focuswaves.volumeDown', () => fw.post({ type: 'cmd', cmd: 'volume', delta: -0.1 }, false));
  reg('focuswaves.pickMix', async () => {
    const cats = { focus: 'Focus', nature: 'Nature', music: 'Music' };
    const items = [];
    for (const cat of ['focus', 'nature', 'music']) {
      items.push({ label: cats[cat], kind: vscode.QuickPickItemKind.Separator });
      for (const m of fw.catalog.MIXES.filter((x) => x.cat === cat)) {
        items.push({ label: `${m.id === fw.sound.active ? '$(check) ' : ''}${m.name}`, description: m.pulse ? `${m.pulse.hz} Hz pulse` : '', detail: m.note, id: m.id });
      }
    }
    const pick = await vscode.window.showQuickPick(items, { title: 'Focus Waves', placeHolder: 'Choose a mix', matchOnDetail: true });
    if (pick && pick.id) fw.post({ type: 'cmd', cmd: 'mix', id: pick.id }, true);
  });
  reg('focuswaves.showStats', async () => {
    const s = fw.summary();
    const lines = [];
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const st = fw.stats[k] || { sec: 0, sessions: 0 };
      lines.push({ label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), description: `${human(st.sec)} · ${st.sessions} session${st.sessions === 1 ? '' : 's'}` });
      d.setDate(d.getDate() - 1);
    }
    await vscode.window.showQuickPick(lines, { title: `Focus Waves · this week ${human(s.weekSec)}${s.streak > 1 ? ` · ${s.streak} day streak` : ''}`, placeHolder: 'Your focused time, last 7 days' });
  });
  reg('focuswaves.openRoom', () => fw.openRoom());
  reg('focuswaves.open', () => vscode.commands.executeCommand('focuswaves.panel.focus'));
  reg('focuswaves.openWebsite', () => vscode.env.openExternal(vscode.Uri.parse('https://focus.freakingwaves.com')));

  if (!context.globalState.get('fw.welcomed')) {
    context.globalState.update('fw.welcomed', true);
    vscode.window.showInformationMessage('Focus Waves is ready. Pick a mix and start a focus session.', 'Open Focus Waves').then((c) => { if (c) vscode.commands.executeCommand('focuswaves.panel.focus'); });
  }
  return fw; // used by the tests
}

function deactivate() {
  if (fwInstance) { fwInstance.account(); fwInstance.saveTimer(); }
}

module.exports = { activate, deactivate };
