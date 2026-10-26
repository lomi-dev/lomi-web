import { assertPlaceholder } from './verify-placeholders.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Real build-time HTTP contract; no Payload database, existing dist, or remote writes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(resolve(tmpdir(), 'lomi-cms-content-'));
const marker = resolve(scratch, 'command-must-never-run');
const servers = [];
let browser;
let currentOutput;
let fixture;
let cmsOrigin;
const cmsRequests = [];
const browserErrors = [];
const newsletterRequests = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=', 'base64');
const mediaPath = '/api/media/file/cms-sentinel.png';
const videoPath = '/api/media/file/cms-sentinel.webm';
let clip;
const youtubeId = 'aqz-KE-bpKQ';

async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function build(name) {
  const output = resolve(scratch, name);
  await new Promise((resolveBuild, reject) => {
    const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', output], {
      cwd: root, env: { ...process.env, CMS_URL: cmsOrigin, SITE_URL: 'https://fixture.lomi.test', ASTRO_TELEMETRY_DISABLED: '1', PUBLIC_NEWSLETTER_ENDPOINT: 'https://newsletter.example.test/v1/newsletter/subscribe' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (data) => { log += data; });
    child.stderr.on('data', (data) => { log += data; });
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`CMS fixture build ${name} timed out\n${log}`)); }, 120000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? resolveBuild() : reject(new Error(`CMS fixture build ${name} failed (${code})\n${log}`)); });
  });
  currentOutput = output;
}
function asset(alt = 'CMS uploaded metadata alt') {
  return { id: 71, url: mediaPath, mimeType: 'image/png', width: 1, height: 1, alt };
}
async function assertMedia(page, selector, alt) {
  const image = page.locator(selector).first();
  await expect(image).toHaveAttribute('src', `${cmsOrigin}${mediaPath}`);
  await expect(image).toHaveAttribute('alt', alt);
  await image.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth === 1)).toBe(true);
}
async function playNative(video) {
  // Exercise a real decoder and playing event, without replacing media methods.
  await video.evaluate((element) => new Promise((resolvePlaying, reject) => {
    const timeout = setTimeout(() => reject(new Error('Native CMS video did not play: ' + JSON.stringify({ ready: element.readyState, network: element.networkState, error: element.error?.message, src: element.currentSrc, paused: element.paused, muted: element.muted, rect: element.getBoundingClientRect().toJSON(), hidden: document.hidden, blocked: !!element.closest('[hidden], [inert]') }))), 5000);
    element.addEventListener('playing', () => { clearTimeout(timeout); resolvePlaying(); }, { once: true });
    if (element.readyState >= 1) element.currentTime = 0;
    element.play().catch((error) => { clearTimeout(timeout); reject(error); });
  }));
  await expect.poll(() => video.evaluate((element) => !element.paused && element.readyState >= 2)).toBe(true);
}
async function absent(path) { try { await stat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } }

try {
  const parsed = spawnSync('bun', ['-e', "import {landingSchema} from './content/landing-schema.ts'; import seed from './content/landing.json'; console.log(JSON.stringify(landingSchema.parse(seed)));"], { cwd: root, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  fixture = JSON.parse(parsed.stdout);
  fixture.editorVersion = 1;
  fixture._status = 'published';
  fixture.id = 42;
  fixture.seo = { title: 'CMS home SEO sentinel', description: 'CMS home description sentinel' };
  fixture.site.brand.name = 'CMS brand sentinel';
  fixture.site.brand.logo = asset();
  fixture.site.brand.logoAlt = 'CMS logo alt sentinel';
  fixture.site.brand.favicon = asset();
  fixture.site.brand.socialImage = asset();
  fixture.site.theme.accent = '#a1b2c3';
  fixture.site.theme.ink = '#112233';
  fixture.site.skipLabel = 'CMS skip sentinel';
  fixture.site.cookie.title = 'CMS consent sentinel';
  fixture.site.cookie.acceptLabel = 'CMS accept sentinel';
  fixture.site.cookie.mediaLabel = 'CMS media sentinel';
  fixture.site.cookie.saveLabel = 'CMS save sentinel';
  fixture.site.cookie.storageError = 'CMS storage error sentinel';
  fixture.navigation.productLabel = 'CMS product sentinel';
  fixture.navigation.actionLabel = 'CMS download action sentinel';
  fixture.navigation.actionHref = '#newsletter';
  fixture.navigation.links = [{ label: 'CMS newsletter nav sentinel', href: '/#newsletter' }, { label: 'CMS remote nav sentinel', href: '/remote/' }];
  fixture.navigation.productGroups = [{ label: 'CMS group sentinel', links: [{ label: 'CMS newsletter product sentinel', href: '#newsletter' }, { label: 'CMS legal sentinel', href: '/cookies/#preferences' }] }];
  fixture.footer.groups = [{ title: 'CMS footer group sentinel', links: [{ label: 'CMS newsletter footer sentinel', href: '/#newsletter' }, { label: 'CMS legal footer sentinel', href: '/cookies/#preferences' }] }];
  fixture.footer.signoff = 'CMS footer sentinel';
  fixture.hero.title = 'CMS hero sentinel';
  fixture.hero.previewAlt = 'CMS hero image alt sentinel';
  fixture.hero.poster = asset();
  fixture.hero.videoUrl = `https://youtu.be/${youtubeId}`;
  fixture.hero.player.videoTitle = 'CMS player title sentinel';
  fixture.hero.player.privacyLabel = 'CMS player privacy sentinel';
  fixture.features.items[0].title = 'CMS feature title sentinel';
  fixture.features.items[0].description = 'CMS feature detail sentinel';
  fixture.features.items[0].image = asset();
  fixture.features.items[0].alt = 'CMS feature alt sentinel';
  fixture.features.items[1].icon = 'git';
  fixture.features.controls.closeLabel = 'CMS close feature sentinel';
  fixture.roadmap.title = 'CMS roadmap title sentinel';
  fixture.roadmap.ui.legendCompleted = 'CMS completed sentinel';
  fixture.roadmap.ui.progressTemplate = 'CMS progress {completed}/{total}';
  fixture.roadmap.items[0].points[0] = { label: 'CMS task sentinel', status: 'completed' };
  fixture.newsletter.title = 'CMS newsletter title sentinel';
  fixture.newsletter.form.emailLabel = 'CMS email sentinel';
  fixture.newsletter.form.submitLabel = 'CMS subscribe sentinel';
  fixture.newsletter.form.successMessage = 'CMS subscribed message sentinel';
  fixture.newsletter.form.successLabel = 'CMS subscribed label sentinel';
  fixture.layout = [{ section: 'roadmap', enabled: true }, { section: 'hero', enabled: true }, { section: 'features', enabled: true }, { section: 'newsletter', enabled: true }];
  for (const name of ['download', 'remote', 'devlog', 'cookies']) fixture.pages[name].seo = { title: `CMS ${name} SEO sentinel`, description: `CMS ${name} description sentinel` };
  fixture.pages.download.title = 'CMS download title sentinel';
  fixture.pages.download.screenshot.image = asset();
  fixture.pages.download.screenshot.alt = 'CMS download alt sentinel';
  fixture.pages.download.aur.command = `printf CMS_AUR_SENTINEL; touch "${marker}"`;
  fixture.pages.download.feedback.releaseError = 'CMS release error sentinel';
  fixture.pages.remote.title = 'CMS remote title sentinel';
  fixture.pages.remote.screenshot.image = asset();
  fixture.pages.remote.screenshot.alt = 'CMS remote alt sentinel';
  fixture.pages.remote.platforms.unix.command = `printf CMS_UNIX_SENTINEL; touch "${marker}"`;
  fixture.pages.remote.platforms.windows.command = 'Write-Output CMS_WINDOWS_SENTINEL';
  fixture.pages.remote.feedback.copied = 'CMS copied {platform} sentinel';
  fixture.pages.devlog.title = [{ text: 'CMS devlog title sentinel' }];
  fixture.pages.devlog.description = [{ text: 'CMS devlog body sentinel' }];
  Object.assign(fixture.pages.devlog.empty, { label: 'CMS upcoming sentinel', title: 'CMS empty title sentinel', description: 'CMS empty body sentinel', previewLabel: 'CMS unrecorded sentinel', previewTitle: 'CMS slate sentinel' });
  fixture.pages.devlog.footerLabel = 'CMS devlog footer sentinel';
  fixture.pages.devlog.settingsLabel = 'CMS devlog settings sentinel';
  fixture.pages.cookies.title = 'CMS cookies title sentinel';
  fixture.pages.cookies.sections[0].paragraphs = [{ text: 'CMS privacy paragraph sentinel' }];

  browser = await chromium.launch();
  const recorderPage = await browser.newPage();
  const recording = await recorderPage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 40;
    const context = canvas.getContext('2d');
    context.fillRect(0, 0, 64, 40);
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    const result = new Promise((resolveRecording, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('Could not record the native-video fixture'));
      recorder.onstop = async () => {
        const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
        stream.getTracks().forEach((track) => track.stop());
        resolveRecording(btoa(String.fromCharCode(...bytes)));
      };
    });
    recorder.start();
    let frame = 0;
    const paint = setInterval(() => { context.fillStyle = `hsl(${frame++ * 30} 70% 50%)`; context.fillRect(0, 0, 64, 40); }, 80);
    setTimeout(() => { clearInterval(paint); recorder.stop(); }, 1200);
    return result;
  });
  clip = Buffer.from(recording, 'base64');
  assert.ok(clip.length > 100, 'Browser recorded a real playable video fixture');
  await recorderPage.close();

  cmsOrigin = await listen((request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/api/globals/landing') {
      cmsRequests.push(url.pathname + url.search);
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(fixture));
    } else if (url.pathname === '/api/devlogs') {
      cmsRequests.push(url.pathname + url.search);
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ docs: [], hasNextPage: false, nextPage: null }));
    } else if (url.pathname === mediaPath) {
      response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(png);
    } else if (url.pathname === videoPath) {
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1;
      if (start > end || start >= clip.length) { response.writeHead(416, { 'Content-Range': `bytes */${clip.length}` }); response.end(); return; }
      response.writeHead(range ? 206 : 200, { 'Content-Type': 'video/webm', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) });
      response.end(clip.subarray(start, end + 1));
    } else { response.writeHead(404); response.end(); }
  });
  const preview = await listen(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname);
      const path = resolve(currentOutput, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
      if (!path.startsWith(currentOutput + sep)) { response.writeHead(403); response.end(); return; }
      const content = await readFile(path);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await build('youtube-enabled');
  assert.ok(cmsRequests.filter((url) => url.startsWith('/api/globals/')).length >= 5, 'Each rendered page fetches the published global');
  assert.ok(cmsRequests.filter((url) => url.startsWith('/api/globals/')).every((url) => url === '/api/globals/landing?depth=1&draft=false'), 'Published populated CMS global fetch contract');
  assert.deepEqual(cmsRequests.filter((url) => url.startsWith('/api/devlogs')), Array(2).fill('/api/devlogs?depth=1&draft=false&limit=100&page=1&sort=-publishedAt%2C-id&where%5B_status%5D%5Bequals%5D=published'), 'Homepage and archive use the published Devlog feed contract');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })));
  await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, body: '{}' }));
  await context.route('https://newsletter.example.test/v1/newsletter/subscribe', (route) => { newsletterRequests.push(route.request().postDataJSON()); return route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }); });
  const external = [];
  await context.route(/^https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//, (route) => { external.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  for (const route of ['/', '/download/', '/remote/', '/devlog/', '/cookies/']) {
    await page.goto(preview + route, { waitUntil: 'networkidle' });
    const name = route === '/' ? 'home' : route.slice(1, -1);
    await expect(page).toHaveTitle(`CMS ${name} SEO sentinel`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', `CMS ${name} description sentinel`);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', fixture.site.brand.name);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${cmsOrigin}${mediaPath}`);
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', `${cmsOrigin}${mediaPath}`);
    assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--color-lime').trim()), '#a1b2c3');
    assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--color-ink').trim()), '#112233');
    await expect(page.locator('.skip-link')).toHaveText(fixture.site.skipLabel);
    await expect(page.locator('.site-header')).toContainText(fixture.navigation.productLabel);
    await expect(page.locator('.header-action')).toHaveAttribute('href', route === '/' ? '#newsletter' : '/#newsletter');
    await expect(page.locator('.mobile-download')).toHaveAttribute('href', route === '/' ? '#newsletter' : '/#newsletter');
    await assertMedia(page, '.site-header img[alt="CMS logo alt sentinel"]', fixture.site.brand.logoAlt);
    if (route === '/') {
      assert.deepEqual(await page.locator('main > section').evaluateAll((items) => items.map((el) => el.id || 'hero')), ['hero', 'features', 'cli-compatibility', 'updates', 'newsletter']);
      await expect(page.locator('.hero h1')).toContainText(fixture.hero.title);
      await expect(page.locator('[data-hero-video]')).toHaveAttribute('data-video-id', youtubeId);
      await expect(page.locator('[data-video-player]')).toHaveAttribute('aria-label', fixture.hero.player.videoTitle);
      await assertMedia(page, '[data-video-poster] img', fixture.hero.previewAlt);
      await expect(page.locator('#roadmap')).toHaveCount(0);
      await expect(page.locator('a[href="#roadmap"], a[href="/#roadmap"]')).toHaveCount(0);
      await assertMedia(page, '[data-feature-card] img', fixture.features.items[0].alt);
      await expect(page.locator('[data-preview-toggle]')).toHaveCount(0);
      await expect(page.locator('[data-feature-card]').nth(1).locator('[data-feature-preview]')).toHaveAttribute('data-feature-preview', fixture.features.items[1].icon);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('[data-feature-open="0"]').click();
      await expect(page.locator('#feature-dialog')).toBeVisible();
      await expect(page.locator('#feature-dialog-description-0')).toHaveText(fixture.features.items[0].description);
      await page.getByRole('button', { name: fixture.features.controls.closeLabel, exact: true }).click();
      await expect(page.locator('#feature-dialog')).not.toBeVisible();
      await page.locator('[data-feature-open="1"]').click();
      await expect(page.locator('#feature-dialog')).toBeVisible();
      const authoredSimulation = page.locator('#feature-dialog [data-feature-slide]').nth(1).locator('[data-feature-preview]');
      await expect(authoredSimulation).toHaveAttribute('data-feature-preview', fixture.features.items[1].icon);
      await assertPlaceholder(authoredSimulation, { variant: 'feature', aspect: '8 / 5' });
      await page.getByRole('button', { name: fixture.features.controls.closeLabel, exact: true }).click();
      await expect(page.locator('#feature-dialog')).not.toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.getByLabel(fixture.newsletter.form.emailLabel, { exact: true })).toBeEnabled();
      await page.getByLabel(fixture.newsletter.form.emailLabel, { exact: true }).fill('cms-fixture@example.test');
      await expect(page.locator('#newsletter-email')).toHaveValue('cms-fixture@example.test');
      assert.equal(await page.locator('#newsletter-email').evaluate((el) => el.validity.valid), true);
      await page.locator('#newsletter-email').press('Tab');
      await page.keyboard.press('Enter');
      try { await expect(page.locator('#newsletter-status')).toHaveText(fixture.newsletter.form.successMessage); }
      catch (error) {
        console.error('CMS fixture form diagnostic:', await page.locator('#newsletter-form').evaluate((form) => ({ endpoint: form.dataset.endpoint, valid: form.checkValidity(), email: form.querySelector('input')?.value, reason: form.querySelector('input')?.validationMessage, html: form.outerHTML })), { newsletterRequests, browserErrors });
        throw error;
      }
    } else if (route === '/download/') {
      await expect(page.locator('h1')).toHaveText(fixture.pages.download.title);
      await assertMedia(page, '.download-page img[alt="CMS download alt sentinel"]', fixture.pages.download.screenshot.alt);
      await expect(page.locator('#aur-command')).toHaveText(fixture.pages.download.aur.command);
      assert.equal(JSON.parse(await page.locator('[data-download-copy]').getAttribute('data-download-copy')).feedback.releaseError, fixture.pages.download.feedback.releaseError);
    } else if (route === '/remote/') {
      await expect(page.locator('h1')).toHaveText(fixture.pages.remote.title);
      await assertMedia(page, '.remote-showcase img', fixture.pages.remote.screenshot.alt);
      await expect(page.locator('[data-remote-cli-preview]')).toHaveCount(0);
      await expect(page.locator('.remote-platform')).toHaveCount(3);
      for (const platform of ['macOS', 'Windows', 'Linux']) {
        await expect(page.getByRole('button', { name: new RegExp(`${platform}.*coming soon`, 'i') })).toBeDisabled();
      }
      await expect(page.locator('[data-remote-installer], [data-remote-copy], [data-remote-command], input[type="radio"]')).toHaveCount(0);
      const remoteText = await page.locator('body').innerText();
      for (const legacy of ['CMS_UNIX_SENTINEL', 'CMS_WINDOWS_SENTINEL', 'CMS copied {platform} sentinel', 'curl -fsSL', 'Invoke-RestMethod', 'Invoke-Expression']) {
        assert.ok(!remoteText.includes(legacy), `Remote does not render legacy installer field: ${legacy}`);
      }
      await expect(page.locator('#remote-newsletter .newsletter')).toHaveAttribute('aria-label', 'Lomi Remote launch newsletter');
      await expect(page.locator('#remote-newsletter #newsletter-note')).toHaveCount(0);
      await expect(page.locator('#remote-newsletter #newsletter-email')).toHaveAttribute('aria-describedby', 'newsletter-status');
      await expect(page.getByLabel('CMS email sentinel', { exact: true })).toBeVisible();
    } else if (route === '/devlog/') {
      await expect(page.locator('h1')).toContainText(fixture.pages.devlog.title[0].text);
      await expect(page.locator('.devlog-description')).toHaveText(fixture.pages.devlog.description[0].text);
      await expect(page.locator('[data-devlog-empty]')).toContainText(fixture.pages.devlog.empty.title);
      await expect(page.locator('[data-devlog-empty] .empty-description')).toHaveText(fixture.pages.devlog.empty.description);
      await expect(page.locator('h1')).toHaveText(fixture.pages.devlog.title[0].text);
      await expect(page.locator('.empty-preview')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('.empty-preview img')).toHaveAttribute('src', `${cmsOrigin}${mediaPath}`);
      await expect(page.locator('.empty-preview img')).toHaveAttribute('alt', '');
      await expect(page.locator('.empty-preview a, .empty-preview button')).toHaveCount(0);
      await expect(page.locator('.site-footer h2')).toHaveText(fixture.footer.signoff);
      await expect(page.locator('.site-footer [data-cookie-settings]')).toHaveText(fixture.footer.cookieSettingsLabel);
    } else {
      await expect(page.locator('h1')).toHaveText(fixture.pages.cookies.title);
      await expect(page.locator('#preferences')).toContainText('CMS privacy paragraph sentinel');
    }
    for (const placeholder of await page.locator('[data-media-placeholder]:visible').all()) {
      await assertPlaceholder(placeholder, { logo: `${cmsOrigin}${mediaPath}`, variant: await placeholder.evaluate((element) => element.closest('[data-feature-card], [data-feature-slide]') ? 'feature' : element.closest('.product-showcase') ? 'download' : 'brand') });
    }
    await page.locator('[data-cookie-settings]').first().click();
    await expect(page.locator('#cookie-banner-title')).toHaveText(fixture.site.cookie.title);
    await expect(page.locator('#cookie-external-media')).toHaveAccessibleName(fixture.site.cookie.mediaLabel);
    await expect(page.locator('[data-cookie-save]')).toHaveText(fixture.site.cookie.saveLabel);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(external, [], 'Edited YouTube ID still requires consent');
  assert.ok(await absent(marker), 'Authored shell commands were displayed, never executed');
  await context.close();

  // One additional build tests section omission/filtering and the native video mode.
  fixture.layout.find((row) => row.section === 'newsletter').enabled = false;
  fixture.navigation.productGroups = [];
  fixture.pages.cookies.sections[1].paragraphs = [];
  fixture.pages.cookies.sections[1].showStorage = true;
  fixture.pages.cookies.storage[0].label = 'CMS storage table sentinel';
  fixture.hero.mediaMode = 'video';
  fixture.hero.video = { id: 72, url: videoPath, mimeType: 'video/webm', alt: 'CMS video metadata', width: 64, height: 40 };
  for (const item of fixture.features.items.slice(0, 2)) {
    item.video = { ...fixture.hero.video };
    item.image = asset();
  }
  // Reuse this build to cover custom-brand screenshot fallbacks after checking uploads.
  fixture.pages.download.screenshot.image = null;
  fixture.pages.remote.screenshot.image = null;
  await build('native-video-disabled-newsletter');
  const second = await browser.newPage({ reducedMotion: 'reduce' });
  second.on('pageerror', (error) => browserErrors.push(error.message));
  await second.goto(preview, { waitUntil: 'networkidle' });
  await expect(second.locator('#newsletter, a[href="#newsletter"], a[href="/#newsletter"]')).toHaveCount(0);
  await expect(second.locator('#product-menu, #mobile-product, .product-fallback, .header-action, .mobile-download')).toHaveCount(0);
  await expect(second.locator('a[href="/cookies/#preferences"]').first()).toHaveCount(1);
  await expect(second.locator('#workspace video')).not.toHaveAttribute('controls');
  await expect(second.locator('[data-player-controls]')).toBeVisible();
  await expect(second.locator('#workspace video')).toHaveAttribute('poster', `${cmsOrigin}${mediaPath}`);
  await expect(second.locator('#workspace source')).toHaveAttribute('src', `${cmsOrigin}${videoPath}`);
  await expect(second.locator('#workspace video')).toHaveAttribute('aria-label', fixture.hero.player.videoTitle);
  await expect(second.locator('[data-hero-video]')).toHaveAttribute('data-video-provider', 'video');
  const cardVideo = second.locator('[data-feature-card]').first().locator('video');
  await cardVideo.scrollIntoViewIfNeeded();
  await playNative(cardVideo);
  await expect(second.locator('[data-feature-open="0"] .gallery-caption')).toHaveCount(1);
  await expect(second.locator('[data-feature-card] a a')).toHaveCount(0);
  await expect(cardVideo).not.toHaveAttribute('controls');
  await second.locator('[data-feature-open="0"] .gallery-caption').click();
  const featureDialog = second.locator('#feature-dialog');
  await expect(featureDialog).toBeVisible();
  await expect.poll(() => cardVideo.evaluate((element) => element.paused)).toBe(true);
  const firstVideo = featureDialog.locator('[data-feature-slide]').nth(0).locator('video');
  await expect(firstVideo).toHaveAttribute('controls', '');
  await playNative(firstVideo);
  await firstVideo.focus();
  await expect(firstVideo).toBeFocused();
  await second.keyboard.press('ArrowRight');
  await expect(featureDialog).toHaveAttribute('aria-labelledby', 'feature-dialog-title-0');
  await expect(featureDialog.locator('[data-feature-slide]').nth(0)).toBeVisible();
  // Native seeking may pause at this tiny clip's end; start actual playback again.
  await firstVideo.evaluate((element) => { if (element instanceof HTMLVideoElement) element.pause(); });
  await playNative(firstVideo);
  await featureDialog.locator('[data-feature-next]').click();
  await expect(featureDialog).toHaveAttribute('aria-labelledby', 'feature-dialog-title-1');
  await expect.poll(() => firstVideo.evaluate((element) => element.paused)).toBe(true);
  const nextVideo = featureDialog.locator('[data-feature-slide]').nth(1).locator('video');
  await playNative(nextVideo);
  await featureDialog.locator('[data-feature-close]').click();
  await expect(featureDialog).not.toBeVisible();
  await expect.poll(() => nextVideo.evaluate((element) => element.paused)).toBe(true);
  await second.goto(preview + '/remote/', { waitUntil: 'networkidle' });
  await expect(second.locator('a[href="#newsletter"], a[href="/#newsletter"]')).toHaveCount(0);
  await expect(second.locator('a[href="/cookies/#preferences"]').first()).toHaveCount(1);
  await expect(second.locator('#product-menu, #mobile-product, .header-action, .mobile-download')).toHaveCount(0);
  const remotePreview = second.locator('[data-remote-cli-preview]');
  await expect(remotePreview).toBeVisible();
  await expect(remotePreview).toHaveAttribute('aria-label', /Lomi Remote.*preview/i);
  const remoteArtwork = remotePreview.locator('img');
  await expect(remoteArtwork).toHaveCount(1);
  await expect(remoteArtwork).toHaveAttribute('alt', /sample local workspaces/i);
  await remoteArtwork.scrollIntoViewIfNeeded();
  await expect.poll(() => remoteArtwork.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(Math.abs(await remoteArtwork.evaluate((image) => image.naturalWidth / image.naturalHeight) - 8 / 5)).toBeLessThan(0.012);
  await expect(remotePreview.locator('video, audio, canvas, figcaption, button, input, select, textarea, a[href], script')).toHaveCount(0);
  await expect(remotePreview.locator('.cli-titlebar, .cli-window-title, [data-cli-workspace-list], [data-cli-static-list], [data-cli-workspace-controls], [data-cli-detail-content], [data-cli-help-button], [data-cli-help-content], [data-cli-help-static], [data-cli-panel-title]')).toHaveCount(0);
  expect((await remotePreview.innerText()).trim()).toBe('');
  const remoteText = await second.locator('body').innerText();
  for (const legacy of ['CMS_UNIX_SENTINEL', 'CMS_WINDOWS_SENTINEL', 'CMS copied {platform} sentinel', 'curl -fsSL', 'Invoke-RestMethod', 'Invoke-Expression']) {
    assert.ok(!remoteText.includes(legacy), `Remote image render does not expose legacy installer field: ${legacy}`);
  }
  await expect(second.locator('#remote-newsletter, a[href="#remote-newsletter"]')).toHaveCount(0);
  await expect(second.locator('h1')).toBeVisible();
  await expect(second.locator('.remote-showcase')).toBeVisible();
  await second.goto(preview + '/download/', { waitUntil: 'networkidle' });
  const downloadCapture = second.locator('.product-showcase img');
  await expect(downloadCapture).toBeVisible();
  await expect(downloadCapture).toHaveAttribute('alt', fixture.pages.download.screenshot.alt);
  await expect.poll(() => downloadCapture.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await second.goto(preview + '/cookies/', { waitUntil: 'networkidle' });
  await expect(second.locator('.cookies-page dl')).toContainText('CMS storage table sentinel');
  await second.close();

  // A CMS editor can hide the artwork without removing the launch signup.
  fixture.layout.find((row) => row.section === 'newsletter').enabled = true;
  fixture.pages.remote.showScreenshot = false;
  await build('remote-preview-hidden');
  const third = await browser.newPage({ reducedMotion: 'reduce' });
  third.on('pageerror', (error) => browserErrors.push(error.message));
  await third.goto(preview + '/remote/', { waitUntil: 'networkidle' });
  await expect(third.locator('h1')).toHaveText(fixture.pages.remote.title);
  await expect(third.locator('.remote-showcase, [data-remote-cli-preview], .remote-preview')).toHaveCount(0);
  await expect(third.locator('#remote-newsletter')).toBeVisible();
  await expect(third.locator('#remote-newsletter > h2')).toHaveText(/^Get Remote launch news\.?$/);
  await expect(third.locator('#remote-newsletter .newsletter')).toHaveAttribute('aria-label', 'Lomi Remote launch newsletter');
  await expect(third.locator('#remote-newsletter #newsletter-note')).toHaveCount(0);
  await expect(third.locator('#remote-newsletter #newsletter-email')).toHaveAttribute('aria-describedby', 'newsletter-status');
  await expect(third.getByLabel(fixture.newsletter.form.emailLabel, { exact: true })).toBeEnabled();
  const hiddenPreviewText = await third.locator('body').innerText();
  for (const legacy of ['CMS_UNIX_SENTINEL', 'CMS_WINDOWS_SENTINEL', 'CMS copied {platform} sentinel', 'curl -fsSL', 'Invoke-RestMethod', 'Invoke-Expression']) {
    assert.ok(!hiddenPreviewText.includes(legacy), `Remote hidden preview does not render legacy installer field: ${legacy}`);
  }
  await third.close();
  assert.deepEqual(browserErrors, [], 'No runtime errors with authored CMS content');
  assert.ok(await absent(marker));
  console.log('Passed: three isolated published-CMS builds; five routes with edited SEO/brand/theme/nav/copy/uploads; consent and form labels/client messages; feature modal copy and retired roadmap filtering; custom YouTube ID; real native-video playback/control keys and preview/slide/close pausing; Remote custom media and static sample artwork; showScreenshot hides only artwork; disabled newsletter filtering with signup availability preserved; legacy installer fields never render or execute.');
} finally {
  await browser?.close();
  await Promise.all(servers.map((server) => new Promise((resolveClose) => { server.close(resolveClose); server.closeAllConnections(); })));
  await rm(scratch, { recursive: true, force: true });
}
