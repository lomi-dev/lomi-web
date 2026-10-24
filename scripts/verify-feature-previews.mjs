import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertPlaceholder, startStaticPreview } from './verify-placeholders.mjs';

const { origin, close } = await startStaticPreview();
const siteOrigin = new URL(origin).origin;
const browser = await chromium.launch();
const errors = [];
const kinds = ['terminal', 'panels', 'code', 'expand', 'git', 'spark'];
const scenes = (page) => page.locator('[data-feature-card] [data-feature-preview]');
const dialog = (page) => page.locator('#feature-dialog');

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })));
  await context.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await context.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//, (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\.gif(?:\?|$)/i.test(request.url())) errors.push(`Unexpected animated feature capture request: ${request.url()}`);
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  return { context, page };
}

async function decodedImages(scene) {
  return scene.evaluate(async (root) => {
    const images = [...root.querySelectorAll('img')];
    await Promise.all(images.map((image) => image.decode()));
    return images.map((image) => ({
      source: image.getAttribute('src'),
      alt: image.getAttribute('alt'),
      width: image.naturalWidth,
      height: image.naturalHeight,
      complete: image.complete,
      featurePoster: image.hasAttribute('data-feature-poster'),
      desktop: image.classList.contains('feature-desktop'),
    }));
  });
}

async function withinViewport(scene) {
  await scene.evaluate((root) => root.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  const bounds = await scene.evaluate((root) => {
    const { left, right, top, bottom, width, height } = root.getBoundingClientRect();
    return { left, right, top, bottom, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(bounds.width > 0 && bounds.height > 0, `Feature capture has visible bounds: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.left >= -2 && bounds.right <= bounds.viewportWidth + 2, `Feature capture stays inside viewport width: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.top >= -2 && bounds.bottom <= bounds.viewportHeight + 2, `Feature capture stays inside viewport height: ${JSON.stringify(bounds)}`);
  return bounds;
}

async function settleDialog(page) {
  await expect.poll(() => dialog(page).evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => ['running', 'paused'].includes(animation.playState)).length),
  { message: 'Feature dialog and slide motion settles before measuring capture geometry' }).toBe(0);
}

async function checkSlide(page, index, sources) {
  await settleDialog(page);
  const active = dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-preview]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-feature-preview', kinds[index]);
  await assertPlaceholder(active, { variant: 'feature', aspect: '8 / 5' });
  const images = await decodedImages(active);
  const poster = images.find((image) => image.featurePoster);
  assert.equal(poster?.source, sources[kinds[index]], `Dialog keeps the ${kinds[index]} capture`);
  await withinViewport(active);
}

await mkdir('artifacts', { recursive: true });
try {
  const { context, page } = await open({ reducedMotion: 'no-preference' });
  await expect(page.locator('[data-feature-gallery]')).toHaveAttribute('data-feature-ready', 'true');
  const cards = scenes(page);
  await expect(cards).toHaveCount(6);
  assert.deepEqual(await cards.evaluateAll((elements) => elements.map((element) => element.dataset.featurePreview)), kinds);
  await expect(page.locator('[data-preview-toggle]')).toHaveCount(0);

  const sources = {};
  let wallpaperSource;
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let index = 0; index < kinds.length; index++) {
      const scene = cards.nth(index);
      await scene.scrollIntoViewIfNeeded();
      await assertPlaceholder(scene, { variant: 'feature', aspect: '8 / 5' });
      await withinViewport(scene);
      const images = await decodedImages(scene);
      const poster = images.find((image) => image.featurePoster);
      const desktop = images.find((image) => image.desktop);
      const detail = images.find((image) => !image.featurePoster && !image.desktop);
      assert.ok(poster && desktop, `${kinds[index]} has an app capture and Tahoe wallpaper`);
      assert.ok(detail, `${kinds[index]} has a magnified detail image`);
      assert.equal(detail.source, poster.source, `${kinds[index]} detail enlarges the same app capture`);
      assert.ok(poster.complete && poster.width >= 2880 && poster.height >= 1800,
        `${kinds[index]} decodes at retina dimensions: ${JSON.stringify(poster)}`);
      assert.ok(desktop.complete && desktop.width > 0 && desktop.height > 0,
        `${kinds[index]} wallpaper is decoded: ${JSON.stringify(desktop)}`);
      const posterUrl = new URL(poster.source, origin);
      const desktopUrl = new URL(desktop.source, origin);
      assert.equal(posterUrl.origin, siteOrigin, `${kinds[index]} app capture is served locally`);
      assert.equal(desktopUrl.origin, siteOrigin, `${kinds[index]} wallpaper is served locally`);
      assert.match(posterUrl.pathname, /\.webp$/i, `${kinds[index]} app capture is a still WebP`);
      assert.match(desktopUrl.pathname, /tahoe-light[^/]*\.webp$/i, 'Wallpaper is the local Tahoe still');
      assert.equal(images.length, 3, `${kinds[index]} renders wallpaper, app window and detail`);
      assert.ok(images.every((image) => image.complete && image.width > 0 && image.height > 0),
        `${kinds[index]} fully decodes all still imagery: ${JSON.stringify(images)}`);
      assert.ok(images.every((image) => !/\.gif(?:\?|$)/i.test(image.source ?? '')),
        `${kinds[index]} contains no animated capture source`);
      await expect(scene.locator('a, button, input, select, textarea, video, iframe, [tabindex]')).toHaveCount(0);
      sources[kinds[index]] = poster.source;
      wallpaperSource ??= desktop.source;
      assert.equal(desktop.source, wallpaperSource, 'All feature scenes use the same local Tahoe wallpaper');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
      `Feature gallery has no horizontal overflow at ${width}px`);
    if ([320, 1440].includes(width)) {
      await page.locator('#features').screenshot({ path: `artifacts/feature-previews-${width}.png` });
    }
  }
  assert.equal(new Set(Object.values(sources)).size, kinds.length, 'Each feature uses a different local app capture');

  // Each card opens its matching local capture in the native dialog.
  for (let index = 0; index < kinds.length; index++) {
    await page.locator(`[data-feature-open="${index}"]`).click();
    await expect(dialog(page)).toBeVisible();
    await checkSlide(page, index, sources);
    await dialog(page).locator('[data-feature-close]').click();
    await expect(dialog(page)).not.toBeVisible();
  }

  // Arrow and dot navigation still select the corresponding still capture.
  await page.locator('[data-feature-open="0"]').click();
  await checkSlide(page, 0, sources);
  for (let index = 1; index < kinds.length; index++) {
    await dialog(page).locator('[data-feature-next]').click();
    await checkSlide(page, index, sources);
  }
  await dialog(page).locator('[data-feature-next]').click();
  await checkSlide(page, 0, sources);
  await dialog(page).locator('[data-feature-prev]').click();
  await checkSlide(page, 5, sources);
  await dialog(page).locator('[data-feature-dot="2"]').click();
  await checkSlide(page, 2, sources);
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();

  // Stacked tablet and short desktop dialogs constrain the app window to the
  // available height while keeping the full capture inside its clipped root.
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 768, height: 700 },
    { width: 1440, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('[data-feature-open="0"]').click();
    await checkSlide(page, 0, sources);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width,
      `Open feature dialog has no overflow at ${viewport.width}x${viewport.height}`);
    await dialog(page).locator('[data-feature-close]').click();
    await expect(dialog(page)).not.toBeVisible();
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-feature-open="0"]').click();
  await checkSlide(page, 0, sources);
  await dialog(page).locator('[data-feature-next]').click();
  await checkSlide(page, 1, sources);
  assert.deepEqual(await cards.evaluateAll((elements) => elements.map((element) => element.getAnimations({ subtree: true }).length)),
    Array(kinds.length).fill(0), 'Static captures do not animate with reduced motion');
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();
  await context.close();

  const fallback = await open({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width: 320, height: 700 } });
  await expect(fallback.page.locator('[data-feature-gallery]')).not.toHaveAttribute('data-feature-ready', 'true');
  await expect(scenes(fallback.page)).toHaveCount(6);
  for (let index = 0; index < kinds.length; index++) {
    const scene = scenes(fallback.page).nth(index);
    await scene.scrollIntoViewIfNeeded();
    await assertPlaceholder(scene, { variant: 'feature', aspect: '8 / 5' });
    const poster = (await decodedImages(scene)).find((image) => image.featurePoster);
    assert.equal(poster.source, sources[kinds[index]], `${kinds[index]} remains available without JavaScript`);
    await expect(fallback.page.locator(`#feature-description-${index}`)).toBeVisible();
  }
  assert.equal(await fallback.page.evaluate(() => document.documentElement.scrollWidth), 320, 'No-JS feature gallery has no mobile overflow');
  await expect(fallback.page.locator('#feature-dialog')).not.toBeVisible();
  await fallback.context.close();

  assert.deepEqual(errors, [], 'No feature-capture runtime errors or animated asset requests');
  console.log('Passed: six unique local 2880x1800 WebP captures over one decoded Tahoe wallpaper; centered 80% app windows and clipped magnified details; bounded capture geometry and no page overflow at 320/390/768/1440/1920px; native dialog opening, arrows, dots, closing and reduced-motion navigation; no-JS static captures.');
} finally {
  await browser.close();
  await close();
}
