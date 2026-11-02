/* Sound catalogue and curated mixes. Every sound is generated live by nature-worklet.js. */
const ICONS = {
  rain:    '<path d="M7 14.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7a3.75 3.75 0 0 1 .25 7.5"/><path d="M8.5 17.5 7.5 20M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
  tinroof: '<path d="M2 9.5 12 4l10 5.5"/><path d="M4 10.5c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0"/><path d="M6 14v1.5M11 14v3M16 14v2"/>',
  thunder: '<path d="M7 13.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6a3.75 3.75 0 0 1 .25 7.5"/><path d="m12.5 12-2.5 4h3.5L11 20.5"/>',
  waves:   '<path d="M2 8.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 13.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 18.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  wind:    '<path d="M3 8h10.5a2.75 2.75 0 1 0-2.75-2.75"/><path d="M3 12h15.5a2.75 2.75 0 1 1-2.75 2.75"/><path d="M3 16h7"/>',
  birds:   '<path d="M3 12c2-2.5 4.5-2.5 6 0 1.5-2.5 4-2.5 6 0"/><path d="M13 7.5c1.2-1.5 2.8-1.5 3.8 0 1-1.5 2.6-1.5 3.7 0"/>',
  stream:  '<path d="M5 3c3 3-1 6 2 9s-1 6 2 9"/><path d="M12 3c3 3-1 6 2 9s-1 6 2 9"/><path d="M19 3c3 3-1 6 2 9"/>',
  fire:    '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  crickets:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 3.5v2M16 4.5h2M20.5 8v1.5M19.75 8.75h1.5"/>',
  frogs:   '<path d="M3.5 15.5c0-3.6 3.8-6 8.5-6s8.5 2.4 8.5 6c0 2.4-3.8 3.5-8.5 3.5s-8.5-1.1-8.5-3.5z"/><circle cx="8" cy="8.5" r="2"/><circle cx="16" cy="8.5" r="2"/><path d="M3.5 17 2 19.5M20.5 17l1.5 2.5"/>',
  fan:     '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 6 9.2 3.8 7.2 4.8S6 9 12 10.4M13.6 12c4.4 0 6.6 2.8 5.6 4.8s-4.2 1.2-5.6-4.8M10.4 12.6C6.8 15 6.8 19 8.8 19.5s3.4-2.4 1.6-6.9"/>',
  white:   '<path d="M2.5 12h2l1.2-5 2 10 2-12 2 14 2-10 2 6 1.3-3h4.5"/>',
  pink:    '<path d="M2.5 12h3l1.5-4 2 8 2-9 2 9 2-6 1.5 2h5"/>',
  brown:   '<path d="M2.5 13c2-3 3-3 5 0s3 3 5 0 3-3 5 0 2.5 2 4 1"/>',
};

const SOUNDS = [
  { id: "rain",     name: "Rain",        bn: "বৃষ্টি" },
  { id: "tinroof",  name: "Tin roof",    bn: "টিনের চাল" },
  { id: "thunder",  name: "Thunder",     bn: "বাজ" },
  { id: "waves",    name: "Waves",       bn: "ঢেউ" },
  { id: "wind",     name: "Wind",        bn: "বাতাস" },
  { id: "birds",    name: "Birds",       bn: "পাখি" },
  { id: "stream",   name: "Stream",      bn: "ঝর্ণা" },
  { id: "fire",     name: "Fireplace",   bn: "আগুন" },
  { id: "crickets", name: "Crickets",    bn: "ঝিঁঝিঁ" },
  { id: "frogs",    name: "Frogs",       bn: "ব্যাঙ" },
  { id: "fan",      name: "Fan",         bn: "ফ্যান" },
  { id: "white",    name: "White noise", bn: "হোয়াইট নয়েজ" },
  { id: "pink",     name: "Pink noise",  bn: "পিংক নয়েজ" },
  { id: "brown",    name: "Brown noise", bn: "ব্রাউন নয়েজ" },
];

// Curated mixes. Sliders are 0..1 (shown as %); mood tints the scene.
const MIXES = [
  { id: "coxs",   name: "Cox's Bazar",  bn: "কক্সবাজার",    note: "Evening on the longest beach",        noteBn: "সবচেয়ে লম্বা সৈকতে সন্ধ্যা",   mix: { waves: 0.8, wind: 0.3 } },
  { id: "borsha", name: "Borsha",       bn: "বর্ষা",         note: "Monsoon on a tin roof",               noteBn: "টিনের চালে বর্ষার দুপুর",       mix: { tinroof: 0.7, rain: 0.45, frogs: 0.3, thunder: 0.25 } },
  { id: "kalbo",  name: "Kalboishakhi", bn: "কালবৈশাখী",    note: "A nor'wester rolls in",               noteBn: "বিকেলে কালবৈশাখী নামছে",        mix: { rain: 0.75, thunder: 0.6, wind: 0.55 } },
  { id: "bhor",   name: "Village dawn", bn: "গ্রামের ভোর",   note: "Koel, doves and a quiet stream",      noteBn: "কোকিল, ঘুঘু আর ছোট্ট ঝর্ণা",     mix: { birds: 0.65, stream: 0.35, wind: 0.15 } },
  { id: "sheet",  name: "Winter night", bn: "শীতের রাত",    note: "A warm fire, crickets outside",       noteBn: "আগুনের পাশে, বাইরে ঝিঁঝিঁ",      mix: { fire: 0.7, crickets: 0.3, wind: 0.2 } },
  { id: "rraat",  name: "Rainy night",  bn: "বৃষ্টির রাত",   note: "Steady rain and the frogs' chorus",   noteBn: "টানা বৃষ্টি আর ব্যাঙের ডাক",     mix: { rain: 0.6, frogs: 0.45, crickets: 0.15 } },
  { id: "hall",   name: "Hall room",    bn: "হলের রুম",     note: "Ceiling fan, nothing else. Study.",   noteBn: "মাথার উপর ফ্যান, আর কিছু না",    mix: { fan: 0.65, brown: 0.3 } },
  { id: "deep",   name: "Deep work",    bn: "গভীর মনোযোগ",  note: "Brown noise to block the world out",  noteBn: "চারপাশ ঢেকে দেওয়া ব্রাউন নয়েজ", mix: { brown: 0.55, pink: 0.2 } },
];
