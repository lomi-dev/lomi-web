import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Shared by the static-site check and the existing isolated CMS fixture builds.
export async function assertPlaceholder(placeholder, { logo = '/placeholders/lomi-mark.svg', aspect, variant = 'brand' } = {}) {
  if (variant !== 'feature') await expect(placeholder).toHaveAttribute('aria-hidden', 'true');
  const image = placeholder.locator(variant === 'feature' ? 'img[data-feature-poster]' : 'img');
  await expect(image).toHaveCount(1);
  if (variant === 'feature') {
    await expect(placeholder).toHaveAttribute('data-placeholder-variant', 'feature');
    await expect(placeholder).toHaveAttribute('data-feature-preview', /^(terminal|panels|code|expand|git|spark)$/);
    await expect(image).toHaveAttribute('alt', /.+/);
    await expect(placeholder.locator(':scope > img.feature-desktop[aria-hidden="true"]')).toHaveCount(1);
    await expect(placeholder.locator(':scope > [data-render-window] img[data-feature-poster]')).toHaveCount(1);
    await expect(placeholder.locator(':scope > [data-render-detail][aria-hidden="true"] img[alt=""]')).toHaveCount(1);
    await expect(placeholder.locator('img')).toHaveCount(3);
    await expect(placeholder.locator('video, svg, [data-feature-gif]')).toHaveCount(0);
  } else {
    await expect(image).toHaveAttribute('alt', '');
    const illustration = { hero: '/placeholders/hero-workspace.svg', download: '/placeholders/download-workspace.svg' }[variant];
    await expect(image).toHaveAttribute('src', illustration ?? logo);
    if (illustration) await expect(placeholder).toHaveAttribute('data-placeholder-variant', variant);
    else await expect(placeholder).not.toHaveAttribute('data-placeholder-variant', /^(hero|download|feature)$/);
  }
  await placeholder.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(placeholder).toHaveCSS('border-radius', '16px');
  if (aspect) await expect(placeholder).toHaveCSS('aspect-ratio', aspect);
  const geometry = await placeholder.evaluate((element, variant) => {
    const frame = element.getBoundingClientRect();
    const mark = element.querySelector(variant === 'feature' ? ':scope > .feature-desktop' : 'img, svg').getBoundingClientRect();
    const style = getComputedStyle(element);
    const result = {
      width: frame.width, height: frame.height, background: style.backgroundColor,
      border: parseFloat(style.borderTopWidth),
      centered: Math.abs(mark.left + mark.width / 2 - frame.left - frame.width / 2) <= 1 && Math.abs(mark.top + mark.height / 2 - frame.top - frame.height / 2) <= 1,
      fits: mark.width > 0 && mark.height > 0 && mark.left >= frame.left && mark.right <= frame.right + 1 && mark.top >= frame.top && mark.bottom <= frame.bottom + 1,
      restrained: mark.width <= frame.width * .46 && mark.height <= frame.height * .46,
      fills: Math.abs(mark.width - frame.width) <= 3 && Math.abs(mark.height - frame.height) <= 3,
    };
    if (variant !== 'feature') return result;
    const app = element.querySelector('[data-render-window]');
    const detail = element.querySelector('[data-render-detail]');
    const crop = detail?.querySelector('img');
    const appBox = app?.getBoundingClientRect();
    const detailBox = detail?.getBoundingClientRect();
    const cropBox = crop?.getBoundingClientRect();
    const appWidthRatio = appBox?.width / element.clientWidth;
    const appCenterRatio = appBox && (appBox.left + appBox.width / 2 - frame.left) / element.clientWidth;
    const contained = (box) => box && box.left >= frame.left - 2 && box.top >= frame.top - 2
      && box.right <= frame.right + 2 && box.bottom <= frame.bottom + 2;
    return {
      ...result,
      overflow: style.overflow,
      aspect: frame.width / frame.height,
      detailWidth: detailBox?.width,
      detailHeight: detailBox?.height,
      detailVisible: !!detailBox && detailBox.width > 0 && detailBox.height > 0,
      appWidthRatio,
      appCenterRatio,
      appFits: contained(appBox),
      detailFits: contained(detailBox),
      detailOverflow: detail && getComputedStyle(detail).overflow,
      magnifiedWidthRatio: cropBox?.width / detailBox?.width,
      magnifiedHeightRatio: cropBox?.height / detailBox?.height,
      detailImageClipped: cropBox && detailBox && (cropBox.left < detailBox.left - 2 || cropBox.top < detailBox.top - 2
        || cropBox.right > detailBox.right + 2 || cropBox.bottom > detailBox.bottom + 2),
    };
  }, variant);
  assert.ok(geometry.width > 0 && geometry.height > 0, 'Placeholder reserves a visible frame');
  assert.ok(geometry.border > 0, 'Placeholder keeps its border');
  if (variant === 'feature') {
    assert.notEqual(geometry.background, 'rgba(0, 0, 0, 0)', 'Feature capture has a visible background');
    assert.ok(geometry.fills && geometry.fits, `Feature wallpaper fills its frame: ${JSON.stringify(geometry)}`);
    assert.match(geometry.overflow, /^(hidden|clip)$/);
    assert.ok(geometry.appWidthRatio > 0 && geometry.appWidthRatio <= .825,
      `App window fits within 80% of the wallpaper: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.appCenterRatio - .5) < .025, `App window is centered over the wallpaper: ${JSON.stringify(geometry)}`);
    if (geometry.aspect <= 1.65) {
      assert.ok(Math.abs(geometry.appWidthRatio - .8) < .025, `App window spans 80% of a standard capture: ${JSON.stringify(geometry)}`);
    }
    assert.ok(geometry.appFits && geometry.detailFits, `App window and detail stay within the capture: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.detailVisible, `Magnified detail remains visible at this viewport: ${JSON.stringify(geometry)}`);
    assert.match(geometry.detailOverflow, /^(hidden|clip)$/);
    assert.ok(geometry.magnifiedWidthRatio > 1.5 && geometry.magnifiedHeightRatio > 1.5 && geometry.detailImageClipped,
      `Detail shows a magnified crop of the app capture: ${JSON.stringify(geometry)}`);
  } else {
    assert.notEqual(geometry.background, 'rgba(0, 0, 0, 0)', 'Placeholder has a visible pale background');
    assert.ok(geometry.centered && geometry.fits && (variant !== 'brand' ? geometry.fills : geometry.restrained), `Decorative ${variant !== 'brand' ? 'contextual illustration fills its frame' : 'logo stays restrained'}, centered and unclipped: ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

export async function startStaticPreview() {
  let origin = process.env.VERIFY_URL;
  let server;
  if (!origin) {
    const output = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname);
        const path = resolve(output, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
        if (!path.startsWith(output + sep)) throw new Error('Invalid path');
        const content = await readFile(path);
        response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream' });
        response.end(content);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  return { origin, close: async () => { if (server) await new Promise((done) => { server.close(done); server.closeAllConnections(); }); } };
}

async function verify() {
  const { origin, close } = await startStaticPreview();
  const browser = await chromium.launch();
  await mkdir('artifacts', { recursive: true });
  try {
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled, reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })));
      await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '{}' }));
      const external = [];
      await context.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//, (route) => { external.push(route.request().url()); return route.abort(); });
      const page = await context.newPage();
      let background, featureBackground;
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of ['/', '/download/', '/remote/', '/devlog/']) {
          await page.goto(origin + route, { waitUntil: 'networkidle' });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${route} has no overflow at ${width}px`);
          const placeholders = page.locator('[data-media-placeholder]:visible');
          if (route === '/download/') {
            const capture = page.locator('.product-showcase img');
            await expect(capture, 'Download shows the real app capture').toBeVisible();
            await expect(capture).toHaveAttribute('alt', /desktop app/i);
            await expect.poll(() => capture.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
          } else {
            await expect(placeholders.first(), `${route} exposes a branded fallback`).toBeVisible();
          }
          await expect(page.locator('[data-placeholder-variant="hero"]')).toHaveCount(0);
          for (const placeholder of await placeholders.all()) {
            const variant = await placeholder.evaluate((element) => element.closest('#workspace') ? 'hero' : element.closest('[data-feature-card], [data-feature-slide]') ? 'feature' : element.closest('.product-showcase') ? 'download' : 'brand');
            const geometry = await assertPlaceholder(placeholder, { aspect: route === '/devlog/' ? '16 / 9' : '8 / 5', variant });
            if (variant === 'feature') {
              featureBackground ??= geometry.background;
              assert.equal(geometry.background, featureBackground, 'Feature captures share the Tahoe wallpaper surface');
            } else {
              background ??= geometry.background;
              assert.equal(geometry.background, background, 'Branded fallback surfaces share the Devlog background');
            }
          }
          const oldRefs = await page.locator('img, video, source').evaluateAll((elements) => elements.flatMap((element) => ['src', 'srcset', 'poster'].map((name) => element.getAttribute(name) || '')).filter((value) => /(?:placeholder|\/_astro\/(?:workspace|detail|mobile|workbench|source-control)[.])[^\s]*\.png/i.test(value)));
          assert.deepEqual(oldRefs, [], 'No legacy numeric PNG fallback references');
          const name = route === '/' ? 'hero' : route.slice(1, -1);
          if (javaScriptEnabled) {
            await page.screenshot({ path: `artifacts/placeholders-${name}-${width}.png`, fullPage: true });
            if (route === '/') await page.locator('.hero').screenshot({ path: `artifacts/hero-product-${width}.png` });
          }
          if (route === '/' && javaScriptEnabled && width === 1440) {
            for (const [name, selector, contrast] of [
              ['hero', '[data-video-poster] img', 'light'],
              ['feature', '[data-feature-card] [data-media-placeholder]', 'dark'],
              ['roadmap', '#roadmap', 'light'],
            ]) {
              await page.locator(selector).first().evaluate((element) => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top + 100, behavior: 'instant' }));
              for (const target of await page.locator('.site-header :is(.wordmark, .navigation-link, .product-menu > summary, .header-source):visible').all()) {
                await expect(target, `Navbar foreground over ${name}`).toHaveAttribute('data-contrast', contrast);
              }
              await page.screenshot({ path: `artifacts/placeholders-navbar-${name}-${width}.png` });
            }
          }
          if (route === '/' && javaScriptEnabled) {
            const cards = page.locator('[data-feature-card]');
            for (let index = 0; index < await cards.count(); index++) {
              await assertPlaceholder(cards.nth(index).locator('[data-media-placeholder]'), { aspect: '8 / 5', variant: 'feature' });
              await page.locator(`[data-feature-open="${index}"]`).click();
              const dialog = page.locator('#feature-dialog');
              await expect(dialog).toBeVisible();
              const geometry = await assertPlaceholder(dialog.locator('[data-feature-slide]:visible [data-media-placeholder]'), { aspect: '8 / 5', variant: 'feature' });
              assert.equal(geometry.background, featureBackground, 'Modal fallback matches the card wallpaper surface');
              if (index === 0) await page.screenshot({ path: `artifacts/placeholders-modal-${width}.png` });
              await dialog.locator('[data-feature-close]').click();
              await expect(dialog).not.toBeVisible();
            }
          }
        }
      }
      assert.deepEqual(external, [], 'Fallback checks never contact YouTube');
      await context.close();
    }
    const asset = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await asset.goto(origin + '/placeholders/hero-workspace.svg');
    await asset.screenshot({ path: 'artifacts/hero-workspace-asset.png' });
    await asset.close();
    console.log('Passed: current app capture in hero and Download; branded fallbacks; feature scenes; centered unclipped geometry, uniform background/border/radius/aspect, all feature cards and dialogs, four routes at 320/1440px with and without JavaScript; no legacy PNG media references or YouTube requests.');
  } finally { await browser.close(); await close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verify();
