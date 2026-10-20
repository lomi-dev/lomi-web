import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch();
const unix = 'curl -fsSL https://lomi.dev/download/remote | bash';
const windows = 'Invoke-RestMethod "https://lomi.dev/download/remote.ps1" | Invoke-Expression';
const systems = [['macOS / Linux', 'unix', unix], ['Windows', 'windows', windows]];
const errors = [];
const installerRequests = [];
const reports = [];
await mkdir('artifacts', { recursive: true });

async function makePage({ os = 'macOS', clipboard = 'success', javaScriptEnabled = true, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  await context.addInitScript(({ os, clipboard }) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: os === 'macOS' ? 'MacIntel' : os === 'Windows' ? 'Win32' : os });
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: os } });
    window.__copyMode = clipboard;
    window.__copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard === 'missing' ? undefined : { writeText: async (text) => {
      if (window.__copyMode === 'reject') throw new DOMException('Clipboard denied', 'NotAllowedError');
      if (window.__copyMode === 'pending') await new Promise((resolve, reject) => {
        window.__resolveCopy = resolve;
        window.__rejectCopy = () => reject(new DOMException('Clipboard denied', 'NotAllowedError'));
      });
      window.__copies.push(text);
    } } });
  }, { os, clipboard });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://lomi.dev/download/remote**', async (route) => { installerRequests.push(route.request().url()); await route.abort(); });
  return { context, page };
}
const panel = (page) => page.locator('.command-panel:visible');
const feedback = (page) => page.locator('[data-remote-copy-status]');
async function selectSystem(page, label, id, command) {
  await page.getByRole('radio', { name: label, exact: true }).check();
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page)).toHaveAttribute('data-remote-platform', id);
  await expect(panel(page).locator('[data-remote-command]')).toHaveText(command);
  await expect(panel(page).getByRole('button')).toHaveAttribute('aria-label', `Copy ${label} install command`);
  await expect(panel(page).getByRole('button')).toHaveAttribute('title', `Copy ${label} install command`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  reports.push({ label, violations: result.violations });
  expect(result.violations, `${label}: accessibility`).toEqual([]);
}
async function capture(page, label) {
  await page.evaluate(() => { document.activeElement?.blur(); getSelection()?.removeAllRanges(); scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: `artifacts/remote-${browserType.name()}-${label}.png`, fullPage: true });
}
async function verifyCardLayout(page) {
  const card = await page.locator('.command-box').boundingBox();
  const toolbar = await page.locator('.command-toolbar').boundingBox();
  const picker = await page.locator('.remote-system-picker').boundingBox();
  const command = await panel(page).locator('.command-bar').boundingBox();
  expect(card).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(picker).not.toBeNull();
  expect(command).not.toBeNull();
  expect(picker.x).toBeGreaterThanOrEqual(card.x);
  expect(picker.y).toBeGreaterThanOrEqual(card.y);
  expect(picker.x + picker.width).toBeLessThanOrEqual(card.x + card.width + 1);
  expect(card.x + card.width - picker.x - picker.width, 'The picker sits at the upper-right of the shared card').toBeLessThanOrEqual(32);
  expect(picker.y).toBeGreaterThanOrEqual(toolbar.y);
  expect(picker.y + picker.height).toBeLessThanOrEqual(toolbar.y + toolbar.height + 1);
  expect(picker.y + picker.height, 'The picker sits above the command row').toBeLessThanOrEqual(command.y + 1);
  expect(command.y + command.height).toBeLessThanOrEqual(card.y + card.height + 1);
}
async function verifyShowcase(page) {
  const figure = page.locator('figure.remote-showcase');
  const screenshot = figure.locator('img');
  await expect(figure).toHaveCount(1);
  await expect(screenshot).toHaveCount(1);
  await screenshot.scrollIntoViewIfNeeded();
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('src', /\/_astro\//);
  const dimensions = await screenshot.evaluate(async (element) => {
    await element.decode();
    return { width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')), naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight };
  });
  expect(dimensions.width).toBe(2880);
  expect(dimensions.height).toBe(1800);
  expect(dimensions.naturalWidth).toBeGreaterThan(0);
  expect(dimensions.naturalHeight).toBeGreaterThan(0);
  const installer = await page.locator('[data-remote-installer]').boundingBox();
  const image = await screenshot.boundingBox();
  expect(Math.abs(image.height - image.width * dimensions.height / dimensions.width), 'The rendered screenshot preserves its declared aspect ratio within one CSS pixel').toBeLessThanOrEqual(1);
  expect(image.y, 'The screenshot follows the installer').toBeGreaterThanOrEqual(installer.y + installer.height);
  expect(image.x).toBeGreaterThanOrEqual(0);
  expect(image.x + image.width).toBeLessThanOrEqual(page.viewportSize().width);
}

try {
  const { context, page } = await makePage();
  for (const path of ['/remote', '/remote/']) {
    const response = await page.goto(`${origin}${path}`);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle('lomi remote — A host for your workspace');
    await expect(page.locator('h1')).toHaveText('Get lomi remote.');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /macOS, Linux or Windows/);
  }
  await expect(page.locator('.remote-model, .remote-foundation, .remote-flow, .remote-questions')).toHaveCount(0);
  await expect(page.locator('.remote-release-note')).toHaveCount(0);
  await expect(page.locator('.command-toolbar').getByRole('heading', { name: 'Install Lomi Remote CLI', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get project updates', exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/in development|coming soon/i);
  const choices = page.locator('input[type="radio"][name="remote-system"]');
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(choices).toHaveCount(2);
  expect(await choices.evaluateAll((elements) => elements.map((element) => element.value))).toEqual(['unix', 'windows']);
  await expect(page.locator('.command-box .command-toolbar .remote-system-picker')).toHaveCount(1);
  await expect(page.locator('.command-box .command-panels')).toHaveCount(1);
  expect(await page.locator('.remote-system-picker').evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector('.command-panels')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'The picker precedes the command panels in DOM order').toBe(true);
  await expect(page.locator('[data-remote-installer]')).toHaveAttribute('data-remote-ready', '');
  for (const system of systems) {
    await selectSystem(page, ...system);
    await panel(page).getByRole('button').click();
    await expect(feedback(page)).toHaveText(`${system[0]} command copied.`);
    expect(await page.evaluate(() => window.__copies.at(-1))).toBe(system[2]);
  }
  console.log('Remote routes and exact Unix/PowerShell clipboard text passed.');

  await selectSystem(page, ...systems[0]);
  await page.getByRole('radio', { name: 'macOS / Linux', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Windows', exact: true })).toBeChecked();
  expect(await page.getByRole('radio', { name: 'Windows', exact: true }).evaluate((element) => getComputedStyle(element.parentElement).outlineStyle)).toBe('solid');
  await page.keyboard.press('Tab');
  await expect(panel(page).locator('.command-scroll')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel(page).getByRole('button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(feedback(page)).toHaveText('Windows command copied.');
  await page.evaluate(() => { window.__copyMode = 'reject'; });
  await panel(page).getByRole('button').click();
  await expect(feedback(page)).toContainText('copy it manually');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(windows);
  await expect(panel(page).getByRole('button')).not.toHaveAttribute('data-copied', '');
  await expect(panel(page).locator('[data-copied-icon]')).not.toBeVisible();

  await selectSystem(page, ...systems[0]);
  const unixCopy = page.locator('[data-remote-platform="unix"] [data-copy-remote]');
  await unixCopy.focus();
  await page.evaluate(() => { window.__copyMode = 'pending'; });
  await page.keyboard.press('Enter');
  await expect(unixCopy).toBeDisabled();
  await expect(unixCopy).toBeFocused();
  await page.evaluate(() => window.__resolveCopy());
  await expect(feedback(page)).toHaveText('macOS / Linux command copied.');
  await expect(unixCopy).toBeFocused();
  await page.evaluate(() => { window.__copyMode = 'pending'; });
  await page.keyboard.press('Enter');
  await expect(unixCopy).toBeFocused();
  await page.evaluate(() => window.__rejectCopy());
  await expect(feedback(page)).toContainText('copy it manually');
  await expect(unixCopy).toBeFocused();
  await page.evaluate(() => { window.__copyMode = 'success'; });
  await page.keyboard.press('Enter');
  await expect(feedback(page)).toHaveText('macOS / Linux command copied.');
  await expect(unixCopy).toBeFocused();

  await page.evaluate(() => { window.__copyMode = 'pending'; });
  await panel(page).getByRole('button').click();
  await expect(panel(page).getByRole('button')).toBeDisabled();
  await selectSystem(page, ...systems[1]);
  await expect(panel(page).getByRole('button')).toBeDisabled();
  await page.evaluate(() => { window.__copyMode = 'success'; window.__resolveCopy(); });
  await expect(panel(page).getByRole('button')).toBeEnabled();
  await expect(page.getByRole('radio', { name: 'Windows', exact: true })).toBeFocused();
  await expect(feedback(page)).toBeEmpty();
  await panel(page).getByRole('button').click();
  await expect(feedback(page)).toHaveText('Windows command copied.');
  expect(await page.evaluate(() => window.__copies.at(-1))).toBe(windows);
  console.log('Native keyboard, clipboard denial and pending-copy system changes passed.');

  for (const width of [320, 390, 768, 1000, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const system of systems) {
      await selectSystem(page, ...system);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const copy = await panel(page).getByRole('button').boundingBox();
      expect(copy.width).toBeGreaterThanOrEqual(44);
      expect(copy.height).toBeGreaterThanOrEqual(44);
      expect(copy.x).toBeGreaterThanOrEqual(0);
      expect(copy.x + copy.width).toBeLessThanOrEqual(width);
      await verifyCardLayout(page);
    }
    await verifyShowcase(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectSystem(page, ...systems[0]);
  await capture(page, 'desktop');
  await axe(page, 'desktop Unix');
  await selectSystem(page, ...systems[1]);
  await axe(page, 'desktop PowerShell');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'mobile');
  await axe(page, 'mobile PowerShell');
  const scroll = panel(page).locator('.command-scroll');
  await scroll.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  console.log('Six widths, a persistent copy target, command scrolling and accessibility passed.');

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/`);
    if (width < 768) await page.locator('#mobile-navigation > summary').click();
    const product = page.locator(width < 768 ? '#mobile-product' : '#product-menu');
    await product.locator(':scope > summary').click();
    await product.getByRole('link', { name: 'Remote', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/remote/`);
    await expect(page.locator('.site-footer a[href="/#features"]')).toHaveCount(1);
  }
  await page.goto(`${origin}/remote/`);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.locator('.site-footer').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(200, 255, 61)');
  await context.close();

  for (const [os, expected] of [['macOS', 'unix'], ['Linux', 'unix'], ['Windows', 'windows'], ['Android', 'unix']]) {
    const detected = await makePage({ os });
    await detected.page.goto(`${origin}/remote/`);
    await expect(panel(detected.page)).toHaveAttribute('data-remote-platform', expected);
    await detected.context.close();
  }
  const unsupported = await makePage({ clipboard: 'missing' });
  await unsupported.page.goto(`${origin}/remote/`);
  await panel(unsupported.page).getByRole('button').click();
  await expect(feedback(unsupported.page)).toContainText('copy it manually');
  expect(await unsupported.page.evaluate(() => getSelection()?.toString())).toBe(unix);
  await unsupported.context.close();

  const fallback = await makePage({ javaScriptEnabled: false, viewport: { width: 320, height: 568 } });
  await fallback.page.goto(`${origin}/remote/`);
  expect(await fallback.page.evaluate(() => document.querySelector('h1').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom), 'The no-JS heading clears the taller navigation').toBeGreaterThanOrEqual(16);
  for (const system of systems) {
    await selectSystem(fallback.page, ...system);
    await expect(panel(fallback.page).getByRole('button')).toBeDisabled();
    expect(await fallback.page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
  await expect(fallback.page.locator('.manual-copy-note')).toBeVisible();
  await panel(fallback.page).locator('.command-scroll').focus();
  await fallback.page.keyboard.press('ArrowRight');
  await expect.poll(() => panel(fallback.page).locator('.command-scroll').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await fallback.context.close();
  const reduced = await makePage({ reducedMotion: 'reduce' });
  await reduced.page.goto(`${origin}/remote/`);
  await selectSystem(reduced.page, ...systems[1]);
  expect(await reduced.page.locator('.remote-page').evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  await reduced.context.close();

  expect(errors, 'Runtime errors').toEqual([]);
  expect(installerRequests, 'Displaying and copying never downloads an installer').toEqual([]);
  await writeFile(`artifacts/remote-${browserType.name()}-verification.json`, JSON.stringify({ browser: browserType.name(), errors, installerRequests, reports }, null, 2));
  console.log(`Remote installation page verified in ${browserType.name()}: exact copy, system detection, keyboard, no-JS, reduced motion, navigation and no installer execution.`);
} finally {
  await browser.close();
}
