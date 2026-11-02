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
| `index.html`, `style.css` | Page and design. Colours and fonts are the tokens at the top of `style.css` (same palette as freakingwaves.com) |
| `nature-worklet.js` | **The sound engine.** Every sound is synthesised live in an AudioWorklet, so nothing loops or repeats |
| `audio.js` | Connects the engine to the speakers: reverb, limiter, Quran ducking, chime |
| `scene.js` | The living sea. Follows local time of day and reacts to sound events (lightning before thunder, foam when a wave breaks, sparks, drips, birds) |
| `sounds.js` | Sound list, icons and the curated mixes |
| `i18n.js` | English (default) and Bangla text |
| `quran.js` | Reciters, surah names, audio sources |
| `app.js` | Everything you click: intro, faders, mixes, share links, focus sessions, zen mode, stats, Quran player |
| `sw.js`, `manifest.webmanifest` | Installable app / offline support |

## Sounds
Rain, tin roof, thunder, waves, wind, birds (koel, spotted dove, songbirds), stream, fireplace, crickets, frogs, fan, white / pink / brown noise.
Each one is a small simulation with random events and slowly drifting character, not a recording.
To change how a mix sounds, edit `MIXES` in `sounds.js`; values are 0 to 1.

## Share links
"Copy link to this mix" gives a link like `focus.freakingwaves.com/#mix=rain-60.waves-30`. Opening it loads that mix.

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
