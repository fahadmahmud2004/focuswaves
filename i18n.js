/* English by default; Bangla with the toggle. */
const STR = {
  en: {
    title: "FocusWaves", langBtn: "বাং",
    tagline: "Sit by the sea. Get your work done.", begin: "Begin", headphones: "Best with headphones",
    sharedMix: "Someone shared a mix with you: ",
    intent: "What are you working on?", length: "Session length",
    focus: "Focus", break: "Short break", longBreak: "Long break", breakHint: "stand up, drink some water",
    start: "Start focus", pause: "Pause", resume: "Resume", startBreak: "Start break", reset: "Reset", min: "min",
    sounds: "Sounds", tap: "Tap any sound to begin", yourMix: "Your mix", silent: "Paused",
    mixes: "Mixes", save: "Save", mixName: "Name this mix", share: "Copy link to this mix", copied: "Link copied. Send it to a friend.",
    turnOn: "Turn on a sound or two first.", saved: "Saved", sharedLoaded: "Loaded the shared mix",
    quran: "Quran", surah: "Surah", reciter: "Reciter",
    under: "Nature sounds behind recitation", underLvl: "Background",
    underHint: "Sounds drop low on their own while the Quran plays, so every word stays clear.",
    auto: "Continue to next surah", repeat: "Repeat this surah",
    loading: "Loading…", buffering: "Buffering…",
    errPlay: "Couldn't play. Check your connection or pick another reciter.",
    errLoad: "This recitation couldn't load. Pick another reciter.",
    errBlocked: "This preview page blocks outside audio. The Quran will play on the real site.",
    done: "Session done. Alhamdulillah. Take a short break.", doneLong: "Four sessions done. You've earned a long break.",
    breakOver: "Break's over. Start again when you're ready.",
    nDone: "Focus session complete", nDoneB: "Time for a break.", nBreak: "Break over", nBreakB: "Ready for the next one?",
    today: "today", streak: "day streak",
    play: "Play sounds", pauseSounds: "Pause sounds", close: "Close", master: "Master volume", fullscreen: "Full screen",
    playQ: "Play recitation", prevS: "Previous surah", nextS: "Next surah", seek: "Seek",
    noAudio: "Your browser can't run the sound engine. Try the latest Chrome, Safari or Firefox.",
  },
  bn: {
    title: "FocusWaves", langBtn: "EN",
    tagline: "সমুদ্রের পাড়ে বসো। কাজটা শেষ করো।", begin: "শুরু করো", headphones: "হেডফোনে সবচেয়ে ভালো লাগবে",
    sharedMix: "তোমার সাথে একটা মিক্স শেয়ার করা হয়েছে: ",
    intent: "আজ কী নিয়ে কাজ করছ?", length: "সেশনের সময়",
    focus: "ফোকাস", break: "ছোট বিরতি", longBreak: "লম্বা বিরতি", breakHint: "উঠে দাঁড়াও, একটু পানি খাও",
    start: "ফোকাস শুরু", pause: "থামাও", resume: "চালিয়ে যাও", startBreak: "বিরতি শুরু", reset: "রিসেট", min: "মিনিট",
    sounds: "সাউন্ড", tap: "যেকোনো একটা সাউন্ডে ট্যাপ করো", yourMix: "তোমার মিক্স", silent: "থেমে আছে",
    mixes: "মিক্স", save: "সেভ", mixName: "মিক্সের নাম দাও", share: "এই মিক্সের লিংক কপি করো", copied: "লিংক কপি হয়েছে। বন্ধুকে পাঠাও।",
    turnOn: "আগে এক-দুটো সাউন্ড চালু করো।", saved: "সেভ হয়েছে", sharedLoaded: "শেয়ার করা মিক্সটা চালু হয়েছে",
    quran: "কুরআন", surah: "সূরা", reciter: "ক্বারী",
    under: "তিলাওয়াতের পেছনে প্রকৃতির শব্দ", underLvl: "পেছনের শব্দ",
    underHint: "কুরআন চলার সময় পেছনের শব্দ নিজে থেকেই নিচু হয়ে যায়, যাতে প্রতিটা শব্দ স্পষ্ট শোনা যায়।",
    auto: "পরের সূরা চালাও", repeat: "এই সূরা বারবার চালাও",
    loading: "লোড হচ্ছে…", buffering: "বাফারিং…",
    errPlay: "চালানো যায়নি। ইন্টারনেট দেখো, বা অন্য ক্বারী বেছে নাও।",
    errLoad: "এই তিলাওয়াতটা লোড হয়নি। অন্য ক্বারী বেছে নাও।",
    errBlocked: "এই প্রিভিউ পেজ বাইরের অডিও ব্লক করছে। আসল সাইটে কুরআন চলবে।",
    done: "সেশন শেষ, আলহামদুলিল্লাহ। এবার একটু বিরতি।", doneLong: "চারটা সেশন শেষ। এবার লম্বা বিরতি তোমার পাওনা।",
    breakOver: "বিরতি শেষ। তৈরি হলে আবার শুরু করো।",
    nDone: "ফোকাস সেশন শেষ", nDoneB: "এবার একটু বিরতি নাও।", nBreak: "বিরতি শেষ", nBreakB: "পরের সেশনের জন্য তৈরি?",
    today: "আজ", streak: "দিনের ধারা",
    play: "সাউন্ড চালাও", pauseSounds: "সাউন্ড থামাও", close: "বন্ধ করো", master: "মূল ভলিউম", fullscreen: "ফুল স্ক্রিন",
    playQ: "তিলাওয়াত চালাও", prevS: "আগের সূরা", nextS: "পরের সূরা", seek: "সামনে-পেছনে",
    noAudio: "তোমার ব্রাউজারে সাউন্ড চলছে না। Chrome, Safari বা Firefox-এর নতুন ভার্সন দিয়ে চেষ্টা করো।",
  },
};
let LANG = (() => { try { return localStorage.getItem("fw:lang") || "en"; } catch { return "en"; } })();
const t = k => STR[LANG][k] ?? STR.en[k] ?? k;
const nameOf = o => (LANG === "bn" && o.bn) || o.name;
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-t]").forEach(el => (el.textContent = t(el.dataset.t)));
  document.querySelectorAll("[data-t-ph]").forEach(el => (el.placeholder = t(el.dataset.tPh)));
  document.querySelectorAll("[data-t-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.tAria)));
}
