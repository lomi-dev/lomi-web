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
await page.route('https://next-api.useplunk.com/**', () => { throw new Error('Browser must not call Plunk'); });
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

const releaseUrl = 'https://github.com/lomi-dev/lomi/releases';
const assetUrl = (name) => `https://github.com/lomi-dev/lomi/releases/download/v1.2.3/${name}`;
const releaseFixture = [
  {
    tag_name: 'v1.2.2',
    html_url: `${releaseUrl}/tag/v1.2.2`,
    draft: false,
    published_at: '2026-01-01T12:00:00Z',
    assets: [],
  },
  {
    tag_name: 'v9.9.9',
    html_url: `${releaseUrl}/tag/v9.9.9`,
    draft: true,
    published_at: '2026-09-01T12:00:00Z',
    assets: [],
  },
  {
    tag_name: 'v1.2.3',
    html_url: `${releaseUrl}/tag/v1.2.3`,
    draft: false,
    published_at: '2026-08-01T12:00:00Z',
    assets: [
      'Lomi_1.2.3_aarch64.dmg',
      'Lomi_1.2.3_x64.dmg',
      'Lomi_1.2.3_x64-setup.exe',
      'Lomi_1.2.3_x64_en-US.msi',
      'Lomi_1.2.3_amd64.AppImage',
      'Lomi_1.2.3_amd64.deb',
      'Lomi-1.2.3-1.x86_64.rpm',
    ].map((name) => ({ name, browser_download_url: assetUrl(name) })),
  },
];
let releaseApiFails = false;
await page.route(/^https:\/\/api\.github\.com\/repos\/lomi-dev\/lomi\/releases\?per_page=10$/, async (route) => {
  if (releaseApiFails) {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(releaseFixture) });
});

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
          mute() { this.calls.push('mute'); }
          playVideo() { this.calls.push('playVideo'); }
          stopVideo() { this.calls.push('stopVideo'); }
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

async function expectPlayCenteredOnImage(targetPage) {
  await expect.poll(() => targetPage.locator('[data-video-play]').evaluate((play) => {
    const trigger = play.closest('[data-video-open]').getBoundingClientRect();
    const bounds = play.getBoundingClientRect();
    let opacity = 1;
    for (let element = play; element; element = element.parentElement) opacity *= Number(getComputedStyle(element).opacity);
    return opacity > .9
      && Math.abs((bounds.top + bounds.bottom) / 2 - (trigger.top + trigger.bottom) / 2) < 1
      && Math.abs((bounds.left + bounds.right) / 2 - (trigger.left + trigger.right) / 2) < 1;
  }), { message: 'Play stays centered on the full image regardless of viewport clipping' }).toBe(true);
}

async function settleVideoMotion(dialog) {
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
}

async function verifyVideoDialog(targetPage, requests, touch = false) {
  const trigger = targetPage.locator('[data-video-open]');
  const dialog = targetPage.getByRole('dialog', { name: 'Watch Lomi', exact: true });
  const player = targetPage.locator('#video-dialog [data-video-player]');
  const poster = player.locator('[data-video-poster]');
  const mount = player.locator('[data-video-mount]');
  let currentPlayer = -1;
  const emit = async (name, data, index = currentPlayer) => targetPage.evaluate(({ name, data, index }) => {
    const instance = window.__mockYouTube.players[index];
    instance.events[name]?.({ target: instance, data });
  }, { name, data, index });
  const calls = (index = currentPlayer) => targetPage.evaluate((index) => window.__mockYouTube.players[index].calls, index);
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAttribute('href', videoUrl);
  await expect(trigger).toHaveAttribute('aria-controls', 'video-dialog');
  await expect(targetPage.locator('#video-dialog iframe')).toHaveCount(0);
  await expect(targetPage.locator('#video-dialog [data-video-close], #video-dialog .video-close, #video-dialog .video-toolbar, #video-dialog .video-fallback, #video-dialog h2, #video-dialog button, #video-dialog input[type="range"]')).toHaveCount(0);
  await expect(poster.locator('img')).toHaveCount(1);
  await expect.poll(() => poster.locator('img').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  expect(requests, 'YouTube receives no requests before activation').toEqual([]);
  await trigger.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  if (!touch) {
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await trigger.evaluate((element) => {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      element.focus({ preventScroll: true });
    });
  }
  await expectPlayCenteredOnImage(targetPage);
  const initial = await targetPage.evaluate(() => ({ x: scrollX, y: scrollY, root: document.documentElement.style.overflow, body: document.body.style.overflow }));
  const expectOpen = async (start = true) => {
    await expect(dialog).toBeVisible();
    await settleVideoMotion(dialog);
    await expect(dialog).toBeFocused();
    const iframe = mount.locator('iframe');
    await expect(iframe).toHaveCount(1);
    const source = new URL(await iframe.getAttribute('src'));
    expect(source.origin).toBe('https://www.youtube.com');
    expect(source.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(source.searchParams.get('autoplay'), 'Playback waits for the API to mute first').toBe('0');
    expect(source.searchParams.get('controls')).toBe('1');
    expect(source.searchParams.get('playsinline')).toBe('1');
    expect(source.searchParams.get('enablejsapi')).toBe('1');
    expect(source.searchParams.get('origin')).toBe(new URL(targetPage.url()).origin);
    await expect(iframe).toHaveAttribute('title', 'Lomi video');
    await expect(targetPage.frameLocator('#video-dialog iframe').locator('h1')).toHaveText('Mock video');
    await expect(player).toHaveAttribute('data-video-status', 'loading');
    await expect(poster).toHaveCSS('opacity', '1');
    await expect(mount).toHaveAttribute('inert', '');
    await expect(mount).toHaveCSS('opacity', '0');
    await expect.poll(() => targetPage.evaluate(() => window.__mockYouTube?.players.length || 0)).toBeGreaterThan(currentPlayer + 1);
    currentPlayer = await targetPage.evaluate(() => window.__mockYouTube.players.length - 1);
    expect(await calls(), 'Iframe loading alone does not start playback').toEqual([]);
    await emit('onReady');
    expect(await calls(), 'The player is muted before any play request').toEqual(['mute', 'playVideo']);
    await expect(player).toHaveAttribute('data-video-status', 'loading');
    await expect(poster, 'The screenshot stays visible after readiness until playback starts').toHaveCSS('opacity', '1');
    await expect(mount).toHaveAttribute('inert', '');
    if (start) {
      await emit('onStateChange', 1);
      await expect(player).toHaveAttribute('data-video-status', 'playing');
      await expect(poster).toHaveCSS('opacity', '0');
      await expect(mount).toHaveCSS('opacity', '1');
      await expect(mount).not.toHaveAttribute('inert');
    }
    expect(requests.some((request) => new URL(request).pathname === '/iframe_api')).toBe(true);
    expect(await targetPage.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');
    expect(await targetPage.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');
  };
  const expectClosed = async () => {
    await expect(mount.locator('iframe')).toHaveCount(0);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await calls(), 'Closing unloads the API player').toContain('destroy');
    expect(await targetPage.evaluate(() => ({ x: scrollX, y: scrollY, root: document.documentElement.style.overflow, body: document.body.style.overflow })), 'Closing video restores page scrolling and position').toEqual(initial);
  };
  const escape = async () => {
    // Cross-origin iframe key events cannot reach the parent native dialog.
    await dialog.focus();
    await targetPage.keyboard.press('Escape');
  };
  if (!touch) await targetPage.locator('#video-dialog').evaluate((element) => {
    const observer = new MutationObserver(() => {
      if (element.open) {
        element.dataset.verifyEnteringWidth = String(element.getBoundingClientRect().width);
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ['open'] });
  });
  if (touch) await trigger.tap();
  else await targetPage.keyboard.press('Enter');
  if (!touch) {
    const enteringWidth = await dialog.evaluate((element) => {
      const width = Number(element.dataset.verifyEnteringWidth);
      delete element.dataset.verifyEnteringWidth;
      return width;
    });
    await settleVideoMotion(dialog);
    const enteredWidth = (await dialog.boundingBox()).width;
    expect(enteringWidth, 'Video entry has visible geometry').toBeGreaterThan(0);
    expect(enteringWidth, 'Video enters from a smaller centered frame').toBeLessThan(enteredWidth * .99);
  }
  await expectOpen();
  if (!touch) {
    await targetPage.mouse.move(2, 2);
    await targetPage.mouse.wheel(0, 500);
    await targetPage.waitForTimeout(100);
    expect(await targetPage.evaluate(() => scrollY), 'The page stays locked behind the video').toBe(initial.y);
    await trigger.evaluate((element) => element.focus({ preventScroll: true }));
    await expect(dialog, 'The modal makes background controls inert').toBeFocused();
    await targetPage.keyboard.press('Tab');
    await expect(mount.locator('iframe'), 'Tab reaches native player controls').toBeFocused();
    await targetPage.frameLocator('#video-dialog iframe').getByRole('button', { name: 'Play mock video' }).focus();
    await targetPage.keyboard.press('Shift+Tab');
    await expect(dialog, 'Shift+Tab returns from the first player control to the dialog for Escape').toBeFocused();
    const volume = targetPage.frameLocator('#video-dialog iframe').getByRole('slider', { name: 'Volume' });
    await volume.focus();
    await targetPage.keyboard.press('ArrowRight');
    await expect(volume).toHaveValue('1');
    await dialog.focus();
    const accessibility = await new AxeBuilder({ page: targetPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations, 'Video dialog accessibility').toEqual([]);
  }
  await escape();
  await expectClosed();
  if (!touch) {
    await trigger.evaluate((element) => element.click());
    await expect.poll(() => targetPage.evaluate(() => window.__mockYouTube.players.length)).toBeGreaterThan(currentPlayer + 1);
    currentPlayer = await targetPage.evaluate(() => window.__mockYouTube.players.length - 1);
    await escape();
    await expectClosed();
    await emit('onReady');
    await emit('onStateChange', 1);
    expect(await calls(), 'Closing before readiness prevents late mute or play calls').toEqual(['destroy']);
    await expect(mount.locator('iframe')).toHaveCount(0);
    for (const event of ['onAutoplayBlocked', 'onError']) {
      await trigger.click();
      await expectOpen(false);
      await emit(event, event === 'onError' ? 100 : undefined);
      await expect(player).toHaveAttribute('data-video-status', 'fallback');
      await expect(poster).toHaveCSS('opacity', '0');
      await expect(mount).not.toHaveAttribute('inert');
      await expect(mount).toHaveCSS('opacity', '1');
      await escape();
      await expectClosed();
    }
    const stale = currentPlayer;
    await trigger.click();
    await expectOpen(false);
    await emit('onReady', undefined, stale);
    await emit('onStateChange', 1, stale);
    await emit('onError', 100, stale);
    await targetPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(player, 'Callbacks from a closed player cannot reveal the new session').toHaveAttribute('data-video-status', 'loading');
    await expect(poster).toHaveCSS('opacity', '1');
    expect(await calls()).toEqual(['mute', 'playVideo']);
    await emit('onStateChange', 1);
    await expect(player).toHaveAttribute('data-video-status', 'playing');
    const bounds = await dialog.boundingBox();
    expect(bounds.x, 'Video modal leaves a clickable backdrop').toBeGreaterThan(2);
    await targetPage.mouse.click(bounds.x / 2, bounds.y + bounds.height / 2);
    await expectClosed();
    await targetPage.emulateMedia({ reducedMotion: 'reduce' });
    await targetPage.keyboard.press('Enter');
    expect(await dialog.evaluate((element) => element.getAnimations().flatMap((animation) => animation.effect.getKeyframes())
      .every((frame) => !frame.transform || frame.transform === 'none')), 'Reduced-motion video entrance avoids scaling').toBe(true);
    await expectOpen();
    await escape();
    await expectClosed();
    await targetPage.emulateMedia({ reducedMotion: 'no-preference' });
    const pendingScroll = await trigger.evaluate((element) => {
      const before = scrollY;
      window.scrollTo({ top: before + 500, behavior: 'smooth' });
      element.click();
      return before;
    });
    await expectOpen();
    await targetPage.waitForTimeout(350);
    expect(await targetPage.evaluate(() => scrollY), 'Opening video cancels pending smooth page scrolling').toBe(pendingScroll);
    await escape();
    await expect(dialog).not.toBeVisible();
    await expect(mount.locator('iframe')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await targetPage.evaluate(() => scrollY), 'Closing after pending scrolling restores the activation position').toBe(pendingScroll);
  } else {
    await trigger.tap();
    await expectOpen();
    await targetPage.setViewportSize({ width: 844, height: 390 });
    await escape();
    await expect(dialog).not.toBeVisible();
    await expect(mount.locator('iframe')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger, 'Portrait-to-landscape dismissal keeps the video opener visible').toBeInViewport();
    await trigger.tap();
    await expect(dialog).toBeVisible();
    await targetPage.setViewportSize({ width: 320, height: 200 });
    await settleVideoMotion(dialog);
    await expect(dialog, 'The short-view modal remains available for Escape').toBeInViewport();
    const playerBounds = await player.boundingBox();
    expect(playerBounds.width, 'Short-view video player width').toBeGreaterThanOrEqual(200);
    expect(playerBounds.height, 'Short-view video player height').toBeGreaterThanOrEqual(200);
    await escape();
    await expect(dialog).not.toBeVisible();
    await expect(mount.locator('iframe')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport();
    expect(await targetPage.evaluate(() => ({ root: document.documentElement.style.overflow, body: document.body.style.overflow }))).toEqual({ root: initial.root, body: initial.body });
  }
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
  const pointerPage = await pointerContext.newPage();
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
  expect(await targetPage.locator('.hero #workspace').evaluate((workspace) => {
    const primary = workspace.querySelector('[data-video-open]').getBoundingClientRect();
    const detail = workspace.querySelector('[data-workspace-detail]').getBoundingClientRect();
    const protectedAreas = [document.querySelector('.hero h1'), document.querySelector('.hero-actions'),
      workspace.querySelector('[data-video-play]'), workspace.querySelector('figcaption')]
      .filter(Boolean).map((element) => element.getBoundingClientRect());
    const clear = protectedAreas.every((area) => detail.right <= area.left || detail.left >= area.right
      || detail.bottom <= area.top || detail.top >= area.bottom);
    return detail.width > 0 && detail.width < primary.width && detail.left > primary.left
      && detail.left >= 0 && detail.right <= document.documentElement.clientWidth + 1
      && detail.left < primary.right && detail.top < primary.bottom && detail.bottom > primary.top && clear;
  }), `Supporting screenshot overlaps the product without covering copy, play, or caption at ${width}px`).toBe(true);
}

async function expectAnchorBelowHeader(targetPage, destination) {
  await expect.poll(() => targetPage.locator(destination).evaluate((target) => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const content = target.querySelector('h2, [data-video-open]') || target;
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
    await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectControls('dark');
    await scrollSurface('#features');
    await expectControls('light');
    await scrollSurface('#roadmap');
    await expectControls('dark');
    await scrollSurface('[data-video-open]');
    if (width >= 768) {
      await expect.poll(() => header.locator(controlSelector).evaluateAll((elements) => {
        const image = document.querySelector('[data-video-open]').getBoundingClientRect();
        const contrasts = elements.filter((element) => element.getClientRects().length).map((element) => {
          const bounds = element.getBoundingClientRect(), x = bounds.left + bounds.width / 2;
          return { x, contrast: element.dataset.contrast };
        }).filter(({ x }) => x > image.left + 72 && x < image.right - 72).map(({ contrast }) => contrast);
        return { present: contrasts.length > 0, correct: contrasts.every((contrast) => contrast === 'light') };
      }), { message: 'Controls directly above the dark product capture use light foreground' }).toEqual({ present: true, correct: true });
    }
    for (const selector of ['#features', '.deck-frame']) {
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
    await scrollSurface('#features');
    await expectControls('dark');
    expect(await panelStyle(), 'Open dropdown panels retain their readable route palette while the page scrolls').toEqual(originalPanelStyle);
    const accessibility = await new AxeBuilder({ page: targetPage }).include('.site-header').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations, `Unified Product navigation readability at ${width}px`).toEqual([]);
    await close();
    await expectControls('light');
    await open();
    await expectControls('dark');
    await scrollSurface('#roadmap');
    await expectControls('dark');
    await close();
    await expectControls('dark');
    if (!mobile) {
      await targetPage.locator('.header-action[data-download-open]').click();
      await expect(targetPage.locator('#download-dialog')).toBeVisible();
      const modalForegrounds = await controls();
      await scrollSurface('#features');
      await frames();
      expect(await controls(), 'An open native modal freezes local navigation foregrounds').toEqual(modalForegrounds);
      await targetPage.keyboard.press('Escape');
      await expect(targetPage.locator('#download-dialog')).not.toBeVisible();
      await expectControls('light');
    }
    await targetPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectControls('dark');
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
    for (const destination of ['#workspace', '#roadmap', '#download']) {
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
      await expect(links).toHaveCount(4);
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
  const devlogPage = await devlogContext.newPage();
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
    await expect(devlogPage.getByRole('heading', { level: 1 })).toHaveAccessibleName('Work in progress');
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
        .toEqual(['/#workspace', '/#features', '/#workflow', '/#principles', '/#faq', '/#download']);
      await activate(product.locator('a[href="/#workspace"]'));
    } else {
      await expect(devlogPage.locator('.product-fallback')).toHaveAttribute('href', '/#workspace');
      await devlogPage.locator('.product-fallback').click();
    }
    await expect(devlogPage).toHaveURL(new URL('/#workspace', url).href);
    await expect(devlogPage.locator('#workspace')).toBeInViewport();
    await expectAnchorBelowHeader(devlogPage, '#workspace');
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
      await expect(download).toHaveAttribute('href', '/#download');
      await activate(download);
      await expect(devlogPage).toHaveURL(new URL('/#download', url).href);
      await expect(devlogPage.locator('#download')).toBeInViewport();
      await expectAnchorBelowHeader(devlogPage, '#download');
    }
    await devlogPage.goto(devlogUrl);
    await activate(devlogPage.getByRole('link', { name: 'Back to lomi' }));
    await expect(devlogPage).toHaveURL(new URL('/', url).href);
  }
  expect(devlogErrors, `Devlog page errors with JavaScript ${javaScriptEnabled}`).toEqual([]);
  await devlogContext.close();
}

async function verifyLongFooterColophon(targetPage) {
  const colophon = targetPage.locator('.site-footer .footer-credits > p');
  const original = await colophon.textContent();
  // footer.colophon accepts trimmed text from 1 through 2000 characters.
  const longColophon = 'Made in the open, with room for every project. '.repeat(12).slice(0, 520).trim();
  expect(longColophon.length, 'Representative long CMS colophon').toBeGreaterThanOrEqual(500);
  expect(longColophon.length).toBeLessThanOrEqual(2000);
  try {
    await colophon.evaluate((element, value) => { element.textContent = value; }, longColophon);
    // Just above the short-window breakpoint: long copy must not squeeze links out.
    await verifyViewportFooter(targetPage, false, [{ width: 320, height: 400 }]);
  } finally {
    await colophon.evaluate((element, value) => { element.textContent = value; }, original);
  }
  await expect(colophon).toHaveText(original);
}

try {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/\S/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#download a[href="https://github.com/lomi-dev/lomi"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Newsletter signup' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toBeVisible();
  const desktopNavigation = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  const desktopLinks = await desktopNavigation.locator('a.navigation-link:not(.product-fallback)').evaluateAll((links) => links.map((link) => {
    const label = link.cloneNode(true);
    label.querySelectorAll('[aria-hidden="true"]').forEach((decoration) => decoration.remove());
    return { href: link.getAttribute('href'), label: link.getAttribute('aria-label') || label.textContent.trim() };
  }));
  expect(desktopLinks.length, 'Desktop navigation links').toBeGreaterThan(0);
  for (const [index, link] of desktopLinks.entries()) {
    await expect(desktopNavigation.locator('a.navigation-link:not(.product-fallback)').nth(index)).toHaveAccessibleName(link.label);
  }
  await expect(page.getByRole('contentinfo')).toBeVisible();
  for (const section of ['workflow', 'features', 'roadmap', 'faq', 'download', 'newsletter']) {
    await expect(page.locator(`#${section}`)).toBeVisible();
    await expect(page.locator(`#${section}`).getByRole('heading', { level: 2 })).toBeVisible();
  }
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
  await expect(page.locator('#download-dialog')).not.toBeVisible();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('.hero h1')).toBeInViewport();
    await expect(page.locator('.hero h1')).toHaveCSS('text-align', 'center');
    const copyBounds = await page.locator('.hero-content').boundingBox();
    expect(Math.abs(copyBounds.x + copyBounds.width / 2 - viewport.width / 2), 'The hero copy block is centered in the viewport').toBeLessThanOrEqual(1);
    await expect(page.locator('.hero [data-download-open]')).toBeInViewport();
    const image = await page.locator('.hero #workspace [data-video-open] img').boundingBox();
    const visibleHeight = Math.max(0, Math.min(viewport.height, image.y + image.height) - Math.max(0, image.y));
    expect(image.y, 'The screenshot follows the hero copy').toBeGreaterThan(0);
    expect(image.y + image.height, 'The full screenshot continues below the initial fold').toBeGreaterThan(viewport.height);
    expect(visibleHeight / image.height, 'A meaningful part of the screenshot appears initially').toBeGreaterThan(.1);
    await page.mouse.move(image.x + image.width / 2, Math.max(0, image.y) + visibleHeight / 2);
    await expectPlayCenteredOnImage(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });


  await verifyFixedHeader(page);
  await verifyAdaptiveHeader(page);
  const productMenu = page.locator('#product-menu');
  const productSummary = productMenu.locator(':scope > summary');
  await expect(productMenu.locator('.product-link')).toHaveCount(6);
  await expect(productMenu.locator('.product-group')).toHaveCount(3);
  const productDestinations = await productMenu.locator('.product-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(productDestinations).toEqual(['#workspace', '#features', '#workflow', '#principles', '#faq', '#download']);
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
  for (const destination of productDestinations) {
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
  await page.locator('#workflow').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(background).toHaveAttribute('data-state', 'offscreen');
  await expectStaticBackground(page, 'Offscreen background stops rendering new frames');
  await hero.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(background).toHaveAttribute('data-state', 'running');

  const workspace = page.locator('.hero #workspace');
  await expect(workspace.getByRole('img')).toHaveCount(2);
  const workspaceImage = workspace.locator('[data-video-open] img');
  const workspaceDetail = workspace.locator('.deck-detail img');
  await expect(workspaceDetail).toHaveCount(1);
  await expect(workspaceDetail).toHaveAttribute('alt', /\S/);
  await expect.poll(() => workspaceDetail.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await workspaceDetail.getAttribute('src'), 'The supporting capture shows a distinct product view').not.toBe(await workspaceImage.getAttribute('src'));
  await expect(workspaceImage).toHaveCount(1);
  await expect(workspaceImage).toBeVisible();
  await expect(workspaceImage).toHaveAttribute('alt', /\S/);
  await expect.poll(() => workspaceImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  if (await workspace.locator('figcaption').count()) await expect(workspace.locator('figcaption')).toHaveText(/\S/);
  await expect(workspace.locator('[data-deck-view], .deck-controls, .deck-chrome')).toHaveCount(0);
  await verifyVideoDialog(page, videoRequests);

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
  await verifyLongFooterColophon(page);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.locator('#download').scrollIntoViewIfNeeded();
  await expect(page.locator('#download')).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('#mobile-navigation');
  const mobileSummary = mobileMenu.locator(':scope > summary');
  await expect(mobileSummary).toBeVisible();
  await expect(mobileMenu).not.toHaveAttribute('open');
  const mobileProduct = mobileMenu.locator('#mobile-product');
  const mobileProductSummary = mobileProduct.locator(':scope > summary');
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
  for (const destination of productDestinations) {
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

  const faqItems = page.locator('#faq details');
  expect(await faqItems.count()).toBeGreaterThan(0);
  for (const item of await faqItems.all()) {
    const summary = item.locator('summary');
    await expect(item.locator('p')).not.toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('open', '');
    await expect(item.locator('p')).toBeVisible();
    await expect(item.locator('p')).not.toBeEmpty();
    await page.keyboard.press('Space');
    await expect(item).not.toHaveAttribute('open');
    await expect(item.locator('p')).not.toBeVisible();
  }

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/page-${width}.png`, fullPage: true });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(`artifacts/accessibility-${width}.json`, JSON.stringify(results.violations, null, 2));
    expect(results.violations, `Accessibility at ${width}px`).toEqual([]);
  }
  const email = page.getByRole('textbox', { name: 'Email address' });
  const subscribe = page.getByRole('button', { name: 'Subscribe' });
  if (await subscribe.isEnabled()) {
    let requestBody;
    let authorization;
    let cookie;
    const endpoint = await page.locator('#newsletter-form').getAttribute('data-endpoint');
    expect(new URL(endpoint).pathname).toBe('/v1/newsletter/subscribe');
    await page.route(endpoint, async (route) => {
      requestBody = route.request().postDataJSON();
      authorization = route.request().headers().authorization;
      cookie = route.request().headers().cookie;
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) });
    });
    await email.fill('reader@example.com');
    await subscribe.click();
    await expect(page.locator('#newsletter-status')).toHaveText('You’re on the list. Thanks for joining!');
    expect(requestBody).toEqual({ email: 'reader@example.com' });
    expect(authorization).toBeUndefined();
    expect(cookie).toBeUndefined();
    await expect(email).toHaveValue('');

    await page.unroute(endpoint);
    for (const result of [
      { status: 500, body: '{}' },
      { status: 200, body: '{"accepted":true}' },
      { status: 202, body: '{"accepted":false}' },
    ]) {
      await page.route(endpoint, (route) => route.fulfill({ ...result, contentType: 'application/json' }));
      await email.fill('reader@example.com');
      await subscribe.click();
      await expect(page.locator('#newsletter-status')).toHaveText('Something went wrong. Please try again.');
      await expect(subscribe).toBeEnabled();
      await page.unroute(endpoint);
    }
  } else {
    await expect(email).toBeDisabled();
    await expect(page.locator('#newsletter-status')).toHaveText('Newsletter signup is temporarily unavailable.');
  }

  const downloadTriggers = page.locator('[data-download-open]');
  const downloadTrigger = page.locator('#download [data-download-open]');
  const downloadDialog = page.getByRole('dialog', { name: 'Choose your download' });
  const osSelect = page.getByLabel('Operating system');
  const typeSelect = page.getByLabel('Package type');
  const downloadAction = page.getByRole('link', { name: 'Download prerelease' });
  const osIconWrap = page.locator('[data-download-os-icon]');

  await expect(page.locator('dialog')).toHaveCount(2);
  await expect(page.locator('#download-dialog')).toHaveCount(1);
  await expect(page.locator('#video-dialog')).toHaveCount(1);
  expect(await downloadTriggers.count()).toBeGreaterThanOrEqual(2);
  for (const trigger of await downloadTriggers.all()) {
    const inMobileMenu = await trigger.evaluate((element) => Boolean(element.closest('#mobile-navigation')));
    await page.setViewportSize({ width: inMobileMenu ? 390 : 1440, height: 900 });
    if (inMobileMenu) await mobileSummary.click();
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-controls', 'download-dialog');
    await trigger.click();
    await expect(downloadDialog).toBeVisible();
    await expect(osSelect).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(downloadDialog).not.toBeVisible();
    await expect(inMobileMenu ? mobileSummary : trigger).toBeFocused();
  }
  const desktopHeaderDownload = page.locator('.site-header .header-actions [data-download-open]');
  const mobileHeaderDownload = mobileMenu.locator('[data-download-open]');
  await page.setViewportSize({ width: 390, height: 900 });
  await mobileSummary.click();
  await mobileHeaderDownload.click();
  await expect(downloadDialog).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(desktopHeaderDownload, 'Mobile download restores desktop header focus after resizing').toBeFocused();
  await desktopHeaderDownload.click();
  await expect(downloadDialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(mobileSummary, 'Desktop download restores mobile menu focus after resizing').toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await downloadTrigger.click();
  await expect(downloadDialog).toBeVisible();
  await expect(osSelect).toHaveValue('linux');
  await expect(osIconWrap).toHaveAttribute('data-selected-os', 'linux');
  await expect(typeSelect).toHaveValue('appimage');
  await expect(typeSelect).toBeEnabled();
  await expect(downloadAction).toHaveAttribute('href', assetUrl('Lomi_1.2.3_amd64.AppImage'));
  await expect(downloadDialog.locator('[data-download-status]')).toBeEmpty();

  const packageCases = [
    ['macos', 'apple-silicon', 'Lomi_1.2.3_aarch64.dmg'],
    ['macos', 'intel', 'Lomi_1.2.3_x64.dmg'],
    ['windows', 'exe', 'Lomi_1.2.3_x64-setup.exe'],
    ['windows', 'msi', 'Lomi_1.2.3_x64_en-US.msi'],
    ['linux', 'appimage', 'Lomi_1.2.3_amd64.AppImage'],
    ['linux', 'deb', 'Lomi_1.2.3_amd64.deb'],
    ['linux', 'rpm', 'Lomi-1.2.3-1.x86_64.rpm'],
  ];
  const defaultTypes = { macos: 'apple-silicon', windows: 'exe', linux: 'appimage' };
  let selectedOs = 'linux';
  let selectedType = 'appimage';
  for (const [os, type, filename] of packageCases) {
    if (os !== selectedOs) {
      await osSelect.selectOption(os);
      selectedOs = os;
      selectedType = defaultTypes[os];
      await expect(typeSelect).toHaveValue(selectedType);
    }
    await expect(osIconWrap).toHaveAttribute('data-selected-os', os);
    await expect(osIconWrap.locator(`[data-os-icon="${os}"]`)).toBeVisible();
    await expect(osIconWrap.locator(`[data-os-icon="${os}"]`)).toHaveAttribute('src', `/icons/download-${os}.svg`);
    await expect.poll(() => osIconWrap.locator(`[data-os-icon="${os}"]`).evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    if (type !== selectedType) {
      await typeSelect.selectOption(type);
      selectedType = type;
    }
    await expect(downloadAction).toHaveAttribute('href', assetUrl(filename));
  }

  await expect(downloadDialog.locator('[data-architecture-warning]')).toHaveCount(0);
  const osBox = await osSelect.boundingBox();
  const typeBox = await typeSelect.boundingBox();
  expect(osBox).not.toBeNull();
  expect(typeBox).not.toBeNull();
  expect(typeBox.y).toBeGreaterThan(osBox.y + osBox.height);
  expect(Math.abs(typeBox.width - osBox.width)).toBeLessThan(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await downloadDialog.boundingBox();
  expect(mobileDialog).not.toBeNull();
  expect(Math.abs(mobileDialog.x - (390 - mobileDialog.width) / 2)).toBeLessThan(1);
  expect(Math.abs(mobileDialog.y - (844 - mobileDialog.height) / 2)).toBeLessThan(1);
  const dialogA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dialogA11y.violations, 'Accessibility with the download dialog open').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(downloadTrigger).toBeFocused();

  releaseApiFails = true;
  await downloadTrigger.click();
  await expect(downloadDialog.getByRole('status')).toHaveText('We couldn’t check installer availability. Browse the latest release on GitHub.');
  await expect(downloadDialog.getByRole('link', { name: 'Open latest release' })).toHaveAttribute('href', releaseUrl);
  await page.keyboard.press('Escape');
  await expect(downloadTrigger).toBeFocused();

  await expect(page.locator('astro-island, .agent-constellation, [data-agent]')).toHaveCount(0);
  expect(errors).toEqual([]);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.route(releaseUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>GitHub releases</h1>' }));
  await staticPage.goto(url);
  await expect(staticPage.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  await verifyFixedHeader(staticPage, false);
  for (const section of ['workflow', 'features', 'roadmap', 'faq', 'download', 'newsletter']) {
    await expect(staticPage.locator(`#${section}`).getByRole('heading', { level: 2 })).toBeVisible();
  }
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
  await expect(staticWorkspace.getByRole('img')).toHaveCount(2);
  const staticImage = staticWorkspace.locator('[data-video-open] img');
  const staticDetail = staticWorkspace.locator('.deck-detail img');
  await expect(staticDetail).toHaveAttribute('alt', /\S/);
  await expect.poll(() => staticDetail.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(staticImage).toHaveCount(1);
  await expect(staticImage).toBeVisible();
  await expect(staticImage).toHaveAttribute('alt', /\S/);
  await expect.poll(() => staticImage.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  if (await staticWorkspace.locator('figcaption').count()) await expect(staticWorkspace.locator('figcaption')).toHaveText(/\S/);
  await verifyHeroComposition(staticPage, 390);
  await expect(staticPage.locator('#video-dialog iframe')).toHaveCount(0);
  await staticPage.route(videoUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>YouTube video destination</h1>' }));
  await expect(staticPage.locator('[data-video-open]')).toHaveAttribute('href', videoUrl);
  await staticPage.locator('[data-video-open]').click();
  await expect(staticPage).toHaveURL(videoUrl);
  await staticPage.goto(url);
  const staticHeroDownload = staticPage.locator('.hero [data-download-open]');
  await expect(staticHeroDownload).toBeVisible();
  await expect(staticHeroDownload).toHaveAttribute('href', releaseUrl);
  await staticHeroDownload.click();
  await expect(staticPage).toHaveURL(releaseUrl);
  await staticPage.goto(url);
  const staticReleaseLink = staticPage.locator('#download').getByRole('link', { name: 'Browse releases on GitHub' });
  await expect(staticReleaseLink).toBeVisible();
  await expect(staticReleaseLink).toHaveAttribute('href', releaseUrl);
  await expect(staticPage.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  await expect(staticPage.locator('.newsletter-noscript')).toBeVisible();
  await expect(staticPage.locator('#mobile-navigation')).not.toBeVisible();
  await expect(staticPage.locator('#product-menu')).not.toBeVisible();
  const staticProduct = staticPage.locator('.product-fallback');
  await expect(staticProduct).toHaveAttribute('href', '#workspace');
  await staticProduct.click();
  await expectAnchorBelowHeader(staticPage, '#workspace');
  const staticRoadmap = staticPage.locator('.desktop-navigation a[href="#roadmap"]');
  await staticRoadmap.click();
  await expectAnchorBelowHeader(staticPage, '#roadmap');
  await verifyStaticBackdropDoesNotBlockPage(staticPage);
  const staticFaq = staticPage.locator('#faq details').first();
  await staticFaq.locator('summary').focus();
  await staticPage.keyboard.press('Enter');
  await expect(staticFaq.locator('p')).toBeVisible();
  await staticPage.keyboard.press('Space');
  await expect(staticFaq.locator('p')).not.toBeVisible();
  await verifyViewportFooter(staticPage);
  await verifyLongFooterColophon(staticPage);
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await staticPage.goto(url);
  await staticPage.keyboard.press('Tab');
  await expect(staticPage.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await staticPage.keyboard.press('Enter');
  await expect(staticPage.locator('#main')).toBeFocused();
  await staticContext.close();
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const touchPage = await touchContext.newPage();
  const touchVideoRequests = await mockVideoRequests(touchPage);
  await touchPage.goto(url, { waitUntil: 'networkidle' });
  await verifyVideoDialog(touchPage, touchVideoRequests, true);
  await touchContext.close();
  await verifyBackgroundPointer();
  await verifyDevlog(true);
  await verifyDevlog(false);

  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fallbackContext.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === '2d' ? null : Reflect.apply(getContext, this, [type, ...args]);
    };
  });
  const fallbackPage = await fallbackContext.newPage();
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
  await expect(fallbackPage.locator('.hero [data-download-open]')).toHaveAttribute('href', releaseUrl);
  expect(fallbackErrors, 'Canvas 2D unavailable fallback has no page errors').toEqual([]);
  await fallbackContext.close();
  console.log('Passed: complete landing sections and anchors, 7 viewport widths including 200% equivalent reflow and landscape, terminal-glyph canvas pointer trail/fade/touch gating and pixel motion/reduced/resume/offscreen/resize and no-JS/unavailable-2D fallback, no CLI cards or client islands, two-image hero composition and lazy video dialog/keyboard/backdrop/touch/scroll lock/no-JS, exact viewport footer/keyboard access across 8 sizes plus long CMS copy at 320x400 with and without JS, desktop Product/mobile drill-in and Devlog routes with/without JS, mobile navigation and FAQ keyboard behavior, newsletter form, all 7 download packages, release fallback, every download trigger and focus restoration across desktop/mobile resizing, no-JS reading and release links, and mobile/desktop/dialog accessibility.');
} finally {
  await browser.close();
}
