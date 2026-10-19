import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
const browser = await browserType.launch();
const seed = JSON.parse(await readFile(new URL('../content/landing.json', import.meta.url), 'utf8'));
const errors = [];
await mkdir('artifacts', { recursive: true });

async function open(options = {}, html, init) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Feature browser error:', error.message); });
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  if (html) await page.route(new URL(url).href, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (options.javaScriptEnabled !== false) await expect(page.locator('[data-feature-gallery]')).toHaveAttribute('data-feature-ready', 'true');
  return { context, page };
}

const dialog = (page) => page.locator('#feature-dialog');
const card = (page, index) => page.locator(`[data-feature-open="${index}"]`);
async function selected(page, index, count = 6, title = seed.features.items[index]?.title) {
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-labelledby', `feature-dialog-title-${index}`);
  await expect(modal).toHaveAttribute('aria-describedby', `feature-dialog-description-${index}`);
  if (title) await expect(modal).toHaveAccessibleName(title);
  await expect(modal.locator('[data-feature-slide]:not([hidden])')).toHaveCount(1);
  await expect(page.locator(`#feature-dialog-title-${index}`)).toBeVisible();
  await expect(page.locator(`#feature-dialog-description-${index}`)).toBeVisible();
  if (count === 6) await expect(page.locator(`#feature-dialog-description-${index}`)).toHaveText(seed.features.items[index].description);
  await expect(modal.locator('[data-feature-dot][aria-current="true"]')).toHaveCount(1);
  await expect(modal.locator(`[data-feature-dot="${index}"]`)).toHaveAttribute('aria-current', 'true');
  await expect(modal.locator('[data-feature-count]')).toHaveText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`);
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'No horizontal document overflow').toBe(await page.evaluate(() => document.documentElement.clientWidth));
}

async function controlsVisible(page) {
  for (const control of await dialog(page).locator('[data-feature-close], [data-feature-prev], [data-feature-next], [data-feature-dot]').all()) {
    await expect(control).toBeVisible();
    expect(await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, box.left); right = Math.min(right, box.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
        }
      }
      return rect.width > 0 && rect.height > 0 && rect.left >= left - 1 && rect.right <= right + 1 && rect.top >= top - 1 && rect.bottom <= bottom + 1;
    }), 'Modal controls remain fully visible without scrolling').toBe(true);
  }
  await noOverflow(page);
}

async function layout(page) {
  const slide = dialog(page).locator('[data-feature-slide]:not([hidden])');
  const media = await slide.locator('[data-feature-modal-media]').boundingBox();
  const copy = await slide.locator('[data-feature-copy]').boundingBox();
  expect(media.y + media.height, 'Feature media sits above the editorial copy').toBeLessThanOrEqual(copy.y + 1);
}

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).include('#features').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, `${label}: feature accessibility`).toEqual([]);
}

async function close(page, opener) {
  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
  await expect(opener).toBeFocused();
}

try {
  const { context, page } = await open();
  const root = page.locator('#features');
  await expect(page.locator('main > #features')).toHaveCount(1);
  await expect(root).toHaveCSS('background-color', 'rgb(247, 248, 243)');
  expect(await root.getAttribute('data-scroll-surface')).not.toBeNull();
  await expect(root.locator('[data-feature-open]')).toHaveCount(6);
  await expect(root.locator('[data-feature-card-media] picture img')).toHaveCount(6);
  await expect(root.locator('video, iframe')).toHaveCount(0);
  for (const image of await root.locator('img').all()) {
    expect(new URL(await image.getAttribute('src'), url).origin, 'Feature imagery stays local').toBe(new URL(url).origin);
  }
  for (let index = 0; index < 6; index++) {
    const opener = card(page, index);
    await expect(opener).toHaveAttribute('href', `#feature-description-${index}`);
    await expect(page.locator(`#feature-description-${index}`)).not.toBeVisible();
    await opener.click();
    await selected(page, index);
    await expect(dialog(page).locator('[data-feature-close]')).toBeFocused();
    await close(page, opener);
  }
  await card(page, 0).click();
  await dialog(page).locator('[data-feature-prev]').click();
  await selected(page, 5);
  await dialog(page).locator('[data-feature-next]').click();
  await selected(page, 0);
  await page.keyboard.press('ArrowLeft');
  await selected(page, 5);
  await page.keyboard.press('ArrowRight');
  await selected(page, 0);
  await dialog(page).locator('[data-feature-dot="3"]').click();
  await selected(page, 3);
  // Several events in one task expose stale animation callbacks and lost input.
  await dialog(page).evaluate((element) => {
    for (let index = 0; index < 15; index++) element.querySelector('[data-feature-next]').click();
  });
  await selected(page, 0);
  await dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-copy]').focus();
  for (const index of [1, 2]) {
    await page.keyboard.press('ArrowRight');
    await selected(page, index);
    await expect(dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-copy]')).toBeFocused();
  }
  await dialog(page).locator('[data-feature-dot="0"]').click();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index < 9 ? 'Tab' : 'Shift+Tab');
    expect(await dialog(page).evaluate((element) => element.contains(document.activeElement)), 'Native modal keeps keyboard focus inside').toBe(true);
  }
  await layout(page);
  await axe(page, 'Desktop modal');
  await page.screenshot({ path: `artifacts/features-${browserType.name()}-desktop.png` });
  await close(page, card(page, 0));

  await card(page, 2).evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const scrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const inlineBefore = await page.evaluate(() => ({ body: document.body.getAttribute('style'), html: document.documentElement.getAttribute('style') }));
  await card(page, 2).click();
  const lockedBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(lockedBefore);
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 2)).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scrollBefore);
  expect(await page.evaluate(() => ({ body: document.body.style.position, overflow: document.body.style.overflow })), 'Scroll lock releases body styles').toEqual({ body: '', overflow: '' });
  // Preserve any pre-existing inline body declaration through the modal cycle.
  expect(await page.evaluate(() => document.body.getAttribute('style') || '')).toBe(inlineBefore.body || '');

  await card(page, 1).click();
  const bounds = await dialog(page).boundingBox();
  const point = bounds.x > 2 ? { x: 1, y: bounds.y + 10 } : { x: bounds.x + 10, y: 1 };
  await page.mouse.click(point.x, point.y);
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 1)).toBeFocused();
  await card(page, 4).click();
  await dialog(page).evaluate((element) => element.querySelector('[data-feature-next]').click());
  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
  await card(page, 1).click();
  await selected(page, 1);
  await page.waitForTimeout(450);
  await selected(page, 1);

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 500 }]) {
    await page.setViewportSize(viewport);
    await selected(page, 1);
    await controlsVisible(page);
    await layout(page);
    await dialog(page).locator('[data-feature-next]').click();
    await selected(page, 2);
    await dialog(page).locator('[data-feature-prev]').click();
    await selected(page, 1);
    if (viewport.width === 390) {
      await axe(page, 'Mobile modal');
      await page.screenshot({ path: `artifacts/features-${browserType.name()}-mobile.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dialog(page).locator('[data-feature-next]').click();
  await selected(page, 2);
  expect(await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), 'Reduced motion has no transform animation').toBe(false);
  await axe(page, 'Reduced motion modal');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await dialog(page).evaluate((element) => element.querySelector('[data-feature-next]').click());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await selected(page, 3);
  expect(await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running' && animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), 'Live reduced-motion change cancels moving animation').toBe(false);
  await close(page, card(page, 1));
  const serverHTML = await (await page.request.get(url)).text();

  // Transform real server markup before hydration to exercise the published
  // CMS size boundaries without replacing application scripts or scoped CSS.
  for (const [count, longCopy] of [[1, false], [12, false], [12, true]]) {
    const html = await page.evaluate(({ original, count, longCopy }) => {
      const doc = new DOMParser().parseFromString(original, 'text/html');
      const root = doc.querySelector('[data-feature-gallery]');
      const firstCard = root.querySelector('[data-feature-card]');
      const cardTemplate = firstCard.cloneNode(true), cards = firstCard.parentElement;
      const firstSlide = root.querySelector('[data-feature-slide]');
      const slideTemplate = firstSlide.cloneNode(true), slides = firstSlide.parentElement;
      const firstDot = root.querySelector('[data-feature-dot]');
      const dotTemplate = firstDot.cloneNode(true), dots = firstDot.parentElement;
      root.querySelectorAll('[data-feature-card]').forEach((element) => element.remove());
      root.querySelectorAll('[data-feature-slide]').forEach((element) => element.remove());
      root.querySelectorAll('[data-feature-dot]').forEach((element) => element.remove());
      for (let index = 0; index < count; index++) {
        const card = cardTemplate.cloneNode(true), slide = slideTemplate.cloneNode(true), dot = dotTemplate.cloneNode(true);
        const opener = card.querySelector('[data-feature-open]');
        opener.dataset.featureOpen = String(index); opener.setAttribute('href', `#feature-description-${index}`);
        opener.setAttribute('aria-labelledby', `feature-title-${index}`);
        card.querySelector('[id^="feature-title-"]').id = `feature-title-${index}`;
        card.querySelector('[id^="feature-description-"]').id = `feature-description-${index}`;
        slide.querySelector('[id^="feature-dialog-title-"]').id = `feature-dialog-title-${index}`;
        slide.querySelector('[id^="feature-dialog-description-"]').id = `feature-dialog-description-${index}`;
        slide.id = `feature-slide-${index}`;
        slide.dataset.featureSlide = String(index);
        dot.dataset.featureDot = String(index);
        dot.setAttribute('aria-label', `Show published feature ${index + 1}`);
        dot.removeAttribute('aria-current');
        if (dot.hasAttribute('aria-controls')) dot.setAttribute('aria-controls', slide.id || `feature-dialog-title-${index}`);
        const title = `Published feature ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-title-"]').textContent = title;
        const description = longCopy ? 'Published feature context with enough detail to require scrolling. '.repeat(40).slice(0, 2000) : `Published feature description ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-description-"]').textContent = description;
        card.querySelector('[id^="feature-description-"]').textContent = description;
        cards.append(card); slides.append(slide); dots.append(dot);
      }
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }, { original: serverHTML, count, longCopy });
    const fixture = await open({}, html);
    for (const viewport of longCopy ? [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 500 }] : [{ width: 1440, height: 900 }]) {
      await fixture.page.setViewportSize(viewport);
      await card(fixture.page, count - 1).click();
      await selected(fixture.page, count - 1, count, `Published feature ${count}`);
      await controlsVisible(fixture.page);
      if (longCopy) {
        const copy = fixture.page.locator(`#feature-dialog-description-${count - 1}`);
        expect(await copy.textContent()).toHaveLength(2000);
        await copy.evaluate((element) => {
          const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
          const marker = document.createElement('span'); marker.dataset.testCopyEnd = ''; marker.textContent = ' End of published description';
          range.insertNode(marker); marker.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        });
        await expect(fixture.page.locator('[data-test-copy-end]')).toBeInViewport();
        await controlsVisible(fixture.page);
        await axe(fixture.page, `Long CMS copy at ${viewport.width}px`);
        await fixture.page.locator('[data-test-copy-end]').evaluate((element) => element.remove());
      }
      if (count === 1) {
        await expect(dialog(fixture.page).locator('[data-feature-next]')).toBeDisabled();
        await expect(dialog(fixture.page).locator('[data-feature-prev]')).toBeDisabled();
      } else {
        await dialog(fixture.page).locator('[data-feature-next]').click();
      }
      await selected(fixture.page, 0, count, 'Published feature 1');
      await close(fixture.page, card(fixture.page, count - 1));
    }
    await fixture.context.close();
  }
  await context.close();

  const legacyGutter = await open({}, undefined, () => {
    const original = window.getComputedStyle;
    window.getComputedStyle = (...args) => {
      const style = original(...args);
      return new Proxy(style, { get(target, property) {
        if (property === 'scrollbarGutter') return undefined;
        if (property === 'getPropertyValue') return (name) => name === 'scrollbar-gutter' ? '' : target.getPropertyValue(name);
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
  });
  await legacyGutter.page.evaluate(() => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => innerWidth - 12 }));
  await card(legacyGutter.page, 0).click();
  await selected(legacyGutter.page, 0);
  await close(legacyGutter.page, card(legacyGutter.page, 0));
  await legacyGutter.context.close();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }]) {
    const staticRun = await open({ javaScriptEnabled: false, viewport });
    for (let index = 0; index < 6; index++) {
      await expect(staticRun.page.locator(`#feature-description-${index}`)).toBeVisible();
      // Native keyboard activation avoids racing smooth fragment scrolling
      // against Playwright's pointer stability checks in a no-JS document.
      await card(staticRun.page, index).press('Enter');
      await expect(staticRun.page).toHaveURL(new URL(`/#feature-description-${index}`, url).href);
      await expect(staticRun.page.locator(`#feature-description-${index}`)).toBeInViewport();
      await expect(dialog(staticRun.page)).not.toBeVisible();
    }
    expect(await staticRun.page.locator('[data-feature-card]').evaluateAll((cards) => {
      const previews = cards.map((card) => card.querySelector('[data-feature-open]').getBoundingClientRect());
      return cards.every((card, index) => {
        const copy = card.querySelector('[id^="feature-description-"]').getBoundingClientRect();
        return previews.every((preview, other) => other === index || Math.min(copy.right, preview.right) - Math.max(copy.left, preview.left) <= 1 || Math.min(copy.bottom, preview.bottom) - Math.max(copy.top, preview.top) <= 1);
      });
    }), 'No-JS descriptions do not overlap another card').toBe(true);
    await noOverflow(staticRun.page);
    await staticRun.context.close();
  }
  expect(errors, 'No runtime errors in feature scenarios').toEqual([]);
  console.log(`Passed (${browserType.name()}): all feature cards, accessible names/descriptions, wrapping arrows/dots/keyboard, rapid input and reopen, native focus containment/Escape/backdrop, focus and scroll restoration, resize/mobile/tablet/short desktop, reduced motion/live cancellation, CMS 1/12 items and long copy, no-JS fallback, local pictures, no overflow and axe.`);
} finally {
  await browser.close();
}
