import { assertPlaceholder } from './verify-placeholders.mjs';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build and serve throwaway fixtures. Never reuse preview servers or write dist.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(resolve(tmpdir(), 'lomi-devlog-'));
const servers = [];
const errors = [];
const cmsRequests = [];
const youtubePattern = /^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)\//;
const feedPath = '/api/devlogs?depth=1&draft=false&limit=100&page=1&sort=-publishedAt%2C-id&where%5B_status%5D%5Bequals%5D=published';
const mediaPath = '/api/media/file/devlog-fixture.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=', 'base64');
const updates = [
  { id: '4', title: 'The workspace comes together', date: 'Oct 21, 2026', href: 'https://www.youtube.com/watch?v=ddddddddddd', alt: 'The latest workspace preview' },
  { id: '3', title: 'Making room for agents', date: 'Oct 1, 2026', href: 'https://www.youtube.com/watch?v=ccccccccccc' },
  { id: '2', title: 'A quieter terminal', date: 'Sep 20, 2026', href: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  { id: '1', title: 'The first prototype', date: 'Aug 1, 2026', href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
];
const episodes = [
  { id: 2, _status: 'published', title: 'A quieter terminal', videoUrl: 'https://youtu.be/bbbbbbbbbbb?t=30', publishedAt: '2026-09-20T10:00:00Z', duration: '4:23' },
  { id: 4, _status: 'published', title: 'The workspace comes together', description: 'A look at the editor, agents and terminals sharing one workspace.', videoUrl: 'https://www.youtube.com/watch?v=ddddddddddd&list=ignored', publishedAt: '2026-10-20T23:30:00-02:00', duration: '12:34', thumbnail: { id: 91, url: mediaPath, mimeType: 'image/png', width: 1, height: 1, alt: 'Uploaded metadata description' }, thumbnailAlt: 'The latest workspace preview' },
  { id: 1, _status: 'published', title: 'The first prototype', videoUrl: 'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa', publishedAt: '2026-08-01T10:00:00Z' },
  { id: 3, _status: 'published', title: 'Making room for agents', description: 'Small decisions that make everyday development easier.', videoUrl: 'https://www.youtube.com/shorts/ccccccccccc', publishedAt: '2026-10-01T10:00:00Z' },
];
let output;
let docs = [];
let browser;

async function serve(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function build(name, cms) {
  output = resolve(scratch, name);
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', output], {
      cwd: root, env: { ...process.env, CMS_URL: cms, SITE_URL: 'https://fixture.lomi.test', ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Devlog ${name} build timed out\n${log}`)); }, 120000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? done() : reject(new Error(`Devlog ${name} build failed (${code})\n${log}`)); });
  });
}

async function observeUpdateScroll(context) {
  await context.addInitScript(() => {
    window.__lomiUpdateScrollBehaviors = [];
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (options, y) {
      if (this.matches('[data-updates-rail]')) {
        window.__lomiUpdateScrollBehaviors.push(typeof options === 'object' ? options.behavior ?? 'auto' : 'auto');
      }
      return arguments.length === 1 ? originalScrollTo.call(this, options) : originalScrollTo.call(this, options, y);
    };
  });
}

async function verifyHomepageUpdates(page, { state, javaScriptEnabled, width, externalRequests, cms, preview, fixture }) {
  await page.goto(preview + '/', { waitUntil: 'networkidle' });
  const section = page.locator('[data-home-updates]');
  const rail = section.locator('ul[data-updates-rail]');
  await expect(section).toHaveCount(1);
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(/^lomi news & updates$/i);
  await expect(section.locator('[data-updates-all]')).toHaveAttribute('href', '/devlog/');
  await expect(section.locator('[data-updates-all]')).toBeVisible();
  await expect(section.locator('[data-updates-all]')).toHaveAccessibleName(/all devlogs/i);
  await expect(rail).toHaveAttribute('tabindex', '0');
  assert.equal(await rail.evaluate((element) => element.tagName), 'UL', 'Updates rail remains a semantic list');
  await expect(section.locator('[data-updates-previous]')).toHaveCount(1);
  await expect(section.locator('[data-updates-next]')).toHaveCount(1);

  const order = await page.evaluate(() => {
    const nodes = ['#cli-compatibility', '[data-home-updates]', '#newsletter'].map((selector) => document.querySelector(selector));
    if (nodes.some((node) => !node)) return false;
    return nodes[0].compareDocumentPosition(nodes[1]) & Node.DOCUMENT_POSITION_FOLLOWING
      && nodes[1].compareDocumentPosition(nodes[2]) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  assert.ok(order, 'Homepage sections appear in CLI, updates, newsletter order');

  const cards = section.locator('[data-update-episode]');
  await expect(rail.locator('li[data-update-card]')).toHaveCount(state === 'empty' ? 4 : updates.length);
  if (state === 'empty') {
    await expect(section.locator('[data-update-placeholder]')).toHaveCount(4);
    await expect(cards).toHaveCount(0);
    await expect(section.locator('[data-update-placeholder] .update-soon')).toHaveText(Array(4).fill('Coming soon'));
    await expect(section.locator('[data-update-placeholder] a, [data-update-placeholder] button')).toHaveCount(0);
    await expect(section.locator('[data-updates-all]')).toHaveAttribute('href', '/devlog/');
  } else {
    await expect(section.locator('[data-update-placeholder]')).toHaveCount(0);
    await expect(cards).toHaveCount(updates.length);
    assert.deepEqual(await cards.evaluateAll((articles) => articles.map((article) => article.getAttribute('data-update-episode'))), updates.map(({ id }) => id), 'Homepage episodes are ordered newest first');
    await expect(cards.locator('h3')).toHaveText(updates.map(({ title }) => title));
    await expect(cards.locator('time')).toHaveText(updates.map(({ date }) => date));
    await expect(cards.locator('a')).toHaveCount(updates.length);
    assert.deepEqual(await cards.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), updates.map(({ href }) => href), 'Homepage episode links use canonical watch URLs');
    await expect(cards.locator('.update-read')).toHaveText(Array(updates.length).fill(fixture.pages.devlog.watchLabel));
    await expect(cards.first().locator('time')).toHaveAttribute('datetime', episodes[1].publishedAt);
    await expect(cards.first().locator('.update-cover img')).toHaveAttribute('src', cms + mediaPath);
    await expect(cards.first().locator('.update-cover img')).toHaveAttribute('alt', updates[0].alt);
    for (let index = 1; index < updates.length; index++) {
      const cover = cards.nth(index).locator('.update-cover');
      const image = cover.locator('img');
      await expect(cover.locator('[data-media-placeholder]')).toHaveCount(1);
      await expect(image).toHaveAttribute('alt', '');
      assert.equal(new URL(await image.getAttribute('src'), preview).origin, new URL(preview).origin, `Episode ${updates[index].id} uses a local thumbnail placeholder`);
    }
  }

  const railStyles = await rail.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    touchAction: getComputedStyle(element).touchAction,
    scrollBehavior: getComputedStyle(element).scrollBehavior,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  assert.ok(['auto', 'scroll'].includes(railStyles.overflowX), `Updates rail supports native horizontal scrolling (${railStyles.overflowX})`);
  assert.ok(['auto', 'pan-x', 'pan-x pan-y'].includes(railStyles.touchAction), `Updates rail permits touch scrolling (${railStyles.touchAction})`);
  const overflows = railStyles.scrollWidth > railStyles.clientWidth + 1;
  if (width === 320) assert.ok(overflows, `${state} updates rail overflows at ${width}px`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${state}, JS=${javaScriptEnabled}, homepage ${width}px overflow`);

  const controls = section.locator('[data-updates-controls]');
  const previous = section.locator('[data-updates-previous]');
  const next = section.locator('[data-updates-next]');
  if (!javaScriptEnabled) {
    await expect(controls).toBeHidden();
  } else {
    if (overflows) await expect(controls).toBeVisible();
    else await expect(controls).toBeHidden();
    await expect(previous).toBeDisabled();
    assert.equal(await next.isDisabled(), !overflows, 'Next control is enabled only when later cards are reachable');
    if (overflows) {
      await next.focus();
      const start = await rail.evaluate((element) => element.scrollLeft);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__lomiUpdateScrollBehaviors.at(-1)), 'instant', `${state} ${width}px keyboard activation uses reduced-motion scrolling`);
      await expect.poll(() => rail.evaluate((element) => element.scrollLeft), `${state} ${width}px keyboard Next advances the rail`).toBeGreaterThan(start);
      async function advanceToBoundary(button, direction) {
        for (let step = 0; step < 10; step++) {
          const position = await rail.evaluate((element) => ({ left: element.scrollLeft, max: element.scrollWidth - element.clientWidth }));
          const remaining = direction === 1 ? position.max - position.left : position.left;
          if (remaining <= 1) break;
          await expect(button).toBeEnabled();
          await button.click();
          if (direction === 1) await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(position.left);
          else await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeLessThan(position.left);
        }
      }
      await advanceToBoundary(next, 1);
      await expect(next).toBeDisabled();
      const end = await rail.evaluate((element) => ({ left: element.scrollLeft, max: element.scrollWidth - element.clientWidth }));
      assert.ok(Math.abs(end.left - end.max) <= 1, 'Next reaches the final card and stops at the rail boundary');
      await expect(previous).toBeEnabled();
      const beforePrevious = end.left;
      await previous.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeLessThan(beforePrevious);
      await advanceToBoundary(previous, -1);
      await expect(previous).toBeDisabled();
      assert.ok((await rail.evaluate((element) => element.scrollLeft)) <= 1, 'Previous reaches the first card and stops at the rail boundary');
    }
  }

  if (!javaScriptEnabled && width === 320) {
    await rail.scrollIntoViewIfNeeded();
    const bounds = await rail.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(400, 0);
    await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }

  if (javaScriptEnabled) {
    const result = await new AxeBuilder({ page }).include('[data-home-updates]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), [], `${state} homepage updates ${width}px accessibility`);
  }

  assert.deepEqual(externalRequests, [], 'Homepage updates load without contacting YouTube before a user activates a link');
}

try {
  const parsed = spawnSync('bun', ['-e', "import {landingSchema} from './content/landing-schema.ts'; import seed from './content/landing.json'; console.log(JSON.stringify(landingSchema.parse(seed)));"], { cwd: root, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const fixture = JSON.parse(parsed.stdout);
  fixture._status = 'published';
  const cms = await serve((request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/api/globals/landing' || url.pathname === '/api/devlogs') {
      cmsRequests.push(url.pathname + url.search);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(url.pathname === '/api/devlogs' ? { docs, hasNextPage: false, nextPage: null } : fixture));
    } else if (url.pathname === mediaPath) {
      response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(png);
    } else { response.writeHead(404); response.end(); }
  });
  const preview = await serve(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname);
      const path = resolve(output, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
      if (!path.startsWith(output + sep)) { response.writeHead(403); response.end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2' };
      const content = await readFile(path);
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  browser = await chromium.launch();
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  for (const state of ['empty', 'populated']) {
    docs = state === 'empty' ? [] : episodes;
    if (state === 'populated') {
      fixture.pages.devlog.latestLabel = 'Featured recording';
      fixture.pages.devlog.archiveLabel = 'Earlier recordings';
      fixture.pages.devlog.watchLabel = 'Watch this recording';
    }
    cmsRequests.length = 0;
    await build(state, cms);
    assert.deepEqual(cmsRequests.filter((url) => url.startsWith('/api/devlogs')), [feedPath, feedPath], `${state}: devlog and homepage each load the published feed`);
    const builtDevlog = await readFile(resolve(output, 'devlog/index.html'), 'utf8');
    const robotsTag = builtDevlog.match(/<meta\b[^>]*name="robots"[^>]*>/)?.[0] ?? '';
    assert.equal(/\bnoindex\b/.test(robotsTag), state === 'empty', `${state}: only an empty devlog is noindexed`);
    const sitemap = await readFile(resolve(output, 'sitemap-0.xml'), 'utf8');
    assert.equal(sitemap.includes('<loc>https://fixture.lomi.test/devlog/</loc>'), state === 'populated', `${state}: sitemap follows published devlog content`);
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Pacific/Honolulu' });
      await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })));
      await observeUpdateScroll(context);
      const externalRequests = [];
      await context.route(youtubePattern, (route) => {
        externalRequests.push(route.request().url());
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Local YouTube destination</title><body>Local navigation fixture</body></html>' });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await verifyHomepageUpdates(page, { state, javaScriptEnabled, width, externalRequests, cms, preview, fixture });
        await page.goto(preview + '/devlog/', { waitUntil: 'networkidle' });
        await expect(page).toHaveTitle(fixture.pages.devlog.seo.title);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Devlog.');
        await expect(page.locator('.desktop-navigation a[href="/devlog/"]')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.devlog-surface')).toHaveCSS('background-color', 'rgb(247, 248, 243)');
        await expect(page.locator('h1')).toHaveCSS('color', 'rgb(11, 13, 12)');
        await expect(page.locator('.site-header')).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(32, 44, 24)');
        if (width >= 768) {
          await expect(page.locator('.devlog-intro')).toHaveCSS('position', 'sticky');
          const intro = await page.locator('.devlog-intro').boundingBox();
          const recordings = await page.locator('.devlog-recordings').boundingBox();
          assert.ok(intro.x + intro.width < recordings.x, 'Desktop introduction sits beside the recordings');
        }
        await expect(page.locator('iframe')).toHaveCount(0);
        assert.deepEqual(externalRequests, [], 'No YouTube requests before following a link, even with media consent');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${state}, JS=${javaScriptEnabled}, ${width}px overflow`);
        if (state === 'empty') {
          await expect(page.locator('[data-devlog-card]')).toHaveCount(0);
          await expect(page.locator('[data-devlog-empty]')).toBeVisible();
          await expect(page.locator('.devlog-recordings').getByRole('heading', { level: 2 })).toHaveCount(1);
          await expect(page.locator('.devlog-recordings').getByRole('heading', { level: 2 })).toHaveText(fixture.pages.devlog.empty.title);
          await expect(page.getByRole('link', { name: fixture.pages.devlog.cta.label })).toHaveAttribute('href', '/');
          await expect(page.locator('.empty-preview')).toHaveAttribute('aria-hidden', 'true');
          await expect(page.locator('.empty-preview')).toHaveCSS('aspect-ratio', '16 / 9');
          await expect(page.locator('.empty-preview a, .empty-preview button, .empty-preview .episode-play')).toHaveCount(0);
          const wordmarkFits = await page.locator('.empty-preview').evaluate((preview) => {
            const bounds = preview.getBoundingClientRect();
            const wordmark = preview.querySelector('[data-media-placeholder] img').getBoundingClientRect();
            return wordmark.width > 0 && wordmark.height > 0 && wordmark.left >= bounds.left && wordmark.right <= bounds.right + 1 && wordmark.top >= bounds.top && wordmark.bottom <= bounds.bottom + 1;
          });
          assert.ok(wordmarkFits, `Decorative wordmark fits its empty preview at ${width}px`);
        } else {
          await expect(page.locator('[data-devlog-empty]')).toHaveCount(0);
          const cards = page.locator('[data-devlog-card]');
          await expect(cards).toHaveCount(4);
          await expect(cards.locator('h3')).toHaveText(['The workspace comes together', 'Making room for agents', 'A quieter terminal', 'The first prototype']);
          await expect(page.locator('.devlog-recordings').getByRole('heading', { level: 2 })).toHaveCount(2);
          await expect(page.locator('.devlog-recordings').getByRole('heading', { level: 3 })).toHaveCount(4);
          await expect(page.locator('.devlog-latest > h2.devlog-section-heading')).toHaveText(fixture.pages.devlog.latestLabel);
          await expect(page.locator('.devlog-archive > h2.devlog-section-heading')).toHaveText(fixture.pages.devlog.archiveLabel);
          await expect(cards.locator('.episode-watch')).toHaveText(Array(4).fill(fixture.pages.devlog.watchLabel));
          assert.deepEqual(await cards.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('target'))), Array(4).fill(null));
          assert.deepEqual(await cards.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), ['ddddddddddd', 'ccccccccccc', 'bbbbbbbbbbb', 'aaaaaaaaaaa'].map((id) => `https://www.youtube.com/watch?v=${id}`));
          await expect(cards.first().locator('time')).toHaveText('Oct 21, 2026');
          await expect(cards.first().locator('img')).toHaveAttribute('src', cms + mediaPath);
          await expect(cards.first().locator('img')).toHaveAttribute('alt', episodes[1].thumbnailAlt);
          await expect(cards.first().locator('.episode-duration')).toHaveText('12:34');
          const latestThumbnail = await cards.first().locator('.episode-thumbnail').boundingBox();
          const latestCaption = await cards.first().locator('.episode-copy').boundingBox();
          assert.ok(latestCaption.y >= latestThumbnail.y + latestThumbnail.height - 1, 'Featured caption sits below its thumbnail');
          const gridColumns = await page.locator('.devlog-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
          assert.equal(gridColumns, width > 540 ? 2 : 1, 'Archive uses two columns when space allows');
          for (let index = 0; index < 4; index++) {
            const image = cards.nth(index).locator('img');
            await image.scrollIntoViewIfNeeded();
            await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
            if (index > 0) {
              assert.equal(new URL(await image.getAttribute('src'), preview).origin, preview, 'Missing thumbnails use a local asset');
              await expect(image).toHaveAttribute('alt', '');
              await assertPlaceholder(cards.nth(index).locator('[data-media-placeholder]'), { aspect: '16 / 9' });
            }
            const ratio = await cards.nth(index).locator('.episode-thumbnail').evaluate((element) => getComputedStyle(element).aspectRatio);
            assert.equal(ratio, '16 / 9', 'Thumbnails reserve a consistent aspect ratio');
            const playFits = await cards.nth(index).locator('.episode-thumbnail').evaluate((thumbnail) => {
              const bounds = thumbnail.getBoundingClientRect();
              const play = thumbnail.querySelector('.episode-play').getBoundingClientRect();
              return play.left > bounds.left && play.top > bounds.top && play.right < bounds.right && play.bottom < bounds.bottom && play.left < bounds.left + bounds.width / 2 && play.top > bounds.top + bounds.height / 2;
            });
            assert.ok(playFits, `Episode ${index + 1} play icon stays inside the thumbnail at bottom left (${width}px)`);
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        if (javaScriptEnabled) {
          const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), [], `${state} ${width}px accessibility`);
          if (width === 320 || width === 1440) await page.screenshot({ path: resolve(root, `artifacts/devlog-${state}-${width}.png`), fullPage: true });
          await page.locator('[data-cookie-settings]').click();
          await expect(page.locator('#cookie-preferences')).toBeVisible();
          await page.locator('#cookie-external-media').uncheck();
          await page.locator('[data-cookie-save]').click();
          await expect(page.locator('#cookie-preferences')).not.toBeVisible();
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lomi.cookie-consent')).externalMedia), false);
        } else {
          await expect(page.locator('[data-cookie-settings]')).toHaveAttribute('href', '/cookies/#preferences');
        }
      }
      if (state === 'populated') {
        for (const keyboard of [false, true]) {
          await page.goto(preview + '/devlog/', { waitUntil: 'networkidle' });
          externalRequests.length = 0;
          const link = page.locator('[data-devlog-card] > a').first();
          if (keyboard) { await link.focus(); await page.keyboard.press('Enter'); } else { await link.click(); }
          await expect(page).toHaveURL('https://www.youtube.com/watch?v=ddddddddddd');
          assert.deepEqual(externalRequests, ['https://www.youtube.com/watch?v=ddddddddddd']);
          assert.equal(context.pages().length, 1, 'Episode opens in the same tab');
        }
        await page.goto(preview + '/', { waitUntil: 'networkidle' });
        externalRequests.length = 0;
        const homeUpdateLink = page.locator('[data-update-episode="4"] > a');
        if (javaScriptEnabled) { await homeUpdateLink.focus(); await page.keyboard.press('Enter'); }
        else await homeUpdateLink.click();
        await expect(page).toHaveURL('https://www.youtube.com/watch?v=ddddddddddd');
        assert.deepEqual(externalRequests, ['https://www.youtube.com/watch?v=ddddddddddd'], 'Homepage update follows YouTube only after click or keyboard activation');
      }
      await context.close();
    }
    if (state === 'populated') {
      const motionContext = await browser.newContext({ javaScriptEnabled: true, viewport: { width: 320, height: 1000 }, reducedMotion: 'no-preference' });
      await motionContext.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })));
      await observeUpdateScroll(motionContext);
      const motionRequests = [];
      await motionContext.route(youtubePattern, (route) => {
        motionRequests.push(route.request().url());
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Local YouTube destination</title><body>Local navigation fixture</body></html>' });
      });
      const motionPage = await motionContext.newPage();
      await motionPage.goto(preview + '/', { waitUntil: 'networkidle' });
      const motionRail = motionPage.locator('[data-updates-rail]');
      await motionPage.locator('[data-updates-next]').click();
      await expect.poll(() => motionRail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      assert.equal(await motionPage.evaluate(() => window.__lomiUpdateScrollBehaviors.at(-1)), 'smooth', 'Default motion preference keeps button scrolling smooth');
      assert.deepEqual(motionRequests, [], 'Smooth native scrolling adds no unsolicited YouTube request');
      await motionContext.close();
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('Passed: two isolated Devlog builds; empty/populated homepage updates and Devlog feeds; four sorted updates with canonical links, UTC dates, uploaded/local thumbnails and editable CTA; passive placeholders; JS/no-JS native rail, touch-action and wheel scroll, keyboard controls and bounds, responsive overflow, reduced-motion behavior, updates/archive axe and no unsolicited YouTube requests; cookie settings and four screenshots.');
} finally {
  await browser?.close();
  await Promise.all(servers.map((server) => new Promise((done) => { server.close(done); server.closeAllConnections(); })));
  await rm(scratch, { recursive: true, force: true });
}
