/**
 * Capture static Retina feature screenshots from the real Lomi Vite frontend.
 *
 * The desktop and chat bridges are the same deterministic mocks used by Lomi's
 * UI specs; this script never starts an agent, provider request, shell command,
 * or live API. The browser scene uses a locally rendered preview fixture inside
 * the browser pane because Chromium cannot paint Tauri's native child webview.
 * Set LOMI_SOURCE to another Lomi checkout or LOMI_CAPTURE_URL to a running Vite
 * server. If the default Vite URL is unavailable, the script starts and stops
 * its own server without touching any process already listening there.
 * Set LOMI_CAPTURE_FEATURES to a comma-separated subset to rerun selected
 * scenes while tuning captures.
 *
 * Run from lomi-web with: bun run scripts/capture-feature-renders.ts
 */

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = resolve(process.env.LOMI_SOURCE ?? resolve(scriptDir, "../../lomi"));
const outputDir = resolve(scriptDir, "../src/assets/product/renders");
const viewport = { width: 1440, height: 900 };
const projectPath = "/Users/demo/Projects/fieldnotes";

type WorkspaceSession = Record<string, any>;
type MockGitHistory = {
  commits: Record<string, any>[];
  details: Record<string, any>;
  diffs: Record<string, any>;
};

const sourceCode = `import { useMemo, useState } from "react";
import type { Project, SortKey } from "./types";

type FilterState = {
  query: string;
  status: "all" | "open" | "done";
  sort: SortKey;
};

export function useProjectFilter(projects: Project[]) {
  const [filter, setFilter] = useState<FilterState>({
    query: "",
    status: "all",
    sort: "updated",
  });

  const visible = useMemo(() => {
    const query = filter.query.trim().toLowerCase();
    return projects
      .filter((project) => {
        const matchesQuery =
          !query || project.name.toLowerCase().includes(query);
        const matchesStatus =
          filter.status === "all" || project.status === filter.status;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) =>
        filter.sort === "updated"
          ? b.updatedAt - a.updatedAt
          : a.name.localeCompare(b.name),
      );
  }, [projects, filter]);

  return { filter, setFilter, visible };
}
`;

const fileFixtures = {
  [`${projectPath}/src/main.ts`]: {
    content: sourceCode,
    revision: "capture-source-v1",
    encoding: "utf8",
    readOnly: false,
  },
};

const gitChanges = [
  { path: "src/filters.ts", originalPath: null, index: "M", worktree: " " },
  {
    path: "src/components/ProjectList.tsx",
    originalPath: null,
    index: " ",
    worktree: "M",
  },
  { path: "src/styles.css", originalPath: null, index: " ", worktree: "M" },
  {
    path: "tests/filters.test.ts",
    originalPath: null,
    index: " ",
    worktree: "?",
  },
];

const gitPatch = `diff --git a/src/filters.ts b/src/filters.ts
index 773beb1..db704ac 100644
--- a/src/filters.ts
+++ b/src/filters.ts
@@ -1,11 +1,18 @@
 export function filterProjects(projects, query, status) {
-  return projects.filter((project) => project.name.includes(query));
+  const normalizedQuery = query.trim().toLocaleLowerCase();
+
+  return projects
+    .filter((project) => {
+      const matchesQuery =
+        !normalizedQuery ||
+        project.name.toLocaleLowerCase().includes(normalizedQuery);
+      const matchesStatus = status === "all" || project.status === status;
+      return matchesQuery && matchesStatus;
+    })
+    .sort((a, b) => b.updatedAt - a.updatedAt);
 }
`;

function makeSession(
  newProject: (path: string, profile: string) => any,
  newSession: () => WorkspaceSession,
  newWorkspace: (path: string, profile: string, name: string) => any,
  newPane: (cwd: string) => any,
  splitPane: (layout: any, id: string, axis: "horizontal" | "vertical", added: any) => any,
  options: { sidebar?: string | null; rightSidebar?: string | null; extraWorkspace?: boolean; split?: boolean } = {},
) {
  const project = newProject(projectPath, "local:bash");
  project.workspaces[0].name = "Fieldnotes";
  if (options.extraWorkspace) {
    project.workspaces.push(newWorkspace(projectPath, "local:bash", "Release QA"));
  }
  if (options.split) {
    const terminal = project.workspaces[0].tabs[0];
    const added = newPane(projectPath);
    terminal.layout = splitPane(terminal.layout, terminal.activePaneId, "vertical", added);
    terminal.activePaneId = added.id;
  }
  return {
    ...newSession(),
    projects: [project],
    activeProjectId: project.id,
    sidebar: options.sidebar === undefined ? "files" : options.sidebar,
    rightSidebar: options.rightSidebar ?? null,
    sidebarSides: { files: "left", git: "right", workspaces: "left" },
  };
}

async function addTerminalOutput(page: any, paneIndex: number, output: string) {
  const plain = (line: string) =>
    line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const lines = output.split("\r\n").filter((line) => plain(line).length > 0);
  const visibleLines = lines.filter((line) => {
    const text = plain(line);
    if (text.includes("~/Projects/fieldnotes")) return true;
    if (text.trim() === "$") return true;
    if (output.includes("Ready for local preview"))
      return /\$ pnpm dev|VITE v|http:\/\/localhost|Network:|press h|page reload|GET \/|modules transformed|built in|Ready for local preview/.test(text);
    if (output.includes("VITE v7.0.0") && output.includes("$ pnpm test"))
      return true;
    if (paneIndex === 1)
      return /\$ pnpm test|RUN\s+v|useProjectFilter|ProjectList|Test Files|Tests\s+25|Duration/.test(text);
    return /\$ pnpm dev|VITE v|http:\/\/localhost|modules transformed|built in|Local:|Network:/.test(text);
  });
  const visibleOutput = `${visibleLines.join("\r\n")}\r\n`;
  console.log(`terminal pane ${paneIndex}: ${visibleLines.length} output rows`);
  const expectedLine = [...visibleLines]
    .map(plain)
    .reverse()
    .find((line) => /Test Files|Ready for local preview/.test(line))
    ?.replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!expectedLine) throw new Error("Terminal capture has no visible completion marker.");
  await page.evaluate(
    ({ paneIndex, output }: { paneIndex: number; output: string }) => {
      const sessions = [...(window as any).__nativeTest.sessions.keys()];
      const id = sessions[paneIndex];
      if (!id) throw new Error(`No terminal session at index ${paneIndex}`);
      (window as any).__nativeTest.emit(id, output);
    },
    { paneIndex, output: visibleOutput },
  );
  await page.waitForFunction(async ({ paneIndex, expected }: { paneIndex: number; expected: string }) => {
    const pane = document.querySelectorAll<HTMLElement>(".terminal-pane[data-pane-id]")[paneIndex];
    const id = pane?.dataset.paneId;
    if (!id) return false;
    const runtimeUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === "/src/terminal-runtime.ts")
      .at(-1);
    const { runningTerminal } = await import(
      runtimeUrl ?? "/src/terminal-runtime.ts"
    );
    const terminal = runningTerminal(id)?.terminal;
    if (!terminal) return false;
    const buffer = terminal.buffer.active;
    const visible = Array.from({ length: terminal.rows }, (_, row) =>
      buffer.getLine(buffer.viewportY + row)?.translateToString(true),
    ).join("\n");
    return visible.replace(/\u00a0/g, " ").replace(/\s+/g, " ").includes(expected);
  }, { paneIndex, expected: expectedLine });
  await page.waitForFunction(
    ({ paneIndex, expected }: { paneIndex: number; expected: string }) => {
      const pane = document.querySelectorAll<HTMLElement>(
        ".terminal-pane[data-pane-id]",
      )[paneIndex];
      const rendered = pane?.querySelector(".xterm-rows")?.textContent ?? "";
      return rendered
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .includes(expected);
    },
    { paneIndex, expected: expectedLine },
  );
  await page.evaluate(async (paneIndex: number) => {
    const pane = document.querySelectorAll<HTMLElement>(".terminal-pane[data-pane-id]")[paneIndex];
    const runtimeUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === "/src/terminal-runtime.ts")
      .at(-1);
    const { runningTerminal } = await import(runtimeUrl ?? "/src/terminal-runtime.ts");
    const runtime = runningTerminal(pane?.dataset.paneId ?? "");
    if (!runtime) throw new Error("Terminal runtime disappeared after output.");
    await new Promise<void>((resolveRender) => {
      let finished = false;
      let listener: { dispose: () => void } | undefined;
      let timeout = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        listener?.dispose();
        resolveRender();
      };
      timeout = window.setTimeout(finish, 1000);
      listener = runtime.terminal.onRender(finish);
      runtime.terminal.refresh(0, runtime.terminal.rows - 1);
    });
  }, paneIndex);
  const state = await page.evaluate(async (paneIndex: number) => {
    const pane = document.querySelectorAll<HTMLElement>(".terminal-pane[data-pane-id]")[paneIndex];
    const id = pane?.dataset.paneId;
    if (!id) throw new Error("Terminal pane is missing from the layout.");
    const runtimeUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === "/src/terminal-runtime.ts")
      .at(-1);
    const { runningTerminal } = await import(runtimeUrl ?? "/src/terminal-runtime.ts");
    const terminal = runningTerminal(id)?.terminal;
    if (!terminal) throw new Error(`Terminal runtime for ${id} is missing.`);
    const runtime = runningTerminal(id);
    const buffer = terminal.buffer.active;
    return {
      rows: terminal.rows,
      cols: terminal.cols,
      renderer: runtime.getSnapshot().renderer,
      text: Array.from({ length: terminal.rows }, (_, row) =>
        buffer.getLine(buffer.viewportY + row)?.translateToString(true),
      ).join(" | "),
    };
  }, paneIndex);
  console.log(`terminal pane ${paneIndex} ${state.cols}×${state.rows} ${state.renderer}: ${state.text}`);
}

async function settleTerminalLayout(page: any) {
  await page.waitForFunction(async () => {
    await document.fonts.ready;
    const panes = Array.from(document.querySelectorAll<HTMLElement>(".terminal-pane[data-pane-id]"));
    const runtimeUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === "/src/terminal-runtime.ts")
      .at(-1);
    const { runningTerminal } = await import(runtimeUrl ?? "/src/terminal-runtime.ts");
    return panes.length > 0 && panes.every((pane) => {
      const id = pane.dataset.paneId;
      const runtime = id ? runningTerminal(id) : undefined;
      return runtime?.getSnapshot().status === "running" &&
        runtime.getSnapshot().renderer === "dom" &&
        runtime.rendererReady;
    });
  });
  const dimensions = await page.evaluate(async () => {
    await document.fonts.ready;
    const panes = Array.from(document.querySelectorAll<HTMLElement>(".terminal-pane[data-pane-id]"));
    const runtimeUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === "/src/terminal-runtime.ts")
      .at(-1);
    const { runningTerminal } = await import(runtimeUrl ?? "/src/terminal-runtime.ts");
    window.dispatchEvent(new Event("resize"));
    for (const pane of panes) {
      const id = pane.dataset.paneId;
      if (id) runningTerminal(id)?.synchronizeLayoutFit();
    }
    await new Promise<void>((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
    );
    return panes.map((pane) => {
      const runtime = pane.dataset.paneId
        ? runningTerminal(pane.dataset.paneId)
        : undefined;
      return {
        cols: runtime?.terminal.cols,
        rows: runtime?.terminal.rows,
      };
    });
  });
  await page.waitForTimeout(100);
  console.log(
    `terminal fit: ${dimensions.map(({ cols, rows }: { cols?: number; rows?: number }) => `${cols}×${rows}`).join(", ")}`,
  );
}

async function waitForTerminalOutput(page: any) {
  await page.waitForFunction(() => {
    const hosts = Array.from(document.querySelectorAll<HTMLElement>(".terminal-host"));
    return hosts.length > 0 && hosts.every((host) => getComputedStyle(host).opacity === "1");
  });
}

const serverReady = async (url: string, attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
      // Vite is still starting, or the existing server is unavailable.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return false;
};

async function findFreePort() {
  const server = createServer();
  return new Promise<number>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port for Vite."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function useVite() {
  const configuredUrl = new URL(
    process.env.LOMI_CAPTURE_URL ?? "http://127.0.0.1:1420/",
  );
  const existingUrl = configuredUrl.origin;
  if (process.env.LOMI_CAPTURE_URL && (await serverReady(existingUrl, 4)))
    return { url: existingUrl, stop: async () => {} };
  if (!process.env.LOMI_CAPTURE_URL && (await serverReady(existingUrl, 4)))
    return { url: existingUrl, stop: async () => {} };

  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const viteProcess = Bun.spawn(
    ["bun", "run", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: appSource, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  if (!(await serverReady(url))) {
    viteProcess.kill("SIGTERM");
    throw new Error(`Vite did not become ready at ${url}.`);
  }
  return {
    url,
    stop: async () => {
      viteProcess.kill("SIGTERM");
      await viteProcess.exited;
    },
  };
}

async function captureBrowserPreview(page: any, context: any) {
  await page.getByRole("button", { name: /^New tab/ }).click();
  await page.getByRole("menuitem", { name: "New browser", exact: true }).click();
  const address = page.getByRole("combobox", { name: "Web address" });
  await address.fill("http://localhost:5173/");
  await address.press("Enter");
  await address.evaluate((element: HTMLInputElement) => element.blur());
  const viewportElement = page.locator(".browser-viewport");
  await viewportElement.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const element = document.querySelector(".browser-viewport");
    const bounds = element?.getBoundingClientRect();
    return !!bounds && bounds.width > 500 && bounds.height > 300;
  });
  const bounds = await viewportElement.boundingBox();
  if (!bounds) throw new Error("The browser preview viewport is unavailable.");

  const preview = await context.newPage();
  await preview.setViewportSize({
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
  });
  await preview.setContent(previewHtml, { waitUntil: "load" });
  await preview.addStyleTag({
    content:
      ".main{padding-top:20px!important}.stats{margin-top:16px!important}.content{margin-top:12px!important}.chart{height:145px!important}.chart svg{height:120px!important}",
  });
  const previewBytes = await preview.screenshot({ type: "png" });
  await preview.close();

  const dataUrl = `data:image/png;base64,${Buffer.from(previewBytes).toString("base64")}`;
  await viewportElement.evaluate((element: HTMLElement, src: string) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = "Local Fieldnotes project dashboard preview";
    image.draggable = false;
    image.style.cssText = "display:block;width:100%;height:100%;object-fit:cover;";
    element.replaceChildren(image);
  }, dataUrl);
}

const previewHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172235;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.top{height:62px;background:#fff;border-bottom:1px solid #e6eaf1;display:flex;align-items:center;gap:36px;padding:0 34px}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;letter-spacing:-.03em}.mark{width:27px;height:27px;border-radius:9px;background:linear-gradient(145deg,#5b7cfa,#855cf5);position:relative}
.mark:after{content:"";position:absolute;width:9px;height:9px;right:5px;top:5px;border-radius:50%;background:#fff;opacity:.9}
.nav{display:flex;gap:26px;color:#77849a;font-size:13px}.nav b{color:#25334c;font-weight:600}.top-right{margin-left:auto;display:flex;align-items:center;gap:18px;color:#8490a4;font-size:12px}.avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#e8eaff;color:#5968cc;font-weight:700}
.layout{display:grid;grid-template-columns:198px 1fr;min-height:calc(100vh - 62px)}.side{padding:25px 16px;background:#fff;border-right:1px solid #e7ebf2}.workspace{padding:0 10px 12px;color:#909bad;font-size:10px;font-weight:700;letter-spacing:.12em}.side-item{height:38px;display:flex;align-items:center;gap:11px;padding:0 11px;margin:2px 0;color:#66748a;border-radius:8px;font-size:12px}.side-item.active{background:#edf0ff;color:#4f61d6;font-weight:650}.ico{width:16px;text-align:center;font-size:14px}.side-label{margin:25px 10px 7px;color:#a1aaba;font-size:10px;font-weight:700;letter-spacing:.12em}.project{padding-left:22px}.dot{width:7px;height:7px;border-radius:50%;background:#41b98a}
.main{padding:32px 37px 28px;max-width:1100px}.crumb{font-size:11px;color:#9ba5b5;margin-bottom:8px}.heading{display:flex;align-items:flex-start}.heading h1{font-size:27px;line-height:1.2;letter-spacing:-.04em;margin:0;font-weight:700}.sub{color:#8d99aa;margin-top:6px;font-size:12px}.heading-actions{margin-left:auto;display:flex;align-items:center;gap:10px}.period{border:1px solid #e1e6ed;background:#fff;padding:8px 11px;border-radius:8px;font-size:11px;color:#69778c}.primary{background:#596cf2;color:#fff;border-radius:8px;padding:9px 13px;font-size:11px;font-weight:650;box-shadow:0 3px 8px #596cf233}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:25px}.card{background:#fff;border:1px solid #e8ecf2;border-radius:11px;padding:15px 17px;box-shadow:0 4px 12px #15274705}.stat-title{font-size:11px;color:#8b97a9}.stat-row{display:flex;align-items:flex-end;margin-top:8px}.value{font-size:25px;line-height:1;font-weight:700;letter-spacing:-.04em}.trend{margin-left:auto;font-size:10px;color:#3caf84;font-weight:650}.mini{font-size:10px;color:#a0a9b8;margin-top:8px}
.content{display:grid;grid-template-columns:1.45fr 1fr;gap:15px;margin-top:16px}.section-head{display:flex;align-items:center;margin-bottom:14px}.section-head strong{font-size:13px}.section-head span{margin-left:auto;font-size:10px;color:#79869a}.chart{height:185px;position:relative;border-top:1px solid #eef1f5;background:repeating-linear-gradient(to bottom,transparent 0,transparent 44px,#f0f2f6 45px)}.chart svg{position:absolute;inset:15px 0 0;width:100%;height:150px;overflow:visible}.legend{display:flex;gap:15px;color:#8894a7;font-size:10px;margin-top:8px}.legend i{display:inline-block;width:7px;height:7px;border-radius:3px;margin-right:5px}.activity{display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid #f0f2f5}.activity:first-of-type{border-top:0}.taskicon{width:28px;height:28px;border-radius:8px;background:#eef1ff;color:#6979e8;display:grid;place-items:center;font-size:12px}.taskicon.green{background:#e8f8f1;color:#38a97e}.taskicon.gold{background:#fff4df;color:#d89934}.taskcopy{min-width:0}.taskcopy b{display:block;font-size:11px;font-weight:600;white-space:nowrap}.taskcopy small{display:block;margin-top:3px;color:#929daf;font-size:10px}.time{margin-left:auto;color:#a0a9b8;font-size:9px;white-space:nowrap}
.bottom{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:15px}.project-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #f0f2f5}.project-row:first-of-type{border-top:0}.project-dot{width:8px;height:8px;border-radius:50%;background:#f0a75c}.project-row:nth-of-type(3) .project-dot{background:#69b6e3}.project-row:nth-of-type(4) .project-dot{background:#9278eb}.project-row b{font-size:11px;font-weight:600}.project-row small{margin-left:auto;color:#8e9aad;font-size:10px}
</style>
</head>
<body>
<header class="top"><div class="brand"><span class="mark"></span>fieldnotes</div><nav class="nav"><b>Overview</b><span>Projects</span><span>Calendar</span><span>Insights</span></nav><div class="top-right"><span>⌕&nbsp; Search</span><span>◉</span><span class="avatar">FD</span></div></header>
<div class="layout"><aside class="side"><div class="workspace">WORKSPACE</div><div class="side-item active"><span class="ico">▦</span>Overview</div><div class="side-item"><span class="ico">▤</span>My tasks</div><div class="side-item"><span class="ico">▧</span>Inbox <span style="margin-left:auto;color:#596cf2">3</span></div><div class="side-label">PROJECTS</div><div class="side-item project"><span class="dot"></span>Website refresh</div><div class="side-item project"><span class="dot" style="background:#6bb7e4"></span>Design system</div><div class="side-item project"><span class="dot" style="background:#a08be8"></span>Mobile app</div><div class="side-item project"><span class="dot" style="background:#efa85e"></span>Customer research</div><div class="side-label">TOOLS</div><div class="side-item"><span class="ico">⌘</span>Automations</div><div class="side-item"><span class="ico">⚙</span>Settings</div></aside>
<main class="main"><div class="crumb">Workspace&nbsp; / &nbsp;Overview</div><div class="heading"><div><h1>Good morning, team</h1><div class="sub">Here’s what’s moving across your projects today.</div></div><div class="heading-actions"><div class="period">◷&nbsp; This week&nbsp;⌄</div><div class="primary">＋&nbsp; New task</div></div></div>
<section class="stats"><div class="card"><div class="stat-title">Active projects</div><div class="stat-row"><span class="value">08</span><span class="trend">↗ 2 this month</span></div><div class="mini">Across 3 teams</div></div><div class="card"><div class="stat-title">Open tasks</div><div class="stat-row"><span class="value">24</span><span class="trend">↓ 12% this week</span></div><div class="mini">6 due in the next 7 days</div></div><div class="card"><div class="stat-title">Completed this sprint</div><div class="stat-row"><span class="value">86%</span><span class="trend">↗ 8.4%</span></div><div class="mini">Sprint 12 · 21 of 24 tasks</div></div><div class="card"><div class="stat-title">Team capacity</div><div class="stat-row"><span class="value">78%</span><span class="trend" style="color:#8995a8">On track</span></div><div class="mini">5 people · 156h planned</div></div></section>
<section class="content"><div class="card"><div class="section-head"><strong>Project activity</strong><span>Last 7 days&nbsp;⌄</span></div><div class="chart"><svg viewBox="0 0 600 150" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6b7df2" stop-opacity=".22"/><stop offset="1" stop-color="#6b7df2" stop-opacity="0"/></linearGradient></defs><path d="M0 112 C35 98 48 104 78 91 S124 106 157 75 S214 91 246 69 S292 77 325 53 S374 70 405 42 S454 59 485 34 S541 47 600 17 V150 H0Z" fill="url(#fill)"/><path d="M0 112 C35 98 48 104 78 91 S124 106 157 75 S214 91 246 69 S292 77 325 53 S374 70 405 42 S454 59 485 34 S541 47 600 17" fill="none" stroke="#6577ed" stroke-width="3" stroke-linecap="round"/><path d="M0 129 C37 122 51 113 78 119 S129 125 157 102 S218 113 246 94 S294 100 325 88 S373 98 405 73 S456 84 485 67 S548 72 600 53" fill="none" stroke="#54bc99" stroke-width="2" stroke-dasharray="4 5"/></svg></div><div class="legend"><span><i style="background:#6577ed"></i>Tasks completed</span><span><i style="background:#54bc99"></i>New tasks</span></div></div>
<div class="card"><div class="section-head"><strong>Recent activity</strong><span>View all&nbsp; →</span></div><div class="activity"><span class="taskicon">✓</span><div class="taskcopy"><b>Navigation audit completed</b><small>Website refresh · Design</small></div><span class="time">12 min</span></div><div class="activity"><span class="taskicon green">↗</span><div class="taskcopy"><b>New preview is ready</b><small>Mobile app · Engineering</small></div><span class="time">48 min</span></div><div class="activity"><span class="taskicon gold">＋</span><div class="taskcopy"><b>Research notes added</b><small>Customer research · Product</small></div><span class="time">2 hr</span></div><div class="activity"><span class="taskicon">⌁</span><div class="taskcopy"><b>Color tokens updated</b><small>Design system · Design</small></div><span class="time">3 hr</span></div></div></section>
<section class="bottom"><div class="card"><div class="section-head"><strong>Projects in progress</strong><span>All projects&nbsp; →</span></div><div class="project-row"><i class="project-dot"></i><b>Website refresh</b><small>76% complete</small></div><div class="project-row"><i class="project-dot"></i><b>Design system</b><small>58% complete</small></div><div class="project-row"><i class="project-dot"></i><b>Mobile app</b><small>42% complete</small></div></div><div class="card"><div class="section-head"><strong>Upcoming</strong><span>Open calendar&nbsp; →</span></div><div class="activity"><span class="taskicon gold">◷</span><div class="taskcopy"><b>Product review</b><small>Today · 2:30 PM</small></div><span class="time">Today</span></div><div class="activity"><span class="taskicon">◷</span><div class="taskcopy"><b>Design handoff</b><small>Tomorrow · 10:00 AM</small></div><span class="time">Tomorrow</span></div></div></section>
</main></div></body></html>`;

async function makeCapture(
  browser: any,
  name: string,
  setup: (
    page: any,
    context: any,
    dependencies: {
      mockDesktop: (...args: any[]) => Promise<void>;
      mockChats: (page: any) => Promise<void>;
      session: WorkspaceSession;
      panelsSession: WorkspaceSession;
      gitHistory: MockGitHistory;
    },
  ) => Promise<void>,
  dependencies: {
    mockDesktop: (...args: any[]) => Promise<void>;
    mockChats: (page: any) => Promise<void>;
    session: WorkspaceSession;
    panelsSession: WorkspaceSession;
    gitHistory: MockGitHistory;
  },
  baseUrl: string,
) {
  const selected = process.env.LOMI_CAPTURE_FEATURES;
  if (selected && !selected.split(",").map((name) => name.trim()).includes(name))
    return;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await setup(page, context, dependencies);
  if (name === "terminal" || name === "panels") {
    // The mock app_info response normally omits the renderer and Workbench
    // defaults to WebGL. Use the app's supported DOM renderer for deterministic
    // headless screenshots while keeping the real terminal runtime and UI.
    await page.addInitScript(() => {
      const wrapBridge = (bridge: any) => {
        if (!bridge || bridge.__captureRendererPatched) return bridge;
        const invoke = bridge.invoke.bind(bridge);
        bridge.invoke = async (command: string, args: any = {}) => {
          const result = await invoke(command, args);
          return command === "app_info"
            ? { ...result, terminalRenderer: "dom" }
            : result;
        };
        bridge.__captureRendererPatched = true;
        return bridge;
      };
      let nativeBridge = wrapBridge(
        (window as any).__TAURI_INTERNALS__,
      );
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        configurable: true,
        get: () => nativeBridge,
        set: (bridge: any) => {
          nativeBridge = wrapBridge(bridge);
          Object.defineProperty(window, "__TAURI_INTERNALS__", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: nativeBridge,
          });
        },
      });
      if (nativeBridge) {
        Object.defineProperty(window, "__TAURI_INTERNALS__", {
          configurable: true,
          enumerable: true,
          writable: true,
          value: nativeBridge,
        });
      }
    });
  }
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell");
  await page.waitForTimeout(150);

  if (name === "terminal") {
    await page.locator(".xterm-screen").waitFor({ state: "visible" });
    await settleTerminalLayout(page);
    await addTerminalOutput(
      page,
      0,
      "\r\n\x1b[1;36m~/Projects/fieldnotes\x1b[0m  \x1b[1;35mfeature/filter-polish\x1b[0m\r\n$ pnpm dev\r\n\r\n\x1b[1m> fieldnotes@0.8.0 dev\x1b[0m\r\n> vite\r\n\r\n  \x1b[1;32mVITE v7.0.0\x1b[0m  ready in 412 ms\r\n  \x1b[1mLocal:\x1b[0m   \x1b[4;36mhttp://localhost:5173/\x1b[0m\r\n  \x1b[1mNetwork:\x1b[0m use --host to expose\r\n  press h + enter to show help\r\n\r\n  \x1b[90m10:42:13 AM\x1b[0m \x1b[36m[vite]\x1b[0m page reload src/main.ts\r\n  \x1b[90m10:42:15 AM\x1b[0m \x1b[36m[vite]\x1b[0m GET / 200 · 18 ms\r\n  \x1b[90m10:42:16 AM\x1b[0m \x1b[36m[vite]\x1b[0m client connected\r\n  \x1b[90m10:42:18 AM\x1b[0m \x1b[32m✓\x1b[0m 8 modules transformed.\r\n  \x1b[90m10:42:19 AM\x1b[0m \x1b[32m✓\x1b[0m built in 286 ms\r\n  \x1b[90m10:42:20 AM\x1b[0m \x1b[32m✓\x1b[0m Typecheck passed in 0.84 s\r\n\r\n\x1b[1;36m~/Projects/fieldnotes\x1b[0m  \x1b[1;35mfeature/filter-polish\x1b[0m\r\n$ pnpm test\r\n\r\n RUN  v3.2.4 /Users/demo/Projects/fieldnotes\r\n\r\n \x1b[32m✓\x1b[0m src/hooks/useProjectFilter.test.ts (8 tests) 92ms\r\n \x1b[32m✓\x1b[0m src/components/ProjectList.test.tsx (6 tests) 74ms\r\n \x1b[32m✓\x1b[0m src/lib/search-index.test.ts (11 tests) 46ms\r\n\r\n \x1b[1;32mTest Files\x1b[0m  3 passed (3)\r\n  \x1b[1;32mTests\x1b[0m      25 passed (25)\r\n \x1b[90mDuration\x1b[0m   1.34s\r\n\r\n\x1b[1;36m~/Projects/fieldnotes\x1b[0m  \x1b[?25h",
    );
    await waitForTerminalOutput(page);
  } else if (name === "panels") {
    await page.waitForFunction(
      () => (window as any).__nativeTest.sessions.size === 2,
    );
    await page.getByRole("button", { name: "Toggle workspaces", exact: true }).click();
    await page.getByRole("complementary", { name: "Workspaces", exact: true }).waitFor({ state: "visible" });
    await settleTerminalLayout(page);
    await addTerminalOutput(
      page,
      0,
      "\r\n\x1b[1;36m~/Projects/fieldnotes\x1b[0m  \x1b[1;35mfeature/filter-polish\x1b[0m\r\n$ pnpm dev\r\n\r\n\x1b[1;32mVITE v7.0.0\x1b[0m  ready in 412 ms\r\n\r\n  Local:   \x1b[4;36mhttp://localhost:5173/\x1b[0m\r\n  Network: use --host to expose\r\n  press h + enter to show help\r\n\r\n  \x1b[90m10:42:13 AM\x1b[0m [vite] page reload src/main.ts\r\n  \x1b[90m10:42:19 AM\x1b[0m \x1b[32m✓\x1b[0m 8 modules transformed.\r\n  \x1b[32m✓\x1b[0m built in 286 ms\r\n\r\nReady for local preview.\r\n$ \x1b[?25h",
    );
    await addTerminalOutput(
      page,
      1,
      "\r\n\x1b[1;36m~/Projects/fieldnotes\x1b[0m  \x1b[1;35mfeature/filter-polish\x1b[0m\r\n$ pnpm test\r\n\r\n RUN  v3.2.4 /Users/demo/Projects/fieldnotes\r\n\r\n\x1b[32m✓\x1b[0m useProjectFilter › matches without case sensitivity (4 ms)\r\n\x1b[32m✓\x1b[0m useProjectFilter › keeps the selected status (3 ms)\r\n\x1b[32m✓\x1b[0m ProjectList › announces an empty result (8 ms)\r\n\r\n \x1b[1;32mTest Files\x1b[0m  3 passed (3)\r\n \x1b[1;32mTests\x1b[0m      25 passed (25)\r\n \x1b[90mDuration\x1b[0m   1.34s\r\n$ \x1b[?25h",
    );
    await waitForTerminalOutput(page);
  } else if (name === "code") {
    await page.locator(".xterm-screen").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "src", exact: true }).dblclick();
    await page.getByRole("button", { name: "main.ts", exact: true }).dblclick();
    await page.locator(".cm-content").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.querySelector(".cm-content")?.textContent?.includes("useProjectFilter"),
    );
  } else if (name === "expand") {
    await page.locator(".xterm-screen").waitFor({ state: "visible" });
    await captureBrowserPreview(page, context);
  } else if (name === "git") {
    await page.locator(".xterm-screen").waitFor({ state: "visible" });
    await page.evaluate(({ changes, patch }: { changes: any[]; patch: string }) => {
      const native = (window as any).__TAURI_INTERNALS__;
      const invoke = native.invoke.bind(native);
      native.invoke = async (command: string, args: any = {}) => {
        if (command === "git_status")
          return { root: args.root, branch: "feature/filter-polish", changes };
        if (command === "git_repositories")
          return { repositories: [{ root: args.root, branch: "feature/filter-polish", changes }], errors: [], limited: false };
        if (command === "git_diff") return { patch, truncated: false, notice: null };
        if (command === "git_stage" || command === "git_commit") return;
        return invoke(command, args);
      };
      window.dispatchEvent(new Event("focus"));
    }, { changes: gitChanges, patch: gitPatch });
    await page.getByRole("button", { name: /^Toggle source control/ }).click();
    const source = page.getByRole("complementary", { name: "Source Control", exact: true });
    await source.waitFor({ state: "visible" });
    const diff = source.getByRole("button", { name: "View staged diff for src/filters.ts", exact: true });
    await diff.waitFor({ state: "visible" });
    await diff.click();
    await page.locator(".working-file-diff .commit-patch").waitFor({ state: "visible" });
    const commitMessage = source.getByRole("textbox", { name: "Commit message", exact: true });
    await commitMessage.fill("feat: improve project filtering");
    await commitMessage.evaluate((element: HTMLTextAreaElement) => element.blur());
    await page.waitForFunction(() =>
      document.querySelector(".working-file-diff")?.textContent?.includes("normalizedQuery"),
    );
  } else if (name === "spark") {
    await page.locator(".xterm-screen").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /^New tab/ }).click();
    await page.getByRole("menuitem", { name: "Chat AI", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await input.waitFor({ state: "visible" });
    await page.evaluate(() => {
      const test = (window as any).__chatTest;
      test.response =
        "### Filter review\n\nThe changes look good. Check these before merging:\n\n- Normalize whitespace before matching.\n- Keep sorting stable for equal dates.\n- Cover empty searches in the tests.\n\nReady for your review.";
      test.chunks = 1;
      test.maxChunks = 1;
    });
    await input.fill("Review the project filter before I commit.");
    await input.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector(".chat-message-assistant")?.textContent?.includes("Ready for your review."),
    );
    const assistantBounds = await page
      .locator(".chat-message-assistant .chat-markdown")
      .boundingBox();
    if (!assistantBounds) throw new Error("The Spark response is not visible.");
    console.log(
      `spark assistant markdown logical bounds: x=${assistantBounds.x.toFixed(1)}, y=${assistantBounds.y.toFixed(1)}, w=${assistantBounds.width.toFixed(1)}, h=${assistantBounds.height.toFixed(1)}`,
    );
    await input.evaluate((element: HTMLTextAreaElement) => element.blur());
    await page.waitForTimeout(200);
  }

  const png = await page.screenshot({ type: "png", animations: "disabled" });
  const destination = resolve(outputDir, `${name}.webp`);
  await sharp(png)
    .webp({ quality: 98, effort: 6, smartSubsample: true })
    .toFile(destination);
  const metadata = await sharp(destination).metadata();
  const file = Bun.file(destination);
  console.log(
    `${name}.webp ${metadata.width}x${metadata.height} ${(file.size / 1024).toFixed(0)} KB`,
  );
  await context.close();
}

async function main() {
  const [
    { mockDesktop },
    { mockChats },
    { newProject, newSession, newWorkspace, newPane, splitPane },
  ] =
    await Promise.all([
      import(pathToFileURL(resolve(appSource, "tests/ui/desktop.ts")).href),
      import(pathToFileURL(resolve(appSource, "tests/ui/chat-mock.ts")).href),
      import(pathToFileURL(resolve(appSource, "src/model.ts")).href),
    ]);
  const session = makeSession(newProject, newSession, newWorkspace, newPane, splitPane, {
    sidebar: "files",
    extraWorkspace: true,
  });
  const panelsSession = makeSession(newProject, newSession, newWorkspace, newPane, splitPane, {
    sidebar: "files",
    extraWorkspace: true,
    split: true,
  });
  const gitSession = makeSession(newProject, newSession, newWorkspace, newPane, splitPane, {
    sidebar: null,
  });
  const commit = {
    id: "7a3d8c2f9e1b4a6d8f0c2e5a9b7d1f3c6e8a0b2d",
    shortId: "7a3d8c2",
    subject: "feat(ui): add project overview filters",
    authorName: "Alex Morgan",
    authoredAt: "2026-10-20T10:30:00Z",
  };
  const gitHistory: MockGitHistory = {
    commits: [commit],
    details: {
      [commit.id]: {
        commit,
        authorEmail: "alex@example.test",
        committerName: "Alex Morgan",
        committerEmail: "alex@example.test",
        committedAt: "2026-10-20T10:30:00Z",
        parents: [],
        message: `${commit.subject}\n\nKeep filtering predictable as the project list grows.`,
        files: [
          { path: "src/filters.ts", originalPath: null, status: "M", additions: 11, deletions: 2 },
          { path: "tests/filters.test.ts", originalPath: null, status: "A", additions: 18, deletions: 0 },
        ],
      },
    },
    diffs: { "src/filters.ts": { patch: gitPatch, truncated: false } },
  };
  const dependencies = {
    mockDesktop,
    mockChats,
    session,
    panelsSession,
    gitHistory,
  };
  const vite = await useVite();
  const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
  await mkdir(outputDir, { recursive: true });
  try {
    await makeCapture(
      browser,
      "terminal",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, true, fixture.session, fixture.gitHistory, fileFixtures, "macos");
      },
      dependencies,
      vite.url,
    );
    await makeCapture(
      browser,
      "code",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, true, fixture.session, fixture.gitHistory, fileFixtures, "macos");
      },
      dependencies,
      vite.url,
    );
    await makeCapture(
      browser,
      "panels",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, true, fixture.panelsSession, fixture.gitHistory, fileFixtures, "macos");
      },
      dependencies,
      vite.url,
    );
    await makeCapture(
      browser,
      "expand",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, false, fixture.session, fixture.gitHistory, fileFixtures, "macos");
      },
      dependencies,
      vite.url,
    );
    await makeCapture(
      browser,
      "git",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, true, gitSession, fixture.gitHistory, fileFixtures, "macos");
      },
      dependencies,
      vite.url,
    );
    await makeCapture(
      browser,
      "spark",
      async (page, _context, fixture) => {
        await fixture.mockDesktop(page, false, fixture.session, fixture.gitHistory, fileFixtures, "macos");
        await fixture.mockChats(page);
      },
      dependencies,
      vite.url,
    );
  } finally {
    await browser.close();
    await vite.stop();
  }
}

await main();
