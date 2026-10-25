import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertPlaceholder, startStaticPreview } from './verify-placeholders.mjs';

const { origin, close } = await startStaticPreview();
const siteOrigin = new URL(origin).origin;
const browserType = { chromium, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error(`Unsupported VERIFY_BROWSER: ${process.env.VERIFY_BROWSER}`);
const browser = await browserType.launch();
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
    if (/\.gif(?:\?|$)/i.test(request.url())) errors.push(`Feature movies should use local MP4: ${request.url()}`);
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

async function videoFrameSignature(video, time, focus) {
  return video.evaluate(async (element, { targetTime, focus }) => {
    element.pause();
    element.currentTime = targetTime;
    const deadline = Date.now() + 5000;
    while (Math.abs(element.currentTime - targetTime) > .05 || element.readyState < 2) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out seeking to ${targetTime}s (at ${element.currentTime.toFixed(2)}s)`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // WebKit can update currentTime without dispatching `seeked`. Resume just
    // long enough for a decoded frame so the runtime camera and canvas both
    // observe the requested moment.
    await element.play();
    while (element.currentTime < targetTime + .04) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out rendering ${targetTime}s (at ${element.currentTime.toFixed(2)}s)`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    element.pause();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const center = focus || { x: .5, y: .5 };
    const x = Math.max(0, Math.min(1, center.x - .25));
    const y = Math.max(0, Math.min(1, center.y - .25));
    const right = Math.max(0, Math.min(1, center.x + .25));
    const bottom = Math.max(0, Math.min(1, center.y + .25));
    context.drawImage(element, x * element.videoWidth, y * element.videoHeight,
      (right - x) * element.videoWidth, (bottom - y) * element.videoHeight,
      0, 0, canvas.width, canvas.height);
    return [...context.getImageData(0, 0, canvas.width, canvas.height).data];
  }, { targetTime: time, focus });
}

function meanPixelDifference(first, second) {
  assert.equal(first.length, second.length);
  let difference = 0;
  for (let index = 0; index < first.length; index += 4) {
    difference += Math.abs(first[index] - second[index])
      + Math.abs(first[index + 1] - second[index + 1])
      + Math.abs(first[index + 2] - second[index + 2]);
  }
  return difference / (first.length / 4 * 3);
}

async function waitForPlaying(video) {
  await expect.poll(() => video.evaluate((element) => !element.paused && element.readyState >= 2),
    { timeout: 10_000, message: 'Visible feature movie loads and starts playing' }).toBe(true);
}

async function checkMovie(scene, kind, siteOrigin) {
  const video = scene.locator('video[data-feature-video]');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('muted', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).not.toHaveAttribute('controls', '');
  await expect.poll(() => video.evaluate((element) => Boolean(element.currentSrc) && element.readyState >= 2),
    { timeout: 10_000, message: `${kind} lazy source loads and exposes decoded frames` }).toBe(true);
  await waitForPlaying(video);
  const state = await video.evaluate((element) => ({
    source: element.currentSrc,
    declaredSource: element.getAttribute('data-feature-video-src'),
    hasSource: element.hasAttribute('src'),
    duration: element.duration,
    loop: element.loop,
    muted: element.muted,
    width: element.videoWidth,
    height: element.videoHeight,
    camera: JSON.parse(element.closest('[data-feature-preview]').dataset.featureCamera),
  }));
  assert.equal(state.hasSource, true, `${kind} source loads on demand`);
  assert.equal(state.source, new URL(state.declaredSource, siteOrigin).href, `${kind} plays its recorded source`);
  assert.ok(state.loop && state.muted, `${kind} loops silently`);
  assert.ok(Number.isFinite(state.camera.duration) && Math.abs(state.duration - state.camera.duration) <= .1,
    `${kind} decoded duration matches its camera cue (${state.duration}s vs ${state.camera.duration}s)`);
  assert.ok(state.width >= 1280 && state.height >= 800, `${kind} keeps native recording resolution: ${JSON.stringify(state)}`);
  if (state.camera.zoom === 1) {
    assert.equal(state.camera.focus, null, `${kind} remains on a full-frame camera for its whole clip`);
  } else {
    assert.ok(state.camera.focus && state.camera.zoom > 1 && state.camera.zoom <= 1.3,
      `${kind} uses a gentle camera cue for its action: ${JSON.stringify(state.camera)}`);
  }
  const sourceUrl = new URL(state.source);
  assert.equal(sourceUrl.origin, siteOrigin, `${kind} footage is served locally`);
  assert.match(sourceUrl.pathname, /\.mp4$/i, `${kind} uses a local MP4`);
  const zoomAt = state.camera.zoom > 1
    ? state.camera.focusHold?.length === 2
      ? (state.camera.focusHold[0] + state.camera.focusHold[1]) / 2
      : state.camera.zoomIn[1] + .2
    : null;
  const restAt = state.camera.zoom > 1
    ? Math.min(state.camera.restAt ?? state.duration - .1, state.duration - .1)
    : null;
  const moments = [
    ...[.09, .21, .41, .59, .72].map((fraction) => ({ role: 'frame', time: state.duration * fraction })),
    ...(zoomAt === null ? [] : [{ role: 'zoom', time: zoomAt }, { role: 'rest', time: restAt }]),
  ].sort((a, b) => a.time - b.time);
  const samples = [];
  for (const moment of moments) {
    const signature = await videoFrameSignature(video, moment.time, state.camera.focus);
    const scale = await scene.locator('[data-render-window]').evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
    if (moment.role === 'frame') {
      samples.push(signature);
      if (state.camera.zoom === 1) {
        assert.ok(Math.abs(scale - 1) < .01, `${kind} camera stays still at ${moment.time.toFixed(2)}s: ${scale.toFixed(3)}`);
      }
    } else if (moment.role === 'zoom') {
      assert.ok(Math.abs(scale - state.camera.zoom) < .03,
        `${kind} reaches its gentle cue-defined zoom of ${state.camera.zoom} at ${moment.time.toFixed(2)}s: ${scale.toFixed(3)}`);
    } else {
      assert.ok(Math.abs(scale - 1) < .01,
        `${kind} camera returns to full frame at ${moment.time.toFixed(2)}s: ${scale.toFixed(3)}`);
    }
  }
  const frameDifferences = samples.slice(1).map((sample, index) => meanPixelDifference(samples[index], sample));
  const frameDifference = Math.max(...frameDifferences);
  assert.ok(frameDifference > .65, `${kind} footage visibly changes across its actions (mean RGB difference ${frameDifference.toFixed(2)})`);
  await video.evaluate((element) => element.pause());
  return { source: state.source, duration: state.duration };
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
  await expect(dialog(page).locator(':scope > [data-feature-navigation]')).toHaveCount(1);
  await expect(dialog(page).locator('[data-feature-slide] [data-feature-navigation]')).toHaveCount(0);
  await expect(dialog(page).locator('[data-feature-count], [data-feature-dot], .feature-modal-paging, .feature-modal-dots')).toHaveCount(0);
  const active = dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-preview]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-feature-preview', kinds[index]);
  await assertPlaceholder(active, { variant: 'feature', aspect: '8 / 5' });
  const images = await decodedImages(active);
  const poster = images.find((image) => image.featurePoster);
  assert.equal(poster?.source, sources[kinds[index]], `Dialog keeps the ${kinds[index]} capture`);
  await expect(active.locator('.feature-window-chrome, [data-render-detail]')).toHaveCount(0);
  await withinViewport(active);
}

await mkdir('artifacts', { recursive: true });
try {
  const { context, page } = await open({ reducedMotion: 'no-preference' });
  await expect(page.locator('[data-feature-gallery]')).toHaveAttribute('data-feature-ready', 'true');
  const cards = scenes(page);
  await expect(cards).toHaveCount(6);
  assert.deepEqual(await cards.evaluateAll((elements) => elements.map((element) => element.dataset.featurePreview)), kinds);
  await expect(page.locator('[data-feature-playback]')).toHaveCount(0);

  const sources = {};
  const movieDurations = [];
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
      assert.ok(poster && desktop, `${kinds[index]} has a native movie poster and Tahoe wallpaper`);
      assert.ok(poster.complete && poster.width >= 1280 && poster.height >= 800,
        `${kinds[index]} poster keeps native recording resolution: ${JSON.stringify(poster)}`);
      assert.ok(desktop.complete && desktop.width > 0 && desktop.height > 0,
        `${kinds[index]} wallpaper is decoded: ${JSON.stringify(desktop)}`);
      const posterUrl = new URL(poster.source, origin);
      const desktopUrl = new URL(desktop.source, origin);
      assert.equal(posterUrl.origin, siteOrigin, `${kinds[index]} app capture is served locally`);
      assert.equal(desktopUrl.origin, siteOrigin, `${kinds[index]} wallpaper is served locally`);
      assert.match(posterUrl.pathname, /\.webp$/i, `${kinds[index]} has an optimized first-frame poster`);
      assert.match(desktopUrl.pathname, /tahoe-light[^/]*\.webp$/i, 'Wallpaper is the local Tahoe still');
      assert.equal(images.length, 2, `${kinds[index]} contains only wallpaper and native poster images`);
      assert.ok(images.every((image) => image.complete && image.width > 0 && image.height > 0),
        `${kinds[index]} decodes both fallback images: ${JSON.stringify(images)}`);
      assert.ok(images.every((image) => !/\.gif(?:\?|$)/i.test(image.source ?? '')),
        `${kinds[index]} contains no animated capture source`);
      sources[kinds[index]] = poster.source;
      wallpaperSource ??= desktop.source;
      assert.equal(desktop.source, wallpaperSource, 'All feature scenes use the same local Tahoe wallpaper');
      if (width === 1440) {
        await expect(scene.locator('.feature-window-chrome, [data-render-detail]')).toHaveCount(0);
        const video = scene.locator('video[data-feature-video]');
        await video.evaluate((element) => { element.pause(); element.currentTime = 0; });
        await expect.poll(() => scene.locator('[data-render-window]').evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeLessThan(1.03);
        const windowState = await scene.locator('[data-render-window]').evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          frameWidth: element.parentElement.getBoundingClientRect().width,
        }));
        assert.ok(Math.abs(windowState.width / windowState.frameWidth - .8) < .025,
          `${kinds[index]} native window spans 80% of its Tahoe stage`);
        await video.evaluate((element) => element.play());
        const movie = await checkMovie(scene, kinds[index], siteOrigin);
        assert.notEqual(movie.source, poster.source, 'Poster and movie are separate optimized files');
        movieDurations.push(movie.duration);
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
      `Feature gallery has no horizontal overflow at ${width}px`);
    if ([320, 1440].includes(width)) {
      await page.locator('#features').screenshot({ path: `artifacts/feature-previews-${browserType.name()}-${width}.png` });
    }
  }
  assert.equal(new Set(Object.values(sources)).size, kinds.length, 'Each feature has its own local native poster');
  assert.equal(new Set(movieDurations.map((duration) => Math.round(duration * 10))).size, kinds.length,
    `Each feature uses its own configured movie length: ${JSON.stringify(movieDurations)}`);

  // A hidden document stops both decoding and the per-frame camera work. It
  // resumes only after the page becomes visible and a scene remains in view.
  const visibleScene = cards.nth(5);
  await visibleScene.scrollIntoViewIfNeeded();
  const visibleVideo = visibleScene.locator('video[data-feature-video]');
  await waitForPlaying(visibleVideo);
  await expect.poll(() => visibleScene.locator('[data-render-window]').evaluate((window) => window.style.willChange)).toBe('transform');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => visibleVideo.evaluate((video) => video.paused)).toBe(true);
  await expect.poll(() => visibleScene.locator('[data-render-window]').evaluate((window) => window.style.willChange)).toBe('');
  const heldTransform = await visibleScene.locator('[data-render-window]').getAttribute('style');
  await page.waitForTimeout(120);
  await expect(visibleScene.locator('[data-render-window]')).toHaveAttribute('style', heldTransform);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitForPlaying(visibleVideo);

  // A separate page dialog also pauses videos. Closing it restores the
  // visible preview, without leaving the document paused.
  await page.evaluate(() => {
    const external = document.createElement('dialog');
    external.id = 'feature-preview-external-dialog';
    external.textContent = 'Temporary external dialog';
    document.body.append(external);
    external.showModal();
  });
  await expect.poll(() => page.locator('[data-feature-video]').evaluateAll((videos) => videos.filter((video) => !video.paused).length)).toBe(0);
  await page.evaluate(() => {
    const external = document.querySelector('#feature-preview-external-dialog');
    external.close();
    external.remove();
  });
  await waitForPlaying(visibleVideo);

  // Close during the opening transition, then immediately open the same
  // scene again. A rejected pending play must not strand the second take.
  await page.locator('[data-feature-open="0"]').click();
  const modalVideo = dialog(page).locator('[data-feature-slide]:not([hidden]) video[data-feature-video]');
  await expect(dialog(page)).toBeVisible();
  await dialog(page).locator('[data-feature-close]').evaluate((button) => button.click());
  await expect(dialog(page)).not.toBeVisible();
  await page.locator('[data-feature-open="0"]').click();
  await expect(dialog(page)).toBeVisible();
  await waitForPlaying(modalVideo);
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();

  // Each card opens its matching local movie in the native dialog.
  for (let index = 0; index < kinds.length; index++) {
    await page.locator(`[data-feature-open="${index}"]`).click();
    await expect(dialog(page)).toBeVisible();
    await checkSlide(page, index, sources);
    await waitForPlaying(dialog(page).locator('[data-feature-slide]:not([hidden]) video[data-feature-video]'));
    await expect.poll(() => page.locator('[data-feature-card] video[data-feature-video]').evaluateAll((videos) => videos.filter((video) => !video.paused).length)).toBe(0);
    await dialog(page).locator('[data-feature-close]').click();
    await expect(dialog(page)).not.toBeVisible();
  }

  // The fixed arrows pause hidden movies and start the active movie.
  await page.locator('[data-feature-open="0"]').click();
  await checkSlide(page, 0, sources);
  await waitForPlaying(dialog(page).locator('[data-feature-slide]:not([hidden]) video[data-feature-video]'));
  for (let index = 1; index < kinds.length; index++) {
    await dialog(page).locator('[data-feature-next]').click();
    await checkSlide(page, index, sources);
    await waitForPlaying(dialog(page).locator('[data-feature-slide]:not([hidden]) video[data-feature-video]'));
    await expect.poll(() => dialog(page).locator('[data-feature-slide][hidden] video[data-feature-video]').evaluateAll((videos) => videos.filter((video) => !video.paused).length)).toBe(0);
  }
  await dialog(page).locator('[data-feature-next]').click();
  await checkSlide(page, 0, sources);
  await dialog(page).locator('[data-feature-prev]').click();
  await checkSlide(page, 5, sources);
  for (let index = 0; index < 3; index++) await dialog(page).locator('[data-feature-next]').click();
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
  await expect.poll(() => page.locator('[data-feature-video]').evaluateAll((videos) => videos.filter((video) => !video.paused).length)).toBe(0);
  await page.locator('[data-feature-open="0"]').click();
  await checkSlide(page, 0, sources);
  await expect.poll(() => dialog(page).locator('[data-feature-slide]:not([hidden]) video[data-feature-video]').evaluate((video) => video.paused)).toBe(true);
  await expect.poll(() => dialog(page).locator('[data-feature-slide]:not([hidden]) [data-render-window]').evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeLessThan(1.03);
  await dialog(page).locator('[data-feature-next]').click();
  await checkSlide(page, 1, sources);
  assert.deepEqual(await cards.evaluateAll((elements) => elements.map((element) => element.getAnimations({ subtree: true }).length)),
    Array(kinds.length).fill(0), 'Reduced motion avoids animation work on the feature cards');
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();
  await context.close();

  const reduced = await open({ reducedMotion: 'reduce' });
  const reducedScene = scenes(reduced.page).first();
  await reducedScene.scrollIntoViewIfNeeded();
  await expect(reduced.page.locator('[data-feature-playback]')).toHaveCount(0);
  await expect(reducedScene.locator('video[data-feature-video]')).not.toHaveAttribute('src', /.+/);
  await reduced.page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitForPlaying(reducedScene.locator('video[data-feature-video]'));
  await reduced.context.close();

  const fallback = await open({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width: 320, height: 700 } });
  await expect(fallback.page.locator('[data-feature-gallery]')).not.toHaveAttribute('data-feature-ready', 'true');
  await expect(scenes(fallback.page)).toHaveCount(6);
  for (let index = 0; index < kinds.length; index++) {
    const scene = scenes(fallback.page).nth(index);
    await scene.scrollIntoViewIfNeeded();
    await assertPlaceholder(scene, { variant: 'feature', aspect: '8 / 5' });
    const poster = (await decodedImages(scene)).find((image) => image.featurePoster);
    assert.equal(poster.source, sources[kinds[index]], `${kinds[index]} remains available without JavaScript`);
    await expect(scene.locator('video[data-feature-video]')).toHaveAttribute('data-feature-video-src', /\.mp4(?:\?|$)/);
    await expect(scene.locator('video[data-feature-video]')).not.toHaveAttribute('src', /.+/);
    await expect(fallback.page.locator(`#feature-description-${index}`)).toBeVisible();
  }
  assert.equal(await fallback.page.evaluate(() => document.documentElement.scrollWidth), 320, 'No-JS feature gallery has no mobile overflow');
  await expect(fallback.page.locator('#feature-dialog')).not.toBeVisible();
  await fallback.context.close();

  assert.deepEqual(errors, [], 'No feature-capture runtime errors or animated asset requests');
  console.log(`Passed (${browserType.name()}): six native UI movies with varied configured durations, changing action-region frames and per-feature camera moves; original Tahoe wallpaper, 80% borderless app windows and no fabricated chrome; responsive cards and dialog playback lifecycle without play/pause buttons, reduced-motion poster fallback and automatic resume after preference changes, and no-JS posters.`);
} finally {
  await browser.close();
  await close();
}
