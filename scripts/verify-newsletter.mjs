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

async function layout(page) {
  const root = page.locator('#newsletter');
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${viewport.width}px: no horizontal overflow`).toBe(viewport.width);
    for (const [selector, minimum] of [['input', 56], ['button', 52]]) {
      const control = root.locator(selector);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      expect(await control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { height: box.height, fits: box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth + 2 };
      }), `${viewport.width}px: ${selector} fits`).toMatchObject({ fits: true });
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(minimum);
    }
  }
}

async function axe(page) {
  const result = await new AxeBuilder({ page }).include('#newsletter').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, 'Newsletter accessibility').toEqual([]);
}

async function mock(page, status, body) {
  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }));
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
  await layout(unavailable.page);
  await axe(unavailable.page);
  await unavailable.context.close();

  const { context, page } = await open(configuredURL);
  const root = page.locator('#newsletter .newsletter');
  const email = page.locator('#newsletter-email');
  const button = page.locator('#newsletter button');
  const form = page.locator('#newsletter-form');
  await expect(form).toHaveAttribute('data-endpoint', endpoint);
  await expect(email).toBeEnabled();
  await email.fill('invalid-email');
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
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
  await button.click();
  await expect(root).toHaveAttribute('data-state', 'pending');
  await expect(email).toBeDisabled();
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
    await button.click();
    await expect(root, `HTTP ${status}, ${body} is not accepted`).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#newsletter-status')).toContainText(message);
    await expect(email).toHaveValue('retry@example.test');
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

  const noJS = await open(configuredURL, { javaScriptEnabled: false });
  await expect(noJS.page.locator('#newsletter input')).toBeDisabled();
  await expect(noJS.page.locator('#newsletter button')).toBeDisabled();
  await expect(noJS.page.locator('#newsletter .newsletter-noscript')).toBeVisible();
  await layout(noJS.page);
  await noJS.context.close();
  expect(errors, 'No page runtime errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): unavailable and no-JS states; canonical credential-free POST; invalid email; pending lock and reentry; strict 202 acceptance; retry after malformed/200/503/429/network/timeout; success reset and stamp; reduced motion; four widths, long CMS heading, desktop/mobile axe and screenshots; desktop/mobile header anchors from home and devlog. All requests mocked.`);
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
