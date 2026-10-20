import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const api = 'https://api.github.com/repos/lomi-dev/lomi/releases?per_page=10';
const releases = 'https://github.com/lomi-dev/lomi/releases';
const packages = [
  ['macos', 'apple-silicon', 'Lomi_1.2.3_aarch64.dmg'],
  ['macos', 'intel', 'Lomi_1.2.3_x64.dmg'],
  ['windows', 'exe', 'Lomi_1.2.3_x64-setup.exe'],
  ['windows', 'msi', 'Lomi_1.2.3_x64_en-US.msi'],
  ['linux', 'appimage', 'Lomi_1.2.3_amd64.AppImage'],
  ['linux', 'deb', 'Lomi_1.2.3_amd64.deb'],
  ['linux', 'rpm', 'Lomi-1.2.3-1.x86_64.rpm'],
];
const assetUrl = (name) => `${releases}/download/v1.2.3/${name}`;
const release = (extra = {}) => ({
  tag_name: 'v1.2.3', html_url: `${releases}/tag/${extra.tag_name || 'v1.2.3'}`,
  draft: false, prerelease: false, published_at: '2026-08-01T12:00:00Z',
  assets: packages.map(([, , name]) => ({ name, browser_download_url: `${releases}/download/${extra.tag_name || 'v1.2.3'}/${name}` })),
  ...extra,
});
const fixture = () => [
  release({ tag_name: 'v99.0.0', draft: true, published_at: '2026-09-01T12:00:00Z', assets: [] }),
  release({ tag_name: 'v88.0.0', prerelease: true, published_at: '2026-09-01T12:00:00Z', assets: [] }),
  release({ tag_name: 'v77.0.0', published_at: 'invalid', assets: [] }),
  release({ tag_name: 'v1.2.2', published_at: '2026-01-01T12:00:00Z', assets: [] }),
  release(),
];
const browserType = process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch();
await mkdir('artifacts', { recursive: true });
const errors = [];
const installerRequests = [];

async function createPage({ javaScriptEnabled = true, os = 'Linux', mobile = false, clipboardDenied = false, delayedArchitecture = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1440, height: 900 }, reducedMotion });
  await context.addInitScript(({ os, mobile, clipboardDenied, delayedArchitecture }) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => os === 'macOS' ? 'MacIntel' : os === 'Windows' ? 'Win32' : 'Linux x86_64' });
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: os, mobile, ...(delayedArchitecture ? { getHighEntropyValues: () => new Promise((resolve) => { window.__resolveArchitecture = resolve; }) } : {}) } });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' : `Mozilla/5.0 (${os === 'macOS' ? 'Macintosh; Intel Mac OS X' : os === 'Windows' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'})` });
    window.__copiedCommands = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
      if (clipboardDenied) throw new DOMException('Clipboard permission denied', 'NotAllowedError');
      window.__copiedCommands.push(text);
    } } });
  }, { os, mobile, clipboardDenied, delayedArchitecture });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://github.com/lomi-dev/lomi/releases/download/**', async (route) => {
    installerRequests.push(route.request().url());
    await route.abort();
  });
  return { context, page };
}
async function mock(page, body = fixture(), status = 200) {
  await page.route(api, (route) => route.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const root = (page) => page.locator('[data-download-page]');
const tab = (page, platform) => page.locator(`.platform-tab[data-platform="${platform}"]`);
const panel = (page, platform) => page.locator(`[data-platform-panel="${platform}"]`);
async function selected(page, platform) {
  await expect(tab(page, platform)).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page, platform)).toBeVisible();
  for (const other of ['macos', 'windows', 'linux'].filter((value) => value !== platform)) await expect(panel(page, other)).not.toBeVisible();
  const aur = root(page).locator('.aur-install');
  if (platform === 'linux') await expect(aur).toBeVisible();
  else await expect(aur).not.toBeVisible();
}
async function fallback(page, platform, destination = releases) {
  const action = panel(page, platform).locator('[data-download-action]');
  await expect(action).toHaveAttribute('href', destination);
  await expect(action.locator('[data-action-label]')).toContainText(/github|release/i);
  await expect(panel(page, platform).locator('[data-package-status]')).not.toBeEmpty();
}
async function verifyManualArchitectureChoice() {
  // Pointer, keyboard confirmation and changing a package all count as a choice.
  for (const interaction of ['label', 'space', 'change']) {
    const { context, page } = await createPage({ os: 'macOS', delayedArchitecture: true });
    await mock(page);
    await page.goto(`${origin}/download/`);
    await selected(page, 'macos');
    const appleSilicon = panel(page, 'macos').locator('input[value="apple-silicon"]');
    if (interaction === 'change') {
      await panel(page, 'macos').locator('input[value="intel"]').check();
      await appleSilicon.check();
    } else {
      await expect(appleSilicon).toBeChecked();
      if (interaction === 'space') {
        await appleSilicon.focus();
        await page.keyboard.press('Space');
      } else {
        await appleSilicon.locator('..').click();
      }
    }
    await page.evaluate(async () => {
      window.__resolveArchitecture({ architecture: 'x86' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect(appleSilicon, `${interaction} confirmation survives a late architecture hint`).toBeChecked();
    await context.close();
  }
}

try {
  if (process.env.VERIFY_DOWNLOAD_ONLY === 'architecture') {
    await verifyManualArchitectureChoice();
    expect(errors, 'Download runtime errors').toEqual([]);
    expect(installerRequests, 'No installer requests').toEqual([]);
    console.log(`Passed (${browserType.name()}): label, Space and changed package choices survive late architecture hints.`);
  } else {
  const { context, page } = await createPage();
  await mock(page);
  await page.goto(`${origin}/download/`);
  await expect(root(page)).toHaveAttribute('data-release-state', 'ready');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('#download-dialog, [data-download-open]')).toHaveCount(0);
  await selected(page, 'linux');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Download lomi.');
  const capture = root(page).locator('img.product-capture').first();
  await expect(capture, 'A real workbench capture anchors the download page').toBeVisible();
  await expect.poll(() => capture.evaluate((image) => image.complete && image.naturalWidth >= 640)).toBe(true);
  const chooser = root(page).locator('.download-chooser');
  const chooserBounds = await chooser.boundingBox();
  const captureBounds = await capture.boundingBox();
  const actionBounds = await panel(page, 'linux').locator('[data-download-action]').boundingBox();
  expect(actionBounds.y, 'Primary download starts in the initial viewport').toBeGreaterThanOrEqual(0);
  expect(actionBounds.y + actionBounds.height, 'Primary download is fully above the fold').toBeLessThanOrEqual(900);
  expect(chooserBounds.y, 'The complete chooser starts in the initial viewport').toBeGreaterThanOrEqual(0);
  expect(chooserBounds.y + chooserBounds.height, 'The complete chooser remains above the fold').toBeLessThanOrEqual(900);
  expect(chooserBounds.width, 'The chooser remains a compact desktop column').toBeLessThan(550);
  expect(captureBounds.width, 'The real product capture is legible beside the chooser').toBeGreaterThan(500);
  expect(captureBounds.x, 'The product capture occupies the right desktop column').toBeGreaterThanOrEqual(chooserBounds.x + chooserBounds.width);
  expect(Math.min(chooserBounds.y + chooserBounds.height, captureBounds.y + captureBounds.height) - Math.max(chooserBounds.y, captureBounds.y), 'The product capture sits beside the chooser').toBeGreaterThan(100);
  await expect(chooser.locator('[data-platform-tabs]')).toBeVisible();
  await expect(chooser.locator('[data-platform-panel="linux"] [data-package-options]')).toBeVisible();
  await expect(root(page).locator('[data-selected-file], .release-strip, .preview-footnote, .aur-source, figcaption')).toHaveCount(0);
  await expect(root(page).getByText('Which Mac chip do I have?', { exact: true })).toHaveCount(0);
  for (const platform of ['macos', 'windows', 'linux']) {
    const icon = tab(page, platform).locator('img');
    await expect(icon, `${platform} uses its verified local Iconify asset`).toHaveAttribute('src', `/icons/download-${platform}.svg`);
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  expect(await root(page).locator('.aur-install').evaluate((aur) => Boolean(aur.compareDocumentPosition(document.querySelector('.product-showcase')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Arch instructions precede the product capture in reading order').toBe(true);
  expect(Math.min(900, captureBounds.y + captureBounds.height) - Math.max(0, captureBounds.y), 'The initial viewport reveals the product').toBeGreaterThan(80);
  await expect(root(page).locator('.download-emblem, .emblem-orbit, .platform-overview')).toHaveCount(0);
  const background = await root(page).evaluate((element) => {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color.match(/[\d.]+/g).slice(0, 3).map(Number);
    }
    return [255, 255, 255];
  });
  expect(background.every((channel) => channel > 235), 'Download page uses the requested light canvas').toBe(true);
  await expect(root(page).locator('[data-release-status]')).toContainText(/1\.2\.3/);
  for (const [platform, format, filename] of packages) {
    await tab(page, platform).click();
    await selected(page, platform);
    await panel(page, platform).locator(`input[type="radio"][value="${format}"]`).check();
    await expect(panel(page, platform).locator('[data-download-action]')).toHaveAttribute('href', assetUrl(filename));
  }
  await tab(page, 'windows').click();
  const exe = panel(page, 'windows').locator('input[value="exe"]');
  await exe.check();
  await exe.focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel(page, 'windows').locator('input[value="msi"]')).toBeChecked();
  await expect(panel(page, 'windows').locator('[data-download-action]')).toHaveAttribute('href', assetUrl('Lomi_1.2.3_x64_en-US.msi'));
  await tab(page, 'macos').click();
  await tab(page, 'macos').focus();
  for (const [key, platform] of [['ArrowRight', 'windows'], ['End', 'linux'], ['ArrowRight', 'macos'], ['ArrowLeft', 'linux'], ['Home', 'macos']]) {
    await page.keyboard.press(key);
    await expect(tab(page, platform)).toBeFocused();
    await page.keyboard.press('Enter');
    await selected(page, platform);
  }
  await tab(page, 'linux').click();
  const copy = page.locator('[data-copy-aur]').first();
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.__copiedCommands)).toContain('yay -S lomi-bin');
  await expect(page.locator('[data-copy-status]').first()).not.toBeEmpty();
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await tab(page, 'macos').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `Download overflow at ${width}px`).toBe(width);
      if (width <= 390) {
        await tab(page, 'linux').click();
        await selected(page, 'linux');
        const aurBounds = await root(page).locator('.aur-install').boundingBox();
        const showcaseBounds = await root(page).locator('.product-showcase').boundingBox();
        expect(aurBounds.y + aurBounds.height, `Arch instructions precede the image at ${width}px`).toBeLessThanOrEqual(showcaseBounds.y + 1);
        await tab(page, 'macos').click();
        await selected(page, 'macos');
      }
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      await writeFile(`artifacts/download-accessibility-${width}-${reducedMotion}.json`, JSON.stringify(accessibility.violations, null, 2));
      expect(accessibility.violations, `Download accessibility at ${width}px, ${reducedMotion}`).toEqual([]);
      await page.screenshot({ path: `artifacts/download-${width}-${reducedMotion}.png`, fullPage: true });
    }
  }
  await context.close();

  for (const [os, mobile, expected] of [['macOS', false, 'macos'], ['Windows', false, 'windows'], ['Linux', false, 'linux'], ['macOS', true, 'macos']]) {
    const { context, page } = await createPage({ os, mobile });
    await mock(page);
    await page.goto(`${origin}/download/`);
    await selected(page, expected);
    await expect(panel(page, expected).locator('input[type="radio"]:checked')).toHaveValue({ macos: 'apple-silicon', windows: 'exe', linux: 'appimage' }[expected]);
    await page.goto(`${origin}/download/#windows`);
    await selected(page, 'windows');
    await context.close();
  }
  await verifyManualArchitectureChoice();
  // Delay the release response: choosing a platform while loading must survive it.
  {
    const { context, page } = await createPage({ os: 'Windows' });
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    await page.route(api, async (route) => { await gate; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) }); });
    await page.goto(`${origin}/download/`, { waitUntil: 'domcontentloaded' });
    await expect(root(page)).toHaveAttribute('data-release-state', 'loading');
    await expect(panel(page, 'windows').locator('[data-download-action]')).toHaveAttribute('href', releases);
    await expect(panel(page, 'windows').locator('[data-package-status]')).toBeEmpty();
    await expect(root(page).locator('[data-release-status]')).toBeEmpty();
    await tab(page, 'linux').click();
    finish();
    await expect(root(page)).toHaveAttribute('data-release-state', 'ready');
    await selected(page, 'linux');
    await context.close();
  }
  for (const [name, body, status, state] of [
    ['HTTP error', {}, 503, 'error'],
    ['malformed JSON', '{broken', 200, 'error'],
    ['malformed response', { releases: [] }, 200, 'error'],
    ['no stable release', [release({ prerelease: true })], 200, 'error'],
    ['untrusted release URL', [release({ html_url: 'https://example.com/release' })], 200, 'error'],
    ['untrusted asset URL', [release({ assets: release().assets.map((asset) => ({ ...asset, browser_download_url: 'https://example.com/installer.dmg' })) })], 200, 'ready'],
    ['missing asset without older release fallback', [release({ assets: [] }), release({ tag_name: 'v1.2.2', published_at: '2026-01-01T12:00:00Z' })], 200, 'ready'],
  ]) {
    const { context, page } = await createPage();
    await mock(page, body, status);
    await page.goto(`${origin}/download/#macos`);
    await expect(root(page), name).toHaveAttribute('data-release-state', state);
    for (const platform of ['macos', 'windows', 'linux']) {
      await tab(page, platform).click();
      await fallback(page, platform, state === 'ready' ? `${releases}/tag/v1.2.3` : releases);
    }
    if (state === 'error') {
      await expect(page.locator('[data-release-retry]')).toBeVisible();
      await page.unroute(api);
      await mock(page);
      await page.locator('[data-release-retry]').click();
      await expect(root(page)).toHaveAttribute('data-release-state', 'ready');
    }
    await context.close();
  }
  // A retry retains keyboard focus while pending, then only moves owned focus.
  for (const moveFocus of [false, true]) {
    const { context, page } = await createPage();
    await mock(page, {}, 503);
    await page.goto(`${origin}/download/#windows`);
    await expect(root(page)).toHaveAttribute('data-release-state', 'error');
    await page.unroute(api);
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    await page.route(api, async (route) => {
      await gate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) });
    });
    const retry = page.locator('[data-release-retry]');
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(root(page)).toHaveAttribute('data-release-state', 'loading');
    await expect(retry).toBeFocused();
    await expect(retry).toBeVisible();
    await expect(retry).toHaveAttribute('aria-disabled', 'true');
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    if (moveFocus) await tab(page, 'windows').focus();
    finish();
    await expect(root(page)).toHaveAttribute('data-release-state', 'ready');
    await expect(retry).not.toBeVisible();
    await expect(moveFocus ? tab(page, 'windows') : panel(page, 'windows').locator('[data-download-action]')).toBeFocused();
    await context.close();
  }
  {
    const { context, page } = await createPage({ clipboardDenied: true });
    await mock(page);
    await page.goto(`${origin}/download/#linux`);
    await page.locator('[data-copy-aur]').first().click();
    await expect(page.locator('[data-copy-status]').first()).toContainText(/copy|clipboard|select|manual|permission/i);
    expect(await page.evaluate(() => window.__copiedCommands)).toEqual([]);
    await context.close();
  }
  for (const javaScriptEnabled of [true, false]) {
    const { context, page } = await createPage({ javaScriptEnabled });
    await mock(page);
    for (const route of ['/', '/devlog/']) {
      await page.goto(`${origin}${route}`);
      await expect(page.locator('#download-dialog, [data-download-open], [aria-controls="download-dialog"]')).toHaveCount(0);
      const callsToAction = await page.locator('a').evaluateAll((links) => links.filter((link) => /download/i.test(link.textContent)).map((link) => ({ label: link.textContent.trim(), href: link.getAttribute('href') })));
      expect(callsToAction.length).toBeGreaterThan(0);
      for (const action of callsToAction) expect(action.href, `${route}: ${action.label}`).toBe('/download/');
      const links = page.locator('a[href="/download/"]');
      expect(await links.count(), `${route} download entry points`).toBeGreaterThan(0);
      for (const link of await links.all()) await expect(link).not.toHaveAttribute('aria-haspopup', 'dialog');
      const visible = page.locator(route === '/' ? '.hero a[href="/download/"]' : '.header-action[href="/download/"]');
      await visible.click();
      await expect(page).toHaveURL(`${origin}/download/`);
    }
    await context.close();
  }
  {
    const { context, page } = await createPage({ javaScriptEnabled: false });
    await page.goto(`${origin}/download/`);
    for (const platform of ['macos', 'windows', 'linux']) {
      await expect(panel(page, platform)).toBeVisible();
      await expect(panel(page, platform).locator('[data-download-action]')).toHaveAttribute('href', releases);
      await expect(tab(page, platform)).toHaveAttribute('href', `#${platform}`);
    }
    await expect(root(page).locator('.download-noscript')).toBeVisible();
    await expect(root(page).locator('.download-noscript')).toContainText(/javascript|github/i);
    await expect(root(page).locator('.aur-install')).not.toBeVisible();
    for (const platform of ['linux', 'macos', 'windows']) {
      await tab(page, platform).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${origin}/download/#${platform}`);
      const aur = root(page).locator('.aur-install');
      if (platform === 'linux') await expect(aur).toBeVisible();
      else await expect(aur).not.toBeVisible();
    }
    await context.close();
  }
  expect(installerRequests, 'Verification never requests real installers').toEqual([]);
  expect(errors, 'Download runtime errors').toEqual([]);
  console.log('Passed: /download/ entry points, seven verified packages, stable release selection, OS defaults and explicit platform choice, keyboard tabs, radios, clipboard success/denial, release errors/retry and safe fallback without older assets, no-JS platforms, four viewport sizes with normal/reduced motion, screenshots and accessibility.');
  }
} finally {
  await browser.close();
}
