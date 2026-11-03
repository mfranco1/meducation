# Meducation marketing

Local tools for producing video ads from real learner interactions. No production ad, capture recipe, score or rendered media is bundled. The CLI, per-ad files and these docs work with any coding agent or without one.

## Setup

From the repository root:

```sh
npm ci
npm --prefix marketing ci --ignore-scripts
cd marketing && npx playwright install chromium && cd ..
brew install ffmpeg                 # macOS; use your trusted package manager elsewhere
```

Node 22+ and FFmpeg with libx264 are required. `FFMPEG`, `FFPROBE` and `REMOTION_BROWSER_EXECUTABLE` can select existing executables. Rendering reuses Playwright's Chromium. Once dependencies, browser, fonts and footage are local, rendering needs no database or network.

Capture needs the real PostgreSQL-backed learner app. Use the existing authority setup in [operations](../docs/operations.md#local-authority-maintainer-machine). Reuse a running API; never initialize, import, publish or change content for marketing. A dedicated capture server can use:

```sh
MEDUCATION_API_PORT=8001 npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

For optional music generation, install FluidSynth and set up verified instruments:

```sh
brew install fluid-synth
npm --prefix marketing run audio:setup
```

`audio:setup` downloads 135 MB from Debian's official HTTPS archive. It checks a pinned SHA-256 before extracting only the FluidR3 instrument file and license, then verifies the instrument file separately. No archive script is extracted or executed. Verified instruments stay in `.cache/audio-fonts/` for future productions. `FLUIDSYNTH` can select an existing executable.

## Create a production

Follow the workflow in [AGENTS.md](AGENTS.md): brief, three hooks, animatic, polish, final. A production is a directory:

```text
ads/<id>/ad.json     brief, duration, formats, capture recipe, audio
ads/<id>/Ad.tsx      the composition (default export, receives { spec })
recipes/<name>.json  capture recipe, optional
```

`ad.json` fields (contract in `spec.ts`): `id`, `brief` (`audience`, `message`, `hook`, `concept`, `cta`), `frames` (integer frames at 30 fps), `formats` (any of `9:16`, `4:5`, `16:9`; default `9:16`), optional `recipe`, optional `audioRecipe`, and `audio` clips. `Ad.tsx` is ordinary Remotion code; see [remotion.md](remotion.md). Read `width`/`height` from `useVideoConfig()` so one composition serves every format.

The kit in `src/kit/` is optional: `themes` and `safeZone()`, `Footage` (crop, keyframed camera, tap indicators), `Phone` (CSS device frame), `KineticText`, `Captions`, and the `progress`/`Reveal`/`Rule` motion helpers. Import it with `import { Footage } from '../../src/kit'`. Extend the kit when something proves reusable across ads.

Reference public files with literal `staticFile('footage/<recipe>/<shot>.mp4')` strings. The CLI finds them in the ad's code, checks that they exist and decode, and includes them in the render cache key.

## Capture

A capture recipe defines `viewport`, `deviceScaleFactor` (1 to 3), public API `sources` for revision checks (for example `/api/v1/subjects` or `/api/v1/flashcards/subjects`) and `shots`. Each shot has an `id`, `setup` actions and `record` actions. Every shot starts in a fresh, unauthenticated browser context. Inspect the current app to choose actual stable records and controls.

Actions:

- `click`, `hover`: `role` (any ARIA role), `name`, optional `exact`
- `fill`: types `text` into the field labelled `label`, `delay` ms per character (default 70)
- `press`: keyboard `key`
- `scroll`: brings exact `text` into view; `scrollBy`: scrolls `y` CSS pixels over `ms` (default 600)
- `wait`: `ms`

Each shot produces `public/footage/<recipe>/<shot>.mp4`, a `<shot>.png` poster from the end of setup, and `<shot>.events.json`: the record-phase `click`, `hover` and `fill` targets as `{ t, type, x, y }`, where `t` is seconds into the clip and `x`, `y` are the target centre in footage pixels. Pass these to `Footage` `taps` or use them to aim camera keyframes. Footage size is viewport × device scale (for example 480×900 at scale 2 gives 960×1800).

## Commands

Run from the repository root. Production commands take `--spec ads/<id>/ad.json`; paths resolve relative to `marketing/`. `--format` selects one format; otherwise render and validate cover every format in the ad, and preview and contact sheets use the first.

```sh
npm --prefix marketing run capture -- --spec ads/my-ad/ad.json
npm --prefix marketing run preview -- --spec ads/my-ad/ad.json --frames 0-89
npm --prefix marketing run preview -- --spec ads/my-ad/ad.json --format 16:9
npm --prefix marketing run contact-sheet -- --spec ads/my-ad/ad.json
npm --prefix marketing run render -- --spec ads/my-ad/ad.json
npm --prefix marketing run validate -- --spec ads/my-ad/ad.json
npm --prefix marketing run produce -- --spec ads/my-ad/ad.json
AD=ads/my-ad npm --prefix marketing run studio
```

Capture and produce accept `--base-url http://127.0.0.1:5175` and `--force`. `produce` captures or reuses footage, generates configured audio, renders or reuses each unchanged final, validates it and extracts a contact sheet. `--force` recaptures and rerenders. Capture needs the live app to check revisions even when footage is cached; use render/preview directly for offline editing.

`preview` renders at half size with an optional inclusive frame range. `render` makes 30 fps H.264/yuv420p MP4s at full size: 1080×1920, 1080×1350 or 1920×1080. Validation checks asset availability, dimensions, frame rate, duration within one frame, codec, pixel format, audio expectations and complete decoding, and flags dark intervals. These checks do not establish creative quality.

Outputs go to ignored `output/<ad-id>/<format>/` (`9x16`, `4x5`, `16x9`): `final.mp4`, `preview*.mp4`, `contact-sheet.jpg` and full-size `frames/*.png`. The contact sheet samples every half second through the 2-second hook, then every second, plus the last frame; `frames/index.txt` maps positions to timestamps. On 9:16 and 4:5 sheets, red shading marks where platform interface usually covers the video. `contact-sheet --video <file> --format <f>` samples an existing render instead of rendering stills. Tool logs, including browser console output, go to `.cache/logs/`.

## Music and sound effects

The generator uses sampled instruments through FluidSynth and synthesized effects through FFmpeg. It produces original score-based music, not text-prompt AI audio. Ordinary generation is offline, with no paid APIs, accounts, model downloads or recurring LLM tokens.

Set `audioRecipe` in `ad.json` to a JSON score such as `audio/my-score.json`. A score has `id`, creative `direction`, `frames`, `bpm` and instrument `tracks`. Tracks use zero-based General MIDI `program` numbers, pan from -1 to 1, and note events containing `beat`, `beats` (duration), MIDI `pitches` and `velocity` from 0 to 1. Optional `effects` are `tap`, `sweep` or `chime`, with `from` and `frames` on the video timeline, `gain`, optional chime `frequency` and fixed noise `seed`. The score's `frames` must equal the ad's. `direction` guides creative editing; it is not an AI prompt.

```sh
npm --prefix marketing run audio:generate -- --spec ads/my-ad/ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad/ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad/ad.json --video output/my-ad/9x16/final.mp4
```

Generation retains `music.mid`, `music.wav`, individual effects and mastered `mix.wav` in ignored `public/audio/<score-id>/`. Reference the master through the ad's `audio` array: entries contain `src`, `from`, `frames`, `trim`, `volume` (default 1) and `fade` (default 0). Paths are relative to `public/`; times are frames. `src/index.tsx` plays these clips for every format. Omit `audioRecipe` and leave `audio` empty for a silent ad. External audio must have a commercial-use-compatible license and retained source/attribution information.

The master is 48 kHz stereo PCM WAV, normalized in two passes to the score's `lufs` (default -18) with a -1.5 dBTP ceiling. Validation checks decoding, duration, channels, sample rate, integrated loudness within 1 LU and true peak at or below -1 dBTP. Listen to the mix and final video to assess timbre, balance and cue timing.

## Reuse and cleanup

Footage is cached in `public/footage/<recipe-name>/`. Cache inputs include the recipe, capture code, learner source/assets, dependency locks, font, base URL and published revisions. Publication changes during capture abort the run. Failed captures preserve the prior complete set. Recording samples device-resolution screenshots toward 30 fps and preserves their elapsed timestamps; cadence depends on local compute. A local font route supplies the theme's intended Inter font to the recording browser only.

Audio caching includes the score, generator, dependency lock and tool versions, verifies the instrument checksum and checks the saved master hash. The final-video cache includes the specification, format, kit and ad code, branding, dependency locks and referenced assets. Run production jobs sequentially.

When a production is no longer needed, remove `ads/<id>/`, its capture recipe, score, `output/<ad-id>/`, generated footage/audio and scratch logs. Keep reusable tools, fonts, licenses and verified instruments. The downloaded instrument archive can be removed after setup; it is not needed while the verified extracted instruments remain.

## Verification and licenses

Run `npm --prefix marketing run typecheck`, `npm --prefix marketing test`, `npm --prefix marketing run format:check`, and the repository checks required by [testing](../docs/testing.md). Verify affected commands with a temporary synthetic production, then remove its files and outputs. Do not leave a demo advertisement as a tool dependency.

Meducation's owner confirmed an organization headcount of at most three people. Remotion's conditional free license permits eligible commercial automation; recheck eligibility if organization or relevant contractor headcount changes. See its [license FAQ](https://www.remotion.dev/docs/license/faq) and [terms](https://www.remotion.dev/docs/license).

`@remotion/transitions` is under the Remotion licence; `@remotion/layout-utils`, `@remotion/captions` and `@remotion/motion-blur` are MIT. [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) is Apache-2.0. [FFmpeg](https://ffmpeg.org/legal.html) is LGPL or GPL depending on enabled components; the local libx264 build includes GPL components. Local binaries are invoked, not redistributed. Inter's SIL Open Font License is in `public/fonts/OFL.txt`. Branding comes from this repository.

[FluidSynth](https://www.fluidsynth.org/) is LGPL-2.1-or-later; [Tone.js MIDI](https://github.com/Tonejs/Midi) is MIT. FluidR3 instrument samples are MIT, copyright Frank Wen, with the license retained in `audio/FluidR3-LICENSE.txt`. The archive and checksum come from [Debian's source metadata](https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont_3.1-6.dsc). These audio licenses allow commercial use.

Use trusted OS package channels, pinned npm dependencies and published asset checksums. The workspace's `.npmrc` disables npm install lifecycle scripts; retain `--ignore-scripts` during setup. Do not substitute random mirrors, installer scripts, plugins or model packages. The verified audio sources are defined in `audio.ts`.
