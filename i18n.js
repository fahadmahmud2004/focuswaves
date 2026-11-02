/* English is the default language; Bangla via the toggle in the header. */
const STR = {
  bn: {
    title: "FocusWaves · মনোযোগের ঢেউ",
    by: "by Freaking Waves",
    langBtn: "EN",
    intent: "আজ কী নিয়ে ফোকাস করছ?",
    focus: "ফোকাস",
    break: "বিরতি · একটু হাঁটো, পানি খাও",
    start: "ফোকাস শুরু", pause: "থামাও", resume: "চালিয়ে যাও", startBreak: "বিরতি শুরু", reset: "রিসেট",
    min: "মিনিট",
    sounds: "সাউন্ড", tap: "যেকোনো একটা সাউন্ডে ট্যাপ করো", yourMix: "তোমার মিক্স",
    mixes: "মিক্স", save: "সেভ", mixName: "মিক্সের নাম দাও",
    quran: "কুরআন", surah: "সূরা", reciter: "ক্বারী",
    under: "তিলাওয়াতের পেছনে প্রকৃতির শব্দ", underLvl: "পেছনের শব্দ",
    underHint: "কুরআন চলার সময় পেছনের শব্দ নিজে থেকেই নিচু হয়ে যায়, যাতে প্রতিটি শব্দ স্পষ্ট শোনা যায়।",
    auto: "পরের সূরা চালাও", repeat: "এই সূরা বারবার চালাও",
    loading: "লোড হচ্ছে…", buffering: "বাফারিং…",
    errPlay: "চালানো যায়নি। ইন্টারনেট দেখো, বা অন্য ক্বারী বেছে নাও।",
    errLoad: "এই তিলাওয়াতটা লোড হয়নি। অন্য ক্বারী বেছে নাও।",
    done: "সেশন শেষ, আলহামদুলিল্লাহ 🌊 এবার একটু বিরতি।",
    breakOver: "বিরতি শেষ। তৈরি হলে আবার শুরু করো।",
    nTitleDone: "ফোকাস সেশন শেষ", nBodyDone: "এবার একটু বিরতি নাও।",
    nTitleBreak: "বিরতি শেষ", nBodyBreak: "পরের সেশনের জন্য তৈরি?",
    turnOn: "আগে কয়েকটা সাউন্ড চালু করো।", saved: "সেভ হয়েছে", cantLoad: "লোড হয়নি",
    today: "আজ", streak: "দিনের ধারা", h: "ঘ", m: "মি",
    play: "সাউন্ড চালাও", pauseSounds: "সাউন্ড থামাও", close: "বন্ধ করো", master: "মূল ভলিউম",
  },
  en: {
    title: "FocusWaves · deep focus by the sea",
    by: "by Freaking Waves",
    langBtn: "বাং",
    intent: "What are you focusing on?",
    focus: "Focus",
    break: "Break · stretch, drink some water",
    start: "Start focus", pause: "Pause", resume: "Resume", startBreak: "Start break", reset: "Reset",
    min: "min",
    sounds: "Sounds", tap: "Tap a sound to begin", yourMix: "Your mix",
    mixes: "Mixes", save: "Save", mixName: "Name this mix",
    quran: "Quran", surah: "Surah", reciter: "Reciter",
    under: "Nature sounds behind recitation", underLvl: "Background",
    underHint: "Sounds drop low on their own while the Quran plays, so every word stays clear.",
    auto: "Continue to next surah", repeat: "Repeat this surah",
    loading: "Loading…", buffering: "Buffering…",
    errPlay: "Couldn't play. Check your connection or pick another reciter.",
    errLoad: "This recitation couldn't load. Pick another reciter.",
    done: "Session complete, Alhamdulillah 🌊 Take a short break.",
    breakOver: "Break's over. Start again when you're ready.",
    nTitleDone: "Focus session complete", nBodyDone: "Time for a short break.",
    nTitleBreak: "Break over", nBodyBreak: "Ready for the next session?",
    turnOn: "Turn on a few sounds first.", saved: "Saved", cantLoad: "Couldn't load",
    today: "today", streak: "day streak", h: "h", m: "m",
    play: "Play sounds", pauseSounds: "Pause sounds", close: "Close", master: "Master volume",
  },
};
let LANG = (() => { try { return localStorage.getItem("fw:lang") || "en"; } catch { return "en"; } })();
const t = k => STR[LANG][k] ?? STR.en[k] ?? k;
const nameOf = o => (LANG === "bn" && o.bn) || o.name;
function applyI18n() {
  document.documentElement.lang = LANG;
  document.title = t("title");
  document.querySelectorAll("[data-t]").forEach(el => (el.textContent = t(el.dataset.t)));
  document.querySelectorAll("[data-t-ph]").forEach(el => (el.placeholder = t(el.dataset.tPh)));
  document.querySelectorAll("[data-t-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.tAria)));
}
