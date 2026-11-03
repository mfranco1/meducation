import ToneMidi from '@tonejs/midi';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { audioRecipeSchema, FPS, type AudioRecipe } from './spec';
import { ffmpeg, probe, run } from './media';

const { Midi } = ToneMidi;

// Debian's published source checksum. Extract only instrument data and its license.
const ARCHIVE_URL = 'https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont_3.1.orig.tar.gz';
const ARCHIVE_SHA256 = '2621acaa1c78e4abdb24bdd163230cc577e61276936d6aa6e3180582142f0343';
const FONT_SHA256 = '74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0';
const fontPath = (root: string) => join(root, '.cache/audio-fonts/fluid-soundfont-3.1/FluidR3_GM.sf2');
const logPath = (root: string, name: string) => join(root, '.cache/logs', `audio-${name}.log`);
const wav = ['-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le'];

async function hashFile(path: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
export async function verifySoundfontArchive(path: string) {
  if ((await hashFile(path)) !== ARCHIVE_SHA256)
    throw new Error('SoundFont archive checksum mismatch. Nothing was extracted.');
}
export async function setupAudio(root: string) {
  await run(process.env.FLUIDSYNTH ?? 'fluidsynth', ['--version'], logPath(root, 'fluidsynth'));
  try {
    if ((await hashFile(fontPath(root))) === FONT_SHA256) {
      console.log('Audio instruments already verified.');
      return;
    }
  } catch {
    /* First setup. */
  }
  const archive = join(root, '.cache/fluid-soundfont_3.1.orig.tar.gz');
  try {
    await verifySoundfontArchive(archive);
  } catch {
    console.log('Downloading FluidR3 instrument data from Debian (135 MB)…');
    const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`SoundFont download failed (${response.status})`);
    const partial = `${archive}.partial`;
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      createWriteStream(partial),
    );
    await verifySoundfontArchive(partial);
    await rename(partial, archive);
  }
  const directory = join(root, '.cache/audio-fonts');
  await mkdir(directory, { recursive: true });
  await run(
    'tar',
    ['-xzf', archive, '-C', directory, 'fluid-soundfont-3.1/FluidR3_GM.sf2', 'fluid-soundfont-3.1/COPYING'],
    logPath(root, 'extract'),
  );
  if ((await hashFile(fontPath(root))) !== FONT_SHA256) throw new Error('Extracted SoundFont checksum mismatch.');
  console.log(`Audio instruments verified: ${fontPath(root)}`);
}

export function scoreMidi(recipe: AudioRecipe) {
  const midi = new Midi();
  midi.name = recipe.id;
  midi.header.setTempo(recipe.bpm);
  for (const [index, part] of recipe.tracks.entries()) {
    const track = midi.addTrack();
    track.name = part.name;
    track.channel = index;
    track.instrument.number = part.program;
    track.addCC({ number: 10, time: 0, value: (part.pan + 1) / 2 });
    for (const note of part.notes)
      for (const pitch of note.pitches) {
        track.addNote({
          midi: pitch,
          time: (note.beat * 60) / recipe.bpm,
          duration: (note.beats * 60) / recipe.bpm,
          velocity: note.velocity,
        });
      }
  }
  return Buffer.from(midi.toArray());
}

type Loudness = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };
async function loudness(root: string, file: string, target: number): Promise<Loudness> {
  const log = logPath(root, 'loudness');
  await ffmpeg(['-i', file, '-af', `loudnorm=I=${target}:TP=-1.5:LRA=8:print_format=json`, '-f', 'null', '-'], log);
  const measurement = (await readFile(log, 'utf8')).match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (!measurement) throw new Error(`No audio loudness measurement. See ${log}`);
  return JSON.parse(measurement) as Loudness;
}
export async function validateAudio(root: string, file: string, frames: number, target: number) {
  const info = await probe(file, logPath(root, 'probe'));
  const stream = info.streams.find((stream) => stream.codec_type === 'audio');
  if (
    !stream ||
    stream.sample_rate !== '48000' ||
    stream.channels !== 2 ||
    Math.abs(Number(info.format.duration) - frames / FPS) > 1 / FPS
  )
    throw new Error('Expected a 48 kHz stereo soundtrack matching the timeline.');
  await ffmpeg(['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], logPath(root, 'decode'));
  const level = await loudness(root, file, target);
  const integrated = Number(level.input_i),
    peak = Number(level.input_tp);
  if (!Number.isFinite(integrated) || Math.abs(integrated - target) > 1 || !Number.isFinite(peak) || peak > -1)
    throw new Error(`Audio level check failed: ${integrated} LUFS, ${peak} dBTP`);
  console.log(`Audio validated: ${(frames / FPS).toFixed(2)}s, 48 kHz stereo, ${integrated} LUFS, ${peak} dBTP`);
}

async function effect(root: string, cue: AudioRecipe['effects'][number], file: string) {
  const seconds = cue.frames / FPS;
  const noise = `anoisesrc=color=pink:sample_rate=48000:duration=${seconds}:seed=${cue.seed}`;
  const source =
    cue.kind === 'chime'
      ? `aevalsrc=0.45*sin(2*PI*${cue.frequency}*t)*exp(-5*t)+0.18*sin(2*PI*${cue.frequency * 1.5}*t)*exp(-6*t):s=48000:d=${seconds}`
      : noise;
  const filters =
    cue.kind === 'tap'
      ? `highpass=f=700,lowpass=f=3500,afade=t=in:d=0.005,afade=t=out:st=0.01:d=${Math.max(0.01, seconds - 0.01)}`
      : `highpass=f=400,lowpass=f=6000,afade=t=in:d=${Math.min(0.12, seconds / 3)},afade=t=out:st=${seconds / 3}:d=${(seconds * 2) / 3}`;
  await ffmpeg(['-f', 'lavfi', '-i', source, '-af', filters, ...wav, file], logPath(root, 'effect'));
}

export async function generateAudio(root: string, recipePath: string, force: boolean) {
  const recipe = audioRecipeSchema.parse(JSON.parse(await readFile(resolve(root, recipePath), 'utf8')));
  if ((await hashFile(fontPath(root)).catch(() => '')) !== FONT_SHA256)
    throw new Error('Audio instruments missing or changed. Run npm --prefix marketing run audio:setup.');
  const version = await run(process.env.FLUIDSYNTH ?? 'fluidsynth', ['--version'], logPath(root, 'fluidsynth'));
  const ffmpegVersion = await ffmpeg(['-version'], logPath(root, 'version'));
  const key = createHash('sha256')
    .update(JSON.stringify(recipe))
    .update(await readFile(join(root, 'audio.ts')))
    .update(await readFile(join(root, 'package-lock.json')))
    .update(version)
    .update(ffmpegVersion)
    .digest('hex');
  const destination = join(root, 'public/audio', recipe.id);
  try {
    const saved = (await readFile(join(destination, 'cache-key'), 'utf8')).split('\n');
    if (!force && saved[0] === key && saved[1] === (await hashFile(join(destination, 'mix.wav')))) {
      await validateAudio(root, join(destination, 'mix.wav'), recipe.frames, recipe.lufs);
      console.log(`Audio reused: ${destination}/mix.wav`);
      return recipe;
    }
  } catch {
    /* Missing or damaged output is generated again. */
  }
  const working = join(root, '.cache/audio-render', recipe.id);
  await rm(working, { recursive: true, force: true });
  await mkdir(working, { recursive: true });
  await writeFile(join(working, 'music.mid'), scoreMidi(recipe));
  await run(
    process.env.FLUIDSYNTH ?? 'fluidsynth',
    [
      '-ni',
      '-q',
      '-r',
      '48000',
      '-g',
      '0.65',
      '-R',
      '1',
      '-C',
      '0',
      '-o',
      'synth.reverb.room-size=0.55',
      '-o',
      'synth.reverb.damp=0.6',
      '-o',
      'synth.reverb.level=0.25',
      '-F',
      join(working, 'music-raw.wav'),
      fontPath(root),
      join(working, 'music.mid'),
    ],
    logPath(root, 'music'),
  );
  const seconds = recipe.frames / FPS;
  await ffmpeg(
    [
      '-i',
      join(working, 'music-raw.wav'),
      '-af',
      `highpass=f=60,lowpass=f=6500,apad,atrim=duration=${seconds},afade=t=in:d=0.25,afade=t=out:st=${seconds - Math.min(1.2, seconds / 2)}:d=${Math.min(1.2, seconds / 2)}`,
      ...wav,
      join(working, 'music.wav'),
    ],
    logPath(root, 'music-trim'),
  );
  const inputs = ['-i', join(working, 'music.wav')];
  const filters = [`[0:a]volume=${recipe.musicGain}[music]`];
  for (const [index, cue] of recipe.effects.entries()) {
    const file = join(working, `effect-${index}-${cue.kind}.wav`);
    await effect(root, cue, file);
    inputs.push('-i', file);
    filters.push(`[${index + 1}:a]volume=${cue.gain},adelay=${Math.round((cue.from * 1000) / FPS)}:all=1[fx${index}]`);
  }
  filters.push(
    `[music]${recipe.effects.map((_, index) => `[fx${index}]`).join('')}amix=inputs=${recipe.effects.length + 1}:normalize=0,atrim=duration=${seconds}[mix]`,
  );
  const raw = join(working, 'mix-raw.wav');
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[mix]', ...wav, raw], logPath(root, 'mix'));
  const measured = await loudness(root, raw, recipe.lufs);
  if (!Number.isFinite(Number(measured.input_i))) throw new Error('The score produced silence.');
  const normalization = `loudnorm=I=${recipe.lufs}:TP=-1.5:LRA=8:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await ffmpeg(
    ['-i', raw, '-af', normalization, '-t', String(seconds), ...wav, join(working, 'mix.wav')],
    logPath(root, 'master'),
  );
  await validateAudio(root, join(working, 'mix.wav'), recipe.frames, recipe.lufs);
  await writeFile(join(working, 'cache-key'), `${key}\n${await hashFile(join(working, 'mix.wav'))}`);
  await rm(join(working, 'music-raw.wav'));
  await rm(raw);
  await mkdir(join(destination, '..'), { recursive: true });
  const previous = `${destination}.previous`;
  await rm(previous, { recursive: true, force: true });
  let moved = false;
  try {
    await rename(destination, previous);
    moved = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(working, destination);
  } catch (error) {
    if (moved) await rename(previous, destination);
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
  console.log(`Audio generated: ${destination}/mix.wav (MIDI, music and effects retained)`);
  return recipe;
}
