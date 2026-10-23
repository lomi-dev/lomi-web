import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const browserType = process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch({
  ...(browserType === chromium && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'Linux x86_64' });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  });
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: { platform: 'Linux', mobile: false },
  });
});
const page = await context.newPage();
const errors = [];
const videoRequests = await mockVideoRequests(page);
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

const releaseUrl = 'https://github.com/lomi-dev/lomi/releases';
const downloadPath = '/download/';
const footerViewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1440, height: 500 },
  { width: 320, height: 320 },
  { width: 320, height: 200 },
];

async function verifyViewportFooter(targetPage, screenshots = false, viewports = footerViewports) {
  const footer = targetPage.locator('.site-footer');
  const links = footer.locator('a[href]');
  const linkCount = await links.count();
  const regionStops = await footer.locator('[tabindex="0"]:not(a[href])').count();
  expect(linkCount, 'Footer links remain available').toBeGreaterThan(0);
  for (const viewport of viewports) {
    await targetPage.setViewportSize(viewport);
    await footer.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const dimensions = await footer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left, width: bounds.width, height: bounds.height,
        viewportWidth: document.documentElement.clientWidth, viewportHeight: innerHeight,
      };
    });
    const label = `Footer at ${viewport.width}x${viewport.height}`;
    expect(Math.abs(dimensions.left), `${label}: left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.width - dimensions.viewportWidth), `${label}: exact viewport width`).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.height - dimensions.viewportHeight), `${label}: exact viewport height`).toBeLessThanOrEqual(1);
    expect(await targetPage.evaluate(() => document.documentElement.scrollWidth), `${label}: no horizontal overflow`).toBe(dimensions.viewportWidth);

    await links.first().focus();
    for (let index = 0; index < linkCount; index++) {
      const link = links.nth(index);
      for (let stop = 0; stop < regionStops && !await link.evaluate((element) => element === document.activeElement); stop++) {
        expect(await footer.evaluate((element) => element.contains(document.activeElement)
          && document.activeElement.matches('[tabindex="0"]:not(a[href])')), `${label}: explicit region stop before link ${index + 1}`).toBe(true);
        await targetPage.keyboard.press('Tab');
      }
      await expect(link, `${label}: link ${index + 1} in keyboard order`).toBeFocused();
      await link.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
      await expect.poll(() => link.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
        let left = 0, top = Math.max(0, headerBottom), right = document.documentElement.clientWidth, bottom = innerHeight;
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const clip = ancestor.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, clip.left + ancestor.clientLeft);
            right = Math.min(right, clip.left + ancestor.clientLeft + ancestor.clientWidth);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, clip.top + ancestor.clientTop);
            bottom = Math.min(bottom, clip.top + ancestor.clientTop + ancestor.clientHeight);
          }
        }
        return bounds.width > 0 && bounds.height > 0 && bounds.left >= left - 1 && bounds.right <= right + 1
          && bounds.top >= top - 1 && bounds.bottom <= bottom + 1;
      }), `${label}: focused link ${index + 1} is fully visible`).toBe(true);
      if (index < linkCount - 1) await targetPage.keyboard.press('Tab');
    }
    if (screenshots && ((viewport.width === 1440 && viewport.height === 900) || (viewport.width === 390 && viewport.height === 844))) {
      await footer.evaluate((element) => {
        if (element.contains(document.activeElement)) document.activeElement.blur();
        element.querySelector('.footer-frame').scrollTop = 0;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      });
      // Capture the visible viewport without the locator's extra auto-scroll.
      await targetPage.screenshot({ path: `artifacts/footer-${viewport.width}.png` });
    }
  }
}

async function mockVideoRequests(targetPage) {
  const requests = [];
  await targetPage.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//, async (route) => {
    requests.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/iframe_api') {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: `
        window.__mockYouTube = { players: [] };
        window.YT = { PlayerState: { PLAYING: 1 }, Player: class {
          constructor(iframe, options) {
            this.iframe = iframe; this.events = options.events; this.calls = [];
            window.__mockYouTube.players.push(this);
          }
          mute() { this.muted = true; this.calls.push('mute'); }
          unMute() { this.muted = false; this.calls.push('unMute'); }
          isMuted() { return this.muted ?? true; }
          getVolume() { return this.volume ?? 100; }
          setVolume(value) { this.volume = value; }
          getCurrentTime() { return this.time ?? 0; }
          getDuration() { return 120; }
          seekTo(value) { this.time = value; }
          getPlayerState() { return -1; }
          playVideo() { this.calls.push('playVideo'); }
          pauseVideo() { this.calls.push('pauseVideo'); }
          destroy() { this.calls.push('destroy'); this.iframe.remove(); }
          getIframe() { return this.iframe; }
        }};
        window.onYouTubeIframeAPIReady?.();
      ` });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Mock video</title></head><body><main><h1>Mock video</h1><button type="button">Play mock video</button><label>Volume<input aria-label="Volume" type="range" min="0" max="100" value="0"></label></main></body></html>' });
  });
  return requests;
}

async function verifyInlineVideo(targetPage, requests) {
  const root = targetPage.locator('[data-hero-video]');
  const iframe = root.locator('iframe');
  await expect(targetPage.locator('#video-dialog, [data-video-open], [data-video-play], .deck-detail, [data-video-notice], [data-video-allow], [data-video-retry]')).toHaveCount(0);
  await expect(iframe).toHaveCount(1);
  expect(requests.some((request) => request.includes('/iframe_api')), 'Remembered consent initializes the API without a hero click').toBe(true);
  const source = new URL(await iframe.getAttribute('src'));
  expect(source.hostname).toBe('www.youtube-nocookie.com');
  expect(source.searchParams.get('controls')).toBe('0');
  expect(source.searchParams.get('autoplay')).toBe('0');
  await expect(iframe).toHaveAttribute('allowfullscreen', '');
  await expect(root.locator('[data-video-poster]')).toBeVisible();
  await expect(root.locator('[data-player-controls]')).toBeVisible();
  await expect.poll(() => targetPage.evaluate(() => window.__mockYouTube?.players.length || 0)).toBe(1);
  await root.locator('[data-video-player]').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await targetPage.evaluate(() => { const instance = window.__mockYouTube.players[0]; instance.events.onReady({ target: instance }); });
  expect((await targetPage.evaluate(() => window.__mockYouTube.players[0].calls))[0], 'Mute precedes any autoplay').toBe('mute');
  await expect(root.locator('[data-player-volume]')).toBeVisible();
  expect(await targetPage.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]), 'Inline playback does not lock scrolling').not.toContain('hidden');
}

async function backgroundPixels(targetPage) {
  return targetPage.locator('canvas[data-background-canvas]').evaluate((canvas) => {
    const sample = document.createElement('canvas');
    sample.width = 64;
    sample.height = 48;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    let hash = 2166136261;
    const colors = new Set();
    for (let index = 0; index < data.length; index++) hash = Math.imul(hash ^ data[index], 16777619);
    for (let index = 0; index < data.length; index += 4) colors.add(`${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`);
    return { hash: hash >>> 0, colors: colors.size };
  });
}

async function pointerColorContrast(targetPage, center, duration = 0) {
  const sampleCanvas = (canvas, { point, duration }) => {
    const context = canvas.getContext('2d');
    const styles = getComputedStyle(canvas.closest('lomi-shape-waves'));
    const swatch = document.createElement('canvas');
    swatch.width = swatch.height = 1;
    const swatchContext = swatch.getContext('2d');
    const color = (property) => {
      swatchContext.clearRect(0, 0, 1, 1);
      swatchContext.fillStyle = styles.getPropertyValue(property).trim();
      swatchContext.fillRect(0, 0, 1, 1);
      return [...swatchContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const background = color('--shape-waves-background');
    const ambient = color('--shape-waves-color');
    const interaction = color('--shape-waves-interaction-color');
    const contrast = (rgb) => Math.max(...rgb.map((channel, index) => Math.abs(channel - background[index])));
    const ambientContrast = contrast(ambient);
    const interactionContrast = contrast(interaction);
    const threshold = ambientContrast + (interactionContrast - ambientContrast) * .2;
    const pixelContrast = (data, index) => Math.max(
      Math.abs(data[index] - background[0]), Math.abs(data[index + 1] - background[1]),
      Math.abs(data[index + 2] - background[2])) * data[index + 3] / 255;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const left = Math.max(0, Math.floor((point.x - 170) * scaleX));
    const top = Math.max(0, Math.floor((point.y - 170) * scaleY));
    const width = Math.min(canvas.width - left, Math.ceil(340 * scaleX));
    const height = Math.min(canvas.height - top, Math.ceil(340 * scaleY));
    const sample = () => {
      const pixels = context.getImageData(left, top, width, height).data;
      let peak = 0, nearChanged = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const value = pixelContrast(pixels, index);
          peak = Math.max(peak, value);
          if (value > threshold) {
            const dx = (left + x) / scaleX - point.x;
            const dy = (top + y) / scaleY - point.y;
            if (dx * dx + dy * dy < 140 * 140) nearChanged++;
          }
        }
      }
      const control = context.getImageData(0, 0, Math.min(96, canvas.width), Math.min(96, canvas.height)).data;
      let controlPeak = 0;
      for (let index = 0; index < control.length; index += 4) controlPeak = Math.max(controlPeak, pixelContrast(control, index));
      return { peak, nearChanged, controlPeak, threshold, ambientContrast, interactionContrast };
    };
    if (!duration) return sample();
    const observed = sample();
    const until = performance.now() + duration;
    return { result: new Promise((resolve) => {
      const tick = () => {
        const frame = sample();
        observed.peak = Math.max(observed.peak, frame.peak);
        observed.nearChanged = Math.max(observed.nearChanged, frame.nearChanged);
        observed.controlPeak = Math.max(observed.controlPeak, frame.controlPeak);
        if (performance.now() < until) requestAnimationFrame(tick);
        else resolve(observed);
      };
      requestAnimationFrame(tick);
    }) };
  };
  const canvas = targetPage.locator('canvas[data-background-canvas]');
  return duration ? canvas.evaluateHandle(sampleCanvas, { point: center, duration })
    : canvas.evaluate(sampleCanvas, { point: center, duration });
}

async function verifyBackgroundPointer() {
  const pointerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await pointerContext.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  const pointerPage = await pointerContext.newPage();
  await mockVideoRequests(pointerPage);
  const pointerErrors = [];
  pointerPage.on('pageerror', (error) => pointerErrors.push(error.message));
  await pointerPage.goto(url, { waitUntil: 'networkidle' });
  const hero = pointerPage.locator('.hero');
  await expect(hero.locator('lomi-shape-waves')).toHaveAttribute('data-state', 'running');
  const box = await hero.boundingBox();
  const center = { x: box.width * .5, y: box.height * .16 };
  const read = () => pointerColorContrast(pointerPage, center);
  const palette = await read();
  expect(palette.interactionContrast, 'Pointer color contrasts more strongly than ambient shapes').toBeGreaterThan(palette.ambientContrast);
  expect(palette.peak, 'Fresh pointer region contains only ambient background colors').toBeLessThanOrEqual(palette.threshold);
  await pointerPage.mouse.move(box.x + center.x - 100, box.y + center.y);
  // Sample the full transient ripple: its strongest tint can arrive after the gesture.
  const sampler = await pointerColorContrast(pointerPage, center, 1500);
  let response;
  try {
    await pointerPage.mouse.move(box.x + center.x + 100, box.y + center.y, { steps: 12 });
    response = await sampler.evaluate(async (sampler) => await sampler.result);
  } finally {
    await sampler.dispose();
  }
  expect(response.nearChanged, 'A continuous 200px pointer sweep changes nearby cells toward the interaction color').toBeGreaterThan(0);
  expect(response.controlPeak, 'A distant control region remains ambient throughout the ripple').toBeLessThanOrEqual(palette.threshold);
  await expect.poll(async () => (await read()).peak, { message: 'A stationary pointer stops injection and the ripple fades', timeout: 15000, intervals: [100, 250, 500] }).toBeLessThanOrEqual(palette.threshold);
  for (const offset of [0, 8, 16]) {
    await hero.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 2, isPrimary: true, buttons: 1, clientX: box.x + center.x + offset, clientY: box.y + center.y, bubbles: true });
  }
  await pointerPage.waitForTimeout(350);
  expect((await read()).peak, 'Touch pointer movement does not inject a ripple').toBeLessThanOrEqual(palette.threshold);
  expect(pointerErrors).toEqual([]);
  await pointerContext.close();
}

async function expectStaticBackground(targetPage, label) {
  const before = await backgroundPixels(targetPage);
  await targetPage.waitForTimeout(350);
  expect(await backgroundPixels(targetPage), label).toEqual(before);
}

async function verifyTerminalFallback(background) {
  await expect(background).toHaveAttribute('data-background-symbol', 'terminal-characters');
  const glyphs = background.locator('svg[data-background-fallback]:visible [data-terminal-glyph]');
  expect(await glyphs.evaluateAll((paths) => paths.map((path) => path.getAttribute('data-terminal-glyph')).sort()))
    .toEqual(['>', '_', '$', '/', '~', '|', '{', '}', '+'].sort());
  expect(await glyphs.evaluateAll((paths) => paths.every((path) => {
    const bounds = path.getBBox();
    const styles = getComputedStyle(path);
    return Boolean(path.getAttribute('d')?.trim()) && bounds.width + bounds.height > 0
      && styles.stroke !== 'none' && Number.parseFloat(styles.strokeWidth) > 0;
  })), 'Fallback terminal glyphs have visible stroked geometry').toBe(true);
}

async function verifyHeroComposition(targetPage, width) {
  await expect(targetPage.locator('#workspace img')).toHaveCount(1);
  expect(await targetPage.locator('.hero #workspace').evaluate((workspace) => {
    const outer = workspace.getBoundingClientRect();
    const player = workspace.querySelector('[data-video-player]').getBoundingClientRect();
    const actions = document.querySelector('.hero-actions').getBoundingClientRect();
    const gallery = document.querySelector('.gallery-shell').getBoundingClientRect();
    return player.width > 0 && player.height >= 200 && Math.abs(player.left - gallery.left) < 1 && Math.abs(player.right - gallery.right) < 1
      && Math.abs(player.top - outer.top) < 1 && Math.abs(player.bottom - outer.bottom) < 1 && outer.top >= actions.bottom
      && outer.left >= 0 && outer.right <= document.documentElement.clientWidth + 1;
  }), `One aligned player fits below hero copy at ${width}px`).toBe(true);
}

async function expectAnchorBelowHeader(targetPage, destination) {
  await expect.poll(() => targetPage.locator(destination).evaluate((target) => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const content = target.querySelector('h2, [data-video-player]') || target;
    const bounds = content.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, bounds.left + bounds.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, bounds.top + Math.min(16, bounds.height / 2)));
    return bounds.top >= header.bottom - 1 && bounds.top < innerHeight
      && target.contains(document.elementFromPoint(x, y));
  }), { message: `${destination} content clears the fixed header` }).toBe(true);
}

async function verifyAdaptiveHeader(targetPage) {
  const originalViewport = targetPage.viewportSize();
  const header = targetPage.locator('.site-header');
  const controlSelector = '.wordmark, .product-menu > summary, .navigation-link, .header-source, .mobile-navigation > summary';
  const controls = () => header.locator(controlSelector).evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    .map((element) => ({ contrast: element.dataset.contrast, label: element.textContent.trim() || element.getAttribute('aria-label') })));
  const settle = () => header.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
  const frames = () => targetPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const scrollSurface = (selector) => targetPage.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const bar = document.querySelector('.site-header').getBoundingClientRect();
    scrollTo({ top: scrollY + bounds.top + Math.min(120, bounds.height / 2) - bar.height / 2, behavior: 'instant' });
  });
  const setDarkSurface = (active) => targetPage.evaluate((active) => {
    const id = 'verify-header-dark-surface';
    document.getElementById(id)?.remove();
    if (active) {
      const header = document.querySelector('.site-header');
      const surface = document.createElement('div');
      surface.id = id;
      surface.setAttribute('aria-hidden', 'true');
      surface.style.cssText = `position:fixed;inset:0 0 auto;height:${header.clientHeight + 160}px;background:#121712;z-index:${Number(getComputedStyle(header).zIndex) - 1}`;
      document.body.append(surface);
    }
    window.dispatchEvent(new Event('scroll'));
  }, active);
  const expectControls = async (contrast) => {
    await expect.poll(async () => (await controls()).map((control) => control.contrast), {
      message: `Each visible navigation control uses ${contrast} foreground on this surface`,
    }).toEqual((await controls()).map(() => contrast));
    expect((await controls()).length).toBeGreaterThan(1);
    await settle();
  };
  const screenshotPixels = async () => {
    const { data, info } = await sharp(await targetPage.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => {
      const offset = (Math.floor(y) * info.width + Math.floor(x)) * info.channels;
      return [...data.subarray(offset, offset + 3)];
    };
    const mean = (x, y, width = 12, height = 12) => {
      const sums = [0, 0, 0];
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        pixel(x + column, y + row).forEach((channel, index) => { sums[index] += channel; });
      }
      return sums.map((sum) => sum / (width * height));
    };
    const edgeEnergy = (x, y, width = 16, height = 12) => {
      let sum = 0;
      for (let row = 0; row < height; row++) for (let column = 0; column < width - 1; column++) {
        const left = pixel(x + column, y + row), right = pixel(x + column + 1, y + row);
        sum += Math.abs(left[0] - right[0]);
      }
      return sum / ((width - 1) * height);
    };
    return { mean, edgeEnergy };
  };
  const distance = (left, right) => Math.hypot(...left.map((channel, index) => channel - right[index]));
  try {
    for (const width of [1440, 390]) {
      await targetPage.setViewportSize({ width, height: 900 });
      await targetPage.mouse.move(0, 0);
      await targetPage.evaluate(() => scrollTo({ top: 64, behavior: 'instant' }));
      let innerOpacity;
      try {
        await header.evaluate((element) => {
          const field = document.createElement('div');
          field.id = 'verify-local-header-field';
          field.setAttribute('aria-hidden', 'true');
          field.style.cssText = `position:fixed;inset:0 0 auto;height:${element.clientHeight + 160}px;display:grid;grid-template-columns:1fr 1fr;z-index:${Number(getComputedStyle(element).zIndex) - 1}`;
          for (const color of ['rgb(16,43,70)', 'rgb(241,221,194)']) {
            const column = document.createElement('div');
            column.style.cssText = `position:relative;background:${color}`;
            field.append(column);
          }
          const stripes = document.createElement('div');
          stripes.style.cssText = 'position:absolute;top:0;bottom:0;left:calc(42% - 16px);width:32px;background:repeating-linear-gradient(90deg,#000 0 4px,#fff 4px 8px)';
          field.append(stripes);
          document.body.append(field);
          window.dispatchEvent(new Event('scroll'));
        });
        for (const swapped of [false, true]) {
          if (swapped) await targetPage.evaluate(() => {
            const field = document.querySelector('#verify-local-header-field');
            field.children[0].style.backgroundColor = 'rgb(241,221,194)';
            field.children[1].style.backgroundColor = 'rgb(16,43,70)';
            window.dispatchEvent(new Event('scroll'));
          });
          await expect.poll(() => header.locator(controlSelector).evaluateAll((elements, swapped) => {
            const checked = elements.filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
              .map((element) => {
                const bounds = element.getBoundingClientRect(), x = bounds.left + bounds.width / 2;
                return { x, actual: element.dataset.contrast };
              }).filter(({ x }) => Math.abs(x - innerWidth / 2) > 72 && Math.abs(x - innerWidth * .42) > 84);
            return {
              left: checked.filter(({ x }) => x < innerWidth / 2).length,
              right: checked.filter(({ x }) => x > innerWidth / 2).length,
              mismatches: checked.filter(({ x, actual }) => actual !== ((x < innerWidth / 2) !== swapped ? 'light' : 'dark')).length,
            };
          }, swapped), { message: 'Opposite sides of the navigation adapt independently to their local backgrounds' }).toMatchObject({ mismatches: 0 });
          const counts = await header.locator(controlSelector).evaluateAll((elements) => elements
            .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
            .map((element) => element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2)
            .filter((x) => Math.abs(x - innerWidth / 2) > 72 && Math.abs(x - innerWidth * .42) > 84)
            .reduce((counts, x) => { counts[x < innerWidth / 2 ? 0 : 1]++; return counts; }, [0, 0]));
          expect(counts.every((count) => count > 0), 'The fixture exercises controls on both colored halves').toBe(true);
          await settle();
          innerOpacity = await header.locator('.header-inner').evaluate((element) => {
            const original = element.style.opacity;
            element.style.opacity = '0';
            return original;
          });
          const pixels = await screenshotPixels();
          const barHeight = (await header.boundingBox()).height;
          const left = pixels.mean(width * .08, barHeight / 2 - 6);
          const right = pixels.mean(width * .92 - 12, barHeight / 2 - 6);
          const navy = [16, 43, 70], cream = [241, 221, 194];
          expect(distance(left, right), 'Different underlying colors remain visible simultaneously through the fog').toBeGreaterThan(100);
          expect(distance(left, swapped ? cream : navy), 'Left fog follows the local color without an opaque global tint').toBeLessThan(40);
          expect(distance(right, swapped ? navy : cream), 'Right fog follows the local color without an opaque global tint').toBeLessThan(40);
          const rawDetail = pixels.edgeEnergy(width * .42 - 8, barHeight + 48);
          const fogDetail = pixels.edgeEnergy(width * .42 - 8, barHeight / 2 - 6);
          expect(rawDetail, 'The uncovered fixture contains sharp text-scale detail').toBeGreaterThan(20);
          expect(fogDetail, 'Native fog softens detail underneath the navigation').toBeLessThan(rawDetail * .35);
          await header.locator('.header-inner').evaluate((element, value) => { element.style.opacity = value; }, innerOpacity);
          innerOpacity = undefined;
        }
      } finally {
        if (innerOpacity !== undefined) await header.locator('.header-inner').evaluate((element, value) => { element.style.opacity = value; }, innerOpacity);
        await targetPage.evaluate(() => {
          document.querySelector('#verify-local-header-field')?.remove();
          window.dispatchEvent(new Event('scroll'));
        });
      }
      await setDarkSurface(false);
      await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expectControls('dark');
      await setDarkSurface(true);
      await expectControls('light');
      await setDarkSurface(false);
      await scrollSurface('.hero');
      await expectControls('dark');
      await scrollSurface('[data-video-player]');
      if (width >= 768) {
        await expect.poll(() => header.locator(controlSelector).evaluateAll((elements) => {
          const image = document.querySelector('[data-video-player]').getBoundingClientRect();
          const contrasts = elements.filter((element) => element.getClientRects().length).map((element) => {
            const bounds = element.getBoundingClientRect(), x = bounds.left + bounds.width / 2;
            return { x, contrast: element.dataset.contrast };
          }).filter(({ x }) => x > image.left + 72 && x < image.right - 72).map(({ contrast }) => contrast);
          return { present: contrasts.length > 0, correct: contrasts.every((contrast) => contrast === 'light') };
        }), { message: 'Controls directly above the dark product capture use light foreground' }).toEqual({ present: true, correct: true });
      }
      for (const selector of ['[data-video-player]']) {
        await targetPage.locator(selector).evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const bar = document.querySelector('.site-header').getBoundingClientRect();
          scrollTo({ top: scrollY + bounds.top + 1 - bar.height / 2, behavior: 'instant' });
        });
        await frames();
        await settle();
        const labels = await header.locator(width < 768 ? '.mobile-navigation > summary' : '.navigation-link').evaluateAll((elements) => elements
          .filter((element) => element.getClientRects().length).map((element) => {
            const bounds = element.getBoundingClientRect();
            return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
              color: getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number), label: element.textContent.trim() };
          }));
        expect(labels.length, 'The boundary probe exercises visible navigation text').toBeGreaterThan(0);
        const originalOpacity = await header.locator('.header-inner').evaluate((element) => {
          const original = element.style.opacity;
          element.style.opacity = '0';
          return original;
        });
        try {
          const pixels = await screenshotPixels();
          const luminance = (rgb) => rgb.map((channel) => {
            const value = channel / 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
          }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
          for (const label of labels) {
            const foreground = luminance(label.color);
            const background = luminance(pixels.mean(label.x - 4, label.y - 2, 9, 5));
            const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
            expect(ratio, `Rendered ${label.label} contrast at the ${selector} blur boundary at ${width}px`).toBeGreaterThanOrEqual(4.5);
          }
        } finally {
          await header.locator('.header-inner').evaluate((element, value) => { element.style.opacity = value; }, originalOpacity);
        }
      }
      await scrollSurface('.site-footer');
      const footerContrast = await targetPage.locator('.site-footer').evaluate((footer) => {
        const rgb = getComputedStyle(footer).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = rgb.map((channel) => {
          const value = channel / 255;
          return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
        return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? 'dark' : 'light';
      });
      await expectControls(footerContrast);
      await setDarkSurface(false);
      await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expectControls('dark');
      const mobile = width < 768;
      const open = async () => {
        if (mobile) {
          await targetPage.locator('#mobile-navigation > summary').focus();
          await targetPage.keyboard.press('Enter');
        }
        await targetPage.locator(mobile ? '#mobile-product > summary' : '#product-menu > summary').focus();
        await targetPage.keyboard.press('Enter');
        await settle();
      };
      const close = async () => {
        await targetPage.keyboard.press('Escape');
        if (mobile) await targetPage.keyboard.press('Escape');
      };
      await open();
      const panelStyle = () => targetPage.locator(mobile ? '.mobile-panel' : '.product-panel').evaluate((panel) => ({
        background: getComputedStyle(panel).backgroundColor,
        title: getComputedStyle(panel.querySelector('.product-link-title')).color,
        groupHeading: getComputedStyle(panel.querySelector('.product-group-label')).color,
      }));
      const originalPanelStyle = await panelStyle();
      await setDarkSurface(true);
      await expectControls('dark');
      expect(await panelStyle(), 'Open dropdown panels retain their readable route palette while the page scrolls').toEqual(originalPanelStyle);
      const accessibility = await new AxeBuilder({ page: targetPage }).include('.site-header').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations, `Unified Product navigation readability at ${width}px`).toEqual([]);
      await close();
      await expectControls('light');
      await open();
      await expectControls('dark');
      await setDarkSurface(false);
      await scrollSurface('.hero');
      await expectControls('dark');
      await close();
      await expectControls('dark');
      if (!mobile) {
        await targetPage.evaluate(() => { const dialog = document.createElement('dialog'); dialog.id = 'verify-native-dialog'; dialog.textContent = 'Native modal probe'; document.body.append(dialog); dialog.showModal(); });
        await expect(targetPage.locator('#verify-native-dialog')).toBeVisible();
        const modalForegrounds = await controls();
        await setDarkSurface(true);
        await frames();
        expect(await controls(), 'An open native modal freezes local navigation foregrounds').toEqual(modalForegrounds);
        await targetPage.locator('#verify-native-dialog').evaluate((element) => element.addEventListener('close', () => { element.dataset.verifyClosed = 'true'; }, { once: true }));
        await targetPage.keyboard.press('Escape');
        await expect(targetPage.locator('#verify-native-dialog')).toHaveAttribute('data-verify-closed', 'true');
        await expect(targetPage.locator('#verify-native-dialog')).not.toBeVisible();
        await targetPage.locator('#verify-native-dialog').evaluate((element) => element.remove());
        await expectControls('light');
      }
      await setDarkSurface(false);
      await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expectControls('dark');
    }
  } finally {
    await setDarkSurface(false);
  }
  await targetPage.setViewportSize(originalViewport);
  await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expectControls('dark');
}

async function verifyFixedHeader(targetPage, javaScriptEnabled = true) {
  const originalViewport = targetPage.viewportSize();
  const header = targetPage.locator('.site-header');
  await targetPage.mouse.move(0, 0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await targetPage.setViewportSize(viewport);
    for (const destination of ['#workspace', '#roadmap', '.site-footer']) {
      await targetPage.locator(destination).evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await expect(header).toHaveCSS('position', 'fixed');
      const bounds = await header.boundingBox();
      expect(Math.abs(bounds.y), `Header remains at the viewport top above ${destination}`).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds.x), 'Header begins at the viewport left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(bounds.width - viewport.width), 'Header spans the viewport').toBeLessThanOrEqual(1);
      await expectAnchorBelowHeader(targetPage, destination);
    }
  }
  for (const viewport of [{ width: 1440, height: 200 }, { width: 390, height: 320 }]) {
    await targetPage.setViewportSize(viewport);
    const mobile = viewport.width < 768;
    if (!javaScriptEnabled) {
      await expect(targetPage.locator('#product-menu')).not.toBeVisible();
      await expect(targetPage.locator('#mobile-navigation')).not.toBeVisible();
      const links = targetPage.locator('.desktop-navigation .product-fallback, .desktop-navigation .navigation-link:not(.product-fallback)');
      await expect(links).toHaveCount(5);
      for (const link of await links.all()) {
        await expect(link).toBeVisible();
        await link.focus();
        await expect(link).toBeFocused();
        expect(await link.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
            && element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
        }), 'Compact no-JavaScript navigation links remain unobstructed').toBe(true);
      }
      continue;
    }
    const root = targetPage.locator('#mobile-navigation');
    if (mobile) {
      await root.locator(':scope > summary').focus();
      await targetPage.keyboard.press('Enter');
    }
    const menu = targetPage.locator(mobile ? '#mobile-product' : '#product-menu');
    await menu.locator(':scope > summary').focus();
    await targetPage.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    const links = menu.locator('.product-link');
    for (const link of await links.all()) {
      await link.focus();
      await link.evaluate((element) => element.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
      await expect.poll(() => link.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        return bounds.top >= document.querySelector('.header-inner').getBoundingClientRect().bottom - 1
          && bounds.bottom <= innerHeight + 1 && element.contains(document.elementFromPoint(point.x, point.y));
      }), { message: `Product links remain reachable at ${viewport.width}x${viewport.height}` }).toBe(true);
    }
    await menu.locator(':scope > summary').focus();
    await targetPage.keyboard.press('Enter');
    if (mobile) {
      await root.locator(':scope > summary').focus();
      await targetPage.keyboard.press('Enter');
    }
  }
  await targetPage.setViewportSize(originalViewport);
  await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
}

async function verifyStaticBackdropDoesNotBlockPage(targetPage) {
  await expect(targetPage.locator('.navigation-backdrop')).not.toBeVisible();
  const pageLink = targetPage.locator('.site-footer .footer-takeoff');
  await pageLink.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  expect(await pageLink.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hit?.closest('a') === element && !hit.closest('.navigation-backdrop');
  }), 'No-JavaScript navigation leaves page links unobstructed').toBe(true);
  await pageLink.click();
  await expect(targetPage).toHaveURL(new URL('/#top', url).href);
}

async function verifyDevlog(javaScriptEnabled) {
  const devlogContext = await browser.newContext({ javaScriptEnabled });
  await devlogContext.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  const devlogPage = await devlogContext.newPage();
  await mockVideoRequests(devlogPage);
  await devlogPage.route(releaseUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>GitHub releases</h1>' }));
  const devlogErrors = [];
  devlogPage.on('pageerror', (error) => devlogErrors.push(error.message));
  const activate = async (link) => {
    if (javaScriptEnabled) await link.click();
    else {
      await expect(link).toBeVisible();
      await link.focus();
      await devlogPage.keyboard.press('Enter');
    }
  };
  const devlogUrl = new URL('/devlog/', url).href;
  for (const width of [1440, 390]) {
    await devlogPage.setViewportSize({ width, height: 900 });
    const mobile = width < 768;
    const openRoot = async () => {
      if (mobile && javaScriptEnabled) await activate(devlogPage.locator('#mobile-navigation > summary'));
    };
    const rootLinks = () => devlogPage.locator(mobile && javaScriptEnabled ? '#mobile-navigation .mobile-root-link' : '.desktop-navigation .navigation-link:not(.product-fallback)');
    await devlogPage.goto(url);
    if (!javaScriptEnabled) {
      await devlogPage.locator('.product-fallback').click();
      await expect(devlogPage.locator('#workspace')).toBeInViewport();
      await verifyStaticBackdropDoesNotBlockPage(devlogPage);
      await devlogPage.goto(url);
    }
    await openRoot();
    await activate(rootLinks().and(devlogPage.locator('a[href="/devlog/"]')));
    await expect(devlogPage).toHaveURL(devlogUrl);
    await expect(devlogPage).toHaveTitle('Devlog — lomi');
    await expect(devlogPage.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(devlogPage.getByRole('heading', { level: 1 })).toHaveAccessibleName('Devlog.');
    await expect(devlogPage.locator('main article')).toHaveCount(0);
    await expect(devlogPage.locator('.wordmark')).toHaveAttribute('href', '/');
    await expect(devlogPage.getByRole('link', { name: 'Back to lomi' })).toHaveAttribute('href', '/');
    expect(await devlogPage.evaluate(() => document.documentElement.scrollWidth), `Devlog at ${width}px`).toBe(width);
    await expect(rootLinks().and(devlogPage.locator('a[href="/devlog/"]'))).toHaveAttribute('aria-current', 'page');
    await expect(rootLinks().and(devlogPage.locator('a[href="/#roadmap"]'))).toHaveCount(1);
    await expect(rootLinks().and(devlogPage.locator('a[href="https://docs.lomi.dev"]'))).toHaveCount(1);
    await expect(devlogPage.locator('.site-header [data-download-open]')).toHaveCount(0);
    if (javaScriptEnabled) {
      const accessibility = await new AxeBuilder({ page: devlogPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations, `Devlog accessibility at ${width}px`).toEqual([]);
    }
    await openRoot();
    if (javaScriptEnabled) {
      const product = devlogPage.locator(mobile ? '#mobile-product' : '#product-menu');
      await activate(product.locator(':scope > summary'));
      expect(await product.locator('.product-link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))))
        .toEqual(['/#workspace', '/#features', '/remote/', 'https://docs.lomi.dev', 'https://github.com/lomi-dev/lomi', downloadPath, releaseUrl]);
      await activate(product.locator('a[href="/#features"]'));
    } else {
      await expect(devlogPage.locator('.product-fallback')).toHaveAttribute('href', '/#workspace');
      await devlogPage.locator('.product-fallback').click();
    }
    const productAnchor = javaScriptEnabled ? '#features' : '#workspace';
    await expect(devlogPage).toHaveURL(new URL(`/${productAnchor}`, url).href);
    await expect(devlogPage.locator(productAnchor)).toBeInViewport();
    await expectAnchorBelowHeader(devlogPage, productAnchor);
    await devlogPage.goto(devlogUrl);
    await openRoot();
    await activate(rootLinks().and(devlogPage.locator('a[href="/#roadmap"]')));
    await expect(devlogPage).toHaveURL(new URL('/#roadmap', url).href);
    await expect(devlogPage.locator('#roadmap')).toBeInViewport();
    await expectAnchorBelowHeader(devlogPage, '#roadmap');
    await devlogPage.goto(devlogUrl);
    if (javaScriptEnabled || !mobile) {
      await openRoot();
      const download = devlogPage.locator(mobile ? '.mobile-download' : '.header-action');
      await expect(download).toHaveAttribute('href', downloadPath);
      await activate(download);
      await expect(devlogPage).toHaveURL(new URL(downloadPath, url).href);
    }
    await devlogPage.goto(devlogUrl);
    await activate(devlogPage.getByRole('link', { name: 'Back to lomi' }));
    await expect(devlogPage).toHaveURL(new URL('/', url).href);
  }
  expect(devlogErrors, `Devlog page errors with JavaScript ${javaScriptEnabled}`).toEqual([]);
  await devlogContext.close();
}

async function verifyLongFooterSignoff(targetPage) {
  const signoff = targetPage.locator('.site-footer .footer-invitation h2');
  const original = await signoff.textContent();
  // footer.signoff accepts trimmed text from 1 through 2000 characters.
  const longSignoff = 'Keep the project in view, with room for every idea. '.repeat(12).slice(0, 520).trim();
  expect(longSignoff.length, 'Representative long CMS signoff').toBeGreaterThanOrEqual(500);
  expect(longSignoff.length).toBeLessThanOrEqual(2000);
  try {
    await signoff.evaluate((element, value) => { element.textContent = value; }, longSignoff);
    // Just above the short-window breakpoint: long copy must not squeeze links out.
    await verifyViewportFooter(targetPage, false, [{ width: 320, height: 400 }]);
  } finally {
    await signoff.evaluate((element, value) => { element.textContent = value; }, original);
  }
  await expect(signoff).toHaveText(original);
}

try {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/\S/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.site-footer a[href="https://github.com/lomi-dev/lomi"]').first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toBeVisible();
  const desktopNavigation = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  const desktopLinks = await desktopNavigation.locator('a.navigation-link:not(.product-fallback):visible').evaluateAll((links) => links.map((link) => {
    const label = link.cloneNode(true);
    label.querySelectorAll('[aria-hidden="true"]').forEach((decoration) => decoration.remove());
    return { href: link.getAttribute('href'), label: link.getAttribute('aria-label') || label.textContent.trim() };
  }));
  expect(desktopLinks.length, 'Desktop navigation links').toBeGreaterThan(0);
  for (const [index, link] of desktopLinks.entries()) {
    await expect(desktopNavigation.locator('a.navigation-link:not(.product-fallback):visible').nth(index)).toHaveAccessibleName(link.label);
  }
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.locator('#roadmap').getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.locator('#roadmap .roadmap-masthead, #roadmap .section-marker')).toHaveCount(0);
  expect(await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.classList.contains('hero') ? 'hero' : section.id))).toEqual(['hero', 'features', 'agent-workflows', 'roadmap', 'newsletter']);
  await expect(page.locator('#workflow, #principles, #faq, #download, .download-cta')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Keep me posted' })).toHaveCount(1);
  const anchors = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return {
      duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
      missingTargets: [...document.querySelectorAll('a[href^="#"]')]
        .map((link) => link.getAttribute('href'))
        .filter((href) => href.length < 2 || !document.getElementById(decodeURIComponent(href.slice(1)))),
    };
  });
  expect(anchors.duplicates, 'Unique element IDs').toEqual([]);
  expect(anchors.missingTargets, 'Internal anchor destinations').toEqual([]);
  await expect(page.locator('#download-dialog')).toHaveCount(0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('.hero h1')).toBeInViewport();
    await expect(page.locator('.hero h1')).toHaveCSS('text-align', 'center');
    const copyBounds = await page.locator('.hero-content').boundingBox();
    expect(Math.abs(copyBounds.x + copyBounds.width / 2 - viewport.width / 2), 'The hero copy block is centered in the viewport').toBeLessThanOrEqual(1);
    await expect(page.locator('.hero a[href="/download/"]')).toBeInViewport();
    const image = await page.locator('.hero #workspace [data-video-player]').boundingBox();
    const visibleHeight = Math.max(0, Math.min(viewport.height, image.y + image.height) - Math.max(0, image.y));
    expect(image.y, 'The screenshot follows the hero copy').toBeGreaterThan(0);
    expect(image.y + image.height, 'The full screenshot continues below the initial fold').toBeGreaterThan(viewport.height);
    expect(visibleHeight / image.height, 'A meaningful part of the screenshot appears initially').toBeGreaterThan(.1);
    await page.mouse.move(image.x + image.width / 2, Math.max(0, image.y) + visibleHeight / 2);
  }
  await page.setViewportSize({ width: 1440, height: 900 });


  await verifyFixedHeader(page);
  await verifyAdaptiveHeader(page);
  const productMenu = page.locator('#product-menu');
  const productSummary = productMenu.locator(':scope > summary');
  await expect(productMenu.locator('.product-link')).toHaveCount(7);
  await expect(productMenu.locator('.product-group')).toHaveCount(3);
  const productDestinations = await productMenu.locator('.product-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(productDestinations).toEqual(['#workspace', '#features', '/remote/', 'https://docs.lomi.dev', 'https://github.com/lomi-dev/lomi', downloadPath, releaseUrl]);
  await expect(productMenu.locator(`.product-link[href="${downloadPath}"]`)).toHaveCount(1);
  await expect(productMenu.locator(`.product-link[href="${downloadPath}"]`)).not.toHaveAttribute('data-download-open');
  await expect(productMenu.locator(`.product-link[href="${releaseUrl}"]`)).not.toHaveAttribute('data-download-open');
  for (const link of await productMenu.locator('.product-link').all()) {
    await expect(link.locator('.product-link-title')).toHaveText(/\S/);
  }
  await page.locator('.wordmark').focus();
  await productSummary.hover();
  await expect(productMenu).toHaveAttribute('open', '');
  await productMenu.locator('.product-link').first().hover();
  await expect(productMenu).toHaveAttribute('open', '');
  await page.mouse.move(0, 0);
  await expect(productMenu).not.toHaveAttribute('open');
  await productSummary.hover();
  await expect(productMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(productMenu).not.toHaveAttribute('open');
  await expect(productSummary).toBeFocused();
  await page.mouse.move(0, 0);
  await page.locator('.wordmark').focus();
  const productSummaryBounds = await productSummary.boundingBox();
  await page.mouse.move(productSummaryBounds.x + productSummaryBounds.width / 2, productSummaryBounds.y + productSummaryBounds.height / 2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  await expect(productMenu, 'Escape cancels a pending hover opening').not.toHaveAttribute('open');

  await productSummary.click();
  await expect(productMenu).toHaveAttribute('open', '');
  await productSummary.click();
  await expect(productMenu).not.toHaveAttribute('open');
  await page.mouse.move(0, 0);
  await productSummary.focus();
  await page.keyboard.press('Enter');
  await expect(productMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(productMenu.locator('.product-link').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(productMenu).not.toHaveAttribute('open');
  await expect(productSummary).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(desktopNavigation.locator('.navigation-link:not(.product-fallback)').first(), 'Closed Product links leave the Tab order').toBeFocused();
  await productSummary.focus();
  await page.keyboard.press('Space');
  await expect(productMenu).toHaveAttribute('open', '');
  await desktopNavigation.locator('.navigation-link:not(.product-fallback)').first().focus();
  await expect(productMenu).not.toHaveAttribute('open');
  await productSummary.click();
  await expect(productMenu).toHaveAttribute('open', '');
  const openProductPanel = await productMenu.locator('.product-panel').boundingBox();
  const outsideProductY = openProductPanel.y + openProductPanel.height + 12;
  expect(outsideProductY, 'The outside-dismissal point lies below the full-width Product panel').toBeLessThan(page.viewportSize().height);
  await page.mouse.click(8, outsideProductY);
  await expect(productMenu).not.toHaveAttribute('open');
  await expect(productSummary, 'Outside dismissal returns focus from closed Product').toBeFocused();
  await productSummary.click();
  const productA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(productA11y.violations, 'Accessibility with desktop Product open').toEqual([]);
  await page.keyboard.press('Escape');
  for (const destination of productDestinations.filter((href) => href.startsWith('#'))) {
    await productSummary.click();
    await productMenu.locator(`a[href="${destination}"]`).click();
    await expect(page).toHaveURL(new URL(destination, url).href);
    await expect(productMenu).not.toHaveAttribute('open');
    await expect(page.locator(destination)).toBeInViewport();
    await expectAnchorBelowHeader(page, destination);
    await expect(page.locator(destination), 'Closed navigation focuses the chosen section').toBeFocused();
  }
  await page.locator('.header-source').focus();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('#mobile-navigation > summary'), 'Resizing restores focus from hidden desktop utilities').toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(productSummary, 'Resizing restores focus from hidden mobile navigation').toBeFocused();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));

  const hero = page.locator('.hero');
  const background = hero.locator('lomi-shape-waves');
  const backgroundCanvas = background.locator('canvas[data-background-canvas]');
  await expect(background).toHaveAttribute('data-background-symbol', 'terminal-characters');
  await expect(background).toHaveAttribute('data-renderer', 'canvas');
  await expect(background).toHaveAttribute('data-state', 'running');
  await expect(backgroundCanvas).toBeVisible();
  await expect(backgroundCanvas).toHaveCSS('opacity', '1');
  expect((await backgroundPixels(page)).colors, 'Background draws visible shapes, not a blank canvas').toBeGreaterThan(1);
  const runningPixels = await backgroundPixels(page);
  await expect.poll(() => backgroundPixels(page), { message: 'Running background pixels actually change' }).not.toEqual(runningPixels);

  await expect(page.locator('astro-island, .agent-constellation, [data-agent]')).toHaveCount(0);
  await expect(hero.locator('.hero-eyebrow, .hero-note, [data-motion-toggle]')).toHaveCount(0);
  await page.mouse.move(0, 0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(background).toHaveAttribute('data-state', 'reduced');
  await expectStaticBackground(page, 'Live reduced-motion preference freezes background pixels');
  const reducedBackgroundPixels = await backgroundPixels(page);
  const reducedHeroBounds = await hero.boundingBox();
  await page.mouse.move(reducedHeroBounds.x + reducedHeroBounds.width * .5, reducedHeroBounds.y + reducedHeroBounds.height * .16);
  await page.waitForTimeout(350);
  expect(await backgroundPixels(page), 'Reduced motion ignores pointer movement').toEqual(reducedBackgroundPixels);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(background).toHaveAttribute('data-state', 'running');
  const resumedPixels = await backgroundPixels(page);
  await expect.poll(() => backgroundPixels(page), { message: 'Removing reduced-motion preference restarts background pixels' }).not.toEqual(resumedPixels);
  await page.locator('.site-footer').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(background).toHaveAttribute('data-state', 'offscreen');
  await expectStaticBackground(page, 'Offscreen background stops rendering new frames');
  await hero.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(background).toHaveAttribute('data-state', 'running');

  const workspace = page.locator('.hero #workspace');
  const workspaceImage = workspace.locator('[data-video-player]');
  await expect(workspace.locator('img')).toHaveCount(1);
  await expect(workspace.locator('img')).toHaveAttribute('alt', /project explorer, TypeScript editor and integrated terminal/);
  await expect(workspace.locator('picture source').first()).toHaveAttribute('srcset', /hero-workbench/);
  await expect.poll(() => workspace.locator('img').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await verifyInlineVideo(page, videoRequests);

  for (const width of [320, 390, 640, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `Layout at ${width}px`).toBe(width);
    await expect.poll(() => backgroundCanvas.evaluate((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      return canvas.width > 0 && canvas.height > 0 && bounds.width > 0 && bounds.height > 0
        && Math.abs(canvas.width / canvas.height - bounds.width / bounds.height) < .01
        && Math.abs(bounds.width - canvas.closest('lomi-shape-waves').clientWidth) <= 1
        && Math.abs(bounds.height - canvas.closest('lomi-shape-waves').clientHeight) <= 1;
    }), { message: `Background canvas resizes to its hero background area at ${width}px` }).toBe(true);

    await verifyHeroComposition(page, width);
    const imageBounds = await workspaceImage.boundingBox();
    expect(imageBounds.x, `Product screenshot fits at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(imageBounds.x + imageBounds.width, `Product screenshot fits at ${width}px`).toBeLessThanOrEqual(width);
    if (width === 640) {
      // 640 CSS pixels provides the reflow width of a 1280px window at 200% zoom.
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth), 'Heading reflows at 200% equivalent width').toBe(true);
    }
  }
  await verifyViewportFooter(page, true);
  await verifyLongFooterSignoff(page);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.locator('#roadmap').scrollIntoViewIfNeeded();
  await expect(page.locator('#roadmap')).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('#mobile-navigation');
  const mobileSummary = mobileMenu.locator(':scope > summary');
  await expect(mobileSummary).toBeVisible();
  await expect(mobileMenu).not.toHaveAttribute('open');
  const mobileProduct = mobileMenu.locator('#mobile-product');
  const mobileProductSummary = mobileProduct.locator(':scope > summary');
  await expect(mobileProduct.locator('.product-group')).toHaveCount(3);
  expect(await mobileProduct.locator('.product-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(productDestinations);
  await expect(mobileProduct.locator(`.product-link[href="${downloadPath}"]`)).toHaveCount(1);
  await expect(mobileProduct.locator(`.product-link[href="${downloadPath}"]`)).not.toHaveAttribute('data-download-open');
  await expect(mobileProduct.locator(`.product-link[href="${releaseUrl}"]`)).not.toHaveAttribute('data-download-open');
  const mobileRootLinks = mobileMenu.locator('.mobile-root-link');
  expect(await mobileRootLinks.evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute('href'), label: link.textContent.trim(),
  }))), 'Consistent direct desktop and mobile navigation').toEqual(desktopLinks);
  await mobileSummary.click();
  await mobileProductSummary.focus();
  await page.keyboard.press('Enter');
  await expect(mobileProduct).toHaveAttribute('open', '');
  await expect(mobileProductSummary).toHaveAccessibleName('Back');
  for (const link of await mobileRootLinks.all()) await expect(link).not.toBeVisible();
  await expect(mobileMenu.locator('.mobile-utilities')).not.toBeVisible();
  await page.locator('.site-header').evaluate(async (header) => {
    await Promise.all(header.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
  const mobileMenuA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobileMenuA11y.violations, 'Accessibility with mobile Product drill-in open').toEqual([]);
  await mobileProductSummary.click();
  await expect(mobileProduct).not.toHaveAttribute('open');
  await expect(mobileRootLinks.first()).toBeVisible();
  await mobileProductSummary.click();
  await page.keyboard.press('Escape');
  await expect(mobileProduct).not.toHaveAttribute('open');
  await expect(mobileMenu).toHaveAttribute('open', '');
  await expect(mobileProductSummary).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(mobileMenu).not.toHaveAttribute('open');
  await expect(mobileSummary).toBeFocused();
  await mobileSummary.click();
  await mobileProductSummary.click();
  await mobileSummary.click();
  await expect(mobileMenu).not.toHaveAttribute('open');
  await expect(mobileProduct).not.toHaveAttribute('open');
  for (const destination of productDestinations.filter((href) => href.startsWith('#'))) {
    await mobileSummary.click();
    await mobileProductSummary.click();
    const link = mobileProduct.locator(`a[href="${destination}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new URL(destination, url).href);
    await expect(mobileMenu).not.toHaveAttribute('open');
    await expect(mobileProduct).not.toHaveAttribute('open');
    await expect(page.locator(destination)).toBeInViewport();
    await expectAnchorBelowHeader(page, destination);
    await expect(page.locator(destination), 'Closed navigation focuses the chosen section').toBeFocused();
  }
  await mobileSummary.click();
  await mobileMenu.locator('a.mobile-root-link[href="#roadmap"]').click();
  await expect(page.locator('#roadmap')).toBeInViewport();
  await expectAnchorBelowHeader(page, '#roadmap');
  await expect(mobileMenu).not.toHaveAttribute('open');

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/page-${width}.png`, fullPage: true });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(`artifacts/accessibility-${width}.json`, JSON.stringify(results.violations, null, 2));
    expect(results.violations, `Accessibility at ${width}px`).toEqual([]);
  }
  await expect(page.locator('#download-dialog, [data-download-open]')).toHaveCount(0);
  await expect(page.locator('#video-dialog')).toHaveCount(0);
  for (const link of await page.locator('a[href="/download/"]').all()) {
    await expect(link).not.toHaveAttribute('aria-controls');
  }

  await expect(page.locator('astro-island, .agent-constellation, [data-agent]')).toHaveCount(0);
  expect(errors).toEqual([]);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await staticContext.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  const staticPage = await staticContext.newPage();
  await mockVideoRequests(staticPage);
  await staticPage.route(releaseUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>GitHub releases</h1>' }));
  await staticPage.goto(url);
  await expect(staticPage.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  await verifyFixedHeader(staticPage, false);
  await expect(staticPage.locator('#roadmap').getByRole('heading', { level: 2 })).toBeVisible();
  expect(await staticPage.locator('main > section').evaluateAll((sections) => sections.map((section) => section.classList.contains('hero') ? 'hero' : section.id))).toEqual(['hero', 'features', 'agent-workflows', 'roadmap', 'newsletter']);
  await expect(staticPage.locator('#workflow, #principles, #faq, #download, .download-cta')).toHaveCount(0);
  await expect(staticPage.getByRole('textbox', { name: 'Email address' })).toBeDisabled();
  await expect(staticPage.getByRole('button', { name: 'Keep me posted' })).toBeDisabled();
  await expect(staticPage.locator('.newsletter-noscript')).toHaveText('Enable JavaScript to subscribe to the newsletter.');
  const staticBackground = staticPage.locator('lomi-shape-waves');
  await expect(staticBackground).toHaveAttribute('data-renderer', 'fallback');
  await verifyTerminalFallback(staticBackground);
  await expect(staticBackground.locator('svg[data-background-fallback]:visible')).toBeVisible();
  await expect(staticBackground.locator('svg[data-background-fallback]:visible')).toHaveCSS('opacity', '1');
  await expect(staticBackground.locator('canvas[data-background-canvas]')).toHaveCSS('opacity', '0');
  await expect(staticPage.locator('astro-island, .agent-constellation, [data-agent]')).toHaveCount(0);
  await expect(staticPage.locator('.hero .hero-eyebrow, .hero .hero-note, .hero [data-motion-toggle]')).toHaveCount(0);
  await expect(staticPage.locator('.hero .hero-explore')).toHaveAttribute('href', '#workspace');
  const staticWorkspace = staticPage.locator('.hero #workspace');
  await expect(staticWorkspace.locator('img')).toHaveCount(1);
  const staticImage = staticWorkspace.locator('[data-video-poster] img');
  await expect(staticImage).toBeVisible();
  await expect(staticImage).toHaveAttribute('alt', '');
  await expect.poll(() => staticImage.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  await verifyHeroComposition(staticPage, 390);
  await expect(staticWorkspace.locator('iframe')).toHaveCount(0);
  const fallbackLink = staticWorkspace.locator('[data-video-poster]');
  await expect(fallbackLink).toHaveAttribute('href', videoUrl);
  await fallbackLink.evaluate((element) => element.removeAttribute('target'));
  await staticPage.route(videoUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>YouTube video destination</h1>' }));
  await fallbackLink.click();
  await expect(staticPage).toHaveURL(videoUrl);
  await staticPage.goto(url);
  const staticHeroDownload = staticPage.locator('.hero a[href="/download/"]');
  await expect(staticHeroDownload).toBeVisible();
  await expect(staticHeroDownload).toHaveAttribute('href', downloadPath);
  await staticHeroDownload.click();
  await expect(staticPage).toHaveURL(new URL(downloadPath, url).href);
  await staticPage.goto(url);
  await expect(staticPage.locator('#mobile-navigation')).not.toBeVisible();
  await expect(staticPage.locator('#product-menu')).not.toBeVisible();
  const staticProduct = staticPage.locator('.product-fallback');
  await expect(staticProduct).toHaveAttribute('href', '#workspace');
  await staticProduct.click();
  await expectAnchorBelowHeader(staticPage, '#workspace');
  const staticRoadmap = staticPage.locator('.desktop-navigation a.navigation-link[href="#roadmap"]');
  await staticRoadmap.click();
  await expectAnchorBelowHeader(staticPage, '#roadmap');
  await verifyStaticBackdropDoesNotBlockPage(staticPage);
  await verifyViewportFooter(staticPage);
  await verifyLongFooterSignoff(staticPage);
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await staticPage.goto(url);
  await staticPage.keyboard.press('Tab');
  await expect(staticPage.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await staticPage.keyboard.press('Enter');
  await expect(staticPage.locator('#main')).toBeFocused();
  await staticContext.close();
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await touchContext.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  const touchPage = await touchContext.newPage();
  const touchVideoRequests = await mockVideoRequests(touchPage);
  await touchPage.goto(url, { waitUntil: 'networkidle' });
  await verifyInlineVideo(touchPage, touchVideoRequests);
  await touchContext.close();
  await verifyBackgroundPointer();
  await verifyDevlog(true);
  await verifyDevlog(false);

  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fallbackContext.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  await fallbackContext.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === '2d' ? null : Reflect.apply(getContext, this, [type, ...args]);
    };
  });
  const fallbackPage = await fallbackContext.newPage();
  await mockVideoRequests(fallbackPage);
  const fallbackErrors = [];
  fallbackPage.on('pageerror', (error) => fallbackErrors.push(error.message));
  await fallbackPage.goto(url, { waitUntil: 'networkidle' });
  const unavailableBackground = fallbackPage.locator('lomi-shape-waves');
  await expect(unavailableBackground).toHaveAttribute('data-renderer', 'fallback');
  await verifyTerminalFallback(unavailableBackground);
  await expect(unavailableBackground.locator('svg[data-background-fallback]:visible')).toBeVisible();
  await expect(unavailableBackground.locator('svg[data-background-fallback]:visible')).toHaveCSS('opacity', '1');
  await expect(unavailableBackground.locator('canvas[data-background-canvas]')).toHaveCSS('opacity', '0');
  await expect(fallbackPage.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(fallbackPage.locator('.hero a[href="/download/"]')).toHaveAttribute('href', downloadPath);
  expect(fallbackErrors, 'Canvas 2D unavailable fallback has no page errors').toEqual([]);
  await fallbackContext.close();
  console.log('Passed: Hero/Features/Roadmap/Newsletter/Footer and remaining anchors, 7 viewport widths including 200% equivalent reflow and landscape, terminal-glyph canvas pointer trail/fade/touch gating and pixel motion/reduced/resume/offscreen/resize and no-JS/unavailable-2D fallback, no CLI cards or client islands, single aligned inline player with remembered consent/native controls/touch/no-JS, exact viewport footer/keyboard access across 8 sizes plus long CMS copy at 320x400 with and without JS, desktop Product/mobile drill-in and Devlog routes with/without JS, mobile navigation, retired sections absent and newsletter visible with/without JS, dedicated download route links including Product Download, no-JS reading and download links (installer coverage: verify:download), and mobile/desktop accessibility.');
} finally {
  await browser.close();
}
