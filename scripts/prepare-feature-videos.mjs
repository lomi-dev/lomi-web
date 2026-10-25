#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = JSON.parse(readFileSync(path.join(root, 'media/feature-demos/cues.json'), 'utf8'));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
};
const input = path.resolve(root, option('--input-dir', 'artifacts/feature-demos/raw'));
const output = path.join(root, 'src/assets/product/demos');
const names = option('--only', Object.keys(cues.features).join(',')).split(',');
if (names.some((name) => !Object.hasOwn(cues.features, name))) throw new Error('Unknown feature name');
mkdirSync(output, { recursive: true });

const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
for (const name of names) {
  const { duration, sourceDuration } = cues.features[name];
  if (!Number.isFinite(duration) || duration < 1 || !Number.isFinite(sourceDuration) || sourceDuration < 1) throw new Error(`Invalid feature timing: ${name}`);
  // Prefer the original Retina recording over an intermediate review encode.
  const source = ['mov', 'webm', 'mp4'].map((ext) => path.join(input, `${name}.${ext}`)).find(existsSync);
  if (!source) throw new Error(`Missing native capture: ${name}`);
  const original = probe(source);
  const stream = original.streams.find((stream) => stream.codec_type === 'video');
  // macOS counts recorder startup in -V; hold the final resting frame if needed.
  if (!stream || Number(original.format.duration) < sourceDuration - .6) throw new Error(`Capture is too short: ${name}`);
  const chrome = [path.join(input, `${name}-window.png`), path.join(input, 'native-window-proof.png')].find(existsSync);
  if (!chrome) throw new Error(`Missing genuine pre-recording native controls: ${name}`);
  // macOS replaces the traffic lights with its purple recording indicator.
  // Restore only that OS-owned area from the same window before recording.
  const cropWidth = Math.round(stream.width * 88 / 1440);
  const cropHeight = Math.round(stream.height * 44 / 900);
  // Remove the captured macOS frame's one-point outline as well as the CSS rim.
  const edge = Math.max(1, Math.round(stream.width / 1440));
  const width = Math.min(1920, stream.width);
  const height = Math.round(width * stream.height / stream.width / 2) * 2;
  const filter = `[1:v]scale=${stream.width}:${stream.height},crop=${cropWidth}:${cropHeight}:0:0[controls];`
    + `[0:v][controls]overlay=0:0:format=auto:eof_action=repeat,crop=iw-${edge * 2}:ih-${edge * 2}:${edge}:${edge},fps=30,tpad=stop_mode=clone:stop_duration=1,trim=duration=${sourceDuration},setpts=(PTS-STARTPTS)*${duration / sourceDuration},fps=30,scale=${width}:${height}:flags=lanczos[window]`;
  const movie = path.join(output, `${name}.mp4`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-i', chrome,
    '-map', '[window]', '-an', '-t', String(duration), '-filter_complex', filter,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { stdio: 'inherit' });
  const encoded = probe(movie);
  if (Math.abs(Number(encoded.format.duration) - duration) > .1 || encoded.streams.length !== 1) throw new Error(`Invalid web movie: ${name}`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', movie,
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '94', path.join(output, `${name}-poster.webp`)], { stdio: 'inherit' });
  console.log(`${name}: ${duration}s silent MP4 and native first-frame poster prepared`);
}
