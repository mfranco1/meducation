import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';

export async function run(command: string, args: string[], log: string): Promise<string> {
  await mkdir(join(log, '..'), { recursive: true });
  const file = await open(log, 'w');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', file.fd] });
      let output = '';
      child.stdout!.setEncoding('utf8').on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(output) : reject(new Error(`${command} failed (${code}). See ${log}`)),
      );
    });
  } finally {
    await file.close();
  }
}
export async function probe(path: string, log: string) {
  return JSON.parse(
    await run(
      process.env.FFPROBE ?? 'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      log,
    ),
  ) as {
    format: { duration: string };
    streams: {
      codec_type: string;
      codec_name: string;
      width: number;
      height: number;
      pix_fmt: string;
      avg_frame_rate: string;
      duration?: string;
      sample_rate?: string;
      channels?: number;
    }[];
  };
}
export const ffmpeg = (args: string[], log: string) =>
  run(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], log);
