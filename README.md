# FocusWaves

**FocusWaves by Freaking Waves**, live at focus.freakingwaves.com.

A living sea for deep focus: mix calm nature sounds, run focus sessions, and listen to the Quran with soft sounds behind the recitation. English and Bangla.
It is a static site: no server, no database, no build step. It runs on the Cloudflare Pages free tier.

## Deploy (Cloudflare Pages, free)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. Project name: `focuswaves` → drag this whole folder in → **Deploy**
3. Project → **Custom domains** → **Set up a custom domain** → `focus.freakingwaves.com`
   - If freakingwaves.com DNS is on Cloudflare, the record is added automatically.
   - Otherwise add a CNAME at your DNS provider: `focus` → `focuswaves.pages.dev`

To update later, upload the folder again (or connect a GitHub repo for auto-deploy).

## Files
| File | What it is |
|---|---|
| `index.html`, `style.css` | Page and design. Brand colors and fonts are the tokens at the top of `style.css` |
| `scene.js` | The living sea: follows local time of day and reacts to the sound mix |
| `sounds.js` | Sound list, icons, ready-made mixes, and **your own recorded sounds** |
| `gen.js`, `audio-worker.js` | Built-in sounds, generated in a background worker (no audio files) |
| `quran.js` | Reciters and surah names |
| `i18n.js` | English / Bangla text (English is default) |
| `app.js` | Player, focus sessions, stats, mixes, Quran player with background ducking |
| `sw.js`, `manifest.webmanifest` | Installable app / offline support |

## Adding your own sounds
Put a loopable `.mp3`/`.ogg` in `sounds/` and add a line in `CUSTOM_SOUNDS` in `sounds.js`.
Only use audio you recorded or that is CC0 / free to use (freesound.org with CC0 filter, pixabay.com/sound-effects).
Keep each file under 25 MB (Cloudflare Pages limit). 1–3 MB per loop is ideal.

## Quran audio
Sources are tried in order until one plays (12 s timeout each):
1. **Your own Cloudflare R2** (set `QURAN_OWN` in `quran.js`)
2. quranicaudio.com
3. islamic.network (backup)

### Using your own R2
1. Cloudflare → R2 → **Create bucket** `focuswaves-audio`
2. Bucket → **Settings → Custom Domains → Connect Domain** → `audio.freakingwaves.com`
   (use a custom domain, not the r2.dev URL: r2.dev is rate-limited and has no caching)
3. Upload files as `quran/<reciter id>/<001..114>.mp3`, e.g. `quran/alafasy/001.mp3`.
   Reciter ids are in `quran.js` (alafasy, abdulbasit, husary, sudais, ghamdi, muaiqly, shuraim).
   You don't need every reciter: a missing file falls back to the public sources automatically.
4. In `quran.js` set `const QURAN_OWN = "https://audio.freakingwaves.com/quran/";`
