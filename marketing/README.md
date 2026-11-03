# Meducation marketing

Reusable local tools for producing advertisements from real learner interactions. No production ad, capture recipe, score or rendered media is bundled. The CLI and JSON specifications work with any coding agent or without an agent.

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

1. Develop the audience, message, hook, visual concept and CTA. Inspect current branding, actual product capabilities and the published content you will capture.
2. Create `marketing/ads/<name>.json` and `marketing/recipes/<name>.json`. Create the directories as needed. The schemas in `spec.ts` define their contracts.
3. Capture a short real interaction and render a short preview to prove selectors, framing and text sharpness.
4. Build the full narrative using existing scene treatments and motion components. Add an optional original score and restrained effects.
5. Run technical checks, inspect representative frames at phone scale, watch the preview and listen to the soundtrack. Refine short ranges, then render and validate the final.

An ad specification contains `id`, a `brief` with `audience`, `message`, `concept` and `cta`, a capture `recipe` path, and ordered `scenes`. Each scene has `treatment`, `frames` and `headline`; optional fields control `label`, `detail`, `theme`, footage, trim, crop, poster and zoom. Times are integer frames at 30 fps. Scene durations add together; transitions do not shorten the timeline. Treatments are `type`, `product` and `closing`; themes are `cream`, `orange` and `ink`.

A capture recipe defines `viewport`, `deviceScaleFactor`, public API `sources` for revision checks and `shots`. Each shot has an `id`, `setup` actions and `record` actions. Actions click accessible roles/names, scroll to exact text or hold for a number of milliseconds. Inspect the current app to select actual stable records and controls. Every shot starts in a fresh, unauthenticated browser context. Do not mock content or use private profiles.

Product footage is 960×1800, normally recorded at a 480×900 CSS viewport with device scale 2. Scene `crop` coordinates use source pixels; its width fills the 936-pixel product frame and determines its height. `trim` is a source frame offset. `zoom` defaults to 1 and supports a restrained move up to 1.3. `poster` can reference a real screenshot. Output dimensions and layout are centralized in `spec.ts` and `src/Ad.tsx`; additional aspect ratios are not implemented.

## Commands

Run from the repository root after creating your specification. Every production command requires `--spec`; paths resolve relative to `marketing/`. `audio:setup` needs no specification.

```sh
npm --prefix marketing run capture -- --spec ads/my-ad.json
npm --prefix marketing run preview -- --spec ads/my-ad.json --frames 0-89
npm --prefix marketing run preview -- --spec ads/my-ad.json
npm --prefix marketing run contact-sheet -- --spec ads/my-ad.json
npm --prefix marketing run render -- --spec ads/my-ad.json
npm --prefix marketing run validate -- --spec ads/my-ad.json
npm --prefix marketing run contact-sheet -- --spec ads/my-ad.json --video output/my-ad/final.mp4
npm --prefix marketing run produce -- --spec ads/my-ad.json
```

Capture and produce accept `--base-url http://127.0.0.1:5175` and `--force`. `produce` captures or reuses footage, generates configured audio, renders or reuses the unchanged final, validates it and extracts a contact sheet. `--force` recaptures and rerenders. Capture needs the live app to check revisions even when footage is cached; use render/preview directly for offline editing.

`preview` makes a 540×960 MP4 and supports an inclusive frame range. `render` makes a 1080×1920, 30 fps H.264/yuv420p MP4. Validation checks asset availability, dimensions, frame rate, duration within one frame, codec, pixel format, audio expectations and complete decoding. Dark intervals are flagged for inspection. These checks do not establish creative quality.

Outputs go to ignored `output/<ad-id>/`: `final.mp4`, `preview.mp4`, `contact-sheet.jpg` and full-size `frames/*.png`. `frames/index.txt` maps sheet positions to timestamps, left to right, top to bottom. Contact-sheet without `--video` renders stills directly, avoiding another full video. Tool logs go to `.cache/logs/`.

For interactive inspection, `npm --prefix marketing run studio -- --props ads/my-ad.json` loads the raw ad specification. Without props, Studio shows setup instructions. The rendering CLI supplies its own props automatically.

## Music and sound effects

The generator uses sampled instruments through FluidSynth and synthesized effects through FFmpeg. It produces original score-based music, not text-prompt AI audio. Ordinary generation is offline, with no paid APIs, accounts, model downloads or recurring LLM tokens.

Set `audioRecipe` on an ad to a JSON score such as `audio/my-score.json`. A score has `id`, creative `direction`, `frames`, `bpm` and instrument `tracks`. Tracks use zero-based General MIDI `program` numbers, pan from -1 to 1, and note events containing `beat`, `beats` (duration), MIDI `pitches` and `velocity` from 0 to 1. Optional `effects` are `tap`, `sweep` or `chime`, with `from` and `frames` on the video timeline, `gain`, optional chime `frequency` and fixed noise `seed`. The score's duration must equal the ad's. `direction` guides creative editing; it is not an AI prompt.

```sh
npm --prefix marketing run audio:generate -- --spec ads/my-ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad.json
npm --prefix marketing run audio:validate -- --spec ads/my-ad.json --video output/my-ad/final.mp4
```

Generation retains `music.mid`, `music.wav`, individual effects and mastered `mix.wav` in ignored `public/audio/<score-id>/`. Reference the master through the ad's `audio` array: entries contain `src`, `from`, `frames`, `trim`, `volume` and `fade`. Paths are relative to `public/`; times are frames. A generated mix already includes mastering and fades, so use volume 1 and fade 0 for direct playback. Omit `audioRecipe` and leave `audio` empty for a silent ad. External audio must have a commercial-use-compatible license and retained source/attribution information.

The master is 48 kHz stereo PCM WAV, normalized in two passes to the score's `lufs` (default -18) with a -1.5 dBTP ceiling. Validation checks decoding, duration, channels, sample rate, integrated loudness within 1 LU and true peak at or below -1 dBTP. Listen to the mix and final video to assess timbre, balance and cue timing.

## Reuse and cleanup

Footage is cached in `public/footage/<recipe-name>/`. Cache inputs include the recipe, capture code, learner source/assets, dependency locks, font, base URL and published revisions. Publication changes during capture abort the run. Failed captures preserve the prior complete set. Recording samples device-resolution screenshots toward 30 fps and preserves their elapsed timestamps; cadence depends on local compute. A local font route supplies the theme's intended Inter font to the recording browser only.

Audio caching includes the score, generator, dependency lock and tool versions, verifies the instrument checksum and checks the saved master hash. The final-video cache includes the specification, composition code, branding, dependency locks and referenced assets. Run production jobs sequentially.

When a production is no longer needed, remove its ad specification, capture recipe, score, `output/<ad-id>/`, generated footage/audio and scratch logs. Keep reusable tools, fonts, licenses and verified instruments. The downloaded instrument archive can be removed after setup; it is not needed while the verified extracted instruments remain.

## Verification and licenses

Run `npm --prefix marketing run typecheck`, `npm --prefix marketing test`, `npm --prefix marketing run format:check`, and the repository checks required by [testing](../docs/testing.md). Verify affected commands with a temporary synthetic production, then remove its files and outputs. Do not leave a demo advertisement as a tool dependency.

Meducation's owner confirmed an organization headcount of at most three people. Remotion's conditional free license permits eligible commercial automation; recheck eligibility if organization or relevant contractor headcount changes. See its [license FAQ](https://www.remotion.dev/docs/license/faq) and [terms](https://www.remotion.dev/docs/license).

[Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) is Apache-2.0. [FFmpeg](https://ffmpeg.org/legal.html) is LGPL or GPL depending on enabled components; the local libx264 build includes GPL components. Local binaries are invoked, not redistributed. Inter's SIL Open Font License is in `public/fonts/OFL.txt`. Branding comes from this repository.

[FluidSynth](https://www.fluidsynth.org/) is LGPL-2.1-or-later; [Tone.js MIDI](https://github.com/Tonejs/Midi) is MIT. FluidR3 instrument samples are MIT, copyright Frank Wen, with the license retained in `audio/FluidR3-LICENSE.txt`. The archive and checksum come from [Debian's source metadata](https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont_3.1-6.dsc). These audio licenses allow commercial use.

Use trusted OS package channels, pinned npm dependencies and published asset checksums. The workspace's `.npmrc` disables npm install lifecycle scripts; retain `--ignore-scripts` during setup. Do not substitute random mirrors, installer scripts, plugins or model packages. The verified audio sources are defined in `audio.ts`.
