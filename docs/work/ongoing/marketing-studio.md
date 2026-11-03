# Marketing studio

Move `marketing/` from a fixed JSON template to per-ad Remotion code with a shared kit, keeping the security and content rules.

## Decisions

- Any coding agent: no agent-specific folders; `marketing/AGENTS.md`, README, CLI and per-ad files are the interface.
- Keep Remotion (source-available, free at current headcount).
- Formats 9:16, 4:5, 16:9. Each ad is `ads/<id>/ad.json` + `ads/<id>/Ad.tsx`.
- Audio: sourced (licence manifest with checksums) plus synthesized. Optional local voiceover (Kokoro, Apache-2.0).
- sfizz has no Homebrew formula: keep FluidSynth and allow better SF2 instruments from the manifest (e.g. FreePats) instead of building sfizz.

## Steps

1. Done: rules, kit, per-ad compositions, formats, review sheet, capture actions and tap events. `fill`/`press` untested (home page has no field).
2. Audio: external asset manifest + `assets:fetch`, soundtrack mixing (score, clips, ducking) in one master.
3. Spikes: Kokoro voiceover via `kokoro-js`; stepped (frame-exact) capture.
