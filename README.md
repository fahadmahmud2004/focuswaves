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
Streamed from quranicaudio.com. Nothing is stored on your site. After deploying, test each reciter once;
if one fails, fix its folder name in `quran.js` (check at https://quranicaudio.com).
