#!/usr/bin/env node

import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  readSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.join(repoRoot, "media", "feature-demos");
const cueConfig = JSON.parse(readFileSync(path.join(projectDir, "cues.json"), "utf8"));
const defaultInputDir = path.join(repoRoot, "src", "assets", "product", "demos");
const outputRoot = path.join(repoRoot, "artifacts", "feature-demos");
const defaultOutputDir = path.join(outputRoot, "rendered");
const defaultPosterDir = path.join(outputRoot, "posters");
const defaultGifDir = path.join(outputRoot, "gif");
const defaultNames = Object.keys(cueConfig.features);
const acceptedExtensions = [".mp4", ".webm", ".mov"];
const temporaryCompositions = new Set();

process.on("SIGINT", () => {
  for (const file of temporaryCompositions) {
    try {
      unlinkSync(file);
    } catch {
      // The composition may already have been removed by the render cleanup.
    }
  }
  process.exit(130);
});

function usage() {
  console.log(`Render the real Lomi window recordings through the HyperFrames composition.

Usage:
  node scripts/render-feature-demos.mjs [options]

Options:
  --input-dir <path>       Prepared recordings and optional cue JSON
                           (default: src/assets/product/demos)
  --manifest <path>        Cue JSON; relative paths resolve from --input-dir
  --output-dir <path>      MP4 output directory
  --poster-dir <path>      First-frame WebP poster directory
  --gif-dir <path>         GIF output directory (default: artifacts/feature-demos/gif)
  --only <name,...>        Render selected demo(s), e.g. terminal for camera review
  --fps <24|30>            Output frame rate (default: 30)
  --quality <preset>       HyperFrames quality: draft, looks, delivery (default: looks)
  --no-gif                 Skip GIF exports
  -h, --help               Show this help
`);
}

function parseArgs(argv) {
  const options = {
    inputDir: defaultInputDir,
    outputDir: defaultOutputDir,
    posterDir: defaultPosterDir,
    gifDir: defaultGifDir,
    fps: cueConfig.fps,
    quality: "looks",
    makeGifs: true,
    only: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const result = argv[index + 1];
      if (!result || result.startsWith("--")) {
        throw new Error(`Expected a value after ${arg}`);
      }
      index += 1;
      return result;
    };

    if (arg === "--input-dir") options.inputDir = path.resolve(repoRoot, value());
    else if (arg === "--manifest") options.manifest = value();
    else if (arg === "--output-dir") options.outputDir = path.resolve(repoRoot, value());
    else if (arg === "--poster-dir") options.posterDir = path.resolve(repoRoot, value());
    else if (arg === "--gif-dir") options.gifDir = path.resolve(repoRoot, value());
    else if (arg === "--only") options.only = value().split(",").filter(Boolean);
    else if (arg === "--fps") options.fps = Number(value());
    else if (arg === "--quality") options.quality = value();
    else if (arg === "--no-gif") options.makeGifs = false;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (![24, 30].includes(options.fps)) throw new Error("--fps must be 24 or 30");
  if (!["draft", "looks", "delivery"].includes(options.quality)) {
    throw new Error("--quality must be draft, looks, or delivery");
  }
  return options;
}

function findNode22Path() {
  const candidates = (process.env.PATH || "").split(path.delimiter).map((dir) => path.join(dir, "node"));
  candidates.push(process.execPath);

  for (const candidate of [...new Set(candidates)]) {
    if (!existsSync(candidate)) continue;
    try {
      const version = execFileSync(candidate, ["-p", "process.versions.node"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (Number(version.split(".")[0]) >= 22) return path.dirname(candidate);
    } catch {
      // Continue through PATH until a Node 22 executable is found.
    }
  }
  throw new Error("Node.js 22 or newer is required. Put Node 22 on PATH and retry.");
}

function commandEnvironment() {
  const nodeBin = findNode22Path();
  const pathParts = [nodeBin, ...(process.env.PATH || "").split(path.delimiter)];
  const uniquePath = [...new Set(pathParts.filter(Boolean))].join(path.delimiter);
  return {
    ...process.env,
    PATH: uniquePath,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || "/tmp/lomi-hyperframes-cache-serial",
  };
}

function run(command, args, { cwd = repoRoot, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? result.signal}`);
  }
}

function capture(command, args, { cwd = repoRoot, env = process.env } = {}) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function resolveManifestPath(inputDir, manifestOption) {
  if (manifestOption) {
    return path.isAbsolute(manifestOption) ? manifestOption : path.resolve(inputDir, manifestOption);
  }
  for (const candidate of ["feature-demos.json", "feature-demos-cues.json", "capture-cues.json", "cues.json", "manifest.json"]) {
    const file = path.join(inputDir, candidate);
    if (existsSync(file)) return file;
  }
  return null;
}

function readManifest(file) {
  if (!file) return { defaults: {}, demos: null };
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read cue JSON ${file}: ${error.message}`);
  }

  if (Array.isArray(data)) return { defaults: {}, demos: data };
  if (!data || typeof data !== "object") throw new Error("Cue JSON must be an object or array");

  const defaults = {
    ...(data.camera && typeof data.camera === "object" ? data.camera : {}),
    ...(data.defaults && typeof data.defaults === "object" ? data.defaults : {}),
  };
  let demos = Array.isArray(data.demos) ? data.demos : Array.isArray(data.cues) ? data.cues : null;
  if (!Array.isArray(demos) && data.features && typeof data.features === "object") {
    demos = Object.entries(data.features).map(([name, config]) => ({ name, ...config }));
  }
  if (!Array.isArray(demos) && data.cues && typeof data.cues === "object") {
    demos = Object.entries(data.cues).map(([name, config]) => ({ name, ...config }));
  }
  if (!Array.isArray(demos)) {
    const ignored = new Set(["defaults", "duration", "fps", "canvas", "version"]);
    const entries = Object.entries(data).filter(([key, value]) => !ignored.has(key) && value && typeof value === "object");
    if (entries.length > 0) demos = entries.map(([name, config]) => ({ name, ...config }));
  }
  if (!Array.isArray(demos)) return { defaults, demos: null };
  return { defaults, demos };
}

function readSidecarCues(inputDir) {
  const demos = [];
  for (const name of defaultNames) {
    const file = [
      `${name}.cues.json`,
      `${name}-cues.json`,
      `${name}.json`,
    ]
      .map((filename) => path.join(inputDir, filename))
      .find((candidate) => existsSync(candidate));
    if (!file) continue;
    try {
      const cue = JSON.parse(readFileSync(file, "utf8"));
      const demo = cue.demo && typeof cue.demo === "object" ? cue.demo : cue;
      demos.push({ ...demo, name: demo.name ?? name });
    } catch (error) {
      throw new Error(`Could not read cue JSON ${file}: ${error.message}`);
    }
  }
  return { defaults: {}, demos: demos.length > 0 ? demos : null };
}

function chooseSource(inputDir, demo) {
  const candidate = demo.source ?? demo.file ?? demo.recording ?? demo.video;
  if (candidate) {
    const normalized = String(candidate).replace(/^assets\/raw\//, "");
    const candidates = path.isAbsolute(normalized)
      ? [normalized]
      : [path.resolve(inputDir, normalized), path.resolve(repoRoot, String(candidate))];
    const file = candidates.find((candidatePath) => existsSync(candidatePath));
    if (!file) throw new Error(`Recording not found: ${candidates.join(" or ")}`);
    return file;
  }

  const name = demo.name;
  for (const extension of acceptedExtensions) {
    const file = path.join(inputDir, `${name}${extension}`);
    if (existsSync(file)) return file;
  }
  throw new Error(`No recording found for "${name}" in ${inputDir}`);
}

function interval(value, fallback, label) {
  if (value === undefined || value === null) {
    if (!fallback) throw new Error(`${label} is required for a zoomed demo`);
    return [...fallback];
  }
  const start = Array.isArray(value) ? Number(value[0]) : Number(value.start);
  const end = Array.isArray(value) ? Number(value[1]) : Number(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`${label} cue must be [start, end] or { start, end }`);
  }
  return [start, end];
}

function numberValue(value, fallback, label) {
  const number = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number`);
  return number;
}

function inspectMedia(file, expectedDuration) {
  let probe;
  try {
    probe = JSON.parse(
      capture("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,duration,avg_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        file,
      ]),
    );
  } catch (error) {
    throw new Error(`ffprobe could not inspect ${file}: ${error.message}`);
  }

  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(probe.format?.duration ?? video?.duration);
  if (!video || !Number.isFinite(duration)) throw new Error(`No readable video stream in ${file}`);
  if (Math.abs(duration - expectedDuration) > 0.1) {
    throw new Error(`${path.basename(file)} is ${duration.toFixed(3)}s; expected ${expectedDuration}s ±0.1s`);
  }
  if (!video.width || !video.height) throw new Error(`Could not read video dimensions for ${file}`);
  return { width: Number(video.width), height: Number(video.height), duration };
}

function normalizeDemos(manifest, inputDir, selectedNames) {
  let demos = manifest.demos;
  if (!demos) demos = defaultNames.map((name) => ({ name, ...cueConfig.features[name] }));
  else {
    const listed = new Set(demos.map((demo) => demo.name ?? demo.kind ?? demo.id));
    for (const name of defaultNames) {
      const featureDefaults = cueConfig.features[name] || {};
      const hasRecording = acceptedExtensions.some((extension) => existsSync(path.join(inputDir, `${name}${extension}`)));
      if (!listed.has(name) && featureDefaults.duration !== undefined && hasRecording) {
        demos.push({ name, ...featureDefaults });
      }
    }
  }
  if (selectedNames) {
    const selected = new Set(selectedNames);
    demos = demos.filter((demo) => selected.has(demo.name ?? demo.kind ?? demo.id));
    const missing = [...selected].filter((name) => !demos.some((demo) => (demo.name ?? demo.kind ?? demo.id) === name));
    if (missing.length > 0) throw new Error(`No cue entries found for: ${missing.join(", ")}`);
  }
  if (demos.length === 0) throw new Error("No demos are configured");

  const seen = new Set();
  return demos.map((demo) => {
    const name = String(demo.name ?? demo.kind ?? demo.id ?? "");
    const featureDefaults = cueConfig.features[name] || {};
    const curatedCue = Object.fromEntries(
      Object.entries(featureDefaults).filter(([, value]) => value !== null && value !== undefined),
    );
    const curatedTiming = Object.fromEntries(
      ["zoomIn", "focusHold", "pullback", "restAt"]
        .filter((key) => curatedCue[key] !== undefined)
        .map((key) => [key, curatedCue[key]]),
    );
    demo = {
      ...demo,
      ...curatedCue,
      ...(Object.keys(curatedTiming).length > 0
        ? { cues: { ...(demo.cues || {}), ...curatedTiming } }
        : {}),
      name,
    };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`Invalid demo name "${name}"; use lowercase letters, digits, and hyphens`);
    }
    if (seen.has(name)) throw new Error(`Duplicate demo name "${name}"`);
    seen.add(name);

    const source = chooseSource(inputDir, { ...demo, name });
    const extension = path.extname(source).toLowerCase();
    if (!acceptedExtensions.includes(extension)) {
      throw new Error(`Unsupported recording type ${extension} for ${source}`);
    }
    const resolvedInput = realpathSync(inputDir);
    const resolvedSource = realpathSync(source);
    const relativeSource = path.relative(resolvedInput, resolvedSource);
    if (!relativeSource || relativeSource.startsWith(`..${path.sep}`) || path.isAbsolute(relativeSource)) {
      throw new Error(`Recording must be inside the input folder: ${source}`);
    }

    const demoCues = demo.cues && typeof demo.cues === "object" ? demo.cues : {};
    const duration = numberValue(demo.duration, manifest.defaults?.duration, `${name}.duration`);
    if (duration <= 0) throw new Error(`${name} duration must be greater than zero`);
    const zoom = numberValue(demo.zoom, numberValue(manifest.defaults?.zoom, 1, "defaults.zoom"), `${name}.zoom`);
    const zoomRange = cueConfig.defaults.zoomRange || [1, 1.24];
    if (zoom < zoomRange[0] || zoom > zoomRange[1]) {
      throw new Error(`${name} zoom must be between ${zoomRange[0]} and ${zoomRange[1]}`);
    }
    const focusCandidate = demo.focus ?? demo.anchor ?? demo.focusPoint;
    const focus = focusCandidate && typeof focusCandidate === "object" ? focusCandidate : {};
    const xValue = focus.x ?? demo.focusX;
    const yValue = focus.y ?? demo.focusY;
    if (zoom > 1 && (xValue === undefined || yValue === undefined)) {
      throw new Error(`${name} has no focus anchor; provide normalized x/y in the capture cue JSON`);
    }
    const focusX = numberValue(xValue, 0.5, `${name}.focus.x`);
    const focusY = numberValue(yValue, 0.5, `${name}.focus.y`);

    if (zoom > 1 && (focusX < 0 || focusX > 1 || focusY < 0 || focusY > 1)) {
      throw new Error(`${name} focus coordinates must be normalized to the 0..1 range`);
    }
    let zoomIn = [0, 0];
    let focusHold = null;
    let pullback = [duration, duration];
    let restAt = duration;
    if (zoom > 1) {
      zoomIn = interval(demoCues.zoomIn ?? demo.zoomIn, null, `${name}.zoomIn`);
      focusHold = interval(demoCues.focusHold ?? demo.focusHold, null, `${name}.focusHold`);
      pullback = interval(demoCues.pullback ?? demo.pullback, null, `${name}.pullback`);
      restAt = numberValue(demoCues.restAt ?? demo.restAt, pullback[1], `${name}.restAt`);
      if (zoomIn[0] < 0 || zoomIn[1] <= zoomIn[0] || zoomIn[1] > duration) {
        throw new Error(`${name} zoom-in cue must have positive duration within the ${duration}s demo`);
      }
      if (focusHold[0] < zoomIn[1] || focusHold[1] < focusHold[0] || focusHold[1] > pullback[0]) {
        throw new Error(`${name} focus hold must follow zoom-in and finish before pullback`);
      }
      if (pullback[0] < focusHold[1] || pullback[1] <= pullback[0] || pullback[1] > duration) {
        throw new Error(`${name} pullback must follow focus hold and finish within the ${duration}s demo`);
      }
      if (restAt < pullback[1] || restAt > duration) {
        throw new Error(`${name}.restAt must be between pullback end and demo end`);
      }
    }

    const media = inspectMedia(source, duration);
    return {
      name,
      source: `assets/raw/${relativeSource.split(path.sep).join("/")}`,
      duration,
      sourceWidth: media.width,
      sourceHeight: media.height,
      focusX,
      focusY,
      zoom,
      zoomInStart: zoomIn[0],
      zoomInEnd: zoomIn[1],
      pullbackStart: pullback[0],
      pullbackEnd: pullback[1],
      focusHold,
      sourcePath: source,
    };
  });
}

function ensureLink(linkPath, targetPath, kind) {
  mkdirSync(path.dirname(linkPath), { recursive: true });
  const target = realpathSync(targetPath);
  let info;
  try {
    info = lstatSync(linkPath);
  } catch {
    info = null;
  }
  if (info) {
    if (!info.isSymbolicLink()) {
      throw new Error(`${kind} path already exists and is not a symlink: ${linkPath}`);
    }
    try {
      if (realpathSync(linkPath) === target) return;
    } catch {
      // Replace a stale generated symlink when an explicit input folder changes.
    }
    unlinkSync(linkPath);
  }
  const relativeTarget = path.relative(path.dirname(linkPath), target);
  symlinkSync(relativeTarget, linkPath, "dir");
}

function ensureWallpaper(projectAssets) {
  mkdirSync(projectAssets, { recursive: true });
  const source = path.join(repoRoot, "src", "assets", "product", "renders", "tahoe-light.jpg");
  const target = path.join(projectAssets, "tahoe-light.jpg");
  const sourceReal = realpathSync(source);
  if (existsSync(target)) {
    if (realpathSync(target) !== sourceReal) {
      throw new Error(`Wallpaper path already exists and does not resolve to the source asset: ${target}`);
    }
    return;
  }
  symlinkSync(path.relative(projectAssets, sourceReal), target, "file");
}

function writeDurationComposition(name, duration) {
  const templateFile = path.join(projectDir, "index.html");
  const temporaryFile = path.join(projectDir, `.feature-demo-render-${name}.html`);
  const template = readFileSync(templateFile, "utf8");
  let replacements = 0;
  const composition = template.replace(/data-duration="[0-9]+(?:\.[0-9]+)?"/g, () => {
    replacements += 1;
    return `data-duration="${duration}"`;
  });
  if (replacements !== 3) {
    throw new Error(`Expected 3 static clip durations in ${templateFile}; found ${replacements}`);
  }
  writeFileSync(temporaryFile, composition);
  temporaryCompositions.add(temporaryFile);
  return temporaryFile;
}

function renderDemo(demo, options, output, env) {
  mkdirSync(path.dirname(output), { recursive: true });
  const composition = writeDurationComposition(demo.name, demo.duration);
  const variables = {
    name: demo.name,
    source: demo.source,
    duration: demo.duration,
    sourceWidth: demo.sourceWidth,
    sourceHeight: demo.sourceHeight,
    focusX: demo.focusX,
    focusY: demo.focusY,
    zoom: demo.zoom,
    zoomInStart: demo.zoomInStart,
    zoomInEnd: demo.zoomInEnd,
    pullbackStart: demo.pullbackStart,
    pullbackEnd: demo.pullbackEnd,
  };

  try {
    run(
      "npx",
      [
        "--yes",
        "hyperframes@0.8.193",
        "render",
        "--composition",
        path.basename(composition),
        "--output",
        output,
        "--fps",
        String(options.fps),
        "--quality",
        options.quality,
        "--video-frame-format",
        "png",
        "--strict-variables",
        "--variables",
        JSON.stringify(variables),
        "--strict",
      ],
      { cwd: projectDir, env },
    );
  } finally {
    try {
      unlinkSync(composition);
    } finally {
      temporaryCompositions.delete(composition);
    }
  }
}

function ffprobeOutput(file) {
  return JSON.parse(
    capture("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames",
      "-show_entries",
      "format=duration,start_time",
      "-of",
      "json",
      file,
    ]),
  );
}

function hasFastStart(file) {
  const fd = openSync(file, "r");
  const buffer = Buffer.alloc(4 * 1024 * 1024);
  try {
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    let offset = 0;
    while (offset + 8 <= bytes) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > bytes) return false;
        size = Number(buffer.readBigUInt64BE(offset + 8));
        headerSize = 16;
      } else if (size === 0) {
        size = bytes - offset;
      }
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (size < headerSize) return false;
      offset += size;
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

function verifyMp4(file, fps, expectedDuration) {
  if (!existsSync(file) || lstatSync(file).size === 0) throw new Error(`Render output is missing or empty: ${file}`);
  const probe = ffprobeOutput(file);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.some((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);
  if (!video || video.codec_name !== "h264") throw new Error(`${file} is not H.264 video`);
  if (audio) throw new Error(`${file} unexpectedly contains an audio stream`);
  if (video.width !== 1600 || video.height !== 1000) {
    throw new Error(`${file} is ${video.width}×${video.height}; expected 1600×1000`);
  }
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.1) {
    throw new Error(`${file} duration is ${duration}; expected ${expectedDuration}s ±0.1s`);
  }
  if (!String(video.avg_frame_rate).startsWith(`${fps}/`)) {
    const [numerator, denominator] = String(video.avg_frame_rate).split("/").map(Number);
    if (!Number.isFinite(numerator / denominator) || Math.abs(numerator / denominator - fps) > 0.01) {
      throw new Error(`${file} frame rate is ${video.avg_frame_rate}; expected ${fps} fps`);
    }
  }
  if (!hasFastStart(file)) throw new Error(`${file} does not place its MP4 index before the media data (faststart)`);
}

function verifyImage(file, codec, width, height) {
  if (!existsSync(file) || lstatSync(file).size === 0) throw new Error(`Image output is missing or empty: ${file}`);
  const stream = ffprobeOutput(file).streams?.find((item) => item.codec_type === "video");
  if (!stream || stream.codec_name !== codec || stream.width !== width || stream.height !== height) {
    throw new Error(`${file} is not a ${width}×${height} ${codec} image`);
  }
}

function verifyGif(file, expectedDuration) {
  if (!existsSync(file) || lstatSync(file).size === 0) throw new Error(`GIF output is missing or empty: ${file}`);
  const probe = ffprobeOutput(file);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(probe.format?.duration);
  if (!video || video.codec_name !== "gif" || video.width !== 960 || video.height !== 600) {
    throw new Error(`${file} is not a 960×600 GIF`);
  }
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.2) {
    throw new Error(`${file} duration is ${duration}; expected ${expectedDuration}s`);
  }
  if (!readFileSync(file).includes(Buffer.from("NETSCAPE2.0"))) {
    throw new Error(`${file} is missing the infinite-loop GIF extension`);
  }
}

function makePoster(videoFile, posterFile, env) {
  mkdirSync(path.dirname(posterFile), { recursive: true });
  run(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoFile,
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "92",
      posterFile,
    ],
    { env },
  );
}

function makeGif(videoFile, gifFile, env) {
  mkdirSync(path.dirname(gifFile), { recursive: true });
  const filter =
    "[0:v]fps=15,scale=960:600:flags=lanczos,split[s0][s1];" +
    "[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a";
  run(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoFile,
      "-filter_complex",
      filter,
      "-loop",
      "0",
      gifFile,
    ],
    { env },
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = commandEnvironment();
  const inputDir = options.inputDir;
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    throw new Error(`Video input folder not found: ${inputDir}`);
  }

  const manifestFile = resolveManifestPath(inputDir, options.manifest);
  const manifest = manifestFile ? readManifest(manifestFile) : readSidecarCues(inputDir);
  console.log(`Using prepared videos from ${path.relative(repoRoot, inputDir) || "."}`);
  if (manifestFile) console.log(`Using cues from ${path.relative(inputDir, manifestFile) || path.basename(manifestFile)}`);
  else if (manifest.demos) console.log("Using per-kind cue JSON files from the input folder.");
  else console.log("No cue JSON found; using the tracked per-feature cue configuration.");

  const demos = normalizeDemos(manifest, inputDir, options.only);
  const projectAssets = path.join(projectDir, "assets");
  const rawLink = path.join(projectAssets, "raw");
  ensureLink(rawLink, inputDir, "Raw recording folder");
  ensureWallpaper(projectAssets);

  for (const demo of demos) {
    const output = path.join(options.outputDir, `${demo.name}.mp4`);
    renderDemo(demo, options, output, env);
    verifyMp4(output, options.fps, demo.duration);
    const poster = path.join(options.posterDir, `${demo.name}-poster.webp`);
    makePoster(output, poster, env);
    verifyImage(poster, "webp", 1600, 1000);
    if (options.makeGifs) {
      const gif = path.join(options.gifDir, `${demo.name}.gif`);
      makeGif(output, gif, env);
      verifyGif(gif, demo.duration);
    }
  }

  console.log(`Verified ${demos.length} silent ${options.fps}fps H.264 MP4${demos.length === 1 ? "" : "s"} at 1600×1000.`);
}

try {
  main();
} catch (error) {
  console.error(`render-feature-demos: ${error.message}`);
  process.exitCode = 1;
}
