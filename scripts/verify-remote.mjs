import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error('VERIFY_BROWSER must be chromium, firefox or webkit');
const browser = await browserType.launch();
const errors = [];
const requests = [];
const scriptRequests = [];
const reports = [];
await mkdir('artifacts', { recursive: true });

async function makePage({ width = 1440, height = 900, javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    requests.push(request.url());
    if (request.resourceType() === 'script') scriptRequests.push(request.url());
  });
  return { context, page };
}

async function verifyLaunchPage(page, { noJs = false } = {}) {
  await expect(page.locator('[data-remote-page]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Lomi Remote.' })).toBeVisible();
  await expect(page.locator('.remote-opening a, .remote-opening [role="status"], .remote-opening [data-remote-status]')).toHaveCount(0);
  await expect(page).toHaveTitle(/Lomi Remote/i);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toMatch(/launch|coming soon|upcoming/i);
  expect(description).not.toMatch(/installation command|install.*macOS.*Linux.*Windows/i);

  const badges = page.locator('.remote-platform');
  await expect(badges).toHaveCount(3);
  for (const platform of ['macOS', 'Windows', 'Linux']) {
    const badge = page.getByRole('button', { name: new RegExp(`${platform}.*coming soon`, 'i') });
    await expect(badge).toBeDisabled();
    await expect(badge).not.toHaveAttribute('href', /.+/);
    await expect(badge).toHaveCSS('background-color', 'rgb(229, 232, 226)');
    await expect(badge.locator('img')).toHaveAttribute('alt', '');
  }
  await expect(page.locator('.remote-platform-soon')).toHaveCount(3);
  for (const label of await page.locator('.remote-platform-soon').all()) await expect(label).toHaveText('Coming soon');

  await expect(page.locator('[data-remote-installer], [data-remote-copy], [data-remote-command], input[type="radio"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /copy.*install|install.*command/i })).toHaveCount(0);
  const pageText = await page.locator('body').innerText();
  for (const legacy of ['curl -fsSL https://lomi.dev/download/remote', 'Invoke-RestMethod', 'Invoke-Expression']) {
    expect(pageText).not.toContain(legacy);
  }
  const installLinks = await page.locator('a[href], img[src], script[src]').evaluateAll((elements) => elements
    .map((element) => element.getAttribute('href') || element.getAttribute('src') || '')
    .filter((value) => /lomi\.dev\/download\/remote(?:\.ps1)?/i.test(value)));
  expect(installLinks, 'No installer URLs are present in rendered links or resources').toEqual([]);

  const preview = page.locator('[data-remote-cli-preview]');
  await expect(preview).toHaveCount(1);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('aria-label', /Lomi Remote.*preview/i);
  await expect(preview).not.toHaveAttribute('data-enhanced', 'true');
  await expect(preview.locator('img')).toHaveCount(1);
  const image = preview.locator('img');
  await expect(image).toHaveAttribute('alt', /sample local workspaces/i);
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  const artwork = await image.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      source: element.currentSrc,
      x: bounds.x,
      right: bounds.right,
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(artwork.naturalWidth).toBeGreaterThan(0);
  expect(artwork.naturalHeight).toBeGreaterThan(0);
  expect(Math.abs(artwork.naturalWidth / artwork.naturalHeight - 8 / 5)).toBeLessThan(0.012);
  expect(artwork.source).not.toMatch(/\.gif(?:[?#]|$)/i);
  expect(artwork.x).toBeGreaterThanOrEqual(0);
  expect(artwork.right).toBeLessThanOrEqual(page.viewportSize().width);
  await expect(preview.locator('video, audio, canvas, figcaption, button, input, select, textarea, a[href], script')).toHaveCount(0);
  await expect(preview.locator('.cli-titlebar, .cli-window-title, [data-cli-workspace-list], [data-cli-static-list], [data-cli-workspace-controls], [data-cli-detail-content], [data-cli-help-button], [data-cli-help-content], [data-cli-help-static], [data-cli-panel-title]')).toHaveCount(0);
  const previewText = await preview.innerText();
  expect(previewText).not.toMatch(/Development preview|Interface preview only|Local IPC connected|Sharing policy/i);
  expect(previewText.trim()).toBe('');
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('Development preview');
  expect(bodyText).not.toContain('Interface preview only; no live host is connected.');
  const scripts = await page.locator('script').evaluateAll((items) => items.map((script) => `${script.getAttribute('src') || ''}\n${script.textContent || ''}`));
  expect(scripts.filter((script) => /RemoteCliPreview|remote-cli-preview|enhanceRemoteCliPreview|data-cli-workspace/i.test(script)), 'No Remote preview controller is loaded').toEqual([]);

  const previewGeometry = await preview.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x, right: bounds.right, width: bounds.width,
      stage: element.closest('.remote-showcase')?.getBoundingClientRect().toJSON(),
      newsletter: document.querySelector('#remote-newsletter')?.getBoundingClientRect().toJSON(),
    };
  });
  expect(previewGeometry.width).toBeGreaterThan(200);
  expect(previewGeometry.x).toBeGreaterThanOrEqual(0);
  expect(previewGeometry.right).toBeLessThanOrEqual(page.viewportSize().width);
  expect(previewGeometry.stage.width).toBeLessThanOrEqual(1000);
  expect(Math.abs(previewGeometry.stage.x + previewGeometry.stage.width / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(previewGeometry.x + previewGeometry.width / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);
  expect(previewGeometry.newsletter.width).toBeLessThanOrEqual(620);
  expect(Math.abs(previewGeometry.newsletter.x + previewGeometry.newsletter.width / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(1);
  expect(previewGeometry.newsletter.y).toBeGreaterThanOrEqual(previewGeometry.stage.bottom + (page.viewportSize().width <= 767 ? 40 : 60));
  await expect(page.locator('.remote-showcase-copy')).toHaveCount(0);
  await expect(page.locator('.remote-showcase')).not.toHaveCSS('background-color', 'rgb(237, 241, 231)');

  await expect(page.locator('#remote-newsletter .newsletter')).toBeVisible();
  await expect(page.locator('#remote-newsletter .newsletter')).toHaveAttribute('aria-label', 'Lomi Remote launch newsletter');
  await expect(page.locator('#remote-newsletter > h2')).toHaveText(/^Get Remote launch news\.?$/);
  await expect(page.locator('#remote-newsletter #newsletter-note')).toHaveCount(0);
  await expect(page.locator('#remote-newsletter #newsletter-email')).toHaveAttribute('aria-describedby', 'newsletter-status');
  await expect(page.locator('#remote-newsletter #newsletter-status')).toHaveCount(1);
  if (noJs) {
    await expect(page.locator('#remote-newsletter input')).toBeDisabled();
    await expect(page.locator('#remote-newsletter button')).toBeDisabled();
    await expect(page.locator('#remote-newsletter .newsletter-noscript')).toBeVisible();
  }
}

async function verifyProductNavigation(page, width) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  const product = page.locator(width < 768 ? '#mobile-product' : '#product-menu');
  if (width < 768) await page.locator('#mobile-navigation > summary').click();
  await product.locator(':scope > summary').click();
  await expect(product).toHaveAttribute('open', '');
  const links = product.locator('.product-link');
  await expect(links.first()).toContainText('Features');
  await expect(product.getByRole('link', { name: /^Overview$/i })).toHaveCount(0);
  await expect(product.getByRole('link', { name: 'Remote', exact: true })).toHaveAttribute('href', '/remote/');
  await expect(product.getByRole('link', { name: 'Remote', exact: true })).toHaveAttribute('aria-current', 'page');
  await product.evaluate((element) => { element.open = false; });
  if (width < 768) await page.locator('#mobile-navigation').evaluate((element) => { element.open = false; });
}

async function verifyResponsive(page) {
  for (const width of [320, 390, 768, 999, 1000, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), `${width}px: no horizontal overflow`).toBe(width);
    const preview = page.locator('[data-remote-cli-preview]');
    const image = preview.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0), `${width}px: static artwork loads`).toBe(true);
    const geometry = await image.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const frame = element.closest('picture') || element;
      const frameBounds = frame.getBoundingClientRect();
      return {
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        x: bounds.x,
        right: bounds.right,
        width: bounds.width,
        ratio: bounds.width / bounds.height,
        frameRatio: frameBounds.width / frameBounds.height,
      };
    });
    expect(Math.abs(geometry.naturalWidth / geometry.naturalHeight - 8 / 5), `${width}px: source art keeps its 8:5 aspect`).toBeLessThan(0.012);
    expect(Math.abs(geometry.frameRatio - 8 / 5), `${width}px: picture frame keeps its 8:5 aspect`).toBeLessThan(0.012);
    expect(geometry.x, `${width}px: preview stays inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(geometry.right, `${width}px: preview stays inside the viewport`).toBeLessThanOrEqual(width);
    expect(Math.abs(geometry.x + geometry.width / 2 - width / 2), `${width}px: preview stays centered`).toBeLessThanOrEqual(2);
    const stage = await page.locator('.remote-showcase').boundingBox();
    const newsletter = await page.locator('#remote-newsletter').boundingBox();
    expect(stage.width, `${width}px: the preview stays within the centered 1000px stage`).toBeLessThanOrEqual(1000);
    expect(Math.abs(stage.x + stage.width / 2 - width / 2), `${width}px: the preview stage stays centered`).toBeLessThanOrEqual(1);
    expect(newsletter.width, `${width}px: the launch form stays within 620px`).toBeLessThanOrEqual(620);
    expect(Math.abs(newsletter.x + newsletter.width / 2 - width / 2), `${width}px: the launch form stays centered`).toBeLessThanOrEqual(1);
    expect(newsletter.y, `${width}px: signup follows the full-width preview`).toBeGreaterThanOrEqual(stage.y + stage.height + (width <= 767 ? 40 : 60));
    await expect(page.locator('.remote-showcase')).not.toHaveCSS('background-color', 'rgb(237, 241, 231)');
  }
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

try {
  const { context, page } = await makePage();
  for (const path of ['/remote', '/remote/']) {
    const requestStart = requests.length;
    const response = await page.goto(`${origin}${path}`);
    expect(response.status()).toBe(200);
    await verifyLaunchPage(page);
    if (path === '/remote/') {
      const externalRequests = requests.slice(requestStart).filter((url) => new URL(url).origin !== new URL(origin).origin);
      expect(externalRequests, 'Remote and its CLI preview make no external resource requests').toEqual([]);
    }
  }
  await verifyResponsive(page);
  await verifyProductNavigation(page, 1440);
  await capture(page, 'desktop');
  await axe(page, 'desktop');
  await verifyProductNavigation(page, 390);
  await capture(page, 'mobile');
  await axe(page, 'mobile');

  // The Product link remains usable from both enhanced navigation variants.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(`${origin}/`);
    if (width < 768) await page.locator('#mobile-navigation > summary').click();
    const product = page.locator(width < 768 ? '#mobile-product' : '#product-menu');
    await product.locator(':scope > summary').click();
    await product.getByRole('link', { name: 'Remote', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/remote/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Lomi Remote.' })).toBeVisible();
  }
  await context.close();

  const fallback = await makePage({ width: 390, height: 844, javaScriptEnabled: false });
  await fallback.page.goto(`${origin}/remote/`);
  await verifyLaunchPage(fallback.page, { noJs: true });
  await fallback.context.close();

  const installRequests = requests.filter((url) => /lomi\.dev\/download\/remote(?:\.ps1)?/i.test(url));
  expect(installRequests, 'No installer scripts are requested by the page').toEqual([]);
  const controllerRequests = scriptRequests.filter((url) => /RemoteCliPreview|remote-cli-preview|enhanceRemoteCliPreview/i.test(url));
  expect(controllerRequests, 'No Remote preview controller script is requested').toEqual([]);
  expect(errors, 'Runtime errors').toEqual([]);
  await writeFile(`artifacts/remote-${browserType.name()}-verification.json`, JSON.stringify({ browser: browserType.name(), errors, requests, reports }, null, 2));
  console.log(`Remote launch page verified in ${browserType.name()}: launch status, disabled platform badges, static accessible artwork, newsletter fallback, centered responsive layout, no installer UI, animation, or external requests, and accessibility.`);
} finally {
  await browser.close();
}
