import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322/';
const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
const browser = await browserType.launch();
const errors = [];
const widths = [320, 390, 640, 768, 1024, 1440, 1920];
await mkdir('artifacts', { recursive: true });

async function open({ consent = true, apiFailure = false, embedFailure = false, fastReadyTimeout = false, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  if (consent) await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  if (fastReadyTimeout) await context.addInitScript(() => {
    const setTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => setTimeout(callback, delay === 15000 ? 250 : delay, ...args);
  });
  const page = await context.newPage();
  const requests = [];
  const mock = { apiFailure };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//, async (route) => {
    requests.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/iframe_api') {
      if (mock.apiFailure) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: `
        window.__heroVideo ||= { players: [] };
        window.YT = { Player: class {
          constructor(iframe, options) {
            this.iframe = iframe; this.events = options.events; this.calls = [];
            window.__heroVideo.players.push(this);
          }
          mute() { this.calls.push('mute'); }
          playVideo() { this.calls.push('playVideo'); }
          pauseVideo() { this.calls.push('pauseVideo'); }
          destroy() { this.calls.push('destroy'); this.iframe.remove(); }
        }};
        window.onYouTubeIframeAPIReady?.();
      ` });
    }
    if (embedFailure && new URL(route.request().url()).pathname.startsWith('/embed/')) return route.abort();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Mock video</title></head><body><main><h1>Mock video</h1><button type="button">Play video</button><label>Volume<input aria-label="Volume" type="range" min="0" max="100" value="0"></label><button type="button">Fullscreen</button></main></body></html>' });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, requests, mock };
}

async function composition(page) {
  const workspace = page.locator('.hero #workspace');
  await expect(workspace).toHaveClass('workspace-showcase');
  await expect(page.locator('#video-dialog, [data-video-open], [data-video-play], [data-workspace-detail], .deck-detail, [data-video-notice], [data-video-allow], [data-video-retry]')).toHaveCount(0);
  await expect(workspace.locator('img')).toHaveCount(1);
  const image = workspace.locator('[data-video-poster] img');
  expect(await image.evaluate(async (element) => { await element.decode(); return element.complete && element.naturalWidth > 0; })).toBe(true);
  expect(new URL(await image.getAttribute('src'), url).origin, 'Poster remains local').toBe(new URL(url).origin);
  await expect(image).toHaveAttribute('alt', /placeholder/i);
  const geometry = await workspace.evaluate((element) => {
    const rect = (item) => { const b = item.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    return { showcase: rect(element), player: rect(element.querySelector('[data-video-player]')), hero: rect(element.closest('.hero')),
      gallery: rect(document.querySelector('.gallery-shell')), actions: rect(document.querySelector('.hero-actions')), clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  const { showcase, player, actions, hero, gallery } = geometry;
  expect(player.height).toBeGreaterThanOrEqual(200);
  expect(player.width).toBeGreaterThan(200);
  expect(player.height).toBeCloseTo(Math.max(200, player.width * 5 / 8), 0);
  expect(player.left, 'Hero and features share their content edges').toBeCloseTo(gallery.left, 0);
  expect(player.right).toBeCloseTo(gallery.right, 0);
  expect(player.top).toBeCloseTo(showcase.top, 0);
  expect(player.bottom, 'No bar or empty space remains below the player').toBeCloseTo(showcase.bottom, 0);
  expect(player.height).toBeCloseTo(showcase.height, 0);
  expect(showcase.top).toBeGreaterThanOrEqual(actions.bottom);
  expect(showcase.bottom).toBeLessThanOrEqual(hero.bottom + 1);
  expect(showcase.left).toBeGreaterThanOrEqual(0);
  expect(showcase.right).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  return geometry;
}

const root = (page) => page.locator('[data-hero-video]');
const emit = (page, name, data, index = 0) => page.evaluate(({ name, data, index }) => {
  const instance = window.__heroVideo.players[index];
  instance.events[name]?.({ target: instance, data });
}, { name, data, index });
const calls = (page, index = 0) => page.evaluate((index) => window.__heroVideo.players[index].calls, index);
async function center(page) {
  await page.locator('[data-video-player]').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect.poll(() => page.locator('[data-video-player]').evaluate((element) => {
    const b = element.getBoundingClientRect();
    return Math.max(0, Math.min(innerHeight, b.bottom) - Math.max(0, b.top)) / b.height;
  })).toBeGreaterThanOrEqual(.5);
}
async function mounted(page) {
  const iframe = root(page).locator('iframe');
  await expect(iframe).toHaveCount(1);
  await expect(root(page).locator('[data-video-poster]')).toHaveCSS('visibility', 'hidden');
  await expect(root(page).locator('[data-video-mount]')).not.toHaveAttribute('inert');
  await expect(iframe).toHaveAttribute('title', 'Lomi product walkthrough');
  await expect(iframe).toHaveAttribute('allowfullscreen', '');
  const source = new URL(await iframe.getAttribute('src'));
  expect(source.hostname).toBe('www.youtube-nocookie.com');
  for (const [key, value] of Object.entries({ autoplay: '0', controls: '1', playsinline: '1', enablejsapi: '1' })) expect(source.searchParams.get(key)).toBe(value);
  const frame = page.frameLocator('[data-video-mount] iframe');
  await expect(frame.getByRole('button', { name: 'Play video' })).toBeVisible();
  const volume = frame.getByRole('slider', { name: 'Volume' });
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('1');
  await expect(frame.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]), 'Inline player does not lock document scrolling').not.toContain('hidden');
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, `${label}: hero accessibility`).toEqual([]);
}
async function revoke(page) {
  await page.evaluate(() => {
    const newValue = JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() });
    localStorage.setItem('lomi.cookie-consent', newValue);
    dispatchEvent(new StorageEvent('storage', { key: 'lomi.cookie-consent', newValue, storageArea: localStorage }));
  });
}

try {
  const run = await open({ consent: false });
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'consent');
  expect(run.requests, 'No YouTube traffic without consent').toEqual([]);
  const geometries = [];
  for (const width of widths) {
    await run.page.setViewportSize({ width, height: width === 320 ? 568 : width < 768 ? 844 : 900 });
    geometries.push({ viewportWidth: width, ...await composition(run.page) });
    if ([390, 1440].includes(width)) {
      await axe(run.page, `${width}px`);
      await run.page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await run.page.locator('.hero').screenshot({ path: `artifacts/hero-product-${browserType.name()}-${width}.png`, animations: 'disabled' });
    }
  }
  await writeFile(`artifacts/hero-product-${browserType.name()}-geometry.json`, JSON.stringify(geometries, null, 2));
  expect(run.requests).toEqual([]);
  await run.page.setViewportSize({ width: 1440, height: 900 });
  await run.page.locator('[data-cookie-reject]:visible').click();
  await root(run.page).locator('[data-video-poster]').click();
  await expect(run.page.locator('#cookie-preferences')).toBeVisible();
  expect(run.requests, 'Opening global preferences does not grant media consent').toEqual([]);
  await run.page.locator('#cookie-external-media').check();
  await run.page.locator('[data-cookie-save]').click();
  await expect(root(run.page).locator('iframe')).toBeFocused();
  await mounted(run.page);
  await center(run.page);
  await emit(run.page, 'onReady');
  await expect.poll(() => calls(run.page)).toEqual(['mute', 'playVideo']);
  // YouTube can report PLAYING after an autoplay request has left view.
  await run.page.locator('.site-footer').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect.poll(() => calls(run.page)).toContain('pauseVideo');
  const offscreenPauses = (await calls(run.page)).filter((call) => call === 'pauseVideo').length;
  await emit(run.page, 'onStateChange', 1);
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'paused');
  expect((await calls(run.page)).filter((call) => call === 'pauseVideo')).toHaveLength(offscreenPauses + 1);
  await center(run.page);
  expect((await calls(run.page)).filter((call) => call === 'playVideo')).toHaveLength(1);
  // A late PLAYING event must also remain paused after the tab is hidden.
  await run.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenPauses = (await calls(run.page)).filter((call) => call === 'pauseVideo').length;
  expect(hiddenPauses).toBeGreaterThan(offscreenPauses + 1);
  await emit(run.page, 'onStateChange', 1);
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'paused');
  expect((await calls(run.page)).filter((call) => call === 'pauseVideo')).toHaveLength(hiddenPauses + 1);
  await run.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  expect((await calls(run.page)).filter((call) => call === 'playVideo')).toHaveLength(1);
  // Native manual playback is valid while some, but less than half, is visible.
  await run.page.locator('[data-video-player]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    scrollTo({ top: scrollY + bounds.top + bounds.height * .75, behavior: 'instant' });
  });
  await expect.poll(() => run.page.locator('[data-video-player]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)) / bounds.height;
  })).toBeLessThan(.5);
  // Wait for the IntersectionObserver notification that records partial visibility.
  await run.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const partialPauses = (await calls(run.page)).filter((call) => call === 'pauseVideo').length;
  await emit(run.page, 'onStateChange', 1);
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'playing');
  expect((await calls(run.page)).filter((call) => call === 'pauseVideo')).toHaveLength(partialPauses);
  await center(run.page);
  await emit(run.page, 'onStateChange', 2);
  await run.page.locator('.site-footer').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await center(run.page);
  expect((await calls(run.page)).filter((call) => call === 'playVideo')).toHaveLength(1);
  await emit(run.page, 'onError');
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'error');
  await expect(root(run.page).locator('iframe')).toBeVisible();
  await expect(root(run.page).locator('[data-video-poster]')).toHaveCSS('visibility', 'hidden');
  await root(run.page).locator('iframe').focus();
  await revoke(run.page);
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'consent');
  await expect(root(run.page).locator('iframe')).toHaveCount(0);
  await expect(run.page.locator('script[src="https://www.youtube.com/iframe_api"]')).toHaveCount(0);
  await expect(root(run.page).locator('[data-video-poster]')).toBeVisible();
  await expect(root(run.page).locator('[data-video-poster]')).toBeFocused();
  expect(await calls(run.page)).toContain('destroy');
  await emit(run.page, 'onReady');
  await emit(run.page, 'onStateChange', 1);
  await emit(run.page, 'onError');
  await expect(root(run.page)).toHaveAttribute('data-video-status', 'consent');
  await run.context.close();

  const remembered = await open();
  await expect(root(remembered.page).locator('iframe')).not.toBeFocused();
  await mounted(remembered.page);
  expect(remembered.requests.some((request) => request.includes('/iframe_api'))).toBe(true);
  await remembered.context.close();

  const reduced = await open({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await composition(reduced.page);
  await mounted(reduced.page);
  await center(reduced.page);
  await emit(reduced.page, 'onReady');
  expect(await calls(reduced.page)).toEqual(['mute']);
  await expect(root(reduced.page).locator('.video-loading')).toHaveCSS('animation-name', 'none');
  await axe(reduced.page, 'Touch and reduced motion');
  await reduced.context.close();

  const failure = await open({ apiFailure: true });
  await expect(root(failure.page)).toHaveAttribute('data-video-status', 'error');
  await expect(root(failure.page).locator('[data-video-poster]')).toBeVisible();
  await expect(root(failure.page).locator('iframe')).toHaveCount(0);
  await expect(root(failure.page).locator('[data-video-poster]')).toHaveAttribute('href', videoUrl);
  failure.mock.apiFailure = false;
  await failure.page.reload({ waitUntil: 'networkidle' });
  await expect(root(failure.page).locator('iframe')).not.toBeFocused();
  await mounted(failure.page);
  await failure.context.close();

  // An available API does not prove the iframe itself has loaded successfully.
  const stalled = await open({ embedFailure: true, fastReadyTimeout: true });
  await expect(root(stalled.page)).toHaveAttribute('data-video-status', 'error');
  await expect(root(stalled.page).locator('[data-video-notice], [data-video-allow], [data-video-retry]')).toHaveCount(0);
  await expect(root(stalled.page).locator('iframe')).toBeVisible();
  await expect(root(stalled.page).locator('[data-video-poster]')).toHaveCSS('visibility', 'hidden');
  await emit(stalled.page, 'onReady');
  await expect(root(stalled.page)).toHaveAttribute('data-video-status', 'ready');
  await stalled.context.close();

  const staticRun = await open({ javaScriptEnabled: false });
  for (const width of widths) {
    await staticRun.page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await composition(staticRun.page);
    await expect(root(staticRun.page).locator('[data-video-poster]')).toBeVisible();
    await expect(root(staticRun.page).locator('iframe')).toHaveCount(0);
  }
  expect(staticRun.requests).toEqual([]);
  const fallback = root(staticRun.page).locator('[data-video-poster]');
  await expect(fallback).toHaveAttribute('href', videoUrl);
  const popupPromise = staticRun.page.waitForEvent('popup');
  await fallback.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(videoUrl);
  await staticRun.context.close();
  expect(errors, 'No runtime errors in inline hero scenarios').toEqual([]);
  console.log(`Passed (${browserType.name()}): one aligned player at seven widths, local poster/no-JS fallback, consent-gated traffic and remembered initialization, immediately visible native controls/volume/fullscreen, mute before autoplay, offscreen/hidden delayed-PLAYING protection, partial-view manual playback and no auto-resume, reduced motion/touch, API failure/reload recovery, stalled-iframe timeout/late readiness, native-error visibility, revocation/stale callbacks, and hero axe.`);
} finally {
  await browser.close();
}
