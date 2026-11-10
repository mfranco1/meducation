import { z } from 'zod';

const asset = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]+$/)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), 'Use a relative public asset path');
const role = z.string().regex(/^[a-z]+$/);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), role, name: z.string().min(1), exact: z.boolean().default(true) }),
  z.object({ type: z.literal('hover'), role, name: z.string().min(1), exact: z.boolean().default(true) }),
  z.object({
    type: z.literal('fill'),
    label: z.string().min(1),
    text: z.string(),
    delay: z.number().int().min(0).max(500).default(70),
  }),
  z.strictObject({ type: z.literal('press'), key: z.string().min(1) }),
  z.object({ type: z.literal('wait'), ms: z.number().int().min(0).max(30000) }),
  z.object({ type: z.literal('scroll'), text: z.string().min(1) }),
  z.object({
    type: z.literal('scrollBy'),
    y: z.number().int().min(-5000).max(5000),
    ms: z.number().int().min(0).max(10000).default(600),
  }),
]);
const pressKeys = z.strictObject({
  type: z.literal('press'),
  keys: z.array(z.string().min(1)).min(1).max(1000),
  delay: z.number().int().min(0).max(5000).default(0),
});
/** `press` with `keys` expands to one press per key, each followed by a `wait` of `delay` ms when it is above 0. */
const actions = z
  .array(z.union([action, pressKeys]))
  .transform((list) =>
    list.flatMap((step) =>
      'keys' in step
        ? step.keys.flatMap((key) => [
            { type: 'press' as const, key },
            ...(step.delay > 0 ? [{ type: 'wait' as const, ms: step.delay }] : []),
          ])
        : [step],
    ),
  );
export const recipeSchema = z.object({
  viewport: z.object({ width: z.number().int().min(320), height: z.number().int().min(320) }),
  deviceScaleFactor: z.number().min(1).max(3),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  sources: z.array(z.string().startsWith('/api/v1/')).min(1),
  shots: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        setup: actions,
        record: actions.refine((list) => list.length > 0, 'A shot needs at least one record action'),
      }),
    )
    .min(1),
});
export const FPS = 30;
export const formats = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
} as const;
export type Format = keyof typeof formats;
export const formatId = (format: Format) => format.replace(':', 'x');
// "<asset-id>/<path inside the asset>" or "local/<path under marketing/audio/>"
const ref = z
  .string()
  .regex(/^[a-z0-9-]+\/[^\0\\]+$/)
  .refine((p) => !p.split('/').includes('..') && !p.includes('//'), 'Use an asset-relative path');
const db = z.number().min(-60).max(12).default(0);
const pan = z.number().min(-1).max(1).default(0);
const frameCount = z.number().int().nonnegative();
const soundtrackSchema = z.object({
  lufs: z.number().min(-23).max(-9).default(-14),
  /** Music gain in dB while a voice clip is speaking. */
  duck: z.number().min(-30).max(0).default(-8),
  score: z
    .object({
      bpm: z.number().min(40).max(240),
      reverb: z
        .object({ seconds: z.number().min(0.3).max(8).default(2.2), mix: z.number().min(0).max(1).default(0.25) })
        .default({ seconds: 2.2, mix: 0.25 }),
      tracks: z
        .array(
          z.object({
            name: z.string().min(1),
            instrument: ref,
            gain: db,
            pan,
            reverb: z.number().min(0).max(1).default(0.5),
            notes: z
              .array(
                z.object({
                  beat: z.number().nonnegative(),
                  beats: z.number().positive(),
                  pitches: z.array(z.number().int().min(0).max(127)).min(1).max(12),
                  velocity: z.number().min(0.01).max(1),
                }),
              )
              .min(1),
            sustain: z.array(z.object({ beat: z.number().nonnegative(), beats: z.number().positive() })).default([]),
          }),
        )
        .min(1)
        .max(16),
    })
    .optional(),
  clips: z
    .array(
      z.object({
        src: ref,
        role: z.enum(['music', 'sfx', 'voice']),
        from: frameCount.default(0),
        trim: frameCount.default(0),
        frames: z.number().int().positive().optional(),
        gain: db,
        pan,
        fadeIn: frameCount.default(0),
        fadeOut: frameCount.default(0),
      }),
    )
    .default([]),
  /** Voice lines synthesized locally with Kokoro. `from` is the start frame. */
  voiceover: z
    .array(
      z.object({
        from: frameCount,
        text: z.string().min(1).max(600),
        voice: z
          .string()
          .regex(/^[a-z]{2}_[a-z]+$/)
          .default('af_heart'),
        speed: z.number().min(0.5).max(2).default(1),
        gain: db,
        pan,
      }),
    )
    .default([]),
});
export type Soundtrack = z.infer<typeof soundtrackSchema>;
export type SoundtrackInput = z.input<typeof soundtrackSchema>;
function checkSoundtrack(soundtrack: Soundtrack, frames: number, ctx: z.RefinementCtx) {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['soundtrack'], message });
  if (!soundtrack.score && soundtrack.clips.length === 0 && soundtrack.voiceover.length === 0)
    issue('A soundtrack needs a score, a clip or a voiceover line');
  const { score } = soundtrack;
  if (score)
    for (const track of score.tracks)
      for (const event of [...track.notes, ...track.sustain])
        if (((event.beat + event.beats) * 60) / score.bpm > frames / FPS) issue('Score events must fit the ad');
  for (const clip of soundtrack.clips) if (clip.from + (clip.frames ?? 0) > frames) issue('Clips must fit the ad');
  for (const line of soundtrack.voiceover) if (line.from >= frames) issue('Voiceover lines must start inside the ad');
}

export const specSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    brief: z.object({
      audience: z.string().min(1),
      message: z.string().min(1),
      hook: z.string().min(1),
      concept: z.string().min(1),
      cta: z.string().min(1),
    }),
    frames: z.number().int().min(30).max(3600),
    formats: z
      .array(z.enum(Object.keys(formats) as [Format, ...Format[]]))
      .min(1)
      .default(['9:16']),
    recipe: z.string().min(1).optional(),
    soundtrack: soundtrackSchema.optional(),
  })
  .superRefine((spec, ctx) => {
    if (spec.soundtrack) checkSoundtrack(spec.soundtrack, spec.frames, ctx);
  });
export type AdSpec = z.infer<typeof specSchema>;
export type Recipe = z.infer<typeof recipeSchema>;

const assetBase = { id: z.string().regex(/^[a-z0-9-]+$/), license: z.string().min(1), attribution: z.string().min(1) };
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const https = z.url().startsWith('https://');
export const assetsSchema = z
  .array(
    z.discriminatedUnion('type', [
      z.object({
        ...assetBase,
        type: z.literal('github'),
        repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
        commit: z.string().regex(/^[0-9a-f]{40}$/),
        paths: z.array(z.string()),
        source: https,
      }),
      z.object({
        ...assetBase,
        type: z.literal('huggingface'),
        repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
        revision: z.string().regex(/^[0-9a-f]{40}$/),
        paths: z.array(z.string()),
        source: https,
      }),
      z.object({
        ...assetBase,
        type: z.literal('file'),
        url: https,
        name: z.string().regex(/^[^/\\\0]+$/),
        sha256,
        source: https,
      }),
      z.object({
        ...assetBase,
        type: z.literal('local'),
        files: z.array(z.object({ name: z.string().regex(/^[^/\\\0]+$/), sha256 })).min(1),
      }),
    ]),
  )
  .superRefine((assets, ctx) => {
    const seen = new Set<string>();
    for (const { id } of assets) {
      if (id === 'local' || seen.has(id))
        ctx.addIssue({ code: 'custom', message: `Asset id "${id}" is reserved or duplicated` });
      seen.add(id);
    }
  });
export type Asset = z.infer<typeof assetsSchema>[number];
