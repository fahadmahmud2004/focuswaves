/* =========================================================
   SOUND LIBRARY
   ---------------------------------------------------------
   Built-in sounds are generated in the browser (no files, no
   copyright worries, zero bandwidth).

   To add your OWN recorded sound:
     1. Put a loopable file in /sounds  (e.g. sounds/birds.mp3)
     2. Add an entry to CUSTOM_SOUNDS below:
        { id: "birds", name: "Birds", icon: "bird", file: "sounds/birds.mp3" }
   Use a CC0 / your-own recording (freesound.org CC0, pixabay.com/sound-effects).
   ========================================================= */
const CUSTOM_SOUNDS = [
  // { id: "birds", name: "Birds", icon: "bird", file: "sounds/birds.mp3" },
  // { id: "cafe",  name: "Café",  icon: "cup",  file: "sounds/cafe.mp3" },
];

const ICONS = {
  rain:   '<path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7.5 3.75 3.75 0 0 1 17.25 15"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
  storm:  '<path d="M7 14a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5 3.75 3.75 0 0 1 17.25 14"/><path d="M13 13l-3 4h4l-3 4"/>',
  wind:   '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  waves:  '<path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  fire:   '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  stream: '<path d="M4 4c4 2 0 6 4 8s0 6 4 8"/><path d="M12 4c4 2 0 6 4 8s0 6 4 8"/>',
  night:  '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 4v2M16 5h2"/>',
  fan:    '<circle cx="12" cy="12" r="1.5"/><path d="M12 10.5C12 6 9 4 7 5s-1 4 5 5.5M13.5 12c4.5 0 6.5 3 5.5 5s-4 1-5.5-5M10.5 12.5C7 15 7 19 9 19.5s3.5-2.5 1.5-7"/>',
  white:  '<path d="M3 12h2l1-5 2 10 2-12 2 14 2-10 2 6 1-3h4"/>',
  pink:   '<path d="M3 12h3l1.5-4 2 8 2-9 2 9 2-6 1.5 2H21"/>',
  brown:  '<path d="M3 13c2-3 3-3 5 0s3 3 5 0 3-3 5 0 2 2 3 1"/>',
  bird:   '<path d="M4 15c3 0 5-2 6-5 1-3 4-4 6-3l3 1-3 1c0 5-4 9-12 6z"/>',
  cup:    '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>',
  note:   '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
};

// Order matters (tiles appear in this order). seconds = loop length (longer = less repetitive).
const BUILTIN_SOUNDS = [
  { id: "rain",   name: "Rain", bn: "বৃষ্টি",       icon: "rain",   seconds: 24 },
  { id: "storm",  name: "Thunderstorm", bn: "বজ্রঝড়", icon: "storm", seconds: 45 },
  { id: "waves",  name: "Waves", bn: "ঢেউ",      icon: "waves",  seconds: 36 },
  { id: "wind",   name: "Wind", bn: "বাতাস",       icon: "wind",   seconds: 39 },
  { id: "stream", name: "Stream", bn: "ঝর্ণা",     icon: "stream", seconds: 24 },
  { id: "fire",   name: "Fireplace", bn: "আগুন",  icon: "fire",   seconds: 24 },
  { id: "night",  name: "Night", bn: "রাত",      icon: "night",  seconds: 34 },
  { id: "fan",    name: "Fan", bn: "ফ্যান",        icon: "fan",    seconds: 12 },
  { id: "white",  name: "White noise", bn: "হোয়াইট নয়েজ", icon: "white", seconds: 8 },
  { id: "pink",   name: "Pink noise", bn: "পিংক নয়েজ", icon: "pink",   seconds: 10 },
  { id: "brown",  name: "Brown noise", bn: "ব্রাউন নয়েজ", icon: "brown", seconds: 12 },
];

const BUILTIN_PRESETS = [
  { name: "Rainy study", bn: "বৃষ্টির দিনে পড়া",    mix: { rain: 0.65, brown: 0.25 } },
  { name: "Ocean focus", bn: "সমুদ্রের পাড়ে",    mix: { waves: 0.7, wind: 0.2 } },
  { name: "Cozy fireplace", bn: "আগুনের পাশে", mix: { fire: 0.7, rain: 0.35 } },
  { name: "Summer night", bn: "গ্রীষ্মের রাত",   mix: { night: 0.55, stream: 0.3, wind: 0.15 } },
  { name: "Deep focus", bn: "গভীর মনোযোগ",     mix: { brown: 0.55, fan: 0.3 } },
  { name: "Storm outside", bn: "বাইরে ঝড়",  mix: { storm: 0.6, fire: 0.3 } },
];
