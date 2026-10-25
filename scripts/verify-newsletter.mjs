import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const endpoint = 'https://auth.example.test/v1/newsletter/subscribe';
const configuredURL = process.env.VERIFY_CONFIGURED_URL || 'http://127.0.0.1:4334';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error('VERIFY_BROWSER must be chromium, firefox or webkit');
let server;
let browser;
let serverOutput = '';
const errors = [];
await mkdir('artifacts', { recursive: true });

async function startFixture() {
  if (process.env.VERIFY_CONFIGURED_URL) return;
  const address = new URL(configuredURL);
  let occupied = false;
  try { await fetch(configuredURL, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
  if (occupied) throw new Error(`Fixture port ${address.port} is in use; stop that process or set VERIFY_CONFIGURED_URL to a configured test server`);
  // A separate dev process leaves the production build and local env untouched.
  server = spawn('bun', ['run', 'dev', '--', '--port', address.port, '--ignore-lock'], {
    env: { ...process.env, PUBLIC_NEWSLETTER_ENDPOINT: endpoint },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  server.on('error', (error) => { serverOutput += error.message; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (data) => { serverOutput = (serverOutput + data).slice(-8000); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(configuredURL);
      if (response.ok && (await response.text()).includes(`data-endpoint="${endpoint}"`)) return;
    } catch { /* Wait for Astro's first compilation. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Configured Astro fixture did not start: ${serverOutput}`);
}

async function open(target, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  await context.addInitScript((endpoint) => {
    window.__newsletterRequests = [];
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (String(input) === endpoint) window.__newsletterRequests.push({ ...init, signal: Boolean(init.signal) });
      return nativeFetch.call(this, input, init);
    };
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (milliseconds) => {
      window.__newsletterTimeout = milliseconds;
      return timeout(window.__fastNewsletterTimeout ? 50 : milliseconds);
    };
  }, endpoint);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  // Every configured context blocks real sends, including unexpected requests.
  await page.route(endpoint, (route) => route.abort());
  await page.goto(target, { waitUntil: 'networkidle' });
  return { context, page };
}

async function layout(page, rootSelector = '#newsletter') {
  const root = page.locator(rootSelector);
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${viewport.width}px: no horizontal overflow`).toBe(viewport.width);
    for (const [selector, minimum] of [['input', 56], ['button', 52]]) {
      const control = root.locator(selector);
      const requiredHeight = ['#mobile-newsletter', '#remote-newsletter'].includes(rootSelector) && selector === 'input' ? 52 : minimum;
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      expect(await control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { height: box.height, fits: box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth + 2 };
      }), `${viewport.width}px: ${selector} fits`).toMatchObject({ fits: true });
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(requiredHeight);
    }
    const stackedLaunchForm = rootSelector === '#mobile-newsletter'
      ? viewport.width <= 999
      : rootSelector === '#remote-newsletter' && viewport.width <= 767;
    if (stackedLaunchForm) {
      const input = root.locator('input');
      const button = root.locator('button');
      await expect(input).toHaveCSS('border-radius', '10px');
      await expect(button).toHaveCSS('border-radius', '10px');
      const inputBox = await input.boundingBox();
      const buttonBox = await button.boundingBox();
      const gap = buttonBox.y - inputBox.y - inputBox.height;
      expect(gap, `${viewport.width}px: input and submit button have a clear vertical gap`).toBeGreaterThanOrEqual(7);
      expect(gap, `${viewport.width}px: the controls do not drift apart`).toBeLessThanOrEqual(9);
    }
  }
}

async function axe(page, rootSelector = '#newsletter') {
  const result = await new AxeBuilder({ page }).include(rootSelector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, 'Newsletter accessibility').toEqual([]);
}

async function noteContract(page, rootSelector, shouldShow) {
  const root = page.locator(rootSelector);
  const note = root.locator('#newsletter-note');
  const email = root.locator('#newsletter-email');
  const describedBy = (await email.getAttribute('aria-describedby') || '').trim().split(/\s+/).filter(Boolean);
  if (shouldShow) {
    await expect(note).toBeVisible();
    expect(describedBy).toContain('newsletter-note');
  } else {
    await expect(note).toHaveCount(0);
    expect(describedBy).toEqual(['newsletter-status']);
  }
  expect(describedBy).toContain('newsletter-status');
  for (const id of describedBy) await expect(page.locator(`#${id}`)).toHaveCount(1);
}

async function mock(page, status, body) {
  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }));
}

async function mobileSignup() {
  const target = new URL('/mobile-app/', configuredURL).href;
  const { context, page } = await open(target);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-newsletter').scrollIntoViewIfNeeded();
  await expect(page.locator('#mobile-newsletter')).toBeInViewport();

  const root = page.locator('#mobile-newsletter .newsletter');
  const email = page.locator('#mobile-newsletter #newsletter-email');
  const button = page.locator('#mobile-newsletter button[type="submit"]');
  const form = page.locator('#mobile-newsletter #newsletter-form');
  const status = page.locator('#mobile-newsletter #newsletter-status');
  await expect(root).toHaveAttribute('aria-label', 'Lomi Mobile launch newsletter');
  await noteContract(page, '#mobile-newsletter', true);
  await expect(form).toHaveAttribute('data-endpoint', endpoint);
  expect(JSON.parse(await form.getAttribute('data-copy')).successMessage).toContain('Lomi Mobile launch news');
  await expect(button).toHaveText(/Notify me at launch/);
  await expect(email).toBeEnabled();

  await email.fill('not-an-email');
  await email.press('Enter');
  expect(await page.evaluate(() => window.__newsletterRequests)).toEqual([]);
  await expect(root).toHaveAttribute('data-state', 'idle');

  let release;
  let requestCount = 0;
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    requestCount++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ email: 'mobile@example.test' });
    expect(route.request().headers()['content-type']).toBe('application/json');
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"accepted":true}' });
  });
  await email.fill('mobile@example.test');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'pending');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/Subscribing/);
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => requestCount).toBe(1);
  const firstRequest = await page.evaluate(() => window.__newsletterRequests[0]);
  expect(firstRequest).toMatchObject({
    method: 'POST', credentials: 'omit', redirect: 'error',
    body: '{"email":"mobile@example.test"}', signal: true,
  });
  expect(Object.keys(JSON.parse(firstRequest.body))).toEqual(['email']);
  release();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');
  await expect(button).toHaveText(/You’re on the list/);
  await expect(status).toContainText('Lomi Mobile launch news');
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await email.evaluate((element) => element.blur());
  await page.locator('#mobile-newsletter').screenshot({ path: `artifacts/mobile-newsletter-${browserType.name()}-success.png` });

  await email.fill('mobile-retry@example.test');
  await mock(page, 429, '{}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('Too many');
  await expect(email).toHaveValue('mobile-retry@example.test');
  await expect(button).toBeEnabled();
  await mock(page, 202, '{"accepted":true}');
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');

  await email.fill('mobile-error@example.test');
  await mock(page, 503, '{}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('couldn’t');
  await expect(email).toHaveValue('mobile-error@example.test');
  await mock(page, 202, '{"accepted":true}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');
  expect(await page.evaluate(() => window.__newsletterRequests)).toHaveLength(5);

  await page.setViewportSize({ width: 390, height: 844 });
  await axe(page, '#mobile-newsletter');
  await context.close();
}

async function remoteSignup() {
  const target = new URL('/remote/', configuredURL).href;
  const { context, page } = await open(target);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#remote-newsletter').scrollIntoViewIfNeeded();
  await expect(page.locator('#remote-newsletter')).toBeInViewport();

  const root = page.locator('#remote-newsletter .newsletter');
  const email = page.locator('#remote-newsletter #newsletter-email');
  const button = page.locator('#remote-newsletter button[type="submit"]');
  const form = page.locator('#remote-newsletter #newsletter-form');
  const status = page.locator('#remote-newsletter #newsletter-status');
  await expect(root).toHaveAttribute('aria-label', 'Lomi Remote launch newsletter');
  await noteContract(page, '#remote-newsletter', false);
  await expect(form).toHaveAttribute('data-endpoint', endpoint);
  expect(JSON.parse(await form.getAttribute('data-copy')).successMessage).toContain('Lomi Remote launch news');
  await expect(button).toHaveText(/Notify me at launch/);
  await expect(email).toBeEnabled();
  await layout(page, '#remote-newsletter');

  await email.fill('not-an-email');
  await email.press('Enter');
  expect(await page.evaluate(() => window.__newsletterRequests)).toEqual([]);
  await expect(root).toHaveAttribute('data-state', 'idle');

  let release;
  let requestCount = 0;
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    requestCount++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ email: 'remote@example.test' });
    expect(route.request().headers()['content-type']).toBe('application/json');
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"accepted":true}' });
  });
  await email.fill('remote@example.test');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'pending');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/Subscribing/);
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => requestCount).toBe(1);
  const firstRequest = await page.evaluate(() => window.__newsletterRequests[0]);
  expect(firstRequest).toMatchObject({
    method: 'POST', credentials: 'omit', redirect: 'error',
    body: '{"email":"remote@example.test"}', signal: true,
  });
  expect(Object.keys(JSON.parse(firstRequest.body))).toEqual(['email']);
  release();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');
  await expect(button).toHaveText(/You’re on the list/);
  await expect(status).toContainText('Lomi Remote launch news');
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await email.evaluate((element) => element.blur());
  await page.locator('#remote-newsletter').screenshot({ path: `artifacts/remote-newsletter-${browserType.name()}-success.png` });

  await email.fill('remote-retry@example.test');
  await mock(page, 429, '{}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('Too many');
  await expect(email).toHaveValue('remote-retry@example.test');
  await expect(button).toBeEnabled();
  await mock(page, 202, '{"accepted":true}');
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');

  await email.fill('remote-error@example.test');
  await mock(page, 503, '{}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('couldn’t');
  await expect(email).toHaveValue('remote-error@example.test');
  await mock(page, 202, '{"accepted":true}');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');
  expect(await page.evaluate(() => window.__newsletterRequests)).toHaveLength(5);
  await axe(page, '#remote-newsletter');
  await context.close();
}

async function navigation(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(configuredURL, { waitUntil: 'networkidle' });
  const desktop = page.locator('.desktop-navigation a[href$="#newsletter"]');
  await expect(desktop).toHaveAttribute('href', '#newsletter');
  await desktop.click();
  await expect(page).toHaveURL(new URL('/#newsletter', configuredURL).href);
  await expect(page.locator('#newsletter')).toBeFocused();
  await expect.poll(() => page.locator('#newsletter').evaluate((element) =>
    element.getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom - 1
  ), { message: 'Newsletter anchor clears the fixed header' }).toBe(true);

  await page.goto(new URL('/devlog', configuredURL).href, { waitUntil: 'networkidle' });
  await expect(desktop).toHaveAttribute('href', '/#newsletter');
  await desktop.click();
  await expect(page).toHaveURL(new URL('/#newsletter', configuredURL).href);
  await expect(page.locator('#newsletter')).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(configuredURL, { waitUntil: 'networkidle' });
  const menu = page.locator('#mobile-navigation');
  await menu.locator(':scope > summary').click();
  const mobile = menu.getByRole('link', { name: 'Newsletter', exact: true });
  await expect(mobile).toHaveAttribute('href', '#newsletter');
  await mobile.click();
  await expect(page).toHaveURL(new URL('/#newsletter', configuredURL).href);
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(page.locator('#newsletter')).toBeFocused();
  await page.goto(new URL('/devlog', configuredURL).href, { waitUntil: 'networkidle' });
  await menu.locator(':scope > summary').click();
  await expect(mobile).toHaveAttribute('href', '/#newsletter');
  await mobile.click();
  await expect(page).toHaveURL(new URL('/#newsletter', configuredURL).href);
  await expect(page.locator('#newsletter')).toBeInViewport();
}

try {
  await startFixture();
  browser = await browserType.launch();
  const unavailable = await open(url);
  await expect(unavailable.page.locator('#newsletter .newsletter')).toHaveAttribute('data-state', 'unavailable');
  await expect(unavailable.page.locator('#newsletter input')).toBeDisabled();
  await expect(unavailable.page.locator('#newsletter button')).toBeDisabled();
  await expect(unavailable.page.locator('#newsletter-status')).toContainText('temporarily unavailable');
  await noteContract(unavailable.page, '#newsletter', true);
  await layout(unavailable.page);
  await axe(unavailable.page);
  await unavailable.page.goto(new URL('/mobile-app/', url).href, { waitUntil: 'networkidle' });
  const unavailableMobile = unavailable.page.locator('#mobile-newsletter .newsletter');
  await expect(unavailableMobile).toHaveAttribute('data-state', 'unavailable');
  await expect(unavailableMobile.locator('input')).toBeDisabled();
  await expect(unavailableMobile.locator('button')).toBeDisabled();
  await expect(unavailableMobile.locator('#newsletter-status')).toContainText('temporarily unavailable');
  await noteContract(unavailable.page, '#mobile-newsletter', true);
  await layout(unavailable.page, '#mobile-newsletter');
  await axe(unavailable.page, '#mobile-newsletter');
  await unavailable.page.locator('#mobile-newsletter').screenshot({ path: `artifacts/mobile-newsletter-${browserType.name()}-unavailable.png` });
  await unavailable.page.goto(new URL('/remote/', url).href, { waitUntil: 'networkidle' });
  const unavailableRemote = unavailable.page.locator('#remote-newsletter .newsletter');
  await expect(unavailableRemote).toHaveAttribute('data-state', 'unavailable');
  await expect(unavailableRemote.locator('input')).toBeDisabled();
  await expect(unavailableRemote.locator('button')).toBeDisabled();
  await expect(unavailableRemote.locator('#newsletter-status')).toContainText('temporarily unavailable');
  await noteContract(unavailable.page, '#remote-newsletter', false);
  await layout(unavailable.page, '#remote-newsletter');
  await axe(unavailable.page, '#remote-newsletter');
  await unavailable.page.locator('#remote-newsletter').screenshot({ path: `artifacts/remote-newsletter-${browserType.name()}-unavailable.png` });
  await unavailable.context.close();

  const { context, page } = await open(configuredURL);
  const root = page.locator('#newsletter .newsletter');
  const email = page.locator('#newsletter-email');
  const button = page.locator('#newsletter button');
  const form = page.locator('#newsletter-form');
  await expect(form).toHaveAttribute('data-endpoint', endpoint);
  await expect(email).toBeEnabled();
  await noteContract(page, '#newsletter', true);
  await email.fill('invalid-email');
  await email.press('Enter');
  expect(await page.evaluate(() => window.__newsletterRequests)).toEqual([]);
  await expect(root).toHaveAttribute('data-state', 'idle');

  let release;
  let requestCount = 0;
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    requestCount++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ email: 'reader@example.test' });
    expect(route.request().headers()['content-type']).toBe('application/json');
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"accepted":true}' });
  });
  await email.fill('reader@example.test');
  await email.press('Enter');
  await expect(root).toHaveAttribute('data-state', 'pending');
  await expect(email).toBeFocused();
  await expect(email).toBeEnabled();
  await expect(email).not.toBeEditable();
  await expect(button).toBeDisabled();
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await form.evaluate((element) => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect.poll(() => requestCount).toBe(1);
  expect(await page.evaluate(() => window.__newsletterRequests[0])).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', body: '{"email":"reader@example.test"}', signal: true });
  expect(await page.evaluate(() => window.__newsletterTimeout)).toBe(10000);
  release();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(email).toHaveValue('');
  await expect(email).toBeEnabled();
  await expect(email).toBeEditable();
  await expect(email).toBeFocused();
  await expect(button).toContainText('Subscribed');
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.letter-accepted')).toHaveCSS('opacity', '1');
  await page.locator('#newsletter').screenshot({ path: `artifacts/newsletter-${browserType.name()}-success.png` });
  await email.fill('retry@example.test');
  await expect(root).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#newsletter-status')).toBeEmpty();
  await expect(page.locator('.letter-accepted')).toHaveCSS('opacity', '0');

  for (const [status, body, message] of [[200, '{"accepted":true}', 'couldn’t'], [202, '{"accepted":false}', 'couldn’t'], [202, '{', 'couldn’t'], [503, '{}', 'couldn’t'], [429, '{}', 'Too many']]) {
    await mock(page, status, body);
    await email.press('Enter');
    await expect(root, `HTTP ${status}, ${body} is not accepted`).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#newsletter-status')).toContainText(message);
    await expect(email).toHaveValue('retry@example.test');
    await expect(email).toBeFocused();
    await expect(email).toBeEditable();
    await expect(button).toBeEnabled();
  }
  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.abort('failed'));
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(email).toHaveValue('retry@example.test');
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.abort().catch(() => {});
  });
  await page.evaluate(() => { window.__fastNewsletterTimeout = true; });
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'error');
  await expect(email).toHaveValue('retry@example.test');
  await page.evaluate(() => { window.__fastNewsletterTimeout = false; });
  await mock(page, 202, '{"accepted":true}');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'success');
  await expect(page.locator('.letter-accepted')).toHaveCSS('animation-name', 'none');
  await email.fill('');

  await layout(page);
  await axe(page);
  await page.locator('#newsletter').screenshot({ path: `artifacts/newsletter-${browserType.name()}-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await axe(page);
  await page.locator('#newsletter').screenshot({ path: `artifacts/newsletter-${browserType.name()}-mobile.png` });
  const originalHeight = (await page.locator('#newsletter').boundingBox()).height;
  await page.locator('#newsletter-title').evaluate((element) => { element.textContent = 'A longer published newsletter invitation with room for ideas. '.repeat(40).slice(0, 2000); });
  expect((await page.locator('#newsletter').boundingBox()).height).toBeGreaterThan(originalHeight);
  await layout(page);
  await navigation(page);
  await context.close();

  await mobileSignup();
  await remoteSignup();

  const noJS = await open(configuredURL, { javaScriptEnabled: false });
  await expect(noJS.page.locator('#newsletter input')).toBeDisabled();
  await expect(noJS.page.locator('#newsletter button')).toBeDisabled();
  await expect(noJS.page.locator('#newsletter .newsletter-noscript')).toBeVisible();
  await noteContract(noJS.page, '#newsletter', true);
  await layout(noJS.page);
  await noJS.page.goto(new URL('/mobile-app/', configuredURL).href, { waitUntil: 'networkidle' });
  await expect(noJS.page.locator('#mobile-newsletter input')).toBeDisabled();
  await expect(noJS.page.locator('#mobile-newsletter button')).toBeDisabled();
  await expect(noJS.page.locator('#mobile-newsletter .newsletter-noscript')).toBeVisible();
  await noteContract(noJS.page, '#mobile-newsletter', true);
  await expect(noJS.page.locator('#mobile-newsletter .newsletter')).toHaveAttribute('data-state', 'idle');
  await noJS.page.goto(new URL('/remote/', configuredURL).href, { waitUntil: 'networkidle' });
  await expect(noJS.page.locator('#remote-newsletter input')).toBeDisabled();
  await expect(noJS.page.locator('#remote-newsletter button')).toBeDisabled();
  await expect(noJS.page.locator('#remote-newsletter .newsletter-noscript')).toBeVisible();
  await noteContract(noJS.page, '#remote-newsletter', false);
  await expect(noJS.page.locator('#remote-newsletter .newsletter')).toHaveAttribute('data-state', 'idle');
  await noJS.context.close();
  expect(errors, 'No page runtime errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): unavailable and no-JS homepage/mobile/Remote states; canonical credential-free POST for all three forms; invalid email; pending lock; strict 202 acceptance; mobile and Remote launch copy with retries after 429/503; homepage retries after malformed/200/503/429/network/timeout; reset, reduced motion, responsive layout, accessibility, screenshots and header anchors. All signup requests mocked.`);
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      const timer = setTimeout(() => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} resolve(); }, 3000);
      server.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
