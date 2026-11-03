# Marketing production

Read README.md for commands. The CLI and ad specifications are the shared interface for every agent. No runtime LLM calls or agent-specific tooling.

- Start with audience, message, hook, visual idea and CTA. Keep these in the ad's brief and scene list.
- Create a new ad specification and capture recipe for each production. Commands require an explicit `--spec`; no default ad is bundled. Remove production files and generated artifacts when the user asks for cleanup, keeping reusable tooling, fonts and verified instruments.
- Use the actual learner app and published PostgreSQL content. Never mock product UI, change canonical content, use an old export, or record an authenticated/private profile.
- Preserve medical wording and answer ordering. Use existing controls for predictable capture. If selectors stop matching, inspect the current app and canonical records.
- Reuse footage and existing treatments first. Add a motion component only when the creative concept needs it.
- Use the existing logo, Inter, warm neutrals and autumn orange. Keep copy brief, text large, and motion purposeful. Keep the ad understandable without sound.
- For audio, write original notes and restrained cues in the JSON audio recipe. Reuse generated music and effects. Use `audio:generate` and `audio:validate`; review the actual mix before rendering. This is local score-based synthesis, not text-to-audio AI.
- Audio dependencies must be free/open source with commercial-use-compatible instrument licenses. Use official package channels, pinned npm versions and published asset checksums. Keep npm install scripts disabled. Never run downloaded setup scripts or add unreviewed generators, model weights or plugins.
- Run asset and media checks before visual review. Inspect representative frames at phone size and watch the preview for timing and transitions. Fix meaningful issues, preview affected frame ranges, then render the final once.
- Do not confuse successful encoding with creative approval. Report actual outputs and any remaining defects.
- Keep caches and renders local. Never commit captures, logs, credentials or private content. Do not add services, orchestrators, CI jobs or duplicated agent instructions.

Verification: `npm run typecheck`, `npm test`, `npm run format:check`, repository-required checks, and a real render with validation. Run capture/produce sequentially; they share the footage cache.
