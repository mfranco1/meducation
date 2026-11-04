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

For music, build the sfizz renderer once:

```sh
brew install cmake
npm --prefix marketing run audio:setup
```

`audio:setup` downloads the sfizz 1.2.3 source release from GitHub, checks its pinned SHA-256 before extracting, and builds `sfizz_render` into `.cache/tools/`. `SFIZZ_RENDER` can select an existing executable. External instruments and audio are fetched on demand with `assets:fetch` (see [Music and sound](#music-and-sound)).

## Create a production

Follow the workflow in [AGENTS.md](AGENTS.md): brief, three hooks, animatic, polish, final. A production is a directory:

```text
ads/<id>/ad.json     brief, duration, formats, capture recipe, audio
ads/<id>/Ad.tsx      the composition (default export, receives { spec })
recipes/<name>.json  capture recipe, optional
```

`ad.json` fields (contract in `spec.ts`): `id`, `brief` (`audience`, `message`, `hook`, `concept`, `cta`), `frames` (integer frames at 30 fps), `formats` (any of `9:16`, `4:5`, `16:9`; default `9:16`), optional `recipe` and optional `soundtrack` (see [Music and sound](#music-and-sound)). `Ad.tsx` is ordinary Remotion code; see [remotion.md](remotion.md). Read `width`/`height` from `useVideoConfig()` so one composition serves every format.

The kit in `src/kit/` is optional: `themes` and `safeZone()`, `Footage` (crop, keyframed camera, tap indicators), `Phone` (CSS device frame), `KineticText`, `Captions`, and the `progress`/`Reveal`/`Rule` motion helpers. Import it with `import { Footage } from '../../src/kit'`. Extend the kit when something proves reusable across ads.

Reference public files with literal `staticFile('footage/<recipe>/<shot>.mp4')` strings. The CLI finds them in the ad's code, checks that they exist and decode, and includes them in the render cache key.

## Capture

A capture recipe defines `viewport`, `deviceScaleFactor` (1 to 3), optional `fps` (30 or 60, default 30), public API `sources` for revision checks (for example `/api/v1/subjects` or `/api/v1/flashcards/subjects`) and `shots`. Each shot has an `id`, `setup` actions and `record` actions. Every shot starts in a fresh, unauthenticated browser context. Inspect the current app to choose actual stable records and controls.

Actions:

- `click`, `hover`: `role` (any ARIA role), `name`, optional `exact`
- `fill`: types `text` into the field labelled `label`, `delay` ms per character (default 70)
- `press`: keyboard `key`
- `scroll`: brings exact `text` into view; `scrollBy`: scrolls the container under the viewport centre by `y` CSS pixels, evenly over `ms` (default 600)
- `wait`: `ms`

Setup runs in real time. Recording runs in page time: the browser's clock and animations advance exactly one frame between screenshots, so footage has a constant frame rate and smooth motion however long each screenshot takes. `wait`, `scrollBy` and `fill` delays are page time. Network requests pause page time until they finish, so API latency never shows. Controls must be unique, visible and enabled; capture fails otherwise. End setup on a settled screen, because animations already running when recording starts freeze. Script-driven animations that read raw frame timestamps (for example carousels) are not stepped; check them in the frames.

Each shot produces `public/footage/<recipe>/<shot>.mp4`, a `<shot>.png` poster from the end of setup, and `<shot>.events.json`: the record-phase `click`, `hover` and `fill` targets as `{ t, type, x, y }`, where `t` is page-time seconds into the clip and `x`, `y` are the target centre in footage pixels. Copy the file into the production directory and import it (`import taps from './taps.json'`) for `Footage` `taps` or camera keyframes, so the render cache tracks it. Footage size is viewport × device scale (for example 480×900 at scale 2 gives 960×1800).

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

## Music and sound

An ad's optional `soundtrack` in `ad.json` describes one mix: an original score rendered with sampled and synthesized SFZ instruments, plus sourced clips. Generation is local: no paid APIs, accounts or network calls. Music is score-based, not text-to-music AI; optional voiceover uses a local text-to-speech model.

- `lufs`: master loudness, default -14 (social platforms normalize near this).
- `duck`: music gain in dB while a voice clip speaks, default -8. Speech is detected in the voice bus and the music ramps down 0.15 s before and back up over 0.4 s after.
- `score`: `bpm`, `reverb` (`seconds`, `mix`) and up to 16 `tracks`. A track has `name`, `instrument` (an `.sfz` reference), `gain` in dB, `pan` (-1 to 1), `reverb` send (0 to 1), `notes` (`beat`, `beats`, MIDI `pitches`, `velocity` 0 to 1) and optional `sustain` pedal spans (`beat`, `beats`).
- `voiceover`: lines with `from`, `text`, `voice` (default `af_heart`), `speed` (0.5 to 2), `gain` in dB and `pan`. Lines are synthesized locally with Kokoro-82M, cached by text and voice in `.cache/voice/`, and mixed as voice. Generation prints each line's frame range for timing captions. Voices are the American (`af_*`, `am_*`) and British (`bf_*`, `bm_*`) English voices bundled with `kokoro-js`; listen and pick per ad.
- `clips`: `src`, `role` (`music`, `sfx` or `voice`), `from`, `trim`, optional `frames`, `gain` in dB, `pan`, `fadeIn`, `fadeOut`. Times are frames at 30 fps.

The master is limited, normalized in two passes to `lufs` with a -1.5 dBTP ceiling, and played by every format.

References are `<asset-id>/<path>` for entries in `assets.json`, or `local/<path>` for files in `marketing/audio/`. Local instruments are original patches using sfizz's built-in oscillators: `local/instruments/pad.sfz`, `bass.sfz` and `pluck.sfz`. Write new patches there when a sound is missing; see the [SFZ opcode reference](https://sfzformat.com/opcodes/).

`assets.json` records every external asset with its licence, attribution and integrity data:

- `github`: a repository pinned to a commit, optionally limited to path prefixes. Every file is checked against its git blob hash. The [sfzinstruments](https://github.com/sfzinstruments) collection has many CC0 and CC-BY SFZ libraries.
- `file`: one HTTPS download with a SHA-256, for music tracks or sound effects from a reputable source (for example CC0 sounds on [Freesound](https://freesound.org/)).
- `huggingface`: a model repository pinned to a revision; LFS files are checked by SHA-256 and others by git blob hash. `kokoro-82m` (Apache-2.0) provides the voiceover model.
- `local`: files you supply, such as your own voice recordings, placed in `.cache/assets/<id>/` and checked against their SHA-256.

```sh
npm --prefix marketing run assets:fetch -- --spec ads/my-ad/ad.json
npm --prefix marketing run assets:fetch -- --id salamander-piano
npm --prefix marketing run audio:generate -- --spec ads/my-ad/ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad/ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad/ad.json --video output/my-ad/9x16/final.mp4
```

Generation prints each track's level before gain (libraries differ by 20 dB or more, so balance with `gain`), writes the master to ignored `public/audio/<ad-id>/mix.wav` and keeps stems (each track, score, music, effects and voice buses) in `.cache/audio/<ad-id>/` for listening. Validation checks decoding, duration, 48 kHz stereo, integrated loudness within 1 LU and true peak at or below -1 dBTP. Listen to the stems, mix and final video to judge timbre, balance and timing.

## Reuse and cleanup

Footage is cached in `public/footage/<recipe-name>/`. Cache inputs include the recipe, capture code, learner source/assets, dependency locks, font, base URL and published revisions. Publication changes during capture abort the run. Failed captures preserve the prior complete set. A local font route supplies the theme's intended Inter font to the recording browser only.

Audio caching includes the soundtrack, generator, dependency lock, sfizz and FFmpeg versions, referenced instruments and asset entries, and checks the saved master hash. The final-video cache includes the specification, format, kit and ad code, branding, dependency locks and referenced assets. Run production jobs sequentially.

When a production is no longer needed, remove `ads/<id>/`, its capture recipe, `output/<ad-id>/`, generated footage and audio, and scratch logs. Keep reusable tools, fonts, `assets.json` entries and fetched assets in `.cache/assets/`.

## Verification and licenses

Run `npm --prefix marketing run typecheck`, `npm --prefix marketing test`, `npm --prefix marketing run format:check`, and the repository checks required by [testing](../docs/testing.md). Verify affected commands with a temporary synthetic production, then remove its files and outputs. Do not leave a demo advertisement as a tool dependency.

Meducation's owner confirmed an organization headcount of at most three people. Remotion's conditional free license permits eligible commercial automation; recheck eligibility if organization or relevant contractor headcount changes. See its [license FAQ](https://www.remotion.dev/docs/license/faq) and [terms](https://www.remotion.dev/docs/license).

`@remotion/transitions` is under the Remotion licence; `@remotion/layout-utils`, `@remotion/captions` and `@remotion/motion-blur` are MIT. [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) is Apache-2.0. [FFmpeg](https://ffmpeg.org/legal.html) is LGPL or GPL depending on enabled components; the local libx264 build includes GPL components. Local binaries are invoked, not redistributed. Inter's SIL Open Font License is in `public/fonts/OFL.txt`. Branding comes from this repository.

[sfizz](https://github.com/sfztools/sfizz) is BSD-2-Clause and is built locally from its pinned source release. [Tone.js MIDI](https://github.com/Tonejs/Midi) is MIT. [kokoro-js](https://github.com/hexgrad/kokoro) and its voices, `@huggingface/transformers` and the Kokoro-82M model are Apache-2.0; ONNX Runtime is MIT. Instrument and audio licences are recorded per entry in `assets.json`; CC-BY entries need their `attribution` credited wherever the ad's credits or description allow. Patches in `audio/instruments/` are original to this repository.

Use trusted OS package channels, pinned npm dependencies and published asset checksums. The workspace's `.npmrc` disables npm install lifecycle scripts; retain `--ignore-scripts` during setup. Do not substitute random mirrors, installer scripts or plugins. The sfizz source checksum is in `audio.ts`; asset integrity data is in `assets.json`.
