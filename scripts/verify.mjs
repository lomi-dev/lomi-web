import { chromium, firefox, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = process.env.VERIFY_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch({
  ...(browserType === chromium && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

try {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle('lomi: Work in progress');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follow the progress on GitHub' })).toHaveAttribute('href', 'https://github.com/lomi-dev/lomi');
  await expect(page.getByRole('heading', { name: 'Get the next update.' })).toBeVisible();
  await expect(page.locator('nav, footer, dialog')).toHaveCount(0);

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

  expect(await page.locator('astro-island').count()).toBe(0);
  expect(errors).toEqual([]);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(url);
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(staticPage.getByRole('link', { name: 'Follow the progress on GitHub' })).toBeVisible();
  await expect(staticPage.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  await expect(staticPage.locator('.newsletter-noscript')).toBeVisible();
  await staticPage.keyboard.press('Tab');
  await expect(staticPage.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await staticPage.keyboard.press('Enter');
  await expect(staticPage.locator('#main')).toBeFocused();
  await staticContext.close();
  console.log('Passed: 6 viewport widths, short landscape layout, GitHub link, newsletter form, keyboard access, no-JS rendering, and mobile/desktop accessibility.');
} finally {
  await browser.close();
}
