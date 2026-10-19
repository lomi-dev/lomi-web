import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
const browser = await browserType.launch();
await mkdir('artifacts', { recursive: true });
const errors = [];
const desktop = { width: 1440, height: 900 };

async function open(options = {}, html) {
  const context = await browser.newContext({ viewport: desktop, ...options });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  if (html) await page.route(new URL(url).href, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function frame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function scrollProgress(page, progress) {
  await page.locator('#roadmap').evaluate((root, value) => {
    const headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
    const distance = parseFloat(getComputedStyle(root).getPropertyValue('--roadmap-distance'));
    scrollTo({ top: scrollY + root.getBoundingClientRect().top - headerHeight + distance * value, behavior: 'instant' });
  }, progress);
  await frame(page);
}

async function trackX(page) {
  return page.locator('[data-roadmap-track]').evaluate((track) => {
    const transform = getComputedStyle(track).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
  });
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'No horizontal document overflow').toBe(page.viewportSize().width);
}

async function readableStatic(page, count = 3) {
  const root = page.locator('#roadmap');
  await expect(root).toHaveAttribute('data-roadmap-mode', 'static');
  await expect(root.locator('[data-roadmap-milestone]')).toHaveCount(count);
  await noOverflow(page);
  expect(await trackX(page), 'Static copy has no horizontal translation').toBe(0);
  const milestones = root.locator('[data-roadmap-milestone]');
  for (let index = 0; index < count; index++) {
    const milestone = milestones.nth(index);
    await milestone.scrollIntoViewIfNeeded();
    await expect(milestone).toBeVisible();
    expect(await milestone.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && element.scrollHeight <= element.clientHeight + 1;
    }), `Stage ${index + 1}: readable width and full content height`).toBe(true);
    for (const item of await milestone.locator('h3, [data-roadmap-copy], li').all()) {
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport();
      expect(await item.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        let top = -Infinity, bottom = Infinity;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
            const bounds = parent.getBoundingClientRect();
            top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
          }
        }
        return rect.top >= top - 1 && rect.bottom <= bottom + 1;
      }), 'Copy is not clipped by an ancestor').toBe(true);
    }
  }
  const discuss = root.locator('.roadmap-discuss');
  await discuss.scrollIntoViewIfNeeded();
  await expect(discuss).toBeInViewport();
  await expect(discuss).toHaveAttribute('href', /https:\/\/github\.com\/.+\/issues/);
}

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).include('#roadmap').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, `${label}: roadmap accessibility`).toEqual([]);
}

try {
  const { page, context } = await open();
  const root = page.locator('#roadmap');
  // Sample the intro and intermediate native scroll positions: partially
  // revealed copy must retain contrast before it becomes the active stage.
  for (const progress of [0, .25, .5, .75, 1]) {
    await expect(root).toHaveAttribute('data-roadmap-mode', 'horizontal');
    await scrollProgress(page, progress);
    await axe(page, `Desktop reveal at ${Math.round(progress * 100)}%`);
  }
  if (process.env.VERIFY_ROADMAP_A11Y_ONLY === '1') {
    expect(errors, 'No runtime errors during reveal accessibility checks').toEqual([]);
    await context.close();
    console.log(`Passed (${browserType.name()}): roadmap contrast at intro, partial reveal, middle and final native scroll positions.`);
  } else {
    await expect(root).toHaveAttribute('data-roadmap-mode', 'horizontal');
    await expect(page.locator('main > #roadmap')).toHaveCount(1);
    await expect(root.locator('.roadmap-masthead, .section-marker')).toHaveCount(0);
    await expect(root.locator('h2')).toHaveCount(1);
    await expect(root).toHaveCSS('background-color', 'rgb(17, 22, 16)');
    expect(await root.getAttribute('data-scroll-surface')).not.toBeNull();
    await expect(root.locator('[data-roadmap-milestone]')).toHaveCount(3);
    expect(await root.locator('[data-roadmap-milestone]').evaluateAll((items) => items.map((item) => item.dataset.status))).toEqual(['available', 'next', 'later']);
    expect(await root.locator('[aria-live]').count(), 'Scrolling stages do not create live announcements').toBe(0);
    for (const stage of await root.locator('[data-roadmap-milestone]').all()) expect(await stage.locator('ul > li').count()).toBeGreaterThan(0);

    const positions = [];
    for (const progress of [0, .5, 1]) {
      await scrollProgress(page, progress);
      positions.push(await trackX(page));
      expect(await root.evaluate((element) => Number(getComputedStyle(element).getPropertyValue('--roadmap-progress')))).toBeCloseTo(progress, 2);
      const viewport = await page.locator('[data-roadmap-viewport]').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      expect(Math.abs(viewport.y - header.height), 'Timeline remains pinned below the fixed header').toBeLessThanOrEqual(2);
    }
    expect(Math.abs(positions[0]), 'Track starts at its first stage').toBeLessThanOrEqual(2);
    expect(positions[1]).toBeLessThan(positions[0] - 100);
    expect(positions[2]).toBeLessThan(positions[1] - 100);
    await scrollProgress(page, 0);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100);

    const jumps = root.locator('[data-roadmap-jump]');
    await expect(jumps).toHaveCount(3);
    await jumps.first().focus();
    for (let index = 0; index < 3; index++) {
      await expect(jumps.nth(index)).toBeFocused();
      const button = await jumps.nth(index).boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      expect(button.y, 'Focused jump stays below the fixed header').toBeGreaterThanOrEqual(header.height - 1);
      await page.keyboard.press('Enter');
      await expect.poll(() => root.locator('[data-roadmap-milestone]').nth(index).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= document.querySelector('.site-header').getBoundingClientRect().bottom - 1 && box.bottom <= innerHeight + 1;
      }), { timeout: 8000, message: `Jump ${index + 1} exposes the complete stage` }).toBe(true);
      await expect(jumps.nth(index)).toHaveAttribute('aria-current', 'step');
      if (index < 2) await page.keyboard.press('Tab');
    }
    await jumps.first().click();
    await jumps.last().click();
    await expect.poll(async () => (await trackX(page)) < positions[1]).toBe(true);
    await scrollProgress(page, 1);
    const endScroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(endScroll + 400);
    await expect(page.locator('.site-footer')).toBeInViewport();
    await scrollProgress(page, .5);
    await axe(page, 'Desktop');
    await page.screenshot({ path: `artifacts/roadmap-${browserType.name()}-desktop.png` });

    for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
      await page.setViewportSize(viewport);
      await expect(root).toHaveAttribute('data-roadmap-mode', 'horizontal');
      for (let index = 0; index < 3; index++) {
        await jumps.nth(index).click();
        await expect(jumps.nth(index), `${viewport.width}px: jump ${index + 1} is the current stage`).toHaveAttribute('aria-current', 'step');
        await expect(root.locator('[data-roadmap-jump][aria-current="step"]')).toHaveCount(1);
      }
    }
    await jumps.nth(1).focus();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root.locator('[data-roadmap-milestone]').nth(1), 'Reduced motion restores focus to the matching readable stage').toBeFocused();
    await expect(root.locator('[data-roadmap-milestone]').nth(1)).toBeInViewport();
    await readableStatic(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(root).toHaveAttribute('data-roadmap-mode', 'horizontal');
    await jumps.last().focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(root.locator('[data-roadmap-milestone]').last(), 'Narrow resize restores focus to the matching readable stage').toBeFocused();
    await expect(root.locator('[data-roadmap-milestone]').last()).toBeInViewport();
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 600 }]) {
      await page.setViewportSize(viewport);
      await readableStatic(page);
      if (viewport.width === 390) {
        await axe(page, 'Mobile');
        await root.screenshot({ path: `artifacts/roadmap-${browserType.name()}-mobile.png` });
      }
    }
    // Mutate server HTML before scripts execute, retaining the actual generated
    // markup, scoped styles and module entrypoint for CMS shape coverage.
    const serverHTML = await (await page.request.get(url)).text();
    for (const [count, longCopy] of [[1, false], [6, false], [6, true]]) {
      const html = await page.evaluate(({ original, count, longCopy }) => {
        const document = new DOMParser().parseFromString(original, 'text/html');
        const list = document.querySelector('.roadmap-milestones');
        const controls = document.querySelector('.roadmap-controls');
        const itemTemplate = list.firstElementChild.cloneNode(true);
        const buttonTemplate = controls.firstElementChild.cloneNode(true);
        list.replaceChildren(); controls.replaceChildren();
        for (let index = 0; index < count; index++) {
          const item = itemTemplate.cloneNode(true);
          item.id = `roadmap-stage-${index + 1}`;
          item.querySelector('h3').textContent = `Published CMS stage ${index + 1}`;
          if (longCopy) {
            item.querySelector('.milestone-description').textContent = 'A published description with detailed plans and context. '.repeat(40).slice(0, 2000);
            const points = item.querySelector('ul');
            const point = points.firstElementChild.cloneNode(true);
            points.replaceChildren();
            for (let index = 0; index < 8; index++) {
              const entry = point.cloneNode(true);
              entry.querySelector('span').textContent = `Extended published point ${index + 1} with supporting details.`;
              points.append(entry);
            }
          }
          const button = buttonTemplate.cloneNode(true);
          button.dataset.roadmapJump = String(index);
          button.setAttribute('aria-controls', item.id);
          button.setAttribute('aria-label', `Explore published phase ${index + 1}`);
          button.querySelector('.roadmap-control-index').textContent = String(index + 1).padStart(2, '0');
          button.querySelector('.roadmap-control-label').textContent = `Phase ${index + 1}`;
          list.append(item); controls.append(button);
        }
        return '<!doctype html>' + document.documentElement.outerHTML;
      }, { original: serverHTML, count, longCopy });
      const fixture = await open({ viewport: { width: 1920, height: 1080 } }, html);
      if (longCopy) {
        await readableStatic(fixture.page, count);
        await expect(fixture.page.locator('[data-roadmap-milestone] ul > li')).toHaveCount(count * 8);
      } else {
        await expect(fixture.page.locator('#roadmap')).toHaveAttribute('data-roadmap-mode', 'horizontal');
        await expect(fixture.page.locator('[data-roadmap-milestone]')).toHaveCount(count);
        await fixture.page.locator('[data-roadmap-jump]').last().click();
        await expect.poll(() => fixture.page.locator('[data-roadmap-milestone]').last().evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        }), { timeout: 8000, message: `${count} CMS stages: final copy remains reachable` }).toBe(true);
        await noOverflow(fixture.page);
      }
      await fixture.context.close();
    }
    await context.close();

    const staticRun = await open({ javaScriptEnabled: false });
    await readableStatic(staticRun.page);
    await staticRun.context.close();
    expect(errors, 'No runtime errors in roadmap scenarios').toEqual([]);
    console.log(`Passed (${browserType.name()}): native pinned scrolling, all stage jumps, keyboard access, footer exit, responsive/reduced-motion/no-JS fallbacks, CMS 1/6 stages and long copy, no overflow and desktop/mobile axe.`);
  }
} finally {
  await browser.close();
}
