import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error('VERIFY_BROWSER must be chromium, firefox or webkit');
const browser = await browserType.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
const contexts = new Set();
const errors = [];
const reports = [];
const networkReports = [];
const keyboardReports = [];
const key = 'lomi.cookie-consent';
const lifetime = 180 * 24 * 60 * 60 * 1000;
const artifacts = 'artifacts/cookies';
await mkdir(artifacts, { recursive: true });

// Route every YouTube domain before navigation, recording attempted requests even
// when the mock serves them. No test loads remote players or submits an email.
async function open({ raw, blockedStorage = false, failedWrites, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  contexts.add(context);
  await context.addInitScript(({ raw, blockedStorage, failedWrites, key, firstPartyOrigin }) => {
    // Storage fixtures belong to the first-party page, never third-party embeds.
    if (window.top !== window || location.origin !== firstPartyOrigin) return;
    if (raw !== undefined && !sessionStorage.getItem('cookie-fixture-seeded')) {
      localStorage.setItem(key, raw);
      sessionStorage.setItem('cookie-fixture-seeded', 'true');
    }
    if (failedWrites) {
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return set.call(this, name, value);
      };
      Storage.prototype.removeItem = function (name) {
        if (name === key && failedWrites === 'both') throw new DOMException('Storage unavailable', 'SecurityError');
        return remove.call(this, name);
      };
    }
    if (blockedStorage) Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
  }, { raw, blockedStorage, failedWrites, key, firstPartyOrigin: new URL(origin).origin });
  const requests = [];
  const newsletterRequests = [];
  networkReports.push({ requests, newsletterRequests });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/*', async (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/.test(address.hostname)) {
      requests.push(request.url());
      if (address.pathname === '/iframe_api') {
        await route.fulfill({ contentType: 'text/javascript', body: `
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
            stopVideo() { this.calls.push('stopVideo'); }
            pauseVideo() { this.calls.push('pauseVideo'); }
            destroy() { this.calls.push('destroy'); this.iframe.remove(); }
            getIframe() { return this.iframe; }
          }};
          window.onYouTubeIframeAPIReady?.();
        ` });
      } else await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Mock video</title></head><body><main><h1>Mock video</h1><button>Play mock video</button></main></body></html>' });
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      newsletterRequests.push({ url: request.url(), method: request.method() });
      await route.abort();
      return;
    }
    if (address.hostname === 'api.github.com') {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  if (options.javaScriptEnabled !== false) await expect(page.locator('[data-cookie-consent]')).toHaveAttribute('data-cookie-ready', 'true');
  return { context, page, requests, newsletterRequests };
}
const banner = (page) => page.locator('[data-cookie-banner]');
const preferences = (page) => page.locator('#cookie-preferences');
const media = (page) => page.locator('#cookie-external-media');
const inlineVideo = (page) => page.locator('[data-hero-video]');
const videoFrame = (page) => page.locator('[data-hero-video] iframe, #video-dialog iframe');
async function allowVideo(page) {
  if (await inlineVideo(page).count()) {
    await inlineVideo(page).locator('[data-video-poster]').click();
    await expect(preferences(page)).toBeVisible();
    await media(page).check();
    await preferences(page).locator('[data-cookie-save]').click();
  } else await page.locator('#video-dialog [data-video-allow]').click();
}
async function closeVideo(page) {
  if (await inlineVideo(page).count()) return;
  await page.locator('#video-dialog').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#video-dialog')).toBeHidden();
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function close(run) { await run.context.close(); contexts.delete(run.context); }
async function settings(page) {
  await page.locator('a[data-cookie-settings]').first().click();
  await expect(preferences(page)).toBeVisible();
}
async function noVideo(run) {
  await expect(videoFrame(run.page)).toHaveCount(0);
  expect(run.requests, 'No YouTube request without external media permission').toEqual([]);
}
async function gate(run) {
  if (await inlineVideo(run.page).count()) {
    await expect(inlineVideo(run.page)).toHaveAttribute('data-video-status', 'consent');
    await expect(inlineVideo(run.page).locator('[data-video-poster]')).toBeVisible();
    await expect(inlineVideo(run.page).locator('[data-video-notice], [data-video-allow], [data-video-retry]')).toHaveCount(0);
  } else {
    await run.page.locator('[data-video-open]').click();
    await expect(run.page.locator('[data-video-consent]')).toBeVisible();
  }
  await noVideo(run);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  reports.push({ label, violations: result.violations });
  expect(result.violations, label).toEqual([]);
}
async function savedChoice(page, allowed) {
  const choice = await stored(page);
  expect(choice).toEqual({ version: 1, externalMedia: allowed, savedAt: expect.any(Number) });
  expect(Math.abs(Date.now() - choice.savedAt)).toBeLessThan(30000);
  await expect(banner(page)).toBeHidden();
}
async function playing(run) {
  const iframe = videoFrame(run.page);
  if (await inlineVideo(run.page).count()) {
    await inlineVideo(run.page).scrollIntoViewIfNeeded();
    await run.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await expect(iframe).toHaveCount(1);
  expect(new URL(await iframe.getAttribute('src')).origin).toBe('https://www.youtube-nocookie.com');
  await expect.poll(() => run.page.evaluate(() => window.__mockYouTube?.players.length || 0)).toBeGreaterThan(0);
  await run.page.evaluate(() => {
    const player = window.__mockYouTube.players.at(-1);
    player.events.onReady({ target: player });
  });
  await expect.poll(() => run.page.evaluate(() => window.__mockYouTube.players.at(-1).calls.filter((call) => call !== 'pauseVideo')),
    { message: 'Mute precedes playback after an allowed video becomes visible' }).toEqual(['mute', 'playVideo']);
  await run.page.evaluate(() => {
    const player = window.__mockYouTube.players.at(-1);
    player.events.onStateChange({ target: player, data: 1 });
  });
}
async function assertTargets(root) {
  for (const target of await root.locator('button:visible, a:visible, label:visible').all()) {
    // Links within prose use the inline-text target-size exception.
    if (await target.evaluate((element) => element.tagName === 'A' && getComputedStyle(element).display === 'inline')) continue;
    const box = await target.boundingBox();
    expect(box.height, `44px target: ${await target.innerText()}`).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

try {
  for (const allowed of [false, true]) {
    const run = await open();
    await expect(banner(run.page)).toBeVisible();
    await expect(banner(run.page).getByRole('heading', { name: 'Cookie settings' })).toBeVisible();
    expect(await run.page.evaluate(() => document.activeElement === document.body), 'First visit does not steal focus').toBe(true);
    await noVideo(run);
    await banner(run.page).getByRole('button', { name: allowed ? 'Accept all' : 'Reject optional', exact: true }).click();
    await savedChoice(run.page, allowed);
    await run.page.reload({ waitUntil: 'networkidle' });
    await expect(banner(run.page)).toBeHidden();
    await run.page.goto(new URL('/devlog/', origin).href, { waitUntil: 'networkidle' });
    await expect(banner(run.page)).toBeHidden();
    await settings(run.page);
    if (allowed) await expect(media(run.page)).toBeChecked();
    else await expect(media(run.page)).not.toBeChecked();
    await run.page.keyboard.press('Escape');
    await expect(preferences(run.page)).toBeHidden();
    expect((await stored(run.page)).externalMedia).toBe(allowed);
    if (!allowed) await noVideo(run);
    await close(run);
  }

  const fresh = await open();
  await banner(fresh.page).getByRole('button', { name: 'Customize', exact: true }).click();
  await expect(preferences(fresh.page)).toBeVisible();
  await expect(media(fresh.page)).toHaveAttribute('role', 'switch');
  await expect(media(fresh.page)).not.toBeChecked();
  await expect(media(fresh.page)).toHaveAccessibleName('External media');
  await fresh.page.keyboard.press('Escape');
  await expect(preferences(fresh.page)).toBeHidden();
  expect(await stored(fresh.page)).toBeNull();
  await expect(banner(fresh.page).getByRole('button', { name: 'Customize', exact: true })).toBeFocused();
  await gate(fresh);
  await axe(fresh.page, 'Video consent gate');
  if (!await inlineVideo(fresh.page).count()) {
    await fresh.page.locator('[data-video-decline]').click();
    await expect(fresh.page.locator('#video-dialog')).toBeHidden();
    expect(await stored(fresh.page)).toBeNull();
    await gate(fresh);
  }
  await allowVideo(fresh.page);
  await savedChoice(fresh.page, true);
  await playing(fresh);
  await closeVideo(fresh.page);
  await settings(fresh.page);
  await media(fresh.page).uncheck();
  await preferences(fresh.page).locator('[data-cookie-save]').click();
  await savedChoice(fresh.page, false);
  const requestsBeforeReopen = fresh.requests.length;
  if (await inlineVideo(fresh.page).count()) await expect(inlineVideo(fresh.page)).toHaveAttribute('data-video-status', 'consent');
  else {
    await fresh.page.locator('[data-video-open]').click();
    await expect(fresh.page.locator('[data-video-consent]')).toBeVisible();
  }
  expect(fresh.requests.length).toBe(requestsBeforeReopen);
  await allowVideo(fresh.page);
  await playing(fresh);
  // A second tab exercises the browser's real cross-document storage event.
  const other = await fresh.context.newPage();
  await other.goto(new URL('/cookies/', origin).href, { waitUntil: 'networkidle' });
  await settings(other);
  await media(other).uncheck();
  await preferences(other).locator('[data-cookie-save]').click();
  await expect(videoFrame(fresh.page)).toHaveCount(0);
  expect(await fresh.page.evaluate(() => window.__mockYouTube.players.at(-1).calls)).toContain('destroy');
  await allowVideo(fresh.page);
  await playing(fresh);
  await other.evaluate(() => localStorage.clear());
  await expect(videoFrame(fresh.page)).toHaveCount(0);
  expect(await fresh.page.evaluate(() => window.__mockYouTube.players.at(-1).calls)).toContain('destroy');
  await fresh.page.evaluate(() => {
    const stale = window.__mockYouTube.players.at(-1);
    stale.events.onReady({ target: stale });
    stale.events.onStateChange({ target: stale, data: 1 });
  });
  await expect(videoFrame(fresh.page)).toHaveCount(0);
  await expect(banner(other)).toBeHidden(); // The source tab updates on its next load.
  await other.reload({ waitUntil: 'networkidle' });
  await expect(banner(other)).toBeVisible();
  await close(fresh);

  for (const [label, raw] of [
    ['malformed', '{'], ['wrong type', JSON.stringify({ version: 1, externalMedia: 'yes', savedAt: Date.now() })],
    ['expired', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() - lifetime - 1000 })],
    ['future version', JSON.stringify({ version: 2, externalMedia: true, savedAt: Date.now() })],
    ['future date', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() + lifetime })],
  ]) {
    const run = await open({ raw });
    await expect(banner(run.page), label).toBeVisible();
    await gate(run);
    await close(run);
  }
  // Both positive and negative records remain valid just inside the policy age.
  for (const externalMedia of [false, true]) {
    const run = await open({ raw: JSON.stringify({ version: 1, externalMedia, savedAt: Date.now() - lifetime + 3600000 }) });
    await expect(banner(run.page)).toBeHidden();
    await settings(run.page);
    expect(await media(run.page).isChecked()).toBe(externalMedia);
    await close(run);
  }

  const blocked = await open({ blockedStorage: true });
  await banner(blocked.page).getByRole('button', { name: 'Accept all', exact: true }).click();
  await expect(banner(blocked.page)).toBeHidden();
  const feedback = blocked.page.locator('[data-cookie-feedback] [role="status"]').filter({ hasText: /sav|stor|remember/i });
  await expect(feedback.first()).toBeVisible();
  await settings(blocked.page);
  await expect(media(blocked.page)).toBeChecked();
  await blocked.page.keyboard.press('Escape');
  if (!await inlineVideo(blocked.page).count()) await blocked.page.locator('[data-video-open]').click();
  await playing(blocked);
  await close(blocked);

  for (const failedWrites of ['set', 'both']) {
    const quota = await open({ failedWrites, raw: JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() }) });
    await settings(quota.page);
    await media(quota.page).uncheck();
    await preferences(quota.page).locator('[data-cookie-save]').click();
    await expect(videoFrame(quota.page)).toHaveCount(0);
    await expect(quota.page.locator('[data-cookie-feedback]')).toBeVisible();
    await settings(quota.page);
    await expect(media(quota.page), 'Failed persistence still revokes this tab').not.toBeChecked();
    if (failedWrites === 'set') {
      expect(await stored(quota.page), 'Remove stale grant when refusal cannot be written').toBeNull();
    } else {
      expect((await stored(quota.page)).externalMedia).toBe(true);
      await quota.page.evaluate((key) => window.dispatchEvent(new StorageEvent('storage', {
        key, newValue: localStorage.getItem(key), storageArea: localStorage,
      })), key);
      await expect(media(quota.page), 'A stale stored grant cannot replace the unsaved local refusal').not.toBeChecked();
      await expect(videoFrame(quota.page)).toHaveCount(0);
    }
    await close(quota);
  }

  const draft = await open({ raw: JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() }) });
  const draftOther = await draft.context.newPage();
  await draftOther.goto(new URL('/cookies/', origin).href, { waitUntil: 'networkidle' });
  await settings(draft.page);
  await media(draft.page).uncheck();
  await settings(draftOther);
  await media(draftOther).check();
  await preferences(draftOther).locator('[data-cookie-save]').click();
  await expect.poll(async () => (await stored(draft.page)).externalMedia).toBe(true);
  await expect(media(draft.page), 'Another tab accepting preserves an unchecked unsaved draft').not.toBeChecked();
  await media(draft.page).check();
  await settings(draftOther);
  await media(draftOther).uncheck();
  await preferences(draftOther).locator('[data-cookie-save]').click();
  await expect.poll(async () => (await stored(draft.page)).externalMedia).toBe(false);
  await expect(media(draft.page), 'Another tab rejecting preserves a checked unsaved draft').toBeChecked();
  await preferences(draft.page).locator('[data-cookie-save]').click();
  await savedChoice(draft.page, true);
  await close(draft);

  const motion = await open();
  const expansion = await banner(motion.page).evaluate(async (card) => {
    const before = card.getBoundingClientRect().height;
    window.__verifiedCookieCard = card;
    card.querySelector('[data-cookie-customize]').click();
    const active = card.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const during = card.getBoundingClientRect().height;
    await Promise.all(card.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    return { before, during, after: card.getBoundingClientRect().height, active, same: card === window.__verifiedCookieCard };
  });
  expect(expansion.same, 'Customize expands the same card node').toBe(true);
  expect(expansion.after, 'Preferences expand the compact card').toBeGreaterThan(expansion.before);
  expect(expansion.active || (expansion.during > expansion.before && expansion.during < expansion.after), 'Height expansion animates').toBe(true);
  await close(motion);

  const layout = await open({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 320, height: 320 }]) {
    await layout.page.setViewportSize(viewport);
    await expect(banner(layout.page)).toBeVisible();
    await assertTargets(banner(layout.page));
    const compact = await banner(layout.page).boundingBox();
    expect(viewport.width - compact.x - compact.width, 'Compact card is inset from right edge').toBeGreaterThanOrEqual(8);
    expect(viewport.width - compact.x - compact.width).toBeLessThanOrEqual(32);
    expect(await layout.page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await banner(layout.page).evaluate((card) => { window.__verifiedCookieCard = card; });
    const overflowBefore = await layout.page.evaluate(() => ({ root: document.documentElement.style.overflow, body: document.body.style.overflow }));
    await banner(layout.page).getByRole('button', { name: 'Customize', exact: true }).click();
    await expect(preferences(layout.page)).toBeVisible();
    await expect(preferences(layout.page)).toBeFocused();
    expect(await banner(layout.page).evaluate((card) => card === window.__verifiedCookieCard)).toBe(true);
    expect(await banner(layout.page).evaluate((card) => card.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running')), 'Reduced motion expands instantly').toBe(false);
    expect(await layout.page.evaluate(() => ({ root: document.documentElement.style.overflow, body: document.body.style.overflow })), 'Expanded card does not lock page scrolling').toEqual(overflowBefore);
    expect(await layout.page.locator('dialog[open], [aria-modal="true"], main[inert]').count(), 'Preferences are nonmodal').toBe(0);
    await expect(preferences(layout.page).getByText('Necessary', { exact: true })).toBeVisible();
    await expect(preferences(layout.page).getByText('External media', { exact: true })).toBeVisible();
    await expect(preferences(layout.page).locator('input')).toHaveCount(1);
    await assertTargets(banner(layout.page));
    let leftCard = false;
    for (let index = 0; index < 20; index++) {
      await layout.page.keyboard.press('Tab');
      if (!await banner(layout.page).evaluate((card) => card.contains(document.activeElement))) { leftCard = true; break; }
    }
    const forwardEndpoint = await layout.page.evaluate(() => ({ focused: document.hasFocus(), element: document.activeElement?.tagName }));
    // At the document boundary Firefox can retain the final activeElement while
    // native focus proceeds into browser chrome. Verify the reverse path too.
    await preferences(layout.page).focus();
    let leftBackwards = false;
    for (let index = 0; index < 8; index++) {
      await layout.page.keyboard.press('Shift+Tab');
      if (!await banner(layout.page).evaluate((card) => card.contains(document.activeElement))) { leftBackwards = true; break; }
    }
    keyboardReports.push({ viewport, forwardExit: leftCard, forwardEndpoint, backwardExit: leftBackwards });
    expect(leftBackwards, 'Shift+Tab leaves the expanded card for page controls').toBe(true);
    await layout.page.locator('main').evaluate((main) => {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    });
    expect(await layout.page.locator('main').evaluate((main) => main === document.activeElement), 'Background remains focusable').toBe(true);
    const expanded = await banner(layout.page).boundingBox();
    expect(viewport.width - expanded.x - expanded.width, 'Expanded card stays inset from right edge').toBeGreaterThanOrEqual(8);
    expect(await layout.page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await axe(layout.page, `Preferences ${viewport.width}x${viewport.height}`);
    await layout.page.screenshot({ path: `${artifacts}/preferences-${browserType.name()}-${viewport.width}x${viewport.height}.png` });
    await preferences(layout.page).focus();
    await layout.page.keyboard.press('Escape');
    await expect(preferences(layout.page)).toBeHidden();
    await expect(banner(layout.page)).toBeVisible();
    await expect(banner(layout.page).getByRole('button', { name: 'Customize', exact: true })).toBeFocused();
    await axe(layout.page, `Banner ${viewport.width}x${viewport.height}`);
  }
  await layout.page.setViewportSize({ width: 1440, height: 900 });
  await settings(layout.page);
  await banner(layout.page).locator('[data-cookie-close]').click();
  await expect(preferences(layout.page)).toBeHidden();
  expect(await stored(layout.page)).toBeNull();
  await settings(layout.page);
  await preferences(layout.page).locator('[data-cookie-reject]').click();
  await savedChoice(layout.page, false);
  await settings(layout.page);
  await preferences(layout.page).focus();
  await layout.page.keyboard.press('Escape');
  await expect(banner(layout.page)).toBeHidden();
  await expect(layout.page.locator('a[data-cookie-settings]').first()).toBeFocused();
  await close(layout);

  const noJS = await open({ javaScriptEnabled: false });
  await noVideo(noJS);
  const fallback = await inlineVideo(noJS.page).count()
    ? inlineVideo(noJS.page).locator('[data-video-poster]') : noJS.page.locator('[data-video-open]');
  await expect(fallback).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\//);
  const infoLink = noJS.page.locator('a[data-cookie-settings]').first();
  await expect(infoLink).toHaveAttribute('href', /\/cookies\//);
  await infoLink.click();
  await expect(noJS.page).toHaveURL(/\/cookies\//);
  await expect(noJS.page.getByRole('heading', { level: 1 })).toBeVisible();
  await noVideo(noJS);
  await close(noJS);
  expect(errors, 'No page runtime errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): consent persistence, opt-in video isolation, revocation, storage events/failure, invalid records, policy age, keyboard, responsive layout, no-JS links and axe. All YouTube and write requests mocked.`);
} finally {
  await writeFile(`${artifacts}/verification-${browserType.name()}.json`, JSON.stringify({ errors, reports, networkReports, keyboardReports }, null, 2));
  await Promise.allSettled([...contexts].map((context) => context.close()));
  await browser.close();
}
