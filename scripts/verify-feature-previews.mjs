import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertPlaceholder, startStaticPreview } from './verify-placeholders.mjs';

const { origin, close } = await startStaticPreview();
const browser = await chromium.launch();
const errors = [];
const kinds = ['terminal', 'panels', 'code', 'expand', 'git', 'spark'];
const scenes = (page) => page.locator('[data-feature-card] [data-feature-preview]');
const dialog = (page) => page.locator('#feature-dialog');
async function motion(scene, expected) {
  await expect.poll(() => scene.evaluate((element) => element.hasAttribute('data-preview-running')), {
    message: expected ? 'Visible app capture starts' : 'Unavailable app capture stops', timeout: 5000,
  }).toBe(expected);
  const gif = scene.locator('[data-feature-gif]');
  if (expected) {
    await expect(gif).toHaveAttribute('src', /\.gif(?:\?|$)/);
    await expect.poll(() => gif.evaluate((image) => image.complete && image.naturalWidth > 0), {
      message: 'Visible animated app capture loads', timeout: 5000,
    }).toBe(true);
    await expect(scene).toHaveAttribute('data-preview-ready', '');
  } else {
    await expect.poll(() => gif.getAttribute('src'), { message: 'Unavailable GIF source is released' }).toBeNull();
    await expect(scene).not.toHaveAttribute('data-preview-ready');
  }
}
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', ...options });
  await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })));
  await context.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await context.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//, (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  return { context, page };
}

await mkdir('artifacts', { recursive: true });
try {
  const { context, page } = await open();
  await expect(page.locator('[data-feature-gallery]')).toHaveAttribute('data-feature-ready', 'true');
  const cards = scenes(page);
  await expect(cards).toHaveCount(6);
  assert.deepEqual(await cards.evaluateAll((elements) => elements.map((element) => element.dataset.featurePreview)), kinds);
  await expect(page.locator('[data-preview-toggle]')).toHaveCount(0);
  // Start above Features, then exercise each independently visible app capture.
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  for (const scene of await cards.all()) await motion(scene, false);
  for (let index = 0; index < kinds.length; index++) {
    const scene = cards.nth(index);
    await assertPlaceholder(scene, { variant: 'feature', aspect: '8 / 5' });
    await motion(scene, true);
    await scene.screenshot({ path: `artifacts/feature-preview-${kinds[index]}-card.png`, animations: 'allow' });
  }
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#features').screenshot({ path: `artifacts/feature-previews-${width}.png`, animations: 'allow' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
  for (let index = 0; index < kinds.length; index++) {
    await page.locator(`[data-feature-open="${index}"]`).click();
    await expect(dialog(page)).toBeVisible();
    const active = dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-preview]');
    await expect(active).toHaveAttribute('data-feature-preview', kinds[index]);
    await assertPlaceholder(active, { variant: 'feature', aspect: '8 / 5' });
    await motion(active, true);
    for (const scene of await cards.all()) await motion(scene, false);
    for (const scene of await dialog(page).locator('[data-feature-slide][hidden] [data-feature-preview]').all()) await motion(scene, false);
    await active.screenshot({ path: `artifacts/feature-preview-${kinds[index]}-dialog.png`, animations: 'allow' });
    await dialog(page).locator('[data-feature-close]').click();
    await expect(dialog(page)).not.toBeVisible();
    await motion(dialog(page).locator('[data-feature-slide]').nth(index).locator('[data-feature-preview]'), false);
  }

  await cards.first().scrollIntoViewIfNeeded();
  await motion(cards.first(), true);
  // Exercise the real browser visibility lifecycle using a second foreground tab.
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  if (await page.evaluate(() => document.hidden)) {
    for (const scene of await cards.all()) await motion(scene, false);
    await page.bringToFront();
    await motion(cards.first(), true);
  } else {
    // Headless Chromium keeps all tabs visible; trigger the documented lifecycle
    // with the browser's read-only visibility state represented in this fixture.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    for (const scene of await cards.all()) await motion(scene, false);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await motion(cards.first(), true);
  }
  await other.close();
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  for (const scene of await cards.all()) await motion(scene, false);
  await cards.first().scrollIntoViewIfNeeded();
  await motion(cards.first(), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const scene of await cards.all()) await motion(scene, false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await motion(cards.first(), true);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#features').screenshot({ path: `artifacts/feature-previews-${width}.png`, animations: 'allow' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
  await context.close();

  for (const options of [{ javaScriptEnabled: false }, { reducedMotion: 'reduce' }]) {
    const fallback = await open(options);
    for (const scene of await scenes(fallback.page).all()) {
      await assertPlaceholder(scene, { variant: 'feature', aspect: '8 / 5' });
      await motion(scene, false);
    }
    await expect(fallback.page.locator('[data-preview-toggle]')).toHaveCount(0);
    await fallback.context.close();
  }
  assert.deepEqual(errors, [], 'No feature-preview runtime errors');
  console.log('Passed: six local animated app captures; visible-card and active-dialog loading; offscreen, hidden slide, modal backdrop, closed dialog and document visibility pausing; reduced-motion and no-JS poster fallbacks; 320/1440px screenshots and overflow.');
} finally { await browser.close(); await close(); }
