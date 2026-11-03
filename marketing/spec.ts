import { z } from 'zod';

const asset = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]+$/)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), 'Use a relative public asset path');
const action = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('click'),
    role: z.enum(['button', 'radio', 'switch', 'tab']),
    name: z.string().min(1),
    exact: z.boolean().default(true),
  }),
  z.object({ type: z.literal('wait'), ms: z.number().int().min(0).max(30000) }),
  z.object({ type: z.literal('scroll'), text: z.string().min(1) }),
]);
export const recipeSchema = z.object({
  viewport: z.object({ width: z.number().int().min(320), height: z.number().int().min(320) }),
  deviceScaleFactor: z.number().min(1).max(2),
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
export const specSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    brief: z.object({ audience: z.string(), message: z.string(), concept: z.string(), cta: z.string() }),
    recipe: z.string().min(1),
    audioRecipe: z.string().min(1).optional(),
    scenes: z
      .array(
        z.object({
          treatment: z.enum(['type', 'product', 'closing']),
          frames: z.number().int().positive(),
          headline: z.string().min(1),
          label: z.string().default(''),
          detail: z.string().default(''),
          theme: z.enum(['cream', 'orange', 'ink']).default('cream'),
          footage: asset.optional(),
          poster: asset.optional(),
          trim: z.number().int().nonnegative().default(0),
          zoom: z.number().min(1).max(1.3).default(1),
          position: z.number().min(0).max(100).default(50),
          crop: z
            .object({
              x: z.number().nonnegative(),
              y: z.number().nonnegative(),
              width: z.number().positive(),
              height: z.number().positive(),
            })
            .optional(),
        }),
      )
      .min(1),
    audio: z
      .array(
        z.object({
          src: asset,
          from: z.number().int().nonnegative().default(0),
          frames: z.number().int().positive(),
          trim: z.number().int().nonnegative().default(0),
          volume: z.number().min(0).max(1).default(0.3),
          fade: z.number().int().nonnegative().default(15),
        }),
      )
      .default([]),
  })
  .superRefine((spec, ctx) => {
    for (const [index, scene] of spec.scenes.entries()) {
      if (scene.treatment === 'product' && !scene.footage)
        ctx.addIssue({ code: 'custom', path: ['scenes', index, 'footage'], message: 'Product scenes require footage' });
    }
    const total = duration(spec);
    for (const [index, audio] of spec.audio.entries()) {
      if (audio.from + audio.frames > total || audio.fade * 2 > audio.frames)
        ctx.addIssue({
          code: 'custom',
          path: ['audio', index],
          message: 'Audio must fit the timeline and fades must fit the clip',
        });
    }
  });
export type AdSpec = z.infer<typeof specSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Scene = AdSpec['scenes'][number];
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
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export function duration(spec: { scenes: { frames: number }[] }) {
  return spec.scenes.reduce((sum, scene) => sum + scene.frames, 0);
}
