import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey } from '../capture';
import { validateAssets } from '../cli';
import { assetsSchema, specSchema } from '../spec';
import ToneMidi from '@tonejs/midi';
import { gitBlobSha, scoreMidi } from '../audio';
import { ffmpeg } from '../media';

const production = {
  id: 'test',
  brief: { audience: 'Test', message: 'Test', hook: 'Test', concept: 'Test', cta: 'Test' },
  frames: 60,
};

const score = {
  bpm: 120,
  tracks: [
    {
      name: 'Piano',
      instrument: 'salamander-piano/piano.sfz',
      notes: [{ beat: 0.5, beats: 1, pitches: [60, 64, 67], velocity: 0.5 }],
      sustain: [{ beat: 0, beats: 1 }],
    },
  ],
};

test('ad specifications default to vertical video and reject invalid input', () => {
  assert.deepEqual(specSchema.parse(production).formats, ['9:16']);
  for (const edit of [{ frames: 10 }, { formats: ['1:1'] }, { formats: [] }])
    assert.equal(specSchema.safeParse({ ...production, ...edit }).success, false);
});

test('soundtrack must fit the timeline and use plain asset paths', () => {
  const parse = (soundtrack: unknown) => specSchema.safeParse({ ...production, soundtrack }).success;
  assert.equal(parse({ score }), true);
  assert.equal(parse({}), false);
  // 60 frames is 2 seconds: 4 beats at 120 bpm.
  assert.equal(parse({ score: { ...score, bpm: 40 } }), false);
  assert.equal(parse({ clips: [{ src: 'local/a.wav', role: 'sfx', from: 50, frames: 20 }] }), false);
  assert.equal(parse({ clips: [{ src: 'local/a.wav', role: 'sfx', from: 50, frames: 10 }] }), true);
  assert.equal(parse({ clips: [{ src: 'local/../a.wav', role: 'sfx' }] }), false);
  assert.equal(parse({ clips: [{ src: 'pack/a//b.wav', role: 'sfx' }] }), false);
});

test('asset manifest requires https sources and unique ids', () => {
  const file = {
    type: 'file',
    id: 'click',
    url: 'https://example.com/click.wav',
    name: 'click.wav',
    sha256: 'a'.repeat(64),
    license: 'CC0-1.0',
    attribution: 'Example',
    source: 'https://example.com',
  };
  assert.equal(assetsSchema.safeParse([file]).success, true);
  assert.equal(assetsSchema.safeParse([{ ...file, url: 'http://example.com/click.wav' }]).success, false);
  assert.equal(assetsSchema.safeParse([file, file]).success, false);
  assert.equal(assetsSchema.safeParse([{ ...file, id: 'local' }]).success, false);
});

test('git blob checksums match git and reject changed content', () => {
  assert.equal(gitBlobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.notEqual(gitBlobSha(Buffer.from('hello!\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('score MIDI keeps chord pitches, note timing and the sustain pedal', () => {
  const parsed = specSchema.parse({ ...production, soundtrack: { score } }).soundtrack!.score!;
  const [track] = new ToneMidi.Midi(scoreMidi(parsed.bpm, parsed.tracks[0])).tracks;
  assert.deepEqual(
    track.notes.map((note) => note.midi),
    [60, 64, 67],
  );
  assert.equal(track.notes[0].time, 0.25);
  assert.equal(track.notes[0].duration, 0.5);
  assert.deepEqual(
    track.controlChanges[64].map((cc) => [cc.time, Math.round(cc.value)]),
    [
      [0, 1],
      [0.5, 0],
    ],
  );
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
