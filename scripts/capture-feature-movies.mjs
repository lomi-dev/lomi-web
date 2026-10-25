#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rename,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteRoot = resolve(scriptDirectory, "..");
const desktopSource = resolve(websiteRoot, "../lomi");
const helperDirectory = join(scriptDirectory, "feature-movies-capture");
const rawDirectory = resolve(
  process.env.LOMI_FEATURE_MOVIES_OUTPUT_DIR ??
    join(websiteRoot, "artifacts/feature-demos/raw"),
);
const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const identifier =
  process.env.LOMI_FEATURE_MOVIES_IDENTIFIER ??
  `dev.lomi.desktop-smoke-feature-movies-${runId}`;
const workspaceFixtureId = "7a468d3e-1b40-4c19-94cb-3a5ce82f56f0";
const node22Directory = "/opt/homebrew/opt/node@22/bin";
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/(API.?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|GITHUB|AWS|AZURE|OPENAI|ANTHROPIC|GOOGLE|GROK|CODEX|SLACK)/i.test(
          name,
        ),
    ),
  ),
  PATH: `${node22Directory}:${process.env.PATH ?? ""}`,
};
let browserServer;
let activeNativeApp;
let activeRecorder;
let activeCursorControl;

const sleep = (duration) => new Promise((resolveSleep) => setTimeout(resolveSleep, duration));

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`,
    );
  return result.stdout;
}

function runLong(command, args, options = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.once("error", rejectProcess);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function replaceOnce(path, before, after) {
  let contents = await readFile(path, "utf8");
  if (contents.includes(after)) return;
  assert(contents.includes(before), `Could not find expected source in ${path}`);
  contents = contents.replace(before, after);
  await writeFile(path, contents);
}

async function prepareIsolatedSource(runDirectory) {
  const provided = process.env.LOMI_FEATURE_MOVIES_SOURCE_DIR;
  const sourceDirectory = provided
    ? resolve(provided)
    : join(runDirectory, "lomi-source");
  assert.notEqual(sourceDirectory, desktopSource, "Refusing to edit the original Lomi source.");
  if (!provided) {
    await mkdir(sourceDirectory, { recursive: true });
    await runLong(
      "rsync",
      [
        "-a",
        "--delete",
        "--exclude=.git/",
        "--exclude=node_modules/",
        "--exclude=src-tauri/target/",
        `${desktopSource}/`,
        `${sourceDirectory}/`,
      ],
      { env: environment },
    );
    await runLong(
      "cp",
      ["-cR", join(desktopSource, "node_modules"), join(sourceDirectory, "node_modules")],
      { env: environment },
    );
    await runLong(
      "cp",
      ["-cR", join(desktopSource, "src-tauri/target"), join(sourceDirectory, "src-tauri/target")],
      { env: environment },
    );
  }

  await copyFile(
    join(helperDirectory, "feature-movies-support.rs"),
    join(sourceDirectory, "tests/native/feature-movies-support.rs"),
  );
  await copyFile(
    join(helperDirectory, "feature-movie-test.ts.template"),
    join(sourceDirectory, "src/feature-movie-test.ts"),
  );

  const supportPath = join(sourceDirectory, "tests/native/support.rs");
  const supportSource = await readFile(supportPath, "utf8");
  if (!supportSource.includes("mod feature_movie_capture;")) {
  await replaceOnce(
    supportPath,
    "use tauri::{Manager, Window};\n",
    'use tauri::{Manager, Window};\n#[path = "feature-movies-support.rs"]\nmod feature_movie_capture;\n',
  );
  await replaceOnce(
    supportPath,
    "pub fn page(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<'_>) {\n",
    'pub fn page(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<\'_>) {\n    if std::env::var_os("LOMI_FEATURE_MOVIES_DIRECTORY").is_some() {\n        feature_movie_capture::page(webview, payload);\n        return;\n    }\n',
  );
  await replaceOnce(
    supportPath,
    '    if window.label() != "main" {\n        return Err("Unknown test caller.".into());\n    }\n',
    '    if window.label() != "main" {\n        return Err("Unknown test caller.".into());\n    }\n    if std::env::var_os("LOMI_FEATURE_MOVIES_DIRECTORY").is_some() {\n        return feature_movie_capture::result(&app, &stage, data);\n    }\n',
  );
  }

  const appLibraryPath = join(sourceDirectory, "src-tauri/src/lib.rs");
  const appLibrarySource = await readFile(appLibraryPath, "utf8");
  const chatProbePageCall = "            chat_probe::page(_view, _payload);\n";
  if (
    appLibrarySource.includes(chatProbePageCall) &&
    !appLibrarySource.includes("if std::env::var_os(\"LOMI_FEATURE_MOVIES_DIRECTORY\").is_none()")
  ) {
    await replaceOnce(
      appLibraryPath,
      chatProbePageCall,
      "            if std::env::var_os(\"LOMI_FEATURE_MOVIES_DIRECTORY\").is_none() {\n                chat_probe::page(_view, _payload);\n            }\n",
    );
  }

  const mainPath = join(sourceDirectory, "src/main.tsx");
  const dynamicFeatureHook =
    'window.addEventListener("lomi-feature-movie-enable", (event) => {\n' +
    '  void import("./feature-movie-test").then(({ installFeatureMovie }) => {\n' +
    '    installFeatureMovie((event as CustomEvent).detail);\n' +
    "  });\n});\n";
  const staticFeatureHook =
    'import { installFeatureMovie } from "./feature-movie-test";\n\n' +
    'window.addEventListener("lomi-feature-movie-enable", (event) => {\n' +
    "  try {\n" +
    '    installFeatureMovie((event as CustomEvent).detail);\n' +
    "  } catch (error) {\n" +
    "    void (window as any).__TAURI_INTERNALS__.invoke(\"plugin_smoke_result\", {\n" +
    '      stage: "feature-movie-progress",\n' +
    '      data: { error: `Feature helper initialization failed: ${String(error)}` },\n' +
    "    });\n" +
    "  }\n});\n";
  const oldStaticFeatureHook =
    'import { installFeatureMovie } from "./feature-movie-test";\n\n' +
    'window.addEventListener("lomi-feature-movie-enable", (event) => {\n' +
    '  installFeatureMovie((event as CustomEvent).detail);\n});\n';
  const mainSource = await readFile(mainPath, "utf8");
  if (mainSource.includes(dynamicFeatureHook)) {
    await replaceOnce(mainPath, dynamicFeatureHook, staticFeatureHook);
  } else if (mainSource.includes(oldStaticFeatureHook)) {
    await replaceOnce(mainPath, oldStaticFeatureHook, staticFeatureHook);
  } else if (!mainSource.includes('import { installFeatureMovie } from "./feature-movie-test";')) {
    await replaceOnce(
      mainPath,
      'import "./dialog-ui.css";\n',
      `import "./dialog-ui.css";\n\n${staticFeatureHook}`,
    );
  }

  const workbenchPath = join(sourceDirectory, "src/Workbench.tsx");
  const workbenchSource = await readFile(workbenchPath, "utf8");
  if (!workbenchSource.includes("featureMoviePath")) {
    await replaceOnce(
      workbenchPath,
      "      const path = await open({\n",
      "      const featureMoviePath = (window as any).__lomiFeatureMovie?.dialogPath?.(intent);\n" +
        "      const path = featureMoviePath ?? await open({\n",
    );
  }

  const fixtureSourcePath = join(sourceDirectory, "packages/ai-runtime/src/fixture.ts");
  let fixtureSource = await readFile(fixtureSourcePath, "utf8");
  if (!fixtureSource.includes('input.model === "feature-demo"')) {
    const originalCount =
      '            const count =\n              input.model === "fixture-fast"\n                ? 10000\n                : input.model === "fixture-large"\n                  ? 1000\n                  : 40;';
    const demoCount =
      '            const demoWords = [\n' +
      '              "The", "next", "step", "is", "to", "keep", "the", "change",\n' +
      '              "focused,", "run", "local", "checks,", "then", "review",\n' +
      '              "the", "diff", "before", "merging.",\n' +
      '            ] as const;\n' +
      '            const count =\n' +
      '              input.model === "feature-demo"\n' +
      '                ? demoWords.length\n' +
      '                : input.model === "fixture-fast"\n' +
      '                  ? 10000\n' +
      '                  : input.model === "fixture-large"\n' +
      '                    ? 1000\n' +
      '                    : 40;';
    const originalDelta =
      '                delta:\n' +
      '                  input.model === "fixture-large"\n                    ? "x".repeat(32768)\n                    : "Zażółć 日本語 👩🏽‍💻\\n",';
    const demoDelta =
      '                delta:\n' +
      '                  input.model === "feature-demo"\n' +
      '                    ? demoWords[i] + (i === 7 ? "\\n" : " ")\n' +
      '                    : input.model === "fixture-large"\n' +
      '                      ? "x".repeat(32768)\n' +
      '                      : "Zażółć 日本語 👩🏽‍💻\\n",';
    const originalDelay =
      'setTimeout(resolve, input.model === "fixture-fast" ? 0 : 10)';
    const demoDelay =
      'setTimeout(resolve, input.model === "fixture-fast" ? 0 : input.model === "feature-demo" ? 70 : 10)';
    assert(fixtureSource.includes(originalCount), "The isolated Chat fixture count source changed.");
    assert(fixtureSource.includes(originalDelta), "The isolated Chat fixture response source changed.");
    assert(fixtureSource.includes(originalDelay), "The isolated Chat fixture pacing source changed.");
    fixtureSource = fixtureSource
      .replace(originalCount, demoCount)
      .replace(originalDelta, demoDelta)
      .replace(originalDelay, demoDelay);
    await writeFile(fixtureSourcePath, fixtureSource);
  }
  return sourceDirectory;
}

async function createProject(root, scene) {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "tests"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "release-workspace",
        version: "0.1.0",
        private: true,
        scripts: { check: "node --test tests/*.test.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "README.md"),
    "# Release workspace\n\nA local fixture for reviewing workspace changes.\n",
  );
  await writeFile(
    join(root, "src/useWorkspaceFilter.ts"),
    `export type Task = { id: string; title: string; status: "open" | "done" };\n\nexport function filterTasks(tasks: Task[], query: string) {\n  const normalized = query.trim().toLocaleLowerCase();\n  return tasks.filter((task) =>\n    !normalized || task.title.toLocaleLowerCase().includes(normalized),\n  );\n}\n`,
  );
  await writeFile(
    join(root, "tests/workspace.test.mjs"),
    `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";\nimport { setTimeout as wait } from "node:timers/promises";\n\nconst source = await readFile(new URL("../src/useWorkspaceFilter.ts", import.meta.url), "utf8");\n\ntest("project metadata is ready", async () => {\n  await wait(260);\n  const packageData = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));\n  assert.equal(packageData.name, "release-workspace");\n});\n\ntest("task filter is typed", async () => {\n  await wait(320);\n  assert.match(source, /export type Task/);\n  assert.match(source, /export function filterTasks/);\n});\n\ntest("workspace filter normalizes search text", async () => {\n  await wait(320);\n  assert.match(source, /toLocaleLowerCase/);\n});\n\ntest("fixture contains the TypeScript source", async () => {\n  await wait(320);\n  assert.match(source, /title: string/);\n});\n`,
  );

  if (scene === "git") {
    runSync("git", ["init", "-b", "main", root]);
    for (const [key, value] of [
      ["user.name", "Avery Chen"],
      ["user.email", "avery@example.test"],
      ["commit.gpgsign", "false"],
      ["core.hooksPath", join(root, "disabled-hooks")],
    ])
      runSync("git", ["-C", root, "config", "--local", key, value]);
    runSync("git", ["-C", root, "add", "--all"]);
    runSync("git", ["-C", root, "commit", "-m", "Start release workspace demo"]);
    await writeFile(
      join(root, "src/useWorkspaceFilter.ts"),
      `export type Task = { id: string; title: string; status: "open" | "done" };\n\nexport function filterTasks(tasks: Task[], query: string, status: Task["status"] | "all") {\n  const normalized = query.trim().toLocaleLowerCase();\n\n  return tasks\n    .filter((task) =>\n      (!normalized || task.title.toLocaleLowerCase().includes(normalized)) &&\n      (status === "all" || task.status === status),\n    )\n    .sort((a, b) => a.title.localeCompare(b.title));\n}\n`,
    );
  }
}

function makeTerminalTab(root) {
  return {
    type: "terminal",
    id: "feature-movie-terminal-tab",
    title: "Terminal",
    profileId: "local:zsh",
    activePaneId: "feature-movie-terminal-pane",
    layout: {
      type: "terminal",
      id: "feature-movie-terminal-pane",
      cwd: root,
    },
  };
}

function makeSession(root, scene) {
  const terminal = makeTerminalTab(root);
  const file = {
    type: "file",
    id: "feature-movie-file",
    title: "useWorkspaceFilter.ts",
    root,
    relative: "src/useWorkspaceFilter.ts",
  };
  const tabs = scene === "code" ? [terminal, file] : [terminal];
  const workspaceId = workspaceFixtureId;
  return {
    version: 5,
    activeProjectId: "feature-movie-project",
    projects: [
      {
        id: "feature-movie-project",
        path: root,
        activeWorkspaceId: workspaceId,
        workspaces: [
          {
            id: workspaceId,
            name: "Feature Preview",
            activeTabId: terminal.id,
            tabs,
          },
        ],
      },
    ],
    sidebar: scene === "panels" ? "workspaces" : scene === "git" ? "git" : "files",
    sidebarWidth: 260,
    rightSidebar: null,
    rightSidebarWidth: 260,
    sidebarSides: { files: "left", git: "left", workspaces: "left" },
    terminalOverviewSide: "left",
  };
}

async function startBrowserFixture() {
  const html = await readFile(join(helperDirectory, "browser-demo.html"), "utf8");
  const requests = [];
  const server = await new Promise((resolveServer, rejectServer) => {
    const server = createServer((request, response) => {
      requests.push({ method: request.method, path: request.url });
      if (request.url === "/dashboard") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(html);
      } else {
        response.writeHead(404);
        response.end("Not found");
      }
    });
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
  const address = server.address();
  browserServer = server;
  assert(address && typeof address === "object");
  return { server, requests, url: `http://127.0.0.1:${address.port}/dashboard` };
}

function spawnApp(binary, sceneDirectory, appData, root) {
  const appEnvironment = {
    ...environment,
    GIT_CONFIG_GLOBAL: join(sceneDirectory, "absent-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ZDOTDIR: join(sceneDirectory, "empty-zdotdir"),
    LOMI_CHAT_PROBE_DIRECTORY: sceneDirectory,
    LOMI_CHAT_PROBE_OFFLINE: "1",
    LOMI_FEATURE_MOVIES_DIRECTORY: sceneDirectory,
    LOMI_FEATURE_MOVIES_IDENTIFIER: identifier,
    LOMI_FEATURE_MOVIES_APP_DATA: appData,
  };
  const child = spawn(binary, [], {
    cwd: root,
    env: appEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logParts = [];
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => logParts.push(data));
  return { child, logParts };
}

function queryWindow(infoBinary, pid) {
  try {
    const result = runSync(infoBinary, [String(pid)]);
    const windows = JSON.parse(result);
    return windows.find((window) => window.title === "Lomi") ?? windows[0];
  } catch {
    return undefined;
  }
}

async function waitForWindow(infoBinary, child, logParts) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `The native app exited before showing its window.\n${Buffer.concat(logParts).toString("utf8")}`,
      );
    const window = queryWindow(infoBinary, child.pid);
    if (window) return window;
    await sleep(250);
  }
  throw new Error(`The native app window did not appear for pid ${child.pid}.`);
}

async function waitForNativeReady(sceneDirectory, child, logParts) {
  const readyPath = join(sceneDirectory, "ready.json");
  const progressPath = join(sceneDirectory, "progress.json");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `The native app closed before its workbench rendered.\n${Buffer.concat(logParts).toString("utf8")}`,
      );
    const progress = await readJson(progressPath).catch(() => null);
    if (progress?.error)
      throw new Error(`Feature helper failed before recording: ${progress.error}`);
    try {
      await access(readyPath);
      return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`The native workbench did not render for pid ${child.pid}.`);
}

async function waitForExit(child, timeout = 3000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    once(child, "exit"),
    sleep(timeout).then(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    }),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    await Promise.race([once(child, "exit"), sleep(1000)]);
}

function waitForProcess(child, timeout = 15_000) {
  return Promise.race([
    once(child, "exit").then(([code, signal]) => ({ code, signal })),
    sleep(timeout).then(() => {
      child.kill("SIGTERM");
      throw new Error("The native window recording did not finish.");
    }),
  ]);
}

async function restoreCursor() {
  const child = activeCursorControl;
  if (!child) return;
  activeCursorControl = undefined;
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin.end("restore\n");
    await Promise.race([once(child, "exit"), sleep(1000)]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  }
}

async function hideCursor(infoBinary) {
  const child = spawn(infoBinary, ["--hide-cursor"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeCursorControl = child;
  const [data] = await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(([code, signal]) => {
      throw new Error(`Cursor helper exited: ${code ?? signal}`);
    }),
  ]);
  if (!data.toString("utf8").includes("cursor-hidden"))
    throw new Error("Cursor helper did not confirm hidden state.");
  return true;
}

async function transcode(moviePath, outputPath, cleanWindowPath) {
  runSync(
    "/opt/homebrew/bin/ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      moviePath,
      "-loop",
      "1",
      "-i",
      cleanWindowPath,
      "-filter_complex",
      "[0:v]scale=1440:900:force_original_aspect_ratio=increase:flags=lanczos,crop=1440:900[video];[1:v]scale=1440:900:force_original_aspect_ratio=increase:flags=lanczos,crop=1440:900,crop=88:44:0:0[controls];[video][controls]overlay=0:0:shortest=1:format=auto",
      "-r",
      "30",
      "-t",
      "10",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "17",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
  );
  const data = runSync(
    "/opt/homebrew/bin/ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,codec_name:format=duration",
      "-of",
      "json",
      outputPath,
    ],
  );
  const info = JSON.parse(data);
  const stream = info.streams?.[0];
  assert.equal(stream?.width, 1440);
  assert.equal(stream?.height, 900);
  assert.equal(stream?.avg_frame_rate, "30/1");
  assert(Math.abs(Number(info.format.duration) - 10) <= 0.15);
  return {
    width: stream.width,
    height: stream.height,
    frameRate: stream.avg_frame_rate,
    codec: stream.codec_name,
    duration: Number(info.format.duration),
  };
}

const scenes = [
  ["terminal", "streamed-output"],
  ["panels", "split-stacked"],
  ["code", "saved-document"],
  ["expand", "browser-page"],
  ["git", "commit-change"],
  ["spark", "chat-response"],
];
const requestedScenes = process.env.LOMI_FEATURE_MOVIES_SCENES
  ?.split(",")
  .map((scene) => scene.trim())
  .filter(Boolean);
const selectedScenes = requestedScenes
  ? scenes.filter(([scene]) => requestedScenes.includes(scene))
  : scenes;
if (requestedScenes) {
  assert.equal(
    requestedScenes.length,
    new Set(requestedScenes).size,
    "Duplicate scene in LOMI_FEATURE_MOVIES_SCENES.",
  );
  assert.equal(
    selectedScenes.length,
    requestedScenes.length,
    "Unknown scene in LOMI_FEATURE_MOVIES_SCENES.",
  );
  assert(selectedScenes.length > 0, "Select at least one feature movie scene.");
}

async function main() {
  const existingRaw = await readdir(rawDirectory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.equal(existingRaw.length, 0, `Refusing to replace existing raw assets in ${rawDirectory}`);
  await mkdir(rawDirectory, { recursive: true });

  const runDirectory = await mkdtemp(join(tmpdir(), `lomi-feature-movies-${runId}-`));
  const appData = join(homedir(), "Library/Application Support", identifier);
  const profileMarker = join(appData, ".lomi-feature-movies-profile");
  let profileExists = true;
  try {
    await access(appData);
  } catch (error) {
    if (error.code === "ENOENT") profileExists = false;
    else throw error;
  }
  if (profileExists) {
    const marker = await readFile(profileMarker, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    assert.equal(marker, `${identifier}\n`, `Refusing to replace an unmarked app profile: ${appData}`);
    await rm(appData, { recursive: true, force: true });
  }
  await mkdir(appData, { recursive: true });
  await writeFile(profileMarker, `${identifier}\n`);
  const sourceDirectory = await prepareIsolatedSource(runDirectory);
  const configPath = join(runDirectory, "tauri.capture.conf.json");
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        identifier,
        build: {
          beforeBuildCommand:
            "pnpm icon:macos && node scripts/prepare-ai-runtime.mjs --fixture && pnpm build",
        },
      },
      null,
      2,
    )}\n`,
  );
  const nodePath = `${node22Directory}/node`;
  runSync(nodePath, ["--version"], { env: environment });
  runSync("/usr/bin/swiftc", [
    join(helperDirectory, "window-info.swift"),
    "-o",
    join(runDirectory, "window-info"),
  ]);
  console.log(`Isolated source: ${sourceDirectory}`);
  console.log(`Native app identity: ${identifier}`);
  const binary = join(sourceDirectory, "src-tauri/target/debug/lomi");
  if (process.env.LOMI_FEATURE_MOVIES_SKIP_BUILD === "1") {
    assert(
      process.env.LOMI_FEATURE_MOVIES_IDENTIFIER,
      "LOMI_FEATURE_MOVIES_IDENTIFIER is required when reusing a native binary.",
    );
    await access(binary);
    console.log("Reusing the isolated native binary.");
  } else {
    console.log("Building current native UI with isolated capture hooks…");
    await runLong(
      "/opt/homebrew/bin/pnpm",
      [
        "tauri",
        "build",
        "--debug",
        "--no-bundle",
        "--features",
        "native-smoke,chat-probe,tauri/custom-protocol",
        "--config",
        configPath,
        "--",
        "--locked",
      ],
      { cwd: sourceDirectory, env: environment },
    );
  }
  await access(binary);

  const infoBinary = join(runDirectory, "window-info");
  const browser = await startBrowserFixture();
  const appDataAgentPreferences = join(appData, "agent-control-preferences.json");
  await writeJson(appDataAgentPreferences, {
    version: 1,
    autoStart: false,
    yoloMode: false,
  });
  const sceneResults = [];
  let nativeProof;

  for (const [scene, focusCueName] of selectedScenes) {
    console.log(`Recording ${scene}…`);
    const sceneDirectory = join(runDirectory, `scene-${scene}`);
    const projectRoot = join(runDirectory, "projects", scene, "release-workspace");
    await mkdir(sceneDirectory, { recursive: true });
    await mkdir(join(sceneDirectory, "empty-zdotdir"), { recursive: true });
    await writeFile(
      join(sceneDirectory, "empty-zdotdir/.zshrc"),
      "PROMPT='release-workspace › '\n",
    );
    await copyFile(
      join(helperDirectory, "feature-movies.js"),
      join(sceneDirectory, "feature-movies.js"),
    );
    await createProject(projectRoot, scene);
    const session = makeSession(projectRoot, scene);
    await writeJson(join(appData, "session.json"), session);
    await writeJson(join(sceneDirectory, "control.json"), {
      started: false,
      scene,
      root: projectRoot,
      workspaceId: workspaceFixtureId,
      dialogPath: scene === "panels" ? projectRoot : undefined,
      browserUrl: scene === "expand" ? browser.url : undefined,
      chatFixture: scene === "spark",
    });
    await writeJson(join(sceneDirectory, "progress.json"), { scene, started: false });

    const { child, logParts } = spawnApp(
      binary,
      sceneDirectory,
      appData,
      projectRoot,
    );
    activeNativeApp = child;
    const windowInfo = await waitForWindow(infoBinary, child, logParts);
    await waitForNativeReady(sceneDirectory, child, logParts);
    const windowId = windowInfo.windowId;
    const sceneWindowStill = join(rawDirectory, `${scene}-window.png`);
    runSync("/usr/sbin/screencapture", ["-x", "-o", `-l${windowId}`, sceneWindowStill]);
    if (!nativeProof) {
      const proofPath = join(rawDirectory, "native-window-proof.png");
      await copyFile(sceneWindowStill, proofPath);
      nativeProof = {
        appIdentifier: identifier,
        pid: child.pid,
        windowId,
        window: windowInfo,
        screenshot: "native-window-proof.png",
      };
    }

    const nativeMovie = join(rawDirectory, `${scene}.mov`);
    let cursorHidden = false;
    try {
      cursorHidden = await hideCursor(infoBinary);
    } catch (error) {
      await restoreCursor();
      console.warn(`Could not hide the cursor for ${scene}: ${error.message}`);
    }
    const recorder = spawn(
      "/usr/sbin/screencapture",
      ["-v", "-V10", `-l${windowId}`, "-o", nativeMovie],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    activeRecorder = recorder;
    let recorderLog = "";
    for (const stream of [recorder.stdout, recorder.stderr])
      stream.on("data", (data) => (recorderLog += data.toString("utf8")));
    await sleep(120);
    await writeJson(join(sceneDirectory, "control.json"), {
      started: true,
      scene,
      root: projectRoot,
      workspaceId: workspaceFixtureId,
      dialogPath: scene === "panels" ? projectRoot : undefined,
      browserUrl: scene === "expand" ? browser.url : undefined,
      chatFixture: scene === "spark",
    });
    let recordExit;
    try {
      recordExit = await waitForProcess(recorder);
    } finally {
      activeRecorder = undefined;
      await restoreCursor();
    }
    if (recordExit.code !== 0)
      throw new Error(`Window capture failed for ${scene}: ${recorderLog}`);
    await waitForExit(child, 3500);
    activeNativeApp = undefined;
    if (child.exitCode === null && child.signalCode === null)
      throw new Error(`Native app did not exit cleanly after ${scene}.`);

    const progress = await readJson(join(sceneDirectory, "progress.json"));
    await writeJson(join(rawDirectory, `${scene}.progress.json`), progress);
    if (progress.error)
      throw new Error(`${scene} scene failed: ${progress.error}\n${progress.stack ?? ""}`);
    assert(progress.complete, `${scene} scene did not complete its UI actions.`);
    const mp4Path = join(rawDirectory, `${scene}.mp4`);
    const video = await transcode(nativeMovie, mp4Path, sceneWindowStill);
    sceneResults.push({ scene, focusCueName, progress, video, window: windowInfo, windowStill: `${scene}-window.png`, cursorHidden });
    const demos = sceneResults.map(({ scene: name, focusCueName: cueName, progress: result }) => {
      const cue = result.cues.find((item) => item.name === cueName);
      assert(cue, `Missing normalized focus cue ${cueName} for ${name}.`);
      return {
        name,
        source: `${name}.mp4`,
        focus: cue.focus,
        zoom: 1.5,
        zoomIn: [2.5, 3.1],
        focusHold: [3.1, 6.8],
        pullback: [7.4, 8.3],
        restAt: 8.3,
      };
    });
    await writeJson(join(rawDirectory, "feature-demos.json"), { demos });
    await writeJson(join(rawDirectory, "feature-demos-cues.json"), {
      nativeWindow: nativeProof,
      scenes: sceneResults.map(({ scene: name, focusCueName: cueName, progress: result, video: details, window, windowStill, cursorHidden }) => ({
        name,
        focusCue: cueName,
        cues: result.cues,
        video: details,
        nativeWindow: window,
        nativeWindowStill: windowStill,
        cursorHidden,
      })),
    });

    if (scene === "code") {
      const saved = await readFile(join(projectRoot, "src/useWorkspaceFilter.ts"), "utf8");
      assert.match(saved, /status === "all"/);
      assert.match(saved, /localeCompare/);
    }
    if (scene === "git") {
      const status = runSync("git", ["-C", projectRoot, "status", "--porcelain"]);
      const subject = runSync("git", ["-C", projectRoot, "log", "-1", "--format=%s"]).trim();
      assert.equal(status.trim(), "");
      assert.equal(subject, "refine workspace task filtering");
    }
    if (scene === "expand")
      assert(browser.requests.some((request) => request.path === "/dashboard"));
    if (scene === "spark") {
      const chatProfile = await readJson(join(appData, "chat-ai-preferences.json")).catch(() => null);
      if (chatProfile) assert(chatProfile.connections?.some((connection) => connection.id === "native-fixture"));
    }
    console.log(`Saved ${scene}.mp4 (${video.duration.toFixed(2)} s, ${video.frameRate} fps).`);
  }

  await new Promise((resolveClose, rejectClose) =>
    browser.server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  browserServer = undefined;
  const demos = sceneResults.map(({ scene, focusCueName, progress }) => {
    const cue = progress.cues.find((item) => item.name === focusCueName);
    assert(cue, `Missing normalized focus cue ${focusCueName} for ${scene}.`);
    return {
      name: scene,
      source: `${scene}.mp4`,
      focus: cue.focus,
      zoom: 1.5,
      zoomIn: [2.5, 3.1],
      focusHold: [3.1, 6.8],
      pullback: [7.4, 8.3],
      restAt: 8.3,
    };
  });
  await writeJson(join(rawDirectory, "feature-demos.json"), { demos });
  await writeJson(
    join(rawDirectory, "feature-demos-cues.json"),
    {
      nativeWindow: nativeProof,
      scenes: sceneResults.map(({ scene, focusCueName, progress, video, window, windowStill, cursorHidden }) => ({
        name: scene,
        focusCue: focusCueName,
        cues: progress.cues,
        video,
        nativeWindow: window,
        nativeWindowStill: windowStill,
        cursorHidden,
      })),
    },
  );
  await writeJson(join(rawDirectory, "capture-proof.json"), {
    nativeWindow: nativeProof,
    appIdentifier: identifier,
    sceneCount: sceneResults.length,
    sceneNames: sceneResults.map(({ scene }) => scene),
    browserRequests: browser.requests,
    chatProvider: "isolated chat-probe fixture; no live provider request",
    captureMode: "screencapture -l native window; no desktop recording",
    controls: "top-left 88x44 logical pixels restored from each same-window native still",
    cursorHidden: sceneResults.every(({ cursorHidden }) => cursorHidden),
    output: "native MOVs retained; H.264 MP4s at 1440x900 and 30 fps",
  });
  console.log(`Native feature movies are ready in ${rawDirectory}`);
}

main().catch(async (error) => {
  if (activeRecorder && activeRecorder.exitCode === null) activeRecorder.kill("SIGTERM");
  if (activeNativeApp && activeNativeApp.exitCode === null) activeNativeApp.kill("SIGTERM");
  await restoreCursor();
  if (browserServer?.listening) browserServer.close();
  console.error(error);
  process.exitCode = 1;
});
