import ToneMidi from '@tonejs/midi';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assetsSchema, FPS, type Asset, type AdSpec, type Soundtrack } from './spec';
import { ffmpeg, probe, run } from './media';

const { Midi } = ToneMidi;

const SFIZZ_URL = 'https://github.com/sfztools/sfizz/releases/download/1.2.3/sfizz-1.2.3.tar.gz';
const SFIZZ_SHA256 = 'a9339eac7620d7f0f6b44bdfe860680fab73e66efad4b5f15b21198dd9436822';
const KOKORO = 'kokoro-82m';
const logPath = (root: string, name: string) => join(root, '.cache/logs', `audio-${name}.log`);
const assetDir = (root: string, id: string) => join(root, '.cache/assets', id);
const sfizzTool = (root: string) => process.env.SFIZZ_RENDER ?? join(root, '.cache/tools/sfizz_render');
const wav = ['-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le'];
const stem = ['-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le'];

async function hashFile(path: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

async function download(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// ---- sfizz renderer ----

export async function verifyArchive(path: string) {
  if ((await hashFile(path)) !== SFIZZ_SHA256)
    throw new Error('sfizz archive checksum mismatch. Nothing was extracted.');
}
export async function setupAudio(root: string) {
  if (process.env.SFIZZ_RENDER) {
    await access(process.env.SFIZZ_RENDER);
    console.log(`Using ${process.env.SFIZZ_RENDER}`);
    return;
  }
  const tool = sfizzTool(root);
  if (
    await access(tool).then(
      () => true,
      () => false,
    )
  ) {
    console.log(`sfizz_render already built: ${tool}`);
    return;
  }
  await run('cmake', ['--version'], logPath(root, 'cmake')).catch(() => {
    throw new Error('cmake is required to build sfizz. Install it with: brew install cmake');
  });
  const archive = join(root, '.cache/sfizz-1.2.3.tar.gz');
  try {
    await verifyArchive(archive);
  } catch {
    console.log('Downloading sfizz 1.2.3 source…');
    const partial = `${archive}.partial`;
    const response = await fetch(SFIZZ_URL, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`sfizz download failed (${response.status})`);
    await mkdir(dirname(archive), { recursive: true });
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      createWriteStream(partial),
    );
    await verifyArchive(partial);
    await rename(partial, archive);
  }
  const extracted = join(root, '.cache/sfizz-src');
  await rm(extracted, { recursive: true, force: true });
  await mkdir(extracted, { recursive: true });
  await run('tar', ['-xzf', archive, '-C', extracted, '--strip-components=1'], logPath(root, 'sfizz-extract'));
  const flags = ['-Wno-missing-template-arg-list-after-template-kw'];
  const configure = [
    '-S',
    extracted,
    '-B',
    join(extracted, 'build'),
    '-DCMAKE_BUILD_TYPE=Release',
    '-DSFIZZ_SHARED=OFF',
    '-DSFIZZ_JACK=OFF',
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
  ];
  if (process.platform === 'darwin') {
    const sdk = (await run('xcrun', ['--show-sdk-path'], logPath(root, 'xcrun'))).trim();
    flags.push('-isystem', `${sdk}/usr/include/c++/v1`);
    if (process.arch === 'arm64') configure.push('-DPROJECT_SYSTEM_PROCESSOR=aarch64');
  }
  console.log('Building sfizz_render (about a minute)…');
  await run('env', [`CXXFLAGS=${flags.join(' ')}`, 'cmake', ...configure], logPath(root, 'sfizz-configure'));
  await run(
    'cmake',
    ['--build', join(extracted, 'build'), '--target', 'sfizz_render', '-j', String(availableParallelism())],
    logPath(root, 'sfizz-build'),
  );
  await mkdir(dirname(tool), { recursive: true });
  await copyFile(join(extracted, 'build/library/bin/sfizz_render'), tool);
  await rm(extracted, { recursive: true, force: true });
  console.log(`sfizz_render built: ${tool}`);
}

// ---- asset manifest ----

export async function loadAssets(root: string) {
  return assetsSchema.parse(JSON.parse(await readFile(join(root, 'assets.json'), 'utf8')));
}
const marker = (entry: Asset) => sha256(JSON.stringify(entry));
const assetIds = (soundtrack: Soundtrack) => [
  ...new Set(
    [...(soundtrack.score?.tracks.map((t) => t.instrument) ?? []), ...soundtrack.clips.map((c) => c.src)]
      .map((ref) => ref.split('/')[0])
      .filter((id) => id !== 'local')
      .concat(soundtrack.voiceover.length ? [KOKORO] : []),
  ),
];
const soundtrackRefs = (soundtrack: Soundtrack) => [
  ...(soundtrack.score?.tracks.map((t) => t.instrument) ?? []),
  ...soundtrack.clips.map((c) => c.src),
];

/** Git object id of a file: sha1 of "blob <size>\0" followed by the content. */
export const gitBlobSha = (content: Buffer) =>
  createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');

async function fetchGithub(entry: Extract<Asset, { type: 'github' }>, directory: string) {
  const headers: Record<string, string> = { 'User-Agent': 'meducation-marketing' };
  const apiHeaders = process.env.GITHUB_TOKEN
    ? { ...headers, Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : headers;
  const tree = JSON.parse(
    (
      await download(`https://api.github.com/repos/${entry.repo}/git/trees/${entry.commit}?recursive=1`, apiHeaders)
    ).toString(),
  ) as { truncated: boolean; tree: { path: string; type: string; sha: string }[] };
  if (tree.truncated) throw new Error(`${entry.id}: repository listing is truncated`);
  const blobs = tree.tree.filter(
    (item) => item.type === 'blob' && (entry.paths.length === 0 || entry.paths.some((p) => item.path.startsWith(p))),
  );
  for (const { path } of blobs)
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`${entry.id}: unsafe path ${path}`);
  let next = 0;
  const worker = async () => {
    for (let item = blobs[next++]; item; item = blobs[next++]) {
      const encoded = item.path.split('/').map(encodeURIComponent).join('/');
      const content = await download(
        `https://raw.githubusercontent.com/${entry.repo}/${entry.commit}/${encoded}`,
        headers,
      );
      if (gitBlobSha(content) !== item.sha) throw new Error(`${entry.id}: checksum mismatch for ${item.path}`);
      const target = join(directory, item.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  };
  console.log(`Fetching ${entry.id}: ${blobs.length} files…`);
  await Promise.all(Array.from({ length: 8 }, worker));
}

type HuggingfaceFile = { type: string; path: string; oid: string; lfs?: { oid: string } };
/** Large files are checked by SHA-256 (`lfs.oid`), small ones by git blob hash (`oid`). */
export const matchesHuggingfaceFile = (item: HuggingfaceFile, content: Buffer) =>
  item.lfs ? sha256(content) === item.lfs.oid : gitBlobSha(content) === item.oid;

async function fetchHuggingface(entry: Extract<Asset, { type: 'huggingface' }>, directory: string) {
  const base = `https://huggingface.co/${entry.repo}`;
  const tree = JSON.parse(
    (
      await download(`https://huggingface.co/api/models/${entry.repo}/tree/${entry.revision}?recursive=true`)
    ).toString(),
  ) as HuggingfaceFile[];
  const files = tree.filter(
    (item) => item.type === 'file' && (entry.paths.length === 0 || entry.paths.some((p) => item.path.startsWith(p))),
  );
  for (const { path } of files)
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`${entry.id}: unsafe path ${path}`);
  console.log(`Fetching ${entry.id}: ${files.length} files…`);
  for (const item of files) {
    const encoded = item.path.split('/').map(encodeURIComponent).join('/');
    const content = await download(`${base}/resolve/${entry.revision}/${encoded}`);
    if (!matchesHuggingfaceFile(item, content)) throw new Error(`${entry.id}: checksum mismatch for ${item.path}`);
    const target = join(directory, item.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function verifyLocal(root: string, entry: Extract<Asset, { type: 'local' }>) {
  for (const file of entry.files)
    if ((await hashFile(join(assetDir(root, entry.id), file.name)).catch(() => '')) !== file.sha256)
      throw new Error(
        `${entry.id}: put ${file.name} (sha256 ${file.sha256}) in .cache/assets/${entry.id}/. Missing or changed.`,
      );
}

async function fetchAsset(root: string, entry: Asset) {
  const directory = assetDir(root, entry.id);
  if (entry.type === 'local') {
    await verifyLocal(root, entry);
    console.log(`Asset ${entry.id} verified.`);
    return;
  }
  if ((await readFile(join(directory, '.verified'), 'utf8').catch(() => '')) === marker(entry)) {
    console.log(`Asset ${entry.id} already verified.`);
    return;
  }
  const partial = `${directory}.partial`;
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true });
  if (entry.type === 'github') await fetchGithub(entry, partial);
  else if (entry.type === 'huggingface') await fetchHuggingface(entry, partial);
  else {
    const content = await download(entry.url);
    if (sha256(content) !== entry.sha256) throw new Error(`${entry.id}: checksum mismatch`);
    await writeFile(join(partial, entry.name), content);
  }
  await writeFile(join(partial, '.verified'), marker(entry));
  await rm(directory, { recursive: true, force: true });
  await rename(partial, directory);
  console.log(`Asset ${entry.id} verified: ${entry.license}`);
}

export async function fetchAssets(root: string, options: { id?: string; spec?: AdSpec }) {
  const manifest = await loadAssets(root);
  const ids = options.id ? [options.id] : options.spec?.soundtrack ? assetIds(options.spec.soundtrack) : [];
  for (const id of ids) {
    const entry = manifest.find((asset) => asset.id === id);
    if (!entry) throw new Error(`Unknown asset "${id}". Add it to assets.json.`);
    await fetchAsset(root, entry);
  }
  if (ids.length === 0) console.log('No external assets to fetch.');
}

/** Every referenced asset must be in the manifest and verified. Returns the referenced entries. */
async function requireAssets(root: string, soundtrack: Soundtrack) {
  const manifest = await loadAssets(root);
  const entries: Asset[] = [];
  for (const id of assetIds(soundtrack)) {
    const entry = manifest.find((asset) => asset.id === id);
    if (!entry) throw new Error(`Unknown asset "${id}". Add it to assets.json.`);
    if (entry.type === 'local') await verifyLocal(root, entry);
    else if ((await readFile(join(assetDir(root, id), '.verified'), 'utf8').catch(() => '')) !== marker(entry))
      throw new Error(
        `Asset ${id} is missing or unverified. Run: npm --prefix marketing run assets:fetch -- --id ${id}`,
      );
    entries.push(entry);
  }
  return entries;
}
function resolveRef(root: string, ref: string) {
  const [id, ...rest] = ref.split('/');
  const base = id === 'local' ? join(root, 'audio') : assetDir(root, id);
  const path = resolve(base, rest.join('/'));
  if (!path.startsWith(base + sep)) throw new Error(`Invalid audio reference: ${ref}`);
  return path;
}

// ---- score ----

export function scoreMidi(bpm: number, track: NonNullable<Soundtrack['score']>['tracks'][number]) {
  const seconds = (beats: number) => (beats * 60) / bpm;
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const part = midi.addTrack();
  part.name = track.name;
  part.channel = 0;
  for (const note of track.notes)
    for (const pitch of note.pitches)
      part.addNote({ midi: pitch, time: seconds(note.beat), duration: seconds(note.beats), velocity: note.velocity });
  for (const pedal of track.sustain) {
    part.addCC({ number: 64, time: seconds(pedal.beat), value: 1 });
    part.addCC({ number: 64, time: seconds(pedal.beat + pedal.beats), value: 0 });
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

// ---- generation ----

const balance = (pan: number) => `pan=stereo|c0=${Math.min(1, 1 - pan)}*c0|c1=${Math.min(1, 1 + pan)}*c1`;

/** Spoken intervals in a voice bus, in seconds. */
async function speech(root: string, file: string, seconds: number) {
  await ffmpeg(['-i', file, '-af', 'silencedetect=n=-45dB:d=0.25', '-f', 'null', '-'], logPath(root, 'speech'));
  const log = await readFile(logPath(root, 'speech'), 'utf8');
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // Speech runs from each silence end (or 0) to the next silence start (or the end).
  const edges = [0, ...starts.flatMap((start, i) => [start, ends[i] ?? seconds]), seconds];
  const spans: [number, number][] = [];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 0.05) spans.push([edges[i], edges[i + 1]]);
  return spans;
}
/** FFmpeg volume expression: `duck` dB during speech, ramping down 0.15 s before and back up over 0.4 s after. */
export function duckGain(spans: [number, number][], duck: number) {
  if (!spans.length) return '1';
  const cover = spans
    .map(
      ([start, end]) =>
        `min(max((t-${(start - 0.15).toFixed(3)})/0.15,0),1)*min(max((${(end + 0.4).toFixed(3)}-t)/0.4,0),1)`,
    )
    .reduce((all, next) => `max(${all},${next})`);
  return `pow(10,${duck / 20}*${cover})`;
}

/**
 * Synthesizes voiceover lines with Kokoro, offline from the verified model asset. Voices ship inside the
 * pinned kokoro-js package. Lines are cached by content in .cache/voice/ and resampled to 48 kHz stereo.
 */
async function voiceLines(root: string, spec: AdSpec, entries: Asset[], working: string) {
  const lines = spec.soundtrack?.voiceover ?? [];
  const model = entries.find((entry) => entry.id === KOKORO)!;
  const version = JSON.parse(await readFile(join(root, 'node_modules/kokoro-js/package.json'), 'utf8')).version;
  type Kokoro = typeof import('kokoro-js');
  let loaded:
    | {
        tts: InstanceType<Kokoro['KokoroTTS']>;
        RawAudio: typeof import('@huggingface/transformers').RawAudio;
        TextSplitterStream: Kokoro['TextSplitterStream'];
      }
    | undefined;
  const clips = [];
  for (const [index, line] of lines.entries()) {
    const { text, voice, speed } = line;
    const cached = join(
      root,
      '.cache/voice',
      `${sha256(JSON.stringify({ text, voice, speed, model: marker(model), version }))}.wav`,
    );
    if (
      !(await access(cached).then(
        () => true,
        () => false,
      ))
    ) {
      if (!loaded) {
        const { env, RawAudio } = await import('@huggingface/transformers');
        env.allowRemoteModels = false;
        env.localModelPath = join(root, '.cache/assets') + sep;
        const { KokoroTTS, TextSplitterStream } = await import('kokoro-js');
        const tts = await KokoroTTS.from_pretrained(KOKORO, { dtype: 'fp32', device: 'cpu' });
        loaded = { tts, RawAudio, TextSplitterStream };
      }
      // The model reads at most about 510 tokens, so synthesize sentence by sentence with a short pause between.
      const pause = new Float32Array(3600);
      const parts: Float32Array[] = [];
      const sentences = new loaded.TextSplitterStream();
      sentences.push(text);
      sentences.close();
      for await (const { audio } of loaded.tts.stream(sentences, { voice: voice as 'af_heart', speed }))
        parts.push(...(parts.length ? [pause] : []), audio.audio);
      const samples = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
      let offset = 0;
      for (const part of parts) samples.set(part, (offset += part.length) - part.length);
      await mkdir(dirname(cached), { recursive: true });
      await writeFile(`${cached}.partial`, Buffer.from(new loaded.RawAudio(samples, 24000).toWav()));
      await rename(`${cached}.partial`, cached);
    }
    const file = join(working, `voice-${index + 1}.wav`);
    await ffmpeg(['-i', cached, ...stem, file], logPath(root, 'voice'));
    const frames = Math.ceil(Number((await probe(file, logPath(root, 'voice'))).format.duration) * FPS);
    if (line.from + frames > spec.frames)
      throw new Error(`Voice ${index + 1} runs past the end of the ad (frames ${line.from}-${line.from + frames}).`);
    console.log(
      `Voice ${index + 1}: frames ${line.from}-${line.from + frames} (${(frames / FPS).toFixed(2)} s) "${text.length > 50 ? `${text.slice(0, 50)}…` : text}"`,
    );
    clips.push({ ...line, file, role: 'voice' as const, trim: 0, frames: undefined, fadeIn: 0, fadeOut: 0 });
  }
  return clips;
}

export async function generateAudio(root: string, spec: AdSpec, force: boolean) {
  const { soundtrack } = spec;
  if (!soundtrack) throw new Error('This ad has no soundtrack.');
  const entries = await requireAssets(root, soundtrack);
  const sfizz = sfizzTool(root);
  if (
    soundtrack.score &&
    !(await access(sfizz).then(
      () => true,
      () => false,
    ))
  )
    throw new Error('sfizz_render is missing. Run: npm --prefix marketing run audio:setup');
  const seconds = spec.frames / FPS;
  const refs = [...new Set(soundtrackRefs(soundtrack))];
  const key = createHash('sha256')
    .update(JSON.stringify({ soundtrack, frames: spec.frames, entries }))
    .update(await readFile(join(root, 'audio.ts')))
    .update(await readFile(join(root, 'package-lock.json')))
    .update(soundtrack.score ? await hashFile(sfizz) : '')
    .update(await ffmpeg(['-version'], logPath(root, 'version')));
  for (const ref of refs)
    if (ref.startsWith('local/') || ref.endsWith('.sfz')) key.update(ref).update(await hashFile(resolveRef(root, ref)));
  const cacheKey = key.digest('hex');
  const destination = join(root, 'public/audio', spec.id);
  const master = join(destination, 'mix.wav');
  try {
    const saved = (await readFile(join(destination, 'cache-key'), 'utf8')).split('\n');
    if (!force && saved[0] === cacheKey && saved[1] === (await hashFile(master))) {
      await validateAudio(root, master, spec.frames, soundtrack.lufs);
      console.log(`Audio reused: ${master}`);
      return;
    }
  } catch {
    /* Missing or damaged output is generated again. */
  }

  const working = join(root, '.cache/audio', spec.id);
  await rm(working, { recursive: true, force: true });
  await mkdir(working, { recursive: true });
  const inputs: string[] = [];
  const filters: string[] = [];
  const input = (file: string) => {
    inputs.push('-i', file);
    return inputs.length / 2 - 1;
  };
  const buses: Record<'music' | 'sfx' | 'voice', string[]> = { music: [], sfx: [], voice: [] };
  const sum = (labels: string[], out: string) =>
    filters.push(`${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0[${out}]`);

  const score = soundtrack.score;
  if (score) {
    const impulse = join(working, 'reverb-impulse.wav');
    const s = score.reverb.seconds;
    const decay = `exp(-6.9*t/${s})`;
    await ffmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        `aevalsrc=(random(0)*2-1)*${decay}|(random(1)*2-1)*${decay}:s=48000:d=${s}`,
        '-af',
        'highpass=f=200,lowpass=f=7000',
        ...stem,
        impulse,
      ],
      logPath(root, 'impulse'),
    );
    const dry: string[] = [];
    const sends: string[] = [];
    for (const [index, track] of score.tracks.entries()) {
      const base = join(working, `track-${index}-${track.name.replace(/[^\w-]+/g, '-')}`);
      await writeFile(`${base}.mid`, scoreMidi(score.bpm, track));
      await run(
        sfizz,
        [
          '--sfz',
          resolveRef(root, track.instrument),
          '--midi',
          `${base}.mid`,
          '--wav',
          `${base}-raw.wav`,
          '-s',
          '48000',
        ],
        logPath(root, `sfizz-${index}`),
      );
      await ffmpeg(
        ['-i', `${base}-raw.wav`, '-af', `apad,atrim=duration=${seconds}`, ...stem, `${base}.wav`],
        logPath(root, 'track'),
      );
      await rm(`${base}-raw.wav`);
      const level = await ffmpeg(
        ['-i', `${base}.wav`, '-af', 'volumedetect', '-f', 'null', '-'],
        logPath(root, 'level'),
      )
        .then(() => readFile(logPath(root, 'level'), 'utf8'))
        .then((text) => ({
          peak: Number(text.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? -Infinity),
          mean: Number(text.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -Infinity),
        }));
      if (!(level.peak > -80))
        throw new Error(
          `Track "${track.name}" rendered silence. Choose a playable .sfz program in ${track.instrument}.`,
        );
      console.log(`Track ${track.name}: mean ${level.mean} dB, peak ${level.peak} dB before gain`);
      const n = input(`${base}.wav`);
      filters.push(
        `[${n}:a]volume=${track.gain}dB,${balance(track.pan)},asplit=2[dry${index}][send${index}]`,
        `[send${index}]volume=${track.reverb}[wet${index}]`,
      );
      dry.push(`dry${index}`);
      sends.push(`wet${index}`);
    }
    const ir = input(impulse);
    sum(dry, 'drybus');
    sum(sends, 'sendbus');
    filters.push(`[sendbus][${ir}:a]afir=dry=0:wet=1,volume=${score.reverb.mix}[wetbus]`);
    sum(['drybus', 'wetbus'], 'score');
    filters.push('[score]asplit=2[scoremix][scorestem]');
    buses.music.push('scoremix');
  }
  const voice = await voiceLines(root, spec, entries, working);
  const clips = [...soundtrack.clips.map((clip) => ({ ...clip, file: resolveRef(root, clip.src) })), ...voice];
  for (const [index, clip] of clips.entries()) {
    const { file } = clip;
    const info = await probe(file, logPath(root, 'clip'));
    const available = Math.floor(Number(info.format.duration) * FPS) - clip.trim;
    const frames = Math.min(clip.frames ?? available, available, spec.frames - clip.from);
    if (frames <= 0) throw new Error(`Clip does not fit the ad: ${file}`);
    const length = frames / FPS;
    const n = input(file);
    filters.push(
      [
        `[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo`,
        `atrim=start=${clip.trim / FPS}:duration=${length}`,
        'asetpts=PTS-STARTPTS',
        `afade=t=in:st=0:d=${clip.fadeIn / FPS}`,
        `afade=t=out:st=${Math.max(0, length - clip.fadeOut / FPS)}:d=${clip.fadeOut / FPS}`,
        `volume=${clip.gain}dB`,
        balance(clip.pan),
        `adelay=${clip.from * 1600}S:all=1`,
      ].join(',') + `[clip${index}]`,
    );
    buses[clip.role].push(`clip${index}`);
  }
  const outputs: string[] = [];
  const names: string[] = [];
  for (const role of ['music', 'sfx', 'voice'] as const) {
    if (buses[role].length === 0) continue;
    sum(buses[role], `${role}bus`);
    filters.push(`[${role}bus]apad,atrim=duration=${seconds}[${role}out]`);
    outputs.push('-map', `[${role}out]`, ...stem, join(working, `${role}.wav`));
    names.push(role);
  }
  if (score) outputs.push('-map', '[scorestem]', ...stem, join(working, 'score.wav'));
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), ...outputs], logPath(root, 'buses'));

  const stems: string[] = [];
  const masterFilters: string[] = [];
  for (const role of names) stems.push('-i', join(working, `${role}.wav`));
  const label = (role: string) => `${names.indexOf(role)}:a`;
  const mixed: string[] = [];
  if (names.includes('music')) {
    if (names.includes('voice')) {
      const gain = duckGain(await speech(root, join(working, 'voice.wav'), seconds), soundtrack.duck);
      masterFilters.push(`[${label('music')}]volume='${gain}':eval=frame[music]`);
      mixed.push('[music]', `[${label('voice')}]`);
    } else mixed.push(`[${label('music')}]`);
  } else if (names.includes('voice')) mixed.push(`[${label('voice')}]`);
  if (names.includes('sfx')) mixed.push(`[${label('sfx')}]`);
  masterFilters.push(
    `${mixed.join('')}amix=inputs=${mixed.length}:normalize=0,alimiter=limit=0.84:level=disabled,atrim=duration=${seconds}[mix]`,
  );
  const raw = join(working, 'mix-raw.wav');
  await ffmpeg(
    [...stems, '-filter_complex', masterFilters.join(';'), '-map', '[mix]', ...stem, raw],
    logPath(root, 'mix'),
  );
  const measured = await loudness(root, raw, soundtrack.lufs);
  if (!Number.isFinite(Number(measured.input_i))) throw new Error('The soundtrack is silent.');
  const normalization = `loudnorm=I=${soundtrack.lufs}:TP=-1.5:LRA=8:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  const partial = join(working, 'mix.wav');
  await ffmpeg(['-i', raw, '-af', normalization, '-t', String(seconds), ...wav, partial], logPath(root, 'master'));
  await validateAudio(root, partial, spec.frames, soundtrack.lufs);
  await rm(raw);
  await mkdir(destination, { recursive: true });
  await rm(join(destination, 'cache-key'), { force: true });
  await copyFile(partial, `${master}.partial`);
  await rename(`${master}.partial`, master);
  await writeFile(join(destination, 'cache-key'), `${cacheKey}\n${await hashFile(master)}`);
  console.log(`Audio generated: ${master} (stems in ${working})`);
}
