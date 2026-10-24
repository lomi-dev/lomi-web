import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browser = await (process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium).launch();
const viewports = [
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
  { width: 844, height: 390 }, { width: 1440, height: 500 },
  { width: 320, height: 320 }, { width: 320, height: 200 },
];
await mkdir('artifacts', { recursive: true });

async function openPage(options = {}, canvasUnavailable = false) {
  const context = await browser.newContext({ viewport: viewports[0], ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  await context.addInitScript((unavailable) => {
    window.__footerPaints = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('[data-footer-wordmark-canvas]')) window.__footerPaints++;
      return clear.apply(this, args);
    };
    if (unavailable) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (this.matches('[data-footer-wordmark-canvas]')) return null;
        return getContext.apply(this, args);
      };
    }
  }, canvasUnavailable);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

async function showFooter(page) {
  await page.locator('.site-footer').evaluate((element) => {
    scrollTo({ top: scrollY + element.getBoundingClientRect().top, behavior: 'instant' });
  });
}

async function assertLayoutAndKeyboard(page, sizes = viewports) {
  const footer = page.locator('.site-footer');
  const links = footer.locator('a[href]');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await showFooter(page);
    const bounds = await footer.boundingBox();
    expect(Math.abs(bounds.height - size.height), `${size.width}×${size.height}: one viewport tall`).toBeLessThanOrEqual(1);
    expect(bounds.width).toBe(size.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'No horizontal overflow').toBe(size.width);
    await links.first().focus();
    for (let index = 0; index < await links.count(); index++) {
      const link = links.nth(index);
      await expect(link).toBeFocused();
      await link.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
      await expect.poll(() => link.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        let left = 0, top = document.querySelector('.site-header').getBoundingClientRect().bottom;
        let right = document.documentElement.clientWidth, bottom = innerHeight;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, box.left + parent.clientLeft);
            right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, box.top + parent.clientTop);
            bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight);
          }
        }
        return rect.width > 0 && rect.height > 0 && rect.left >= left - 1 && rect.right <= right + 1
          && rect.top >= top - 1 && rect.bottom <= bottom + 1;
      }), { message: `Link ${index + 1} stays visible at ${size.width}×${size.height}` }).toBe(true);
      if (index + 1 < await links.count()) await page.keyboard.press('Tab');
    }
  }
}

async function pixels(page) {
  return page.locator('[data-footer-wordmark-canvas]').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0, hash = 2166136261;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3]) ink++;
      hash = Math.imul(hash ^ data[index], 16777619);
      hash = Math.imul(hash ^ data[index + 3], 16777619);
    }
    return { ink, hash, corner: data[3] };
  });
}

async function assertIdle(page) {
  await expect.poll(async () => {
    const before = await page.evaluate(() => window.__footerPaints);
    await page.waitForTimeout(200);
    return await page.evaluate(() => window.__footerPaints) === before;
  }, { timeout: 6000, message: 'Canvas stops drawing after motion settles' }).toBe(true);
}

async function resetFooter(page) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.querySelector('.footer-frame').scrollTop = 0;
  });
  await showFooter(page);
}

try {
  const { context, page, errors } = await openPage();
  const wordmark = page.locator('[data-footer-wordmark]');
  await expect(wordmark).not.toHaveAttribute('data-wordmark-ready', 'true');
  expect(await page.evaluate(() => window.__footerPaints), 'No drawing before entry').toBe(0);
  await expect(page.locator('html'), 'White canvas at the top matches the hero').toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body'), 'Page content keeps its own chalk surface').toHaveCSS('background-color', 'rgb(247, 248, 243)');
  await showFooter(page);
  await expect(page.locator('html'), 'Native overscroll canvas matches the footer').toHaveCSS('background-color', await page.locator('.site-footer').evaluate((element) => getComputedStyle(element).backgroundColor));
  await expect(page.locator('html'), 'Firefox requires a solid canvas color').toHaveCSS('background-image', 'none');
  await expect(page.locator('html'), 'Homepage vertical edge scrolling is contained through the footer').toHaveCSS('overscroll-behavior-y', 'none');
  await expect(wordmark).toHaveAttribute('data-wordmark-ready', 'true');
  await page.waitForTimeout(1000);
  await assertIdle(page);
  const base = await pixels(page);
  expect(base.ink, 'Wordmark contains visible dots').toBeGreaterThan(2000);
  expect(base.corner, 'Canvas preserves the footer background').toBe(0);
  const art = await wordmark.boundingBox();
  const scale = Math.min(art.width / 491, art.height / 202);
  const point = { x: art.x + (art.width - 491 * scale) / 2 + 140 * scale,
    y: art.y + (art.height - 202 * scale) / 2 + 78 * scale };
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(180);
  expect((await pixels(page)).hash, 'Pointer visibly parts the dots').not.toBe(base.hash);
  await page.screenshot({ path: 'artifacts/footer-wow-hover.png' });
  await page.mouse.click(point.x, point.y);
  const pressed = (await pixels(page)).hash;
  await page.waitForTimeout(160);
  expect((await pixels(page)).hash, 'Click sends a travelling ripple').not.toBe(pressed);
  await page.mouse.move(0, 80);
  await assertIdle(page);
  expect((await pixels(page)).hash, 'Dots return exactly to their original shape').toBe(base.hash);
  await page.screenshot({ path: 'artifacts/footer-wow-desktop.png' });

  await page.mouse.move(point.x, point.y);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(200);
  await expect(page.locator('html'), 'Returning to the top restores the white canvas').toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await assertIdle(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showFooter(page);
  await expect(wordmark).not.toHaveAttribute('data-wordmark-ready', 'true');
  await expect(page.locator('.footer-wordmark-source')).toHaveCSS('visibility', 'visible');
  await assertIdle(page);
  await page.screenshot({ path: 'artifacts/footer-wow-reduced-motion.png' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(wordmark).toHaveAttribute('data-wordmark-ready', 'true');
  await assertLayoutAndKeyboard(page);
  await page.setViewportSize(viewports[0]);
  await resetFooter(page);
  const a11y = await new AxeBuilder({ page }).include('.site-footer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations, 'Footer WCAG checks').toEqual([]);

  await page.locator('.footer-invitation h2').evaluate((element) => { element.textContent = 'Keep the project in view, with room for every idea. '.repeat(12); });
  await assertLayoutAndKeyboard(page, [{ width: 320, height: 400 }]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.footer-navigation').evaluate((navigation) => {
    const groups = [...navigation.children];
    groups.forEach((group) => {
      const list = group.querySelector('ul');
      [...list.children].forEach((item) => list.append(item.cloneNode(true)));
      navigation.append(group.cloneNode(true));
    });
  });
  await assertLayoutAndKeyboard(page, [{ width: 320, height: 400 }]);
  expect(errors).toEqual([]);
  await context.close();

  for (const options of [{ javaScriptEnabled: false }, { reducedMotion: 'reduce' }]) {
    const fallback = await openPage(options);
    await assertLayoutAndKeyboard(fallback.page);
    await expect(fallback.page.locator('html'), 'Footer canvas also matches with scripts disabled or reduced motion').toHaveCSS('background-color', 'rgb(200, 255, 61)');
    await expect(fallback.page.locator('.footer-wordmark-source')).toHaveCSS('visibility', 'visible');
    const back = fallback.page.locator('.footer-takeoff');
    await back.click();
    await expect(fallback.page).toHaveURL(new URL('/#top', url).href);
    expect(fallback.errors).toEqual([]);
    await fallback.context.close();
  }

  const unavailable = await openPage({}, true);
  await showFooter(unavailable.page);
  await unavailable.page.waitForTimeout(250);
  await expect(unavailable.page.locator('[data-footer-wordmark]')).not.toHaveAttribute('data-wordmark-ready', 'true');
  await expect(unavailable.page.locator('.footer-wordmark-source')).toHaveCSS('visibility', 'visible');
  expect(unavailable.errors).toEqual([]);
  await unavailable.context.close();

  const mobile = await openPage({ viewport: viewports[2], hasTouch: true });
  await showFooter(mobile.page);
  // Authored navigation can place the artwork below the footer's scrollport.
  // Exercise its lazy canvas only after the artwork itself becomes visible.
  await mobile.page.locator('[data-footer-wordmark]').scrollIntoViewIfNeeded();
  await expect(mobile.page.locator('[data-footer-wordmark]')).toHaveAttribute('data-wordmark-ready', 'true');
  await mobile.page.waitForTimeout(1000);
  await assertIdle(mobile.page);
  const mobilePixels = await pixels(mobile.page);
  expect(await mobile.page.locator('[data-footer-wordmark]').evaluate((element) => element.dispatchEvent(new PointerEvent('pointerdown', {
    pointerType: 'touch', bubbles: true, cancelable: true, clientX: 100, clientY: 620,
  }))), 'Touch scrolling is never prevented').toBe(true);
  await mobile.page.waitForTimeout(250);
  expect((await pixels(mobile.page)).hash, 'Touch does not trigger pointer effects').toBe(mobilePixels.hash);
  await mobile.page.screenshot({ path: 'artifacts/footer-wow-mobile.png' });
  const mobileA11y = await new AxeBuilder({ page: mobile.page }).include('.site-footer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobileA11y.violations).toEqual([]);
  expect(mobile.errors).toEqual([]);
  await mobile.context.close();
  console.log('Passed: footer layout and keyboard at 8 viewports with JS, without JS and reduced motion; solid lime overscroll canvas with light top restoration and opaque page surface; long CMS copy and 4×8 links; lazy entry, visible pointer/ripple effects, exact spring return, idle/offscreen pause, live motion preference, transparent canvas and Canvas 2D fallback; touch gating; desktop/mobile WCAG checks.');
} finally {
  await browser.close();
}
