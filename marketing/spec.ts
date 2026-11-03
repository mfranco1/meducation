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
  z.object({ type: z.literal('press'), key: z.string().min(1) }),
  z.object({ type: z.literal('wait'), ms: z.number().int().min(0).max(30000) }),
  z.object({ type: z.literal('scroll'), text: z.string().min(1) }),
  z.object({
    type: z.literal('scrollBy'),
    y: z.number().int().min(-5000).max(5000),
    ms: z.number().int().min(0).max(10000).default(600),
  }),
]);
export const recipeSchema = z.object({
  viewport: z.object({ width: z.number().int().min(320), height: z.number().int().min(320) }),
  deviceScaleFactor: z.number().min(1).max(3),
  sources: z.array(z.string().startsWith('/api/v1/')).min(1),
  shots: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        setup: z.array(action),
        record: z.array(action).min(1),
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
    audioRecipe: z.string().min(1).optional(),
    audio: z
      .array(
        z.object({
          src: asset,
          from: z.number().int().nonnegative().default(0),
          frames: z.number().int().positive(),
          trim: z.number().int().nonnegative().default(0),
          volume: z.number().min(0).max(1).default(1),
          fade: z.number().int().nonnegative().default(0),
        }),
      )
      .default([]),
  })
  .superRefine((spec, ctx) => {
    for (const [index, audio] of spec.audio.entries()) {
      if (audio.from + audio.frames > spec.frames || audio.fade * 2 > audio.frames)
        ctx.addIssue({
          code: 'custom',
          path: ['audio', index],
          message: 'Audio must fit the timeline and fades must fit the clip',
        });
    }
  });
export type AdSpec = z.infer<typeof specSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export const audioRecipeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    direction: z.string().min(1),
    frames: z.number().int().min(30).max(3600),
    bpm: z.number().min(40).max(200),
    lufs: z.number().min(-24).max(-14).default(-18),
    musicGain: z.number().min(0).max(1).default(0.8),
    tracks: z
      .array(
        z.object({
          name: z.string().min(1),
          program: z.number().int().min(0).max(127),
          pan: z.number().min(-1).max(1).default(0),
          notes: z
            .array(
              z.object({
                beat: z.number().nonnegative(),
                beats: z.number().positive(),
                pitches: z.array(z.number().int().min(0).max(127)).min(1).max(8),
                velocity: z.number().min(0.01).max(1),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(8),
    effects: z
      .array(
        z.object({
          kind: z.enum(['tap', 'sweep', 'chime']),
          from: z.number().int().nonnegative(),
          frames: z.number().int().min(2).max(90),
          gain: z.number().min(0).max(1),
          frequency: z.number().min(100).max(4000).default(660),
          seed: z.number().int().min(0).max(2147483647).default(42),
        }),
      )
      .max(30)
      .default([]),
  })
  .superRefine((recipe, ctx) => {
    for (const track of recipe.tracks)
      for (const note of track.notes) {
        if (((note.beat + note.beats) * 60) / recipe.bpm > recipe.frames / 30)
          ctx.addIssue({ code: 'custom', message: 'Music notes must fit the soundtrack' });
      }
    for (const effect of recipe.effects)
      if (effect.from + effect.frames > recipe.frames)
        ctx.addIssue({ code: 'custom', message: 'Sound effects must fit the soundtrack' });
  });
export type AudioRecipe = z.infer<typeof audioRecipeSchema>;
