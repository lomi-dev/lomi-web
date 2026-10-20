import { assertPlaceholder } from './verify-placeholders.mjs';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated published-CMS builds: never overwrite the project's dist or use real YouTube.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(resolve(tmpdir(), 'lomi-hero-player-'));
const servers = [];
const errors = [];
const browser = await chromium.launch();
let output;
let clip;
let fixture;
let cms;
const key = 'lomi.cookie-consent';
const labels = Object.fromEntries(['controlsLabel', 'playLabel', 'pauseLabel', 'replayLabel', 'muteLabel', 'unmuteLabel', 'volumeLabel', 'seekLabel', 'fullscreenLabel', 'exitFullscreenLabel', 'retryLabel'].map((name) => [name, `CMS ${name}`]));
labels.timeLabel = 'CMS {current} of {duration}';
async function serve(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${server.address().port}`;
}
async function build(name) {
  output = resolve(scratch, name);
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', output], { cwd: root, env: { ...process.env, CMS_URL: cms, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code ? reject(new Error(log)) : done());
  });
}
const mockAPI = `
window.__players = [];
window.YT = { PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }, Player: class {
 constructor(iframe, options) { this.iframe = iframe; this.events = options.events; this.calls = []; this.time = 0; this.volume = 100; this.muted = false; this.state = -1; window.__players.push(this); }
 mute() { this.muted = true; this.calls.push('mute'); }
 unMute() { this.muted = false; this.calls.push('unMute'); }
 isMuted() { return this.muted; }
 setVolume(value) { this.volume = value; this.calls.push(['setVolume', value]); }
 getVolume() { return this.volume; }
 getCurrentTime() { return this.time; }
 getDuration() { return 120; }
 getPlayerState() { return this.state; }
 seekTo(value) { this.time = value; this.calls.push(['seekTo', value]); }
 playVideo() { this.calls.push('playVideo'); }
 pauseVideo() { this.calls.push('pauseVideo'); }
 getIframe() { return this.iframe; }
 destroy() { this.calls.push('destroy'); this.iframe.remove(); }
}};
window.onYouTubeIframeAPIReady?.();`;
const player = (page) => page.locator('[data-hero-video]');
const control = (page, name) => player(page).locator(`[data-player-${name}]`);
async function open(preview, { consent = true, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.addInitScript(({ consent, key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, externalMedia: consent, savedAt: Date.now() }));
    window.__fullscreenCalls = 0;
    Element.prototype.requestFullscreen = async function () {
      window.__fullscreenCalls++;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  }, { consent, key });
  const requests = [];
  await context.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await context.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: route.request().url().endsWith('/iframe_api') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/iframe_api') ? mockAPI : '<!doctype html><html lang="en"><title>Mock video</title><body></body></html>' });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(preview, { waitUntil: 'networkidle' });
  return { context, page, requests };
}
async function emit(page, event, data, index = 0) {
  await page.evaluate(({ event, data, index }) => {
    const instance = window.__players[index];
    if (event === 'onStateChange') instance.state = data;
    instance.events[event]?.({ target: instance, data });
  }, { event, data, index });
}
async function center(page) {
  await player(page).locator('[data-video-viewport]').evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function choice(page, value) {
  await page.evaluate(({ value, key }) => {
    const newValue = JSON.stringify({ version: 1, externalMedia: value, savedAt: Date.now() });
    localStorage.setItem(key, newValue);
    dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
  }, { value, key });
}
async function range(locator, value) {
  await locator.evaluate((node, value) => { node.value = String(value); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value);
}
async function toggleIcon(page, name) {
  await expect(control(page, 'toggle').locator('[data-icon]:visible')).toHaveCount(1);
  await expect(control(page, 'toggle').locator(`[data-icon="${name}"]`)).toBeVisible();
}
async function videoPointer(page, offset = 0) {
  const box = await player(page).locator('[data-video-viewport]').boundingBox();
  const point = { x: box.x + box.width / 2 + offset, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  return point;
}
async function blurControls(page) {
  await page.evaluate(() => document.activeElement?.blur());
}
async function visibleControls(page, value) {
  await expect(player(page)).toHaveAttribute('data-controls-visible', String(value));
  await expect(control(page, 'controls')).toHaveCSS('opacity', value ? '1' : '0');
  await expect(control(page, 'controls')).toHaveCSS('pointer-events', value ? 'auto' : 'none');
}
async function pinnedControls(page) {
  await blurControls(page);
  await center(page);
  await videoPointer(page);
  await page.waitForTimeout(2200);
  await visibleControls(page, true);
}
async function idleControls(preview) {
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  const idle = await open(preview, { reducedMotion: 'reduce' });
  const page = idle.page;
  await center(page);
  await emit(page, 'onReady');
  await control(page, 'toggle').click();
  await emit(page, 'onStateChange', 1);
  await blurControls(page);
  await videoPointer(page);
  await visibleControls(page, false);
  await player(page).screenshot({ path: resolve(root, 'artifacts/hero-player-idle-1440.png') });
  await videoPointer(page, 5);
  await visibleControls(page, true);
  await player(page).screenshot({ path: resolve(root, 'artifacts/hero-player-active-1440.png') });
  for (const offset of [10, 15, 20]) {
    await page.waitForTimeout(900);
    await videoPointer(page, offset);
    await visibleControls(page, true);
  }
  await visibleControls(page, false);
  await videoPointer(page, 25);
  await visibleControls(page, true);
  const beforeOutsideRelease = await page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length);
  const viewport = await player(page).locator('[data-video-viewport]').boundingBox();
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + 12, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length), 'Releasing outside the gesture surface does not toggle playback').toBe(beforeOutsideRelease);
  await expect(player(page)).toHaveAttribute('data-video-status', 'playing');
  await visibleControls(page, false);
  await videoPointer(page, 30);
  await visibleControls(page, true);
  await visibleControls(page, false);
  await page.locator('.hero-explore').evaluate((node) => node.focus({ preventScroll: true }));
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('Tab');
    if (await control(page, 'toggle').evaluate((node) => node === document.activeElement)) break;
  }
  await expect(control(page, 'toggle')).toBeFocused();
  await visibleControls(page, true);
  await page.waitForTimeout(2200);
  await visibleControls(page, true);
  await blurControls(page);
  await videoPointer(page, 25);
  await visibleControls(page, false);
  await control(page, 'mute').focus();
  await visibleControls(page, true);
  await page.waitForTimeout(2200);
  await visibleControls(page, true);
  await blurControls(page);
  for (const name of ['seek', 'volume']) {
    await videoPointer(page, 30);
    await visibleControls(page, true);
    const box = await control(page, name).boundingBox();
    await page.mouse.move(box.x + box.width * .25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height / 2);
    await videoPointer(page, 40);
    await page.waitForTimeout(2200);
    await visibleControls(page, true);
    await page.mouse.up();
    await blurControls(page);
    await videoPointer(page, 35);
    await visibleControls(page, false);
  }
  await emit(page, 'onStateChange', 0);
  await pinnedControls(page);
  await emit(page, 'onError', 100);
  await pinnedControls(page);
  await idle.context.close();

  const touch = await open(preview, { reducedMotion: 'reduce', viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });
  await center(touch.page);
  await emit(touch.page, 'onReady');
  await control(touch.page, 'toggle').tap();
  await emit(touch.page, 'onStateChange', 1);
  await visibleControls(touch.page, false);
  await player(touch.page).screenshot({ path: resolve(root, 'artifacts/hero-player-idle-320.png') });
  const box = await control(touch.page, 'surface-toggle').boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pauses = await touch.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length);
  await touch.page.touchscreen.tap(point.x, point.y);
  await visibleControls(touch.page, true);
  await player(touch.page).screenshot({ path: resolve(root, 'artifacts/hero-player-active-320.png') });
  expect(await touch.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length)).toBe(pauses);
  await expect(player(touch.page)).toHaveAttribute('data-video-status', 'playing');
  await touch.page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => touch.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length)).toBe(pauses + 1);
  await expect(player(touch.page)).toHaveAttribute('data-video-status', 'paused');
  await touch.context.close();
}
async function layout(page) {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width < 400 ? 844 : 1000 });
    await center(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(control(page, 'controls')).toBeVisible();
    const viewport = await player(page).locator('[data-video-viewport]').boundingBox();
    const controls = await control(page, 'controls').boundingBox();
    const toggle = await control(page, 'toggle').boundingBox();
    expect(toggle.height, 'Slim desktop control retains a larger mobile target').toBe(width < 601 ? 44 : 36);
    await expect(control(page, 'controls')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(controls.x).toBeGreaterThan(viewport.x);
    expect(controls.y).toBeGreaterThan(viewport.y);
    expect(controls.x + controls.width).toBeLessThan(viewport.x + viewport.width);
    expect(controls.y + controls.height).toBeLessThan(viewport.y + viewport.height);
    const result = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations, `Hero axe at ${width}px`).toEqual([]);
  }
}
try {
  const parsed = spawnSync('bun', ['-e', "import {landingSchema} from './content/landing-schema.ts'; import seed from './content/landing.json'; console.log(JSON.stringify(landingSchema.parse(seed)));"], { cwd: root, encoding: 'utf8' });
  expect(parsed.status, parsed.stderr).toBe(0);
  fixture = JSON.parse(parsed.stdout);
  fixture._status = 'published';
  Object.assign(fixture.hero.player, labels);
  const recorder = await browser.newPage();
  clip = Buffer.from(await recorder.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 40;
    const stream = canvas.captureStream(12);
    const recording = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    const result = new Promise((done) => {
      recording.ondataavailable = (event) => chunks.push(event.data);
      recording.onstop = async () => { stream.getTracks().forEach((track) => track.stop()); done(btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer())))); };
    });
    recording.start();
    let frame = 0;
    const paint = setInterval(() => { const context = canvas.getContext('2d'); context.fillStyle = `hsl(${frame++ * 30} 70% 50%)`; context.fillRect(0, 0, 64, 40); }, 80);
    setTimeout(() => { clearInterval(paint); recording.stop(); }, 3000);
    return result;
  }), 'base64');
  await recorder.close();
  cms = await serve((request, response) => {
    if (request.url.startsWith('/api/globals/landing')) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(fixture)); }
    else if (new URL(request.url, 'http://fixture.test').pathname === '/api/devlogs') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ docs: [], hasNextPage: false, nextPage: null })); }
    else if (request.url === '/api/media/file/custom-brand.png') { response.setHeader('Content-Type', 'image/png'); response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=', 'base64')); }
    else if (request.url === '/api/media/file/clip.webm') {
      const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = Number(match?.[1] || 0); const end = match?.[2] ? Math.min(Number(match[2]), clip.length - 1) : clip.length - 1;
      if (start > end || start >= clip.length) { response.writeHead(416, { 'Content-Range': `bytes */${clip.length}` }); response.end(); return; }
      response.writeHead(match ? 206 : 200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(match ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) }); response.end(clip.subarray(start, end + 1));
    } else { response.writeHead(404); response.end(); }
  });
  const preview = await serve(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname);
      const path = resolve(output, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
      if (!path.startsWith(output + sep)) throw new Error('Invalid path');
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  await build('youtube');
  const run = await open(preview, { consent: false });
  const { page } = run;
  await expect(player(page)).toHaveAttribute('data-video-status', 'consent');
  await pinnedControls(page);
  expect(run.requests).toEqual([]);
  await expect(player(page).locator('[data-video-poster]')).toBeVisible();
  await player(page).locator('[data-video-poster]').click();
  await expect(page.locator('#cookie-preferences')).toBeVisible();
  expect(run.requests).toEqual([]);
  await page.locator('#cookie-external-media').check();
  await page.locator('[data-cookie-save]').click();
  await expect(player(page).locator('iframe')).toHaveCount(1);
  expect(new URL(await player(page).locator('iframe').getAttribute('src')).searchParams.get('controls')).toBe('0');
  await expect(player(page).locator('[data-video-poster]')).toBeVisible();
  await center(page);
  await pinnedControls(page);
  await emit(page, 'onReady');
  await expect.poll(() => page.evaluate(() => window.__players[0].calls)).toContain('playVideo');
  expect((await page.evaluate(() => window.__players[0].calls))[0]).toBe('mute');
  await expect(player(page).locator('[data-video-poster]')).toBeVisible();
  const paleSurface = await player(page).locator('[data-media-placeholder]').evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect.poll(() => page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor), { message: 'Overscroll follows the pale placeholder before the first frame' }).toBe(paleSurface);
  const ink = await control(page, 'controls').evaluate((element) => {
    const probe = document.createElement('span'); probe.style.color = 'var(--color-ink)'; element.append(probe);
    const color = getComputedStyle(probe).color; probe.remove(); return color;
  });
  await expect(control(page, 'controls')).toHaveCSS('color', ink);
  await emit(page, 'onStateChange', 1);
  await expect(player(page)).toHaveAttribute('data-video-status', 'playing');
  await expect(player(page).locator('[data-video-poster]')).toBeHidden();
  await expect.poll(() => page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor), { message: 'Overscroll follows the dark video surface after its first frame' }).toBe('rgb(8, 10, 8)');
  expect(await control(page, 'controls').evaluate((element) => getComputedStyle(element).color), 'Video controls switch to a light foreground').not.toBe(ink);
  await expect(control(page, 'controls')).toHaveAttribute('aria-label', labels.controlsLabel);
  await expect(control(page, 'toggle')).toHaveAccessibleName(labels.pauseLabel);
  await toggleIcon(page, 'pause');
  await control(page, 'toggle').click();
  await expect.poll(() => page.evaluate(() => window.__players[0].calls)).toContain('pauseVideo');
  await emit(page, 'onStateChange', 2);
  await expect(control(page, 'toggle')).toHaveAccessibleName(labels.playLabel);
  await toggleIcon(page, 'play');
  await range(control(page, 'seek'), 45);
  await expect.poll(() => page.evaluate(() => window.__players[0].time)).toBe(45);
  await expect(control(page, 'current')).toHaveText('00:45');
  await expect(control(page, 'duration')).toHaveText('02:00');
  await expect(control(page, 'seek')).toHaveAttribute('aria-valuetext', 'CMS 00:45 of 02:00');
  await expect(control(page, 'seek')).toHaveAccessibleName(labels.seekLabel);
  await expect(control(page, 'volume')).toHaveAccessibleName(labels.volumeLabel);
  await expect(control(page, 'fullscreen')).toHaveAccessibleName(labels.fullscreenLabel);
  await control(page, 'seek').focus();
  await expect(control(page, 'seek')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__players[0].time)).toBeGreaterThan(45);
  await range(control(page, 'volume'), 40);
  await expect.poll(() => page.evaluate(() => window.__players[0].volume)).toBe(40);
  await expect(control(page, 'mute')).toHaveAccessibleName(labels.muteLabel);
  await control(page, 'mute').click();
  await expect(control(page, 'mute')).toHaveAccessibleName(labels.unmuteLabel);
  await expect.poll(() => page.evaluate(() => window.__players[0].muted)).toBe(true);
  await control(page, 'mute').click();
  await expect.poll(() => page.evaluate(() => window.__players[0].muted)).toBe(false);
  await control(page, 'fullscreen').click();
  await expect(control(page, 'fullscreen')).toHaveAccessibleName(labels.exitFullscreenLabel);
  expect(await page.evaluate(() => document.fullscreenElement?.matches('[data-video-player]'))).toBe(true);
  await control(page, 'fullscreen').click();
  await emit(page, 'onStateChange', 0);
  await expect(control(page, 'toggle')).toHaveAccessibleName(labels.replayLabel);
  await toggleIcon(page, 'replay');
  await control(page, 'toggle').click();
  await expect.poll(() => page.evaluate(() => window.__players[0].time)).toBe(0);
  await emit(page, 'onStateChange', 1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await emit(page, 'onStateChange', 1);
  await expect(player(page)).toHaveAttribute('data-video-status', 'paused');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('.site-footer').evaluate((node) => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await emit(page, 'onStateChange', 1);
  await expect(player(page)).toHaveAttribute('data-video-status', 'paused');
  await center(page);
  await layout(page);
  await emit(page, 'onError', 100);
  await expect(player(page)).toHaveAttribute('data-video-status', 'error');
  await expect(control(page, 'retry')).toHaveAccessibleName(labels.retryLabel);
  await control(page, 'retry').click();
  await expect.poll(() => page.evaluate(() => window.__players.length)).toBe(2);
  await emit(page, 'onReady', undefined, 0);
  await emit(page, 'onStateChange', 1, 0);
  await emit(page, 'onError', 100, 0);
  await expect(player(page)).toHaveAttribute('data-video-status', 'loading');
  await choice(page, false);
  const requestsAfterRevocation = run.requests.length;
  await emit(page, 'onReady', undefined, 1);
  await emit(page, 'onStateChange', 1, 1);
  await expect(player(page)).toHaveAttribute('data-video-status', 'consent');
  await expect(player(page).locator('iframe')).toHaveCount(0);
  await expect(player(page).locator('[data-video-poster]')).toBeVisible();
  expect(run.requests).toHaveLength(requestsAfterRevocation);
  await run.context.close();

  const partial = await open(preview);
  await player(partial.page).locator('[data-video-viewport]').evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    scrollTo({ top: scrollY + bounds.top + bounds.height * .6, behavior: 'instant' });
  });
  await partial.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await emit(partial.page, 'onReady');
  expect(await partial.page.evaluate(() => window.__players[0].calls), 'Less than half visible prevents autoplay').not.toContain('playVideo');
  await center(partial.page);
  await expect.poll(() => partial.page.evaluate(() => window.__players[0].calls)).toContain('playVideo');
  await partial.context.close();

  const reduced = await open(preview, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await center(reduced.page);
  await emit(reduced.page, 'onReady');
  expect(await reduced.page.evaluate(() => window.__players[0].calls)).not.toContain('playVideo');
  await control(reduced.page, 'toggle').click();
  await expect(control(reduced.page, 'toggle')).toHaveAccessibleName(labels.pauseLabel);
  await expect.poll(() => reduced.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'playVideo').length)).toBe(1);
  await control(reduced.page, 'toggle').click();
  await expect(control(reduced.page, 'toggle')).toHaveAccessibleName(labels.playLabel);
  await expect.poll(() => reduced.page.evaluate(() => window.__players[0].calls)).toContain('pauseVideo');
  await emit(reduced.page, 'onStateChange', 1);
  await expect(player(reduced.page)).toHaveAttribute('data-video-status', 'paused');
  expect(await reduced.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'playVideo').length)).toBe(1);
  expect(await reduced.page.evaluate(() => window.__players[0].calls.filter((call) => call === 'pauseVideo').length)).toBeGreaterThanOrEqual(2);
  await emit(reduced.page, 'onStateChange', 2);
  await control(reduced.page, 'toggle').click();
  await emit(reduced.page, 'onAutoplayBlocked');
  await expect(player(reduced.page).locator('[data-video-poster]')).toBeVisible();
  await expect(control(reduced.page, 'toggle')).toHaveAccessibleName(labels.playLabel);
  await reduced.context.close();
  await idleControls(preview);
  const staticYT = await open(preview, { javaScriptEnabled: false });
  await expect(player(staticYT.page).locator('[data-video-poster]')).toHaveAttribute('href', fixture.hero.videoUrl);
  await expect(control(staticYT.page, 'controls')).toBeHidden();
  expect(staticYT.requests).toEqual([]);
  await staticYT.context.close();

  fixture.hero.mediaMode = 'video';
  fixture.hero.video = { id: 72, url: '/api/media/file/clip.webm', mimeType: 'video/webm', width: 64, height: 40, alt: 'Real VP8 fixture' };
  await build('native');
  const preInit = await browser.newContext({ reducedMotion: 'reduce' });
  let releaseModule;
  let delayedModules = 0;
  const moduleGate = new Promise((done) => { releaseModule = done; });
  await preInit.route('**/_astro/*.js', async (route) => { delayedModules++; await moduleGate; await route.continue(); });
  await preInit.route(`${cms}/api/media/file/clip.webm`, (route) => route.fulfill({ status: 404, body: 'Source fails before the player module initializes' }));
  await preInit.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  const early = await preInit.newPage();
  early.on('pageerror', (error) => errors.push(error.message));
  try {
    await early.goto(preview, { waitUntil: 'commit' });
    await expect.poll(() => early.locator('[data-native-video]').evaluate((node) => node.networkState)).toBe(3);
    expect(delayedModules, 'The module is still delayed when the source has already failed').toBeGreaterThan(0);
    await expect(player(early)).not.toHaveAttribute('data-player-ready');
    releaseModule();
    await early.waitForLoadState('networkidle');
    await expect(player(early)).toHaveAttribute('data-video-status', 'error');
    await expect(control(early, 'retry')).toBeVisible();
  } finally {
    releaseModule();
    await preInit.close();
  }
  const native = await open(preview, { reducedMotion: 'reduce' });
  await expect(player(native.page)).toHaveAttribute('data-video-provider', 'video');
  const video = player(native.page).locator('[data-native-video]');
  await center(native.page);
  await expect(video).not.toHaveAttribute('controls');
  await control(native.page, 'toggle').click();
  await expect.poll(() => video.evaluate((node) => !node.paused && node.readyState >= 2)).toBe(true);
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'playing');
  await control(native.page, 'toggle').click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await range(control(native.page, 'seek'), 1);
  await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeCloseTo(1, 1);
  await range(control(native.page, 'volume'), 30);
  await expect.poll(() => video.evaluate((node) => node.volume)).toBeCloseTo(.3, 2);
  await control(native.page, 'mute').click();
  await expect.poll(() => video.evaluate((node) => node.muted)).toBe(true);
  await range(control(native.page, 'seek'), 2.7);
  await control(native.page, 'toggle').click();
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'ended');
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.replayLabel);
  await range(control(native.page, 'seek'), 1);
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.playLabel);
  await expect.poll(() => video.evaluate((node) => node.paused && Math.abs(node.currentTime - 1) < .1)).toBe(true);
  await control(native.page, 'toggle').click();
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'playing');
  expect(await video.evaluate((node) => node.currentTime)).toBeGreaterThanOrEqual(1);
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'ended');
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.replayLabel);
  await control(native.page, 'toggle').click();
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'playing');
  const sourceURL = await video.locator('source').getAttribute('src');
  await native.page.route(sourceURL, (route) => route.fulfill({ status: 404, body: 'Missing media fixture' }));
  await video.locator('source').evaluate((node) => {
    node.addEventListener('error', (event) => { window.__sourceFailure = { target: event.target.tagName, bubbles: event.bubbles }; }, { once: true });
  });
  await video.evaluate((node) => { node.pause(); node.load(); });
  await expect.poll(() => native.page.evaluate(() => window.__sourceFailure)).toEqual({ target: 'SOURCE', bubbles: false });
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'error');
  await expect(control(native.page, 'retry')).toBeVisible();
  await expect(video).not.toHaveAttribute('src');
  await native.page.unroute(sourceURL);
  await control(native.page, 'retry').click();
  await expect.poll(() => video.evaluate((node) => node.readyState >= 2 && !node.error)).toBe(true);
  await expect.poll(() => video.evaluate((node) => !node.paused && node.readyState >= 2)).toBe(true);
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'playing');
  await control(native.page, 'toggle').click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'paused');
  await native.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // Defer only this race fixture; all playback/seek/ended checks above use the real decoder.
  await video.evaluate((node) => {
    window.__deferredPlayCalls = 0;
    node.play = () => { window.__deferredPlayCalls++; return new Promise((_resolve, reject) => { window.__rejectNativePlay = reject; }); };
  });
  await control(native.page, 'toggle').click();
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.pauseLabel);
  await control(native.page, 'toggle').click();
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.playLabel);
  expect(await native.page.evaluate(() => window.__deferredPlayCalls)).toBe(1);
  await native.page.evaluate(() => window.__rejectNativePlay(new DOMException('Cancelled race fixture', 'AbortError')));
  await control(native.page, 'toggle').click();
  await expect(control(native.page, 'toggle')).toHaveAccessibleName(labels.pauseLabel);
  await native.page.route(sourceURL, (route) => route.fulfill({ status: 404, body: 'Missing pending media fixture' }));
  await video.evaluate((node) => node.load());
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'error');
  await native.page.evaluate(async () => {
    window.__rejectNativePlay(new DOMException('Stale failed play fixture', 'NotSupportedError'));
    await Promise.resolve(); await Promise.resolve();
  });
  await expect(player(native.page)).toHaveAttribute('data-video-status', 'error');
  await expect(control(native.page, 'retry')).toBeVisible();
  await video.evaluate((node) => { delete node.play; });
  await native.page.unroute(sourceURL);
  expect(native.requests).toEqual([]);
  await native.context.close();
  const staticNative = await open(preview, { javaScriptEnabled: false });
  await expect(player(staticNative.page).locator('[data-video-poster]')).toHaveAttribute('href', `${cms}/api/media/file/clip.webm`);
  const nativePoster = player(staticNative.page).locator('video');
  await expect(nativePoster).toHaveAttribute('poster', '/placeholders/hero-workspace.svg');
  expect(await staticNative.page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  }, await nativePoster.getAttribute('poster')), 'Native fallback SVG poster decodes without site JavaScript').toBe(true);
  await expect(control(staticNative.page, 'controls')).toBeHidden();
  await expect(player(staticNative.page).locator('[data-native-video]')).toHaveAttribute('controls', '');
  await expect(player(staticNative.page).locator('[data-native-video]')).toBeVisible();
  await staticNative.context.close();
  fixture.hero.mediaMode = 'image';
  fixture.site.brand.logo = { id: 73, url: '/api/media/file/custom-brand.png', mimeType: 'image/png', width: 1, height: 1, alt: 'CMS brand sentinel' };
  await build('image');
  const image = await open(preview);
  await expect(player(image.page)).toHaveCount(0);
  await expect(image.page.locator('#workspace img')).toBeVisible();
  await assertPlaceholder(image.page.locator('#workspace [data-media-placeholder]'), { variant: 'hero', aspect: '8 / 5' });
  await expect(image.page.locator('#workspace video, #workspace iframe, #workspace [data-player-controls]')).toHaveCount(0);
  expect(image.requests).toEqual([]);
  await image.context.close();
  expect(errors, 'No player runtime errors').toEqual([]);
  console.log('Passed: isolated CMS YouTube/native/image builds; custom playback/replay, time/seek/keyboard, volume/mute, fullscreen callbacks, first-frame poster, consent/no-network/revocation/stale callbacks, offscreen/tab pause, reduced motion/touch, 320/390/1440px overflow and axe, edited CMS labels, actual VP8 native playback/seek/ended/nested-source 404/retry recovery and no-JS fallbacks; ended-seek resume, rapid pending play/pause, stale native play rejection, pre-init source 404, one visible toggle icon per state; image-only mode; idle/mouse/keyboard/drag/touch controls, cross-iframe pointer release recovery.');
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
  await rm(scratch, { recursive: true, force: true });
}
