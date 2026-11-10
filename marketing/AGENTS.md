# Marketing production

Make premium video ads for Meducation from the real learner app. Read README.md for commands and [remotion.md](remotion.md) before writing composition code. These files, the CLI and the per-ad files are the shared interface for every agent; don't add agent-specific folders or instructions.

## Workflow

Work in this order and stop for the user at each **Check**.

1. **Brief.** Audience, single message, CTA. Inspect the current app, branding and the published content you plan to show.
2. **Hooks.** Write three distinct hook options for the first 2 seconds (visual + on-screen line), each with a one-line concept for the rest. **Check:** the user picks or redirects.
3. **Animatic.** Create `ads/<id>/ad.json` and `ads/<id>/Ad.tsx`, capture real footage, add placeholder type and timing, render a preview and contact sheet. **Check:** the user approves structure and pacing.
4. **Polish.** Motion design, typography, camera moves, transitions, sound design, music, optional voiceover, captions, extra formats. Review frames and previews, fix, repeat. Iterate on chosen stills (`contact-sheet --frames 12,48,96`) and ranged previews (`preview --frames START-END`). Review one contact sheet per round; open a full-size frame only when one looks wrong.
5. **Final.** Render once, after the user approves at a Check or asks for it (a final takes 5 to 10 minutes). Validate, report outputs and any remaining defects.

## Quality bar

Aim for work a professional motion studio would ship. Creative choices are open: write any composition, effect, transition or camera move the concept needs. The kit in `src/kit/` is a starting point, not a template.

- Hook within 2 seconds through motion, a striking product moment or a sharp line. No logo or brand card in the first 2 seconds; brand at the end.
- One idea per ad. Show the product doing something real, at a readable size.
- Works with sound off: on-screen type or captions carry the message.
- Keep text and key product UI inside the safe zones shaded on contact sheets. Check legibility at phone size.
- Use the brand: the Meducation logo, Inter, warm neutrals and autumn orange (`src/kit/theme.ts`, `../src/shared/brand.ts`). Add colours only when a concept needs them.
- Audio, when used: mixed, not decorative. Music supports pacing, effects land on cuts and taps, voiceover is clear over the music. Write scores as `soundtrack.ts` with loops and helpers, never as inline JSON notes. An agent cannot hear: read `.cache/audio/<id>/mix.png` and the printed track levels for timing and balance, say plainly that the audio has not been heard, and ask the user to listen before calling audio done.
- In recipes, use `press` with `keys` for long key sequences.
- Copy follows the root AGENTS.md copy rules.

## Hard rules

- Use the actual learner app and published PostgreSQL content. Never mock product UI, change canonical content, use an old export, or record an authenticated or private profile. Preserve medical wording and answer order exactly as shown in the app.
- External assets (music, sound effects, instruments, model weights, fonts, images) must be free for commercial use under an OSI licence, CC0, CC-BY (attribution recorded) or an explicit free-commercial licence from a reputable publisher. Add each to `assets.json` with source, licence, attribution and integrity data before use; the generator refuses unlisted assets.
- Install npm packages pinned and with scripts disabled. Download only from official publisher or package channels over HTTPS and verify checksums. Never run downloaded setup scripts or unreviewed plugins; the only source build is the pinned sfizz release in `audio:setup`.
- No network access at render time. Renders read local files only.
- Keep captures, renders, logs and private content local and uncommitted. Remove a production's files and outputs when the user asks for cleanup, keeping reusable tooling, fonts and verified instruments.
- Encoding success is not creative approval. Report what you actually produced and any defects you know of.

Verification: `npm run typecheck`, `npm test`, `npm run format:check`, repository-required checks, and a real render with validation. Run capture and produce sequentially; they share the footage cache.
