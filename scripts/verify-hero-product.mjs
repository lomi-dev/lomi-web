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

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const videoRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//, async (route) => {
    videoRequests.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/iframe_api') {
      await route.fulfill({ contentType: 'text/javascript', body: `
        window.__heroVideo = { players: [] };
        window.YT = { PlayerState: { PLAYING: 1 }, Player: class {
          constructor(iframe, options) {
            this.iframe = iframe; this.events = options.events; this.calls = [];
            window.__heroVideo.players.push(this);
          }
          mute() { this.calls.push('mute'); }
          playVideo() { this.calls.push('playVideo'); }
          stopVideo() { this.calls.push('stopVideo'); }
          destroy() { this.calls.push('destroy'); this.iframe.remove(); }
        }};
        window.onYouTubeIframeAPIReady?.();
      ` });
    } else {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Mock video</title></head><body><main><h1>Mock video</h1><button type="button">Play video</button></main></body></html>' });
    }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, videoRequests };
}

async function composition(page) {
  const workspace = page.locator('.hero #workspace');
  await expect(workspace.locator('[data-video-open]')).toHaveCount(1);
  await expect(workspace.locator('[data-workspace-detail]')).toHaveCount(1);
  await expect(workspace.locator('picture img')).toHaveCount(2);
  await expect(workspace.locator('[data-workspace-detail] a, [data-workspace-detail] button')).toHaveCount(0);
  for (const image of await workspace.locator('img').all()) {
    expect(await image.evaluate(async (element) => {
      await element.decode();
      return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
    }), 'Both product images decode successfully').toBe(true);
    expect(new URL(await image.getAttribute('src'), url).origin, 'Placeholder imagery remains local').toBe(new URL(url).origin);
    await expect(image).toHaveAttribute('alt', /placeholder/i);
  }
  const geometry = await workspace.evaluate((element) => {
    const rect = (item) => { const bounds = item.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height }; };
    const desktop = element.querySelector('[data-video-open]');
    const phone = element.querySelector('[data-workspace-detail]');
    const desktopImage = desktop.querySelector('img'), phoneImage = phone.querySelector('img');
    const protectedAreas = [document.querySelector('.hero h1'), document.querySelector('.hero-actions'),
      element.querySelector('[data-video-play]'), element.querySelector('figcaption')].filter(Boolean).map(rect);
    return { desktop: rect(desktop), phone: rect(phone), composition: rect(element.querySelector('.deck-composition')),
      hero: rect(element.closest('.hero')), protectedAreas, desktopImage: rect(desktopImage), phoneImage: rect(phoneImage),
      intrinsicDesktop: desktopImage.naturalWidth / desktopImage.naturalHeight,
      intrinsicPhone: phoneImage.naturalWidth / phoneImage.naturalHeight,
      clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  const label = `${page.viewportSize().width}px`;
  expect(geometry.intrinsicDesktop, `${label}: desktop placeholder is landscape`).toBeCloseTo(8 / 5, 2);
  expect(geometry.intrinsicPhone, `${label}: phone placeholder is portrait`).toBeCloseTo(430 / 932, 2);
  expect(geometry.desktop.width / geometry.desktop.height, `${label}: desktop remains landscape`).toBeCloseTo(8 / 5, 2);
  expect(geometry.phoneImage.width / geometry.phoneImage.height, `${label}: phone screen keeps its portrait shape`).toBeCloseTo(430 / 932, 2);
  expect(geometry.phone.width / geometry.phone.height, `${label}: phone body is portrait`).toBeLessThan(.6);
  expect(geometry.desktop.width / geometry.composition.width, `${label}: landscape image leaves room for the phone`).toBeGreaterThan(.8);
  expect(geometry.desktop.width / geometry.composition.width).toBeLessThan(.96);
  expect(geometry.phone.width / geometry.composition.width, `${label}: phone stays subordinate`).toBeGreaterThan(.16);
  expect(geometry.phone.width / geometry.composition.width).toBeLessThan(.35);
  for (const [name, bounds] of [['desktop', geometry.desktop], ['phone', geometry.phone]]) {
    expect(bounds.width, `${label}: ${name} has visible geometry`).toBeGreaterThan(0);
    expect(bounds.left, `${label}: ${name} fits the left edge`).toBeGreaterThanOrEqual(-1);
    expect(bounds.right, `${label}: ${name} fits the right edge`).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(bounds.top, `${label}: ${name} fits the composition top`).toBeGreaterThanOrEqual(geometry.composition.top - 1);
    expect(bounds.bottom, `${label}: composition includes the complete ${name}`).toBeLessThanOrEqual(geometry.composition.bottom + 1);
    expect(bounds.bottom, `${label}: hero does not crop the ${name}`).toBeLessThanOrEqual(geometry.hero.bottom + 1);
  }
  expect(geometry.scrollWidth, `${label}: no document overflow`).toBe(geometry.clientWidth);
  expect(Math.min(geometry.desktop.right, geometry.phone.right) - Math.max(geometry.desktop.left, geometry.phone.left), `${label}: phone overlaps the desktop`).toBeGreaterThan(5);
  expect(Math.min(geometry.desktop.bottom, geometry.phone.bottom) - Math.max(geometry.desktop.top, geometry.phone.top)).toBeGreaterThan(10);
  for (const protectedArea of geometry.protectedAreas) {
    expect(geometry.phone.right <= protectedArea.left || geometry.phone.left >= protectedArea.right
      || geometry.phone.bottom <= protectedArea.top || geometry.phone.top >= protectedArea.bottom,
    `${label}: phone leaves heading, actions, play and caption clear`).toBe(true);
  }
  const desktopImage = workspace.locator('[data-video-open] img');
  const phoneImage = workspace.locator('[data-workspace-detail] img');
  expect(await phoneImage.getAttribute('src'), 'Phone uses a distinct placeholder').not.toBe(await desktopImage.getAttribute('src'));
  expect(await desktopImage.getAttribute('src'), 'Video loading poster retains the desktop placeholder').toBe(await page.locator('#video-dialog [data-video-poster] img').getAttribute('src'));
  await expect(workspace.locator('[data-video-open]')).toHaveAttribute('href', videoUrl);
  return geometry;
}

async function screenshotHero(page, width) {
  // Capture from the document top: locator screenshots center tall elements and
  // can otherwise paint the fixed header halfway down the exported hero.
  await page.mouse.move(0, 0);
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' }); });
  const bounds = await page.locator('.hero').boundingBox();
  await page.screenshot({ path: `artifacts/hero-product-${browserType.name()}-${width}.png`, fullPage: true,
    clip: { x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), width: bounds.width, height: Math.ceil(bounds.height) }, animations: 'disabled' });
}

async function center(page) {
  await page.locator('[data-video-open]').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

async function centeredPlay(page) {
  await expect.poll(() => page.locator('[data-video-play]').evaluate((element) => {
    const play = element.getBoundingClientRect(), image = element.closest('[data-video-open]').getBoundingClientRect();
    let opacity = 1;
    for (let parent = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
    return opacity > .9 && Math.abs(play.left + play.width / 2 - image.left - image.width / 2) < 1
      && Math.abs(play.top + play.height / 2 - image.top - image.height / 2) < 1;
  }), { message: 'Play remains centered on the full desktop image after scrolling' }).toBe(true);
}

async function keyboardAndHover(page) {
  const trigger = page.locator('[data-video-open]');
  await center(page);
  await trigger.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await center(page);
  await centeredPlay(page);
  await trigger.hover();
  await centeredPlay(page);
  await page.evaluate(() => scrollBy({ top: 60, behavior: 'instant' }));
  await centeredPlay(page);
}

async function video(page, requests, touch = false) {
  const trigger = page.locator('[data-video-open]'), modal = page.locator('#video-dialog');
  const player = modal.locator('[data-video-player]'), poster = modal.locator('[data-video-poster]'), mount = modal.locator('[data-video-mount]');
  expect(requests, 'No YouTube traffic before activation').toEqual([]);
  await expect(mount.locator('iframe')).toHaveCount(0);
  await center(page);
  if (!touch) await trigger.focus();
  await centeredPlay(page);
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY, root: document.documentElement.style.overflow, body: document.body.style.overflow }));
  if (touch) await trigger.tap();
  else await page.keyboard.press('Enter');
  await expect(modal).toBeVisible();
  await expect(player).toHaveAttribute('data-video-status', 'loading');
  await expect(poster).toHaveCSS('opacity', '1');
  await expect(mount).toHaveAttribute('inert', '');
  await expect.poll(() => page.evaluate(() => window.__heroVideo?.players.length || 0)).toBe(1);
  await page.evaluate(() => { const instance = window.__heroVideo.players[0]; instance.events.onReady({ target: instance }); });
  expect(await page.evaluate(() => window.__heroVideo.players[0].calls), 'Readiness mutes before playback').toEqual(['mute', 'playVideo']);
  await expect(player).toHaveAttribute('data-video-status', 'loading');
  await expect(poster).toHaveCSS('opacity', '1');
  await page.evaluate(() => { const instance = window.__heroVideo.players[0]; instance.events.onStateChange({ target: instance, data: 1 }); });
  await expect(player).toHaveAttribute('data-video-status', 'playing');
  await expect(mount).not.toHaveAttribute('inert');
  await modal.focus();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(mount.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.__heroVideo.players[0].calls)).toContain('destroy');
  await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY, root: document.documentElement.style.overflow, body: document.body.style.overflow })), { message: 'Video close restores exact scroll position and styles' }).toEqual(before);
}

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, `${label}: hero accessibility`).toEqual([]);
}

try {
  const run = await open();
  const geometries = [];
  for (const width of widths) {
    await run.page.setViewportSize({ width, height: width === 320 ? 568 : width < 768 ? 844 : 900 });
    const geometry = await composition(run.page);
    geometries.push({ viewportWidth: width, desktop: { width: geometry.desktop.width, height: geometry.desktop.height },
      phone: { width: geometry.phone.width, height: geometry.phone.height }, phoneTopOffset: geometry.phone.top - geometry.desktop.top,
      phoneExtension: geometry.phone.bottom - geometry.desktop.bottom, compositionHeight: geometry.composition.height });
    await keyboardAndHover(run.page);
    if ([390, 1440].includes(width)) {
      await axe(run.page, `${width}px`);
      await screenshotHero(run.page, width);
    }
  }
  await writeFile(`artifacts/hero-product-${browserType.name()}-geometry.json`, JSON.stringify(geometries, null, 2));
  await run.page.setViewportSize({ width: 1440, height: 900 });
  await video(run.page, run.videoRequests);
  await run.page.emulateMedia({ reducedMotion: 'reduce' });
  await run.page.setViewportSize({ width: 320, height: 568 });
  await composition(run.page);
  await keyboardAndHover(run.page);
  await expect(run.page.locator('[data-video-play]')).toHaveCSS('transition-duration', '0s');
  await expect(run.page.locator('[data-video-overlay]')).toHaveCSS('transition-duration', '0s');
  await axe(run.page, 'Reduced motion');
  await run.context.close();

  const touch = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await composition(touch.page);
  await center(touch.page);
  await centeredPlay(touch.page);
  await touch.page.evaluate(() => scrollBy({ top: 60, behavior: 'instant' }));
  await centeredPlay(touch.page);
  await video(touch.page, touch.videoRequests, true);
  await touch.context.close();

  const staticRun = await open({ javaScriptEnabled: false });
  for (const width of widths) {
    await staticRun.page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await composition(staticRun.page);
    await expect(staticRun.page.locator('#video-dialog')).not.toBeVisible();
  }
  await staticRun.page.locator('[data-video-open]').press('Enter');
  await expect(staticRun.page).toHaveURL(videoUrl);
  await expect(staticRun.page.getByRole('heading', { name: 'Mock video' })).toBeVisible();
  await staticRun.context.close();
  expect(errors, 'No runtime errors in hero-product scenarios').toEqual([]);
  console.log(`Passed (${browserType.name()}): landscape desktop + portrait phone at 320/390/640/768/1024/1440/1920, decoded local placeholders/poster consistency, complete overlap geometry and no overflow, protected copy/actions/play, keyboard/hover/touch centered play after scrolling, loading poster/playback/Escape/focus/scroll restoration, reduced motion, no-JS composition/YouTube fallback and hero axe.`);
} finally {
  await browser.close();
}
