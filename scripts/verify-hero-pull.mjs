import { chromium, firefox, webkit, expect } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
const browser = await browserType.launch();
const errors = [];
await mkdir('artifacts', { recursive: true });

async function open(options = {}, transformHtml) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addInitScript(() => {
    localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() }));
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  if (transformHtml) await page.route(`${url}/`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: transformHtml(await response.text()) });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (options.javaScriptEnabled !== false) await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

const state = (page) => page.locator('.hero').getAttribute('data-hero-pull-state');
const offset = (page) => page.locator('.home-pull-content').evaluate((element) => element.getBoundingClientRect().top + scrollY);
async function rest(page) {
  await expect.poll(() => state(page), { timeout: 4000 }).toBe('idle');
  await expect.poll(() => offset(page)).toBe(0);
  await expect(page.locator('.home-pull-content')).toHaveCSS('transform', 'none');
  await expect(page.locator('.site-header')).toHaveCSS('transform', 'none');
}

async function wheel(page, options = {}, selector = '.hero-opening') {
  return page.locator(selector).evaluate((element, init) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240, ...init });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, options);
}

async function hold(page) {
  await page.evaluate(() => {
    const send = () => document.querySelector('.hero-opening').dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -80,
    }));
    send();
    window.__heroPullHold = setInterval(send, 40);
  });
  await expect.poll(() => offset(page)).toBeGreaterThan(10);
  let previous = -100;
  let stable = 0;
  await expect.poll(async () => {
    const current = await offset(page);
    stable = Math.abs(current - previous) < 3 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { intervals: [40] }).toBeGreaterThanOrEqual(2);
}

async function release(page) {
  await page.evaluate(() => clearInterval(window.__heroPullHold));
  await rest(page);
}

async function touch(page, type, points, selector = '.hero-opening', cancelable = true) {
  return page.locator(selector).evaluate((element, { type, points, cancelable }) => {
    const event = new Event(type, { bubbles: true, cancelable });
    Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY })) });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, points, cancelable });
}

async function motionTrace(page, packets, duration) {
  return page.evaluate(async ({ packets, duration }) => {
    const content = document.querySelector('.home-pull-content');
    const hero = document.querySelector('.hero');
    const target = document.querySelector('.hero-opening');
    const start = performance.now();
    const samples = [];
    let frame;
    const sample = () => {
      samples.push({ time: performance.now() - start, offset: content.getBoundingClientRect().top + scrollY, state: hero.dataset.heroPullState, scroll: scrollY });
      frame = requestAnimationFrame(sample);
    };
    sample();
    const timers = packets.map(([delay, deltaY]) => setTimeout(() => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })), delay));
    await new Promise((resolve) => setTimeout(resolve, duration));
    cancelAnimationFrame(frame);
    timers.forEach(clearTimeout);
    return samples;
  }, { packets, duration });
}

try {
  const { context, page } = await open();
  await expect(page.locator('.hero')).toHaveAttribute('data-hero-pull-ready', '');
  await rest(page);

  const immediate = await page.locator('.hero-opening').evaluate((element) => {
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240 }));
    return document.querySelector('.home-pull-content').getBoundingClientRect().top + scrollY;
  });
  expect(immediate, 'A wheel packet does not teleport the page before the next frame').toBe(0);
  await rest(page);
  const single = await motionTrace(page, [[0, -240]], 850);
  const peak = Math.max(...single.map((sample) => sample.offset));
  expect(peak, 'An ordinary upward gesture gives a restrained pull').toBeGreaterThan(5);
  expect(peak, 'An ordinary upward gesture stays much smaller than the old 82px jump').toBeLessThan(40);
  expect(single.filter((sample) => sample.time >= 500).every((sample) => sample.offset < 1), 'The visible pull settles promptly').toBe(true);
  expect(single.every((sample) => sample.offset >= 0), 'Return never crosses above the physical top').toBe(true);
  await rest(page);

  const tailPackets = [-120, -80, -45, -20, -9, -4, -2, -1].map((delta, index) => [index * 40, delta]);
  for (let time = 320; time <= 720; time += 40) tailPackets.push([time, -1]);
  const tail = await motionTrace(page, tailPackets, 1100);
  expect(Math.max(...tail.map((sample) => sample.offset)), 'A momentum tail cannot force a large overscroll').toBeLessThan(65);
  expect(tail.filter((sample) => sample.time >= 600 && sample.time <= 720).every((sample) => sample.offset < 4), 'Small momentum packets do not keep the page stretched').toBe(true);
  await rest(page);
  const baseline = await page.evaluate(() => {
    const heading = document.querySelector('#hero-title').getBoundingClientRect();
    const canvas = document.querySelector('.hero canvas[data-background-canvas]');
    window.__heroPullCanvas = canvas;
    return { heading: { width: heading.width, height: heading.height }, canvas: [canvas.width, canvas.height], scrollHeight: document.documentElement.scrollHeight };
  });

  // Real browser wheel input must be intercepted at the physical top.
  await page.mouse.move(700, 260);
  await page.mouse.wheel(0, -320);
  await expect.poll(() => offset(page)).toBeGreaterThan(0);
  await rest(page);

  // Translating a control under a stationary cursor must not end its wheel burst.
  const action = await page.locator('.header-action').boundingBox();
  await page.mouse.move(action.x + action.width / 2, action.y + action.height / 2 + 32);
  for (const delta of [-240, -80, -80, -80]) {
    await page.mouse.wheel(0, delta);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect.poll(() => offset(page), { message: 'An owned wheel gesture survives controls moving under the cursor' }).toBeGreaterThan(0);
  }
  await rest(page);

  await hold(page);
  try {
    expect(await offset(page)).toBeLessThanOrEqual(72);
    await expect(page.locator('.hero')).toHaveAttribute('data-hero-pull-state', 'pulling');
    const during = await page.evaluate(() => {
      const heading = document.querySelector('#hero-title').getBoundingClientRect();
      const canvas = document.querySelector('.hero canvas[data-background-canvas]');
      return { heading: { width: heading.width, height: heading.height }, canvas: [canvas.width, canvas.height], sameCanvas: canvas === window.__heroPullCanvas, scrollHeight: document.documentElement.scrollHeight, scrollY, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(during.heading.width, 'Pulling keeps the text width').toBeCloseTo(baseline.heading.width, 2);
    expect(during.heading.height, 'Pulling keeps the text height').toBeCloseTo(baseline.heading.height, 2);
    expect(during.canvas, 'Backing canvas dimensions stay fixed during the gesture').toEqual(baseline.canvas);
    expect(during.sameCanvas, 'The original animation supplies the revealed rows').toBe(true);
    expect(during.scrollHeight, 'Pulling adds no scrollbar range').toBe(baseline.scrollHeight);
    expect(during.scrollY).toBe(0);
    expect(during.horizontalOverflow).toBe(false);
    const revealedHeight = Math.max(1, Math.floor(await offset(page)) - 4);
    const screenshot = await page.screenshot({ path: `artifacts/hero-pull-${browserType.name()}.png` });
    const { data, info } = await sharp(screenshot).extract({ left: 240, top: 2, width: 960, height: Math.max(1, revealedHeight - 2) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let glyphPixels = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      if (Math.min(data[index], data[index + 1], data[index + 2]) < 240) glyphPixels++;
    }
    expect(glyphPixels, 'The exposed strip contains hero glyphs rather than a flat background').toBeGreaterThan(10);
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  } finally { await release(page); }

  // New input can interrupt an in-progress spring without jumping to zero.
  await wheel(page);
  await expect.poll(() => state(page)).toBe('settling');
  expect(await wheel(page)).toBe(true);
  await expect.poll(() => offset(page)).toBeGreaterThan(0);
  await rest(page);

  // Scrolling towards the page consumes no downward input.
  await hold(page);
  const beforeReverse = await offset(page);
  await wheel(page, { deltaY: 3 });
  expect(await offset(page), 'Small reverse input does not erase the entire pull').toBeGreaterThan(beforeReverse / 2);
  await page.evaluate(() => clearInterval(window.__heroPullHold));
  await page.mouse.wheel(0, 260);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(10);
  await rest(page);
  await page.evaluate(() => scrollTo({ top: 500, behavior: 'instant' }));
  await page.mouse.move(8, 300);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(500);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await rest(page);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));

  for (const init of [{ cancelable: false }, { ctrlKey: true }, { shiftKey: true }, { deltaX: -300, deltaY: -10 }]) {
    expect(await wheel(page, init), 'Unowned, horizontal and zoom input remains native').toBe(false);
    await rest(page);
  }
  for (const selector of ['.hero-download', '.product-menu > summary']) {
    expect(await wheel(page, {}, selector), 'Controls retain their own input').toBe(false);
    await rest(page);
  }
  await page.locator('.hero-opening').evaluate((element) => {
    const nested = document.createElement('div');
    nested.id = 'hero-pull-scroll-probe';
    nested.style.cssText = 'position:absolute;left:0;top:300px;width:100px;height:80px;overflow:auto';
    nested.innerHTML = '<div style="height:400px">Nested scrolling</div>';
    element.append(nested);
  });
  expect(await wheel(page, {}, '#hero-pull-scroll-probe > div')).toBe(false);
  await page.locator('#hero-pull-scroll-probe').evaluate((element) => element.remove());
  await rest(page);

  for (const action of ['menu', 'dialog', 'resize', 'reduced']) {
    await hold(page);
    await page.evaluate(() => clearInterval(window.__heroPullHold));
    if (action === 'menu') await page.locator('#product-menu').evaluate((element) => { element.open = true; });
    if (action === 'dialog') await page.evaluate(() => {
      const dialog = document.createElement('dialog'); dialog.id = 'hero-pull-modal-probe'; document.body.append(dialog); dialog.showModal();
    });
    if (action === 'resize') await page.setViewportSize({ width: 1024, height: 768 });
    if (action === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    await rest(page);
    if (action !== 'resize') expect(await wheel(page), `${action}: pulling stays disabled`).toBe(false);
    if (action === 'menu') await page.locator('#product-menu').evaluate((element) => { element.open = false; });
    if (action === 'dialog') await page.locator('#hero-pull-modal-probe').evaluate((element) => { if (element instanceof HTMLDialogElement) element.close(); element.remove(); });
    if (action === 'resize') await page.setViewportSize({ width: 1440, height: 900 });
    if (action === 'reduced') await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // One-finger downward dragging owns the gesture; pinch and sideways input do not.
  await touch(page, 'touchstart', [[600, 260]]);
  expect(await touch(page, 'touchmove', [[600, 350]])).toBe(true);
  await expect.poll(() => offset(page)).toBeGreaterThan(0);
  await touch(page, 'touchend', []);
  await rest(page);
  await touch(page, 'touchstart', [[600, 260]]);
  expect(await touch(page, 'touchmove', [[750, 270]])).toBe(false);
  await touch(page, 'touchend', []);
  await rest(page);
  await touch(page, 'touchstart', [[600, 260]]);
  expect(await touch(page, 'touchmove', [[600, 350]], '.hero-opening', false)).toBe(false);
  await touch(page, 'touchcancel', []);
  await rest(page);
  await touch(page, 'touchstart', [[600, 260], [700, 260]]);
  expect(await touch(page, 'touchmove', [[600, 350], [700, 350]])).toBe(false);
  await touch(page, 'touchcancel', []);
  await rest(page);

  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(200, 255, 61)');
  await expect(page.locator('html')).toHaveCSS('overscroll-behavior-y', 'auto');
  await rest(page);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await rest(page);
  expect(await page.evaluate(async () => {
    let writes = 0;
    const observer = new MutationObserver(() => writes++);
    for (const element of [document.querySelector('.hero'), document.querySelector('.home-pull-content'), document.querySelector('.site-header')]) observer.observe(element, { attributes: true, attributeFilter: ['style', 'data-hero-pull-state', 'data-hero-pull-active'] });
    await new Promise((resolve) => setTimeout(resolve, 250));
    observer.disconnect();
    return writes;
  }), 'No idle pull style or state updates').toBe(0);
  await page.goto(`${url}/download/`, { waitUntil: 'networkidle' });
  await expect(page.locator('.home-pull-content, [data-hero-pull-ready]')).toHaveCount(0);
  await context.close();

  const dragging = await open();
  await hold(dragging.page);
  const draggedLink = await dragging.page.locator('.hero-download').boundingBox();
  await dragging.page.mouse.move(draggedLink.x + draggedLink.width / 2, draggedLink.y + draggedLink.height / 2);
  await dragging.page.mouse.down();
  await dragging.page.evaluate(() => clearInterval(window.__heroPullHold));
  await dragging.page.mouse.move(draggedLink.x + draggedLink.width + 220, draggedLink.y + 100, { steps: 10 });
  await dragging.page.mouse.up();
  await dragging.page.keyboard.press('Escape');
  await rest(dragging.page);
  await dragging.context.close();

  for (const phase of ['pulling', 'settling']) {
    const activation = await open();
    const restingLink = await activation.page.locator('.hero-download').boundingBox();
    if (phase === 'pulling') await hold(activation.page);
    else {
      await wheel(activation.page, { deltaY: -1500 });
      await expect.poll(() => state(activation.page)).toBe('settling');
      await expect.poll(() => offset(activation.page), { intervals: [10] }).toBeLessThan(40);
    }
    const link = await activation.page.locator('.hero-download').boundingBox();
    // During the return, click the overlap shared with the resting button so
    // protocol latency cannot move the target away before pointerdown.
    const y = phase === 'settling' ? restingLink.y + restingLink.height - 4 : link.y + link.height / 2;
    await activation.page.mouse.move(link.x + link.width / 2, y);
    await activation.page.mouse.down();
    await activation.page.waitForTimeout(50);
    await activation.page.mouse.up();
    await expect(activation.page, `Native link activation during ${phase} retains its target`).toHaveURL(/\/download\/?$/);
    await activation.context.close();
  }

  for (const width of [390, 320]) {
    const mobile = await open({ viewport: { width, height: 844 }, hasTouch: true, ...(browserType === chromium ? { isMobile: true } : {}) });
    if (browserType === chromium) {
      const session = await mobile.context.newCDPSession(mobile.page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 30, y: 180 }] });
      for (const y of [200, 230, 270]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y }] });
      await expect.poll(() => offset(mobile.page)).toBeGreaterThan(0);
      await mobile.page.screenshot({ path: `artifacts/hero-pull-touch-${width}.png` });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await touch(mobile.page, 'touchstart', [[30, 180]]);
      expect(await touch(mobile.page, 'touchmove', [[30, 270]])).toBe(true);
      await expect.poll(() => offset(mobile.page)).toBeGreaterThan(0);
      await touch(mobile.page, 'touchend', []);
    }
    await rest(mobile.page);
    expect(await mobile.page.evaluate(() => scrollY)).toBe(0);
    expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await mobile.context.close();
  }

  for (const options of [{ reducedMotion: 'reduce' }, { javaScriptEnabled: false }]) {
    const fallback = await open(options);
    await expect(fallback.page.locator('#hero-title')).toBeVisible();
    expect(await wheel(fallback.page)).toBe(false);
    expect(await offset(fallback.page)).toBe(0);
    await fallback.context.close();
  }

  // A CMS layout with the hero after another section must keep ordinary scrolling.
  const reordered = await open({}, (html) => {
    const hero = html.match(/<section\b[^>]*class="hero"[\s\S]*?<\/section>/)?.[0];
    if (!hero) throw new Error('Hero fixture was not found');
    return html.replace(hero, '').replace('</main>', `${hero}</main>`);
  });
  expect(await reordered.page.locator('.hero').evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(0);
  expect(await wheel(reordered.page)).toBe(false);
  expect(await offset(reordered.page)).toBe(0);
  await reordered.context.close();

  expect(errors, 'No runtime errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): real upward wheel and stationary-cursor ownership, bounded same-canvas continuation and rendered glyph pixels, spring/reversal/downward handoff, native link activation and drag cleanup, controls/nested scroll/modal/menu/zoom exclusions, touch ownership/cancel/pinch, mobile widths, resize/live reduced motion, native footer, CMS reordering, other routes, no-JS fallback and no idle writes. OS trackpad feel and hardware touch remain manual checks.`);
} finally { await browser.close(); }
