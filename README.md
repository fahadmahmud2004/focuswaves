# Focus Waves

**Focus Waves by Freaking Waves**, live at focus.freakingwaves.com.

A living sea for deep focus: mix calm nature sounds, run focus sessions, and listen to the Quran with soft sounds behind the recitation. English and Bangla.
It is a static site: no server, no database, no build step. It runs on the Cloudflare Pages free tier.

## Deploy
Hosted on **Cloudflare Workers (static assets only)**, connected to this GitHub repo.
Every push to `main` deploys automatically (Workers Builds runs `npx wrangler deploy`).
- `wrangler.jsonc` serves the repo root as static files; `.assetsignore` keeps repo-only files off the site.
- No Worker script runs, so it stays free and unlimited and uses none of the daily Worker request quota.
- Custom domain `focus.freakingwaves.com`: Worker → Settings → Domains & Routes.

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
- **Nature:** waves, wind, birds (koel, spotted dove, songbirds), stream, fireplace, seagulls, leaves, cicadas
- **Rain & storm:** rain, tin roof, thunder
- **Night:** crickets, frogs, owl
- **Music (optional, folded away):** lofi beats, soft piano, ambient pad, nylon guitar (fingerpicked, Karplus-Strong strings), kalimba, bansuri, tanpura drone, and a focus synth (even 16ths, no melody). The chord instruments follow one shared progression so they blend. **Music never plays while the Quran is playing**; nature sounds keep going.
- **Focus noise:** fan, white, pink, brown

Each one is a small simulation with random events and slowly drifting character, not a recording, so nothing loops.
"Close / Room / Far" in the Sounds panel changes how near the sounds feel (filter + reverb).
To change the curated mixes, edit `MIXES` in `sounds.js` (values 0 to 1; `cat` is nature, music or focus; `art` is the card colours).

## Deep focus (Focus pulse)
A rhythmic amplitude modulation applied to the sound bed above ~120 Hz (the low end stays steady, so it reads as a flutter instead of a throb) (the idea behind "neural phase locking": brain rhythms tend to follow
a steady rhythm in what you hear). Rates: Calm 6 Hz, Flow 10 Hz, Focus 14 Hz, Deep 16 Hz, with an intensity control.
A binaural beat (headphones) follows the same rate. 13 "Deep focus" mixes set sounds + rate + intensity for a task
(deep work, study, reading, memorizing, coding, problem solving, power nap, breaks...).
The research is promising but not settled, and effects vary; the site says so and makes no medical claims.
Pulse and binaural switch off while the Quran plays.

## Quran
The recitation has its own volume, a "soft and distant" mode, and a slider for how loud the nature sounds stay while it plays.
Volume and soft mode go through Web Audio when the audio host sends CORS headers; otherwise the player falls back to a plain
`<audio>` element (volume still works, except on iPhone where the hardware buttons control it).
If you later host the files on R2, add a CORS rule allowing `https://focus.freakingwaves.com` so soft mode works.

## Clock
- Modes: **Timer** (focus / short / long breaks, set with steppers), **Stopwatch**, **Clock** (time with Gregorian, Bangla and Hijri dates).
- Digital faces: **Depth** (default: tall numerals painted inside the scene, the near waves and palms pass in front), **Serif** (Instrument Serif), **Light** (Inter Tight 200), **Mono** (DM Mono), **Frosted** (on a pane of real frosted glass).
- Analog faces: **Minimal**, **Dial** (an ivory wall clock), **Ring** (progress ring). The timer shows the time left as a wedge, like a kitchen timer.
- Drag the clock with one finger; pinch with two (or ctrl + trackpad pinch) to resize.
- Sky: Auto (follows local time) or a slider through the whole day.
- The Clock panel links to bro.freakingwaves.com for full-day routines.

## Sound troubleshooting (no sound / stutter)
- The engine is synthesised live, so it needs CPU. It caps the audio at 48 kHz (some PCs run at 96 or 192 kHz, which was 2 to 4 times the work),
  avoids allocating memory on the audio thread, and the scene drops its resolution on slow machines.
- If the browser suspends audio (sleep, headphones switched, autoplay rules), any tap or key resumes it, and the app says so.
- If the audio thread ever throws, the engine restarts itself with the same mix.
- Still silent: check the tab isn't muted, the output device, and that the browser is recent (AudioWorklet is required).

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
