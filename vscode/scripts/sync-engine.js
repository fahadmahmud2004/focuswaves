// Copies the sound engine from the website into the extension, so both play exactly the same sounds.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'media', 'engine');
fs.mkdirSync(out, { recursive: true });
for (const f of ['nature-worklet.js', 'sounds.js']) fs.copyFileSync(path.join(root, f), path.join(out, f));
// The scene fills the whole window on the website. In VS Code it also lives in a card in the sidebar, so it sizes to its canvas.
let scene = fs.readFileSync(path.join(root, 'scene.js'), 'utf8');
const swaps = [
  ['W = innerWidth; H = innerHeight;', 'W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;'],
  ['addEventListener("resize", resize);', 'addEventListener("resize", resize); if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);'],
];
for (const [a, b] of swaps) {
  if (!scene.includes(a)) throw new Error(`scene.js changed: "${a}" not found`);
  scene = scene.replace(a, b);
}
fs.writeFileSync(path.join(out, 'scene.js'), scene);
let audio = fs.readFileSync(path.join(root, 'audio.js'), 'utf8');
const before = 'addModule("nature-worklet.js")';
if (!audio.includes(before)) throw new Error('audio.js changed: worklet path not found');
audio = audio.replace(before, 'addModule(window.FW_WORKLET_URL || "nature-worklet.js")');
fs.writeFileSync(path.join(out, 'audio.js'), audio);
console.log('engine synced');
