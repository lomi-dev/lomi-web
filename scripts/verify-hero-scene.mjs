import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322/';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error(`Unknown VERIFY_BROWSER: ${process.env.VERIFY_BROWSER}`);
const browser = await browserType.launch();
const errors = [];
const widths = [320, 390, 640, 768, 1024, 1200, 1280, 1440, 1920];
await mkdir('artifacts/hero-scene', { recursive: true });

async function open({ initialHash = '', ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })); } catch { /* Storage can be unavailable in restricted browsers. */ }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto(new URL(initialHash, url).href, { waitUntil: 'networkidle' });
  if (options.javaScriptEnabled !== false) await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function imageDifference(page) {
  const hero = page.locator('.hero');
  const visible = await hero.screenshot({ animations: 'disabled' });
  await page.locator('[data-laptop-screen]').evaluate((element) => { element.style.visibility = 'hidden'; });
  const hidden = await hero.screenshot({ animations: 'disabled' });
  await page.locator('[data-laptop-screen]').evaluate((element) => { element.style.removeProperty('visibility'); });
  const first = await sharp(visible).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const second = await sharp(hidden).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([second.info.width, second.info.height]).toEqual([first.info.width, first.info.height]);
  let changedPixels = 0;
  for (let i = 0; i < first.data.length; i += 4) {
    if (Math.abs(first.data[i] - second.data[i]) + Math.abs(first.data[i + 1] - second.data[i + 1]) + Math.abs(first.data[i + 2] - second.data[i + 2]) > 30) changedPixels++;
  }
  return changedPixels;
}

async function mappedCaptureCorners(page) {
  const markers = [
    { name: 'top-left', x: 18, y: 18, color: '#ff00ff', match: (r, g, b) => r > 220 && g < 50 && b > 220 },
    { name: 'top-right', x: 882, y: 18, color: '#00ff00', match: (r, g, b) => r < 50 && g > 220 && b < 50 },
    { name: 'bottom-right', x: 882, y: 544, color: '#00ffff', match: (r, g, b) => r < 50 && g > 220 && b > 220 },
    { name: 'bottom-left', x: 18, y: 544, color: '#ffff00', match: (r, g, b) => r > 220 && g > 220 && b < 50 },
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="562" viewBox="0 0 900 562"><rect width="900" height="562" fill="#101010"/>${markers.map(({ x, y, color }) => `<rect x="${x - 18}" y="${y - 18}" width="36" height="36" fill="${color}"/>`).join('')}</svg>`;
  const source = page.locator('[data-screen-source]');
  const original = await source.getAttribute('href');
  const probe = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const replaceSource = (href) => source.evaluate((element, nextHref) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out loading the temporary screen-corner probe.')), 5000);
    element.addEventListener('load', () => {
      clearTimeout(timeout);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }, { once: true });
    element.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Could not load the temporary screen-corner probe.'));
    }, { once: true });
    element.setAttribute('href', nextHref);
  }), href);
  await replaceSource(probe);
  const screenshot = await page.locator('.hero').screenshot({ animations: 'disabled' });
  await replaceSource(original);

  const figure = await page.locator('#workspace').boundingBox();
  const heroBounds = await page.locator('.hero').boundingBox();
  const { data, info } = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  function project(x, y) {
    const denominator = 1 - .000188234574601623 * x - .0000998384216135245 * y;
    return [
      (.676301657319625 * x - .164079997471883 * y + 550) / denominator,
      (-.100462679622081 * x + .792955948346037 * y + 166) / denominator,
    ];
  }
  return markers.map((marker) => {
    const [projectedX, projectedY] = project(marker.x, marker.y);
    const targetX = Math.round(figure.x + projectedX / 1536 * figure.width - heroBounds.x);
    const targetY = Math.round(figure.y + projectedY / 1024 * figure.height - heroBounds.y);
    let matchingPixels = 0;
    for (let row = Math.max(0, targetY - 7); row < Math.min(info.height, targetY + 8); row++) {
      for (let column = Math.max(0, targetX - 7); column < Math.min(info.width, targetX + 8); column++) {
        const offset = (row * info.width + column) * info.channels;
        if (marker.match(data[offset], data[offset + 1], data[offset + 2]) && data[offset + 3] > 200) matchingPixels++;
      }
    }
    return { name: marker.name, matchingPixels };
  });
}

async function assertHeroPullRemoved(page, label) {
  const obsoleteHooks = await page.locator('.home-pull-viewport, .home-pull-content, [data-hero-pull-ready], [data-hero-pull-state], [data-hero-pull-active], [data-hero-pull]').count();
  expect(obsoleteHooks, `${label}: no hero pull wrappers or state hooks`).toBe(0);
  const transforms = await page.evaluate(() => ['.hero', '.hero-opening', '.site-header', '#main']
    .map((selector) => getComputedStyle(document.querySelector(selector)).transform));
  expect(transforms, `${label}: hero, header, and main stay untransformed`).toEqual(['none', 'none', 'none', 'none']);
}

async function assertTopEdgeEventsAreNotCancelled(page, label) {
  const eventResults = await page.locator('.hero-opening').evaluate((element) => {
    const wheelResults = [-12000, -12000, -600].map((deltaY) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const touchResults = [];
    for (const [type, clientY] of [['touchstart', 20], ['touchmove', 200], ['touchend', 200]]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' ? [] : [{ identifier: 1, clientX: 20, clientY }] },
        changedTouches: { value: [{ identifier: 1, clientX: 20, clientY }] },
      });
      element.dispatchEvent(event);
      touchResults.push(event.defaultPrevented);
    }
    return { wheelResults, touchResults };
  });
  expect(eventResults.wheelResults, `${label}: repeated upward wheel events are not intercepted`).toEqual([false, false, false]);
  expect(eventResults.touchResults, `${label}: touch scrolling events are not intercepted`).toEqual([false, false, false]);
  await assertHeroPullRemoved(page, label);
}

async function assertNoTransformsDuringFrames(page, label) {
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    let remaining = 6;
    const sample = () => {
      samples.push(['.hero', '.hero-opening', '.site-header', '#main']
        .map((selector) => getComputedStyle(document.querySelector(selector)).transform));
      if (--remaining) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  }));
  expect(frames, `${label}: no element transforms during repeated animation frames`).toEqual(
    Array.from({ length: 6 }, () => ['none', 'none', 'none', 'none']),
  );
}

async function workspacePosition(page) {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero');
    const title = document.querySelector('#hero-title');
    const workspace = document.querySelector('#workspace');
    return {
      pageX: scrollX,
      heroX: hero.scrollLeft,
      heroY: hero.scrollTop,
      titleX: title.getBoundingClientRect().left,
      workspaceX: workspace.getBoundingClientRect().left,
    };
  });
}

async function assertBackdropMotion(page) {
  const backdrop = page.locator('lomi-hero-backdrop');
  const drift = backdrop.locator('.hero-backdrop-drift');
  const parallax = backdrop.locator('.hero-backdrop-parallax');
  await expect(backdrop).toHaveAttribute('data-motion', 'running');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  const origin = await workspacePosition(page);
  const initialDrift = await drift.evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => drift.evaluate((element) => getComputedStyle(element).transform)).not.toBe(initialDrift);

  const originBounds = await parallax.boundingBox();
  await page.mouse.move(1380, 120);
  await expect.poll(async () => (await parallax.boundingBox()).x - originBounds.x).toBeGreaterThan(5);
  await page.waitForTimeout(1000);
  const offset = await parallax.boundingBox();
  expect(Math.abs(offset.x - originBounds.x), 'Pointer movement stays subtle').toBeLessThanOrEqual(12);
  expect(Math.abs(offset.y - originBounds.y), 'Vertical pointer movement stays subtle').toBeLessThanOrEqual(8);
  expect(await workspacePosition(page), 'Interactive background does not move text, laptop or viewport').toEqual(origin);
  await page.mouse.move(10, 1110);
  await expect.poll(async () => Math.abs((await parallax.boundingBox()).x - originBounds.x)).toBeLessThan(.1);
  await page.locator('#newsletter').evaluate((element) => element.scrollIntoView({ behavior: 'instant' }));
  await expect(backdrop).toHaveAttribute('data-motion', 'paused');
  const pausedDrift = await drift.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(200);
  expect(await drift.evaluate((element) => getComputedStyle(element).transform), 'Background stops while offscreen').toBe(pausedDrift);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(backdrop).toHaveAttribute('data-motion', 'running');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(backdrop).toHaveAttribute('data-motion', 'paused');
  await page.mouse.move(1380, 120);
  await expect(parallax).toHaveCSS('transform', 'none');
  await expect(drift).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(backdrop).toHaveAttribute('data-motion', 'running');
  // Snapshot animation cancellation uses WAAPI to restart CSS animations.
  // Capture only after the real lifecycle checks so it cannot override pausing.
  await page.locator('.hero').screenshot({ path: `artifacts/hero-scene/${browserType.name()}-interactive.png`, animations: 'disabled' });
}

async function assertAnchorPosition(page, expected, label, target = '#workspace') {
  await expect(page).toHaveURL(new URL(target, url).href);
  await expect(page.locator(target)).toBeInViewport();
  let previousY;
  let stableSamples = 0;
  await expect.poll(async () => {
    const currentY = await page.evaluate(() => scrollY);
    stableSamples = previousY !== undefined && Math.abs(currentY - previousY) < .5 ? stableSamples + 1 : 0;
    previousY = currentY;
    return stableSamples;
  }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
  // Native fragment scrolling can continue after the click handler returns.
  // Sample from the test runner, since animation callbacks are disabled in
  // the no-JS context, so a delayed sideways scroll cannot pass.
  for (let frame = 0; frame < 12; frame++) {
    await page.waitForTimeout(20);
    const actual = await workspacePosition(page);
    expect(actual.pageX, `${label}: viewport stays horizontally aligned`).toBe(0);
    expect(actual.heroX, `${label}: hero does not scroll internally sideways`).toBe(0);
    expect(actual.heroY, `${label}: hero does not scroll internally vertically`).toBe(0);
    expect(Math.abs(actual.titleX - expected.titleX), `${label}: title retains its horizontal position`).toBeLessThan(1);
    expect(Math.abs(actual.workspaceX - expected.workspaceX), `${label}: laptop retains its horizontal position`).toBeLessThan(1);
  }
}

try {
  const { context, page } = await open();
  const hero = page.locator('.hero');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero).toHaveAttribute('data-scroll-surface', '');
  await expect(hero.locator('#workspace')).toHaveAttribute('role', 'img');
  await expect(hero.locator('.hero-eyebrow, .hero-note')).toHaveCount(0);
  await expect(hero.locator('.hero-description')).toHaveText('Run any CLI agent in one desktop app, with terminals, an editor, source control and more.');
  await expect(hero.locator('lomi-shape-waves, [data-hero-video], video, iframe')).toHaveCount(0);
  await expect(page.locator('.site-header')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.site-header .header-action')).toBeVisible();
  await expect(hero.locator('.hero-download')).toHaveAttribute('href', '/download/');
  await expect(hero.locator('.hero-explore')).toHaveAttribute('href', '#newsletter');
  await expect(hero.locator('.hero-explore')).toHaveAccessibleName('Join newsletter');
  await expect(page.locator('html'), 'Homepage contains vertical edge scrolling').toHaveCSS('overscroll-behavior-y', 'none');
  await assertHeroPullRemoved(page, 'initial homepage');
  await assertBackdropMotion(page);

  const imageState = await hero.locator('#workspace picture img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => image.decode()));
    return images.map((image) => ({ width: image.naturalWidth, height: image.naturalHeight, source: image.currentSrc }));
  });
  expect(imageState).toHaveLength(1);
  imageState.forEach((image) => {
    expect(image.width, 'Every hero image decodes').toBeGreaterThan(0);
    expect(new URL(image.source).origin, 'Hero artwork is hosted locally').toBe(new URL(url).origin);
  });
  const screenImage = hero.locator('[data-screen-source]');
  await expect(screenImage).toHaveAttribute('href', /workbench/);
  const decodedScreen = await screenImage.evaluate(async (element) => {
    const image = new Image();
    image.src = element.href.baseVal;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image.currentSrc };
  });
  expect(decodedScreen.width, 'The screen capture source decodes').toBeGreaterThan(0);
  expect(new URL(decodedScreen.source).origin, 'The screen capture is hosted locally').toBe(new URL(url).origin);
  await expect(hero.locator('[data-screen-boundary]')).toBeAttached();

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 1000 : 1100 });
    await page.waitForTimeout(75);
    const layout = await page.evaluate(() => {
      const bounds = (selector) => {
        const element = document.querySelector(selector);
        const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      };
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        hero: bounds('.hero'),
        copy: bounds('.hero-content'),
        screen: bounds('[data-screen-boundary]'),
        scene: bounds('#workspace'),
        stack: getComputedStyle(document.querySelector('.hero-product')).position,
        heading: bounds('#hero-title'),
      };
    });
    expect(layout.document, `${width}px: no horizontal scrolling`).toBe(layout.viewport);
    expect(layout.heading.width, `${width}px: heading fits the viewport`).toBeGreaterThan(200);
    expect(layout.scene.width, `${width}px: scene is large enough to read`).toBeGreaterThan(240);
    expect(layout.screen.width, `${width}px: the app interface remains visible`).toBeGreaterThan(120);
    const sceneWidth = layout.scene.width;
    const sceneHeight = layout.scene.height;
    const screenFrame = {
      left: (layout.screen.x - layout.scene.x) / sceneWidth,
      right: (layout.screen.right - layout.scene.x) / sceneWidth,
      top: (layout.screen.y - layout.scene.y) / sceneHeight,
      bottom: (layout.screen.bottom - layout.scene.y) / sceneHeight,
    };
    for (const [edge, actual, expected, scale] of [
      ['left', screenFrame.left, .3158, sceneWidth],
      ['right', screenFrame.right, .9089, sceneWidth],
      ['top', screenFrame.top, .0889, sceneHeight],
      ['bottom', screenFrame.bottom, .6572, sceneHeight],
    ]) {
      expect(Math.abs(actual - expected) * scale, `${width}px: screen ${edge} aligns with laptop bezel`).toBeLessThan(18);
    }
    if (width <= 1199) expect(layout.stack, `${width}px: scene follows the copy`).toBe('relative');
    else {
      expect(layout.stack, `${width}px: scene layers in the hero`).toBe('absolute');
      const intersectionWidth = Math.max(0, Math.min(layout.copy.right, layout.screen.right) - Math.max(layout.copy.x, layout.screen.x));
      const intersectionHeight = Math.max(0, Math.min(layout.copy.bottom, layout.screen.bottom) - Math.max(layout.copy.y, layout.screen.y));
      expect(intersectionWidth * intersectionHeight, `${width}px: interface does not cover copy`).toBe(0);
    }
    if ([320, 1200, 1280, 1920].includes(width)) {
      await page.locator('.hero').screenshot({ path: `artifacts/hero-scene/${browserType.name()}-${width}.png`, animations: 'disabled' });
    }
    const beforeAnchor = await workspacePosition(page);
    await page.locator('.hero-explore').click();
    await assertAnchorPosition(page, beforeAnchor, `${width}px newsletter link`, '#newsletter');
    // Repeated activation must not introduce an internal offset either.
    await page.evaluate(() => scrollTo({ left: 0, top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.locator('.hero-explore').click();
    await assertAnchorPosition(page, beforeAnchor, `${width}px repeated newsletter link`, '#newsletter');
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname + location.search);
      scrollTo({ left: 0, top: 0, behavior: 'instant' });
    });
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  const desktopDiff = await imageDifference(page);
  expect(desktopDiff, 'Projected product capture is painted on the laptop').toBeGreaterThan(1000);
  const desktopMapping = await mappedCaptureCorners(page);
  desktopMapping.forEach(({ name, matchingPixels }) => expect(matchingPixels, `1440px: source ${name} paints at the projected bezel corner`).toBeGreaterThan(8));
  await page.locator('.hero').screenshot({ path: `artifacts/hero-scene/${browserType.name()}-desktop.png`, animations: 'disabled' });
  await expect(page.locator('.hero .hero-download')).toBeVisible();
  await expect(page.locator('.hero .hero-explore')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 1000 });
  const mobileDiff = await imageDifference(page);
  const mobileMapping = await mappedCaptureCorners(page);
  mobileMapping.forEach(({ name, matchingPixels }) => expect(matchingPixels, `390px: source ${name} paints at the projected bezel corner`).toBeGreaterThan(2));
  await page.locator('.hero').screenshot({ path: `artifacts/hero-scene/${browserType.name()}-mobile.png`, animations: 'disabled' });
  expect(mobileDiff, 'Projected product capture is painted on the mobile laptop').toBeGreaterThan(500);
  const axe = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations, 'Hero accessibility at 390px').toEqual([]);

  const mobileMenu = page.locator('#mobile-navigation');
  const menuSummary = mobileMenu.locator(':scope > summary');
  await expect(menuSummary).toBeVisible();
  await menuSummary.click();
  await expect(mobileMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(mobileMenu).not.toHaveAttribute('open');
  await expect(menuSummary).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 1100 });
  const desktopAxe = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(desktopAxe.violations, 'Hero accessibility at 1440px').toEqual([]);

  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await assertTopEdgeEventsAreNotCancelled(page, 'homepage top edge');
  await assertNoTransformsDuringFrames(page, 'homepage top edge');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect.poll(() => page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');

  await page.mouse.move(900, 850);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await assertHeroPullRemoved(page, 'after ordinary downward scrolling');
  const downScrollY = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(downScrollY);
  await assertNoTransformsDuringFrames(page, 'after ordinary upward scrolling');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  await page.mouse.move(900, 850);
  for (const [index, deltaY] of [-12000, -12000, -600].entries()) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(60);
    await expect.poll(() => page.evaluate(() => scrollY), { message: `Upward wheel ${index + 1} at page top keeps scroll position at zero` }).toBe(0);
    await assertNoTransformsDuringFrames(page, `upward mouse wheel ${index + 1} at page top`);
  }
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await assertHeroPullRemoved(page, 'downward wheel after upward top-edge input');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  await page.locator('.hero .hero-explore').click();
  await expect(page).toHaveURL(/#newsletter$/);
  await expect(page.locator('#newsletter')).toBeInViewport();
  await expect(page.locator('html'), 'Homepage anchor retains vertical edge containment').toHaveCSS('overscroll-behavior-y', 'none');
  await assertHeroPullRemoved(page, 'newsletter anchor');
  await context.close();

  const noJs = await open({ javaScriptEnabled: false, viewport: { width: 390, height: 1000 } });
  await expect(noJs.page.locator('.hero h1')).toBeVisible();
  await expect(noJs.page.locator('#workspace img').nth(0)).toBeVisible();
  await expect(noJs.page.locator('#workspace [data-screen-source]')).toBeAttached();
  await expect(noJs.page.locator('.hero-download')).toHaveAttribute('href', '/download/');
  await expect(noJs.page.locator('.hero-explore')).toHaveAttribute('href', '#newsletter');
  expect(await imageDifference(noJs.page), 'Product capture remains visible without JavaScript').toBeGreaterThan(500);
  const noJsPosition = await workspacePosition(noJs.page);
  await noJs.page.locator('.hero-explore').click();
  await assertAnchorPosition(noJs.page, noJsPosition, 'no-JS newsletter link', '#newsletter');
  await expect(noJs.page.locator('html'), 'No-JS homepage contains vertical edge scrolling').toHaveCSS('overscroll-behavior-y', 'none');
  await assertHeroPullRemoved(noJs.page, 'no-JS homepage');
  await noJs.context.close();

  const reduced = await open({ reducedMotion: 'reduce', viewport: { width: 390, height: 1000 } });
  await expect(reduced.page.locator('.hero h1')).toBeVisible();
  await expect(reduced.page.locator('#workspace img').nth(0)).toBeVisible();
  await expect(reduced.page.locator('.hero-download')).toHaveAttribute('href', '/download/');
  await expect(reduced.page.locator('html'), 'Reduced-motion homepage contains vertical edge scrolling').toHaveCSS('overscroll-behavior-y', 'none');
  await assertTopEdgeEventsAreNotCancelled(reduced.page, 'reduced-motion homepage top edge');
  await assertNoTransformsDuringFrames(reduced.page, 'reduced-motion homepage top edge');
  await assertHeroPullRemoved(reduced.page, 'reduced-motion homepage');
  const reducedPosition = await workspacePosition(reduced.page);
  await reduced.page.locator('.hero-explore').click();
  await assertAnchorPosition(reduced.page, reducedPosition, 'reduced-motion newsletter link', '#newsletter');
  await reduced.context.close();

  const direct = await open({ viewport: { width: 1440, height: 1100 }, initialHash: '#workspace' });
  const directPosition = await workspacePosition(direct.page);
  expect(directPosition.titleX, 'Direct workspace fragment keeps the title aligned with its shell').toBeCloseTo(
    await direct.page.locator('.hero-shell').evaluate((element) => element.getBoundingClientRect().left), 0,
  );
  await assertAnchorPosition(direct.page, directPosition, 'direct workspace fragment');
  await direct.context.close();

  expect(errors, 'Hero scenarios have no page errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): hero copy, CMS links, light header, optimized local images, projected screen source and colored corner pixels at 390/1440, nine responsive widths and bezel bounds, no text overlap or horizontal scroll, axe at 390/1440, mobile Escape navigation, workspace anchor, uncancelled top-edge wheel/touch events, repeated top-edge mouse wheels, ordinary up/down scrolling, no pull hooks or transforms, homepage vertical overscroll containment, no-JS rendering and reduced-motion rendering.`);
} finally {
  await browser.close();
}
