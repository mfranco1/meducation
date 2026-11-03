import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey } from '../capture';
import { validateAssets } from '../cli';
import { audioRecipeSchema, specSchema } from '../spec';
import ToneMidi from '@tonejs/midi';
import { scoreMidi, verifySoundfontArchive } from '../audio';
import { ffmpeg } from '../media';

const production = {
  id: 'test',
  brief: { audience: 'Test', message: 'Test', hook: 'Test', concept: 'Test', cta: 'Test' },
  frames: 60,
};

test('ad specifications default to vertical video and reject invalid input', () => {
  assert.deepEqual(specSchema.parse(production).formats, ['9:16']);
  for (const edit of [
    { frames: 10 },
    { formats: ['1:1'] },
    { formats: [] },
    { audio: [{ src: '../private.wav', frames: 30 }] },
    { audio: [{ src: 'music.wav', frames: 90 }] },
  ])
    assert.equal(specSchema.safeParse({ ...production, ...edit }).success, false);
});

test('music score preserves chord pitches, instrument and musical timing in MIDI output', () => {
  const recipe = audioRecipeSchema.parse({
    id: 'test',
    direction: 'Small synthetic score',
    frames: 60,
    bpm: 120,
    tracks: [{ name: 'Piano', program: 4, notes: [{ beat: 0.5, beats: 1, pitches: [60, 64, 67], velocity: 0.5 }] }],
  });
  const decoded = new ToneMidi.Midi(scoreMidi(recipe));
  assert.equal(decoded.tracks[0].instrument.number, 4);
  assert.deepEqual(
    decoded.tracks[0].notes.map((note) => note.midi),
    [60, 64, 67],
  );
  assert.equal(decoded.tracks[0].notes[0].time, 0.25);
  assert.equal(decoded.tracks[0].notes[0].duration, 0.5);
  assert.equal(
    audioRecipeSchema.safeParse({ ...recipe, effects: [{ kind: 'tap', from: 55, frames: 10, gain: 0.1 }] }).success,
    false,
  );
  assert.equal(audioRecipeSchema.safeParse({ ...recipe, frames: 30, bpm: 40 }).success, false);
});

test('unverified instrument archives are rejected before extraction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meducation-audio-download-'));
  try {
    const file = join(directory, 'download.tar.gz');
    await writeFile(file, 'untrusted download');
    await assert.rejects(verifySoundfontArchive(file), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('capture cache changes when relevant production inputs change', () => {
  const key = cacheKey({ hold: 2000 }, 'source-a', ['revision-a'], 'http://localhost:5175');
  assert.equal(key, cacheKey({ hold: 2000 }, 'source-a', ['revision-a'], 'http://localhost:5175'));
  for (const changed of [
    cacheKey({ hold: 3000 }, 'source-a', ['revision-a'], 'http://localhost:5175'),
    cacheKey({ hold: 2000 }, 'source-b', ['revision-a'], 'http://localhost:5175'),
    cacheKey({ hold: 2000 }, 'source-a', ['revision-b'], 'http://localhost:5175'),
    cacheKey({ hold: 2000 }, 'source-a', ['revision-a'], 'http://localhost:5176'),
  ])
    assert.notEqual(key, changed);
});

test('assets referenced by ad code must exist and decode before rendering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meducation-marketing-'));
  try {
    const ad = join(directory, 'ad');
    await mkdir(ad);
    await writeFile(join(ad, 'Ad.tsx'), "const clip = staticFile('clip.mp4');");
    const spec = specSchema.parse(production);
    await assert.rejects(validateAssets(spec, ad, directory), /Missing asset: clip.mp4/);
    await writeFile(join(directory, 'clip.mp4'), 'not a video');
    await assert.rejects(validateAssets(spec, ad, directory), /ffmpeg failed/);
    await ffmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=64x64:r=30:d=0.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        join(directory, 'clip.mp4'),
      ],
      join(directory, 'encode.log'),
    );
    await validateAssets(spec, ad, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
