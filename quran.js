/* =========================================================
   QURAN — streams full-surah MP3s from quranicaudio.com
   (a free Quran audio CDN). Files are NOT hosted on your site.
   To add a reciter, add { name, path } where path is the folder
   on https://download.quranicaudio.com/quran/<path>/001.mp3
   ========================================================= */
const QURAN_BASE = "https://download.quranicaudio.com/quran/";
// Backup CDN, tried automatically if the first one fails.
const QURAN_ALT = "https://cdn.islamic.network/quran/audio-surah/";

// path = folder on quranicaudio.com, alt = edition on islamic.network
const RECITERS = [
  { name: "Mishary Rashid Alafasy",   path: "mishaari_raashid_al_3afaasee", alt: "ar.alafasy" },
  { name: "Abdul Basit (Murattal)",   path: "abdul_basit_murattal",         alt: "ar.abdulbasitmurattal" },
  { name: "Mahmoud Khalil Al-Husary", path: "mahmood_khaleel_al-husaree",   alt: "ar.husary" },
  { name: "Abdur-Rahman As-Sudais",   path: "abdurrahmaan_as-sudays",       alt: "ar.abdurrahmaansudais" },
  { name: "Saad Al-Ghamdi",           path: "sa3d_al-ghaamidi/complete",    alt: null },
  { name: "Maher Al-Muaiqly",         path: "maher_almu3aiqly/year1440",    alt: "ar.mahermuaiqly" },
  { name: "Saud Ash-Shuraim",         path: "sa3ood_al-shuraym",            alt: "ar.saoodshuraym" },
];

// Every URL to try for one surah, best first.
function quranSources(r, surah) {
  const list = [`${QURAN_BASE}${r.path}/${String(surah).padStart(3, "0")}.mp3`];
  if (r.alt) for (const kbps of [128, 64, 192]) list.push(`${QURAN_ALT}${kbps}/${r.alt}/${surah}.mp3`);
  return list;
}

const SURAHS = ["Al-Fatihah","Al-Baqarah","Ali 'Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus","Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Taha","Al-Anbya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-'Ankabut","Ar-Rum","Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shuraa","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah","As-Saf","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","'Abasa","At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad","Ash-Shams","Al-Layl","Ad-Duhaa","Ash-Sharh","At-Tin","Al-'Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-'Adiyat","Al-Qari'ah","At-Takathur","Al-'Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"];
