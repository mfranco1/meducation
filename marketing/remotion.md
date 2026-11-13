# Remotion notes for ad code

Digest of the official [remotion-dev/skills](https://github.com/remotion-dev/skills/tree/c7cb2fdcacd134fb2ccb9b7a44f9ffa44e467271/skills/remotion-best-practices) (commit `c7cb2fd`, Remotion 4.0.540) adapted to this workspace. Agents that support skills may also install the official skill; this file is what every agent can rely on. Current API docs: <https://www.remotion.dev/docs>.

## Rendering model

- Every frame is rendered independently. Drive all motion from `useCurrentFrame()` with `interpolate()`, `spring()` or `Easing`. CSS `transition`/`animation` and timers do not render.
- Take `fps`, `width` and `height` from `useVideoConfig()`. Write timings as `2 * fps`, not raw numbers, and lay out from `width`/`height` so one `Ad.tsx` works in 9:16, 4:5 and 16:9.
- Keep `useCurrentFrame()` in the smallest component that needs it.
- Prefer the `scale`, `translate` and `rotate` CSS properties over `transform` strings.
- For `scale` animations pass `output: 'perceptual-scale'` to `interpolate`.
- Anything asynchronous (data, measurements) must use `delayRender()`/`continueRender()`. `src/index.tsx` already loads Plus Jakarta Sans and renders the ad only after it is ready.

## Structure

- `<Sequence from durationInFrames>` shifts time for its children. `<Series>` places scenes back to back.
- `<TransitionSeries>` (`@remotion/transitions`) adds transitions (presentations under `@remotion/transitions/<name>`, such as `fade`, `slide`, `wipe`, `push-cut`, `zoom-in-out`, `cross-zoom`, `blur-slide`, `iris`, `clock-wipe`, `flip`, `cube`, `ripple`, `film-burn`, or a custom presentation). Transitions overlap scenes and shorten the total, so the sum of scene lengths minus transition lengths must equal `frames` in `ad.json`. `TransitionSeries.Overlay` adds an effect over a cut without shortening.
- `premountFor` on sequences with video avoids a blank first frame.

## Media

- Footage, images and audio live in `public/` and are referenced with literal `staticFile('path')` strings. The CLI finds and validates assets from those literals; don't build paths dynamically.
- Video: `<OffthreadVideo>` (frame-exact, used by the kit) or `<Video>` from `@remotion/media`. Use `trimBefore`/`trimAfter` in frames and `muted` for product footage.
- Images: `<Img>`.
- Never reference remote URLs. Renders must work offline and every asset needs a known licence. The official skill lists meme sound effects at `remotion.media`; do not use them.

## Effects and type

- `@remotion/layout-utils` `fitText()`/`measureText()` size text to a box (the kit's `KineticText` uses it).
- `@remotion/captions` `createTikTokStyleCaptions()` pages word-timed captions (the kit's `Captions` uses it).
- `@remotion/motion-blur`: `<CameraMotionBlur>` or `<Trail>` for fast moves. `HtmlInCanvasMotionBlur` needs Chrome support for HTML-in-canvas; check the render before relying on it.
- Further first-party packages (`@remotion/effects`, `@remotion/shapes`, `@remotion/paths`, `@remotion/noise`, `@remotion/three`, `@remotion/lottie`) may be added when a concept needs them. Pin them to the same version as `remotion`, install with `--ignore-scripts`, and record them in the README licence section.

## Checking work

- `--frames A-B` previews render only part of the timeline. Contact sheets render stills without a full video.
- Studio (`AD=ads/<id> npm --prefix marketing run studio`) is useful for scrubbing; the CLI render is the source of truth.
- Browser console output from renders is in `.cache/logs/browser.log`.
