import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch({
  ...(browserType === chromium && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'Linux x86_64' });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  });
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: { platform: 'Linux', mobile: false },
  });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

const releaseUrl = 'https://github.com/lomi-dev/lomi/releases';
const assetUrl = (name) => `https://github.com/lomi-dev/lomi/releases/download/v1.2.3/${name}`;
const releaseFixture = [
  {
    tag_name: 'v1.2.2',
    html_url: `${releaseUrl}/tag/v1.2.2`,
    draft: false,
    published_at: '2026-01-01T12:00:00Z',
    assets: [],
  },
  {
    tag_name: 'v9.9.9',
    html_url: `${releaseUrl}/tag/v9.9.9`,
    draft: true,
    published_at: '2026-09-01T12:00:00Z',
    assets: [],
  },
  {
    tag_name: 'v1.2.3',
    html_url: `${releaseUrl}/tag/v1.2.3`,
    draft: false,
    published_at: '2026-08-01T12:00:00Z',
    assets: [
      'Lomi_1.2.3_aarch64.dmg',
      'Lomi_1.2.3_x64.dmg',
      'Lomi_1.2.3_x64-setup.exe',
      'Lomi_1.2.3_x64_en-US.msi',
      'Lomi_1.2.3_amd64.AppImage',
      'Lomi_1.2.3_amd64.deb',
      'Lomi-1.2.3-1.x86_64.rpm',
    ].map((name) => ({ name, browser_download_url: assetUrl(name) })),
  },
];
let releaseApiFails = false;
await page.route(/^https:\/\/api\.github\.com\/repos\/lomi-dev\/lomi\/releases\?per_page=10$/, async (route) => {
  if (releaseApiFails) {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(releaseFixture) });
});

try {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle('lomi: Work in progress');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follow the progress on GitHub' })).toHaveAttribute('href', 'https://github.com/lomi-dev/lomi');
  await expect(page.getByRole('region', { name: 'Newsletter signup' })).toBeVisible();
  await expect(page.locator('nav, footer')).toHaveCount(0);
  await expect(page.locator('#download-dialog')).not.toBeVisible();

  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `Layout at ${width}px`).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight), `Single screen at ${width}px`).toBe(900);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.getByRole('link', { name: 'Follow the progress on GitHub' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'Follow the progress on GitHub' })).toBeInViewport();

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/page-${width}.png`, fullPage: true });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(`artifacts/accessibility-${width}.json`, JSON.stringify(results.violations, null, 2));
    expect(results.violations, `Accessibility at ${width}px`).toEqual([]);
  }
  const email = page.getByRole('textbox', { name: 'Email address' });
  const subscribe = page.getByRole('button', { name: 'Subscribe' });
  if (await subscribe.isEnabled()) {
    let requestBody;
    let authorization;
    await page.route('https://next-api.useplunk.com/v1/track', async (route) => {
      requestBody = route.request().postDataJSON();
      authorization = route.request().headers().authorization;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await email.fill('reader@example.com');
    await subscribe.click();
    await expect(page.getByRole('status')).toHaveText('You’re on the list. Thanks for joining!');
    expect(requestBody).toEqual({
      email: 'reader@example.com',
      event: 'newsletter_signup',
      subscribed: true,
      data: { source: 'lomi_web' },
    });
    expect(authorization).toMatch(/^Bearer pk_/);
    await expect(email).toHaveValue('');

    await page.unroute('https://next-api.useplunk.com/v1/track');
    await page.route('https://next-api.useplunk.com/v1/track', (route) => route.fulfill({ status: 500 }));
    await email.fill('reader@example.com');
    await subscribe.click();
    await expect(page.getByRole('status')).toHaveText('Something went wrong. Please try again.');
    await expect(subscribe).toBeEnabled();
  } else {
    await expect(email).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Newsletter signup is temporarily unavailable.');
  }

  const downloadTrigger = page.getByRole('button', { name: 'Download the prerelease' });
  const downloadDialog = page.getByRole('dialog', { name: 'Choose your download' });
  const osSelect = page.getByLabel('Operating system');
  const typeSelect = page.getByLabel('Package type');
  const downloadAction = page.getByRole('link', { name: 'Download prerelease' });
  const osIconWrap = page.locator('[data-download-os-icon]');

  await expect(downloadTrigger).toBeVisible();
  await downloadTrigger.click();
  await expect(downloadDialog).toBeVisible();
  await expect(osSelect).toHaveValue('linux');
  await expect(osIconWrap).toHaveAttribute('data-selected-os', 'linux');
  await expect(typeSelect).toHaveValue('appimage');
  await expect(typeSelect).toBeEnabled();
  await expect(downloadAction).toHaveAttribute('href', assetUrl('Lomi_1.2.3_amd64.AppImage'));
  await expect(downloadDialog.locator('[data-download-status]')).toBeEmpty();

  const packageCases = [
    ['macos', 'apple-silicon', 'Lomi_1.2.3_aarch64.dmg'],
    ['macos', 'intel', 'Lomi_1.2.3_x64.dmg'],
    ['windows', 'exe', 'Lomi_1.2.3_x64-setup.exe'],
    ['windows', 'msi', 'Lomi_1.2.3_x64_en-US.msi'],
    ['linux', 'appimage', 'Lomi_1.2.3_amd64.AppImage'],
    ['linux', 'deb', 'Lomi_1.2.3_amd64.deb'],
    ['linux', 'rpm', 'Lomi-1.2.3-1.x86_64.rpm'],
  ];
  const defaultTypes = { macos: 'apple-silicon', windows: 'exe', linux: 'appimage' };
  let selectedOs = 'linux';
  let selectedType = 'appimage';
  for (const [os, type, filename] of packageCases) {
    if (os !== selectedOs) {
      await osSelect.selectOption(os);
      selectedOs = os;
      selectedType = defaultTypes[os];
      await expect(typeSelect).toHaveValue(selectedType);
    }
    await expect(osIconWrap).toHaveAttribute('data-selected-os', os);
    await expect(osIconWrap.locator(`[data-os-icon="${os}"]`)).toBeVisible();
    await expect(osIconWrap.locator(`[data-os-icon="${os}"]`)).toHaveAttribute('src', `/icons/download-${os}.svg`);
    await expect.poll(() => osIconWrap.locator(`[data-os-icon="${os}"]`).evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    if (type !== selectedType) {
      await typeSelect.selectOption(type);
      selectedType = type;
    }
    await expect(downloadAction).toHaveAttribute('href', assetUrl(filename));
  }

  await expect(downloadDialog.locator('[data-architecture-warning]')).toHaveCount(0);
  const osBox = await osSelect.boundingBox();
  const typeBox = await typeSelect.boundingBox();
  expect(osBox).not.toBeNull();
  expect(typeBox).not.toBeNull();
  expect(typeBox.y).toBeGreaterThan(osBox.y + osBox.height);
  expect(Math.abs(typeBox.width - osBox.width)).toBeLessThan(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await downloadDialog.boundingBox();
  expect(mobileDialog).not.toBeNull();
  expect(Math.abs(mobileDialog.x - (390 - mobileDialog.width) / 2)).toBeLessThan(1);
  expect(Math.abs(mobileDialog.y - (844 - mobileDialog.height) / 2)).toBeLessThan(1);
  const dialogA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dialogA11y.violations, 'Accessibility with the download dialog open').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(downloadTrigger).toBeFocused();

  releaseApiFails = true;
  await downloadTrigger.click();
  await expect(downloadDialog.getByRole('status')).toHaveText('We couldn’t check installer availability. Browse the latest release on GitHub.');
  await expect(downloadDialog.getByRole('link', { name: 'Open latest release' })).toHaveAttribute('href', releaseUrl);
  await page.keyboard.press('Escape');
  await expect(downloadTrigger).toBeFocused();

  expect(await page.locator('astro-island').count()).toBe(0);
  expect(errors).toEqual([]);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(url);
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(staticPage.getByRole('link', { name: 'Follow the progress on GitHub' })).toBeVisible();
  await expect(staticPage.getByRole('link', { name: 'Browse releases on GitHub' })).toHaveAttribute('href', releaseUrl);
  await expect(staticPage.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  await expect(staticPage.locator('.newsletter-noscript')).toBeVisible();
  await staticPage.keyboard.press('Tab');
  await expect(staticPage.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await staticPage.keyboard.press('Enter');
  await expect(staticPage.locator('#main')).toBeFocused();
  await staticContext.close();
  console.log('Passed: 6 viewport widths, short landscape layout, GitHub link, newsletter form, preview download defaults and all 7 package links, release API fallback, dialog keyboard/focus behavior, no-JS releases link, and mobile/desktop/dialog accessibility.');
} finally {
  await browser.close();
}
