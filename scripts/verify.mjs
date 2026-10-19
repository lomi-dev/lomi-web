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
await page.route('https://next-api.useplunk.com/**', () => { throw new Error('Browser must not call Plunk'); });
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

const footerViewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1440, height: 500 },
  { width: 320, height: 320 },
  { width: 320, height: 200 },
];

async function verifyViewportFooter(targetPage, screenshots = false, viewports = footerViewports) {
  const footer = targetPage.locator('.site-footer');
  const links = footer.locator('a[href]');
  const linkCount = await links.count();
  const regionStops = await footer.locator('[tabindex="0"]:not(a[href])').count();
  expect(linkCount, 'Footer links remain available').toBeGreaterThan(0);
  for (const viewport of viewports) {
    await targetPage.setViewportSize(viewport);
    await footer.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const dimensions = await footer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left, width: bounds.width, height: bounds.height,
        viewportWidth: document.documentElement.clientWidth, viewportHeight: innerHeight,
      };
    });
    const label = `Footer at ${viewport.width}x${viewport.height}`;
    expect(Math.abs(dimensions.left), `${label}: left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.width - dimensions.viewportWidth), `${label}: exact viewport width`).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.height - dimensions.viewportHeight), `${label}: exact viewport height`).toBeLessThanOrEqual(1);
    expect(await targetPage.evaluate(() => document.documentElement.scrollWidth), `${label}: no horizontal overflow`).toBe(dimensions.viewportWidth);

    await links.first().focus();
    for (let index = 0; index < linkCount; index++) {
      const link = links.nth(index);
      for (let stop = 0; stop < regionStops && !await link.evaluate((element) => element === document.activeElement); stop++) {
        expect(await footer.evaluate((element) => element.contains(document.activeElement)
          && document.activeElement.matches('[tabindex="0"]:not(a[href])')), `${label}: explicit region stop before link ${index + 1}`).toBe(true);
        await targetPage.keyboard.press('Tab');
      }
      await expect(link, `${label}: link ${index + 1} in keyboard order`).toBeFocused();
      await link.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
      await expect.poll(() => link.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        let left = 0, top = 0, right = document.documentElement.clientWidth, bottom = innerHeight;
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const clip = ancestor.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, clip.left + ancestor.clientLeft);
            right = Math.min(right, clip.left + ancestor.clientLeft + ancestor.clientWidth);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, clip.top + ancestor.clientTop);
            bottom = Math.min(bottom, clip.top + ancestor.clientTop + ancestor.clientHeight);
          }
        }
        return bounds.width > 0 && bounds.height > 0 && bounds.left >= left - 1 && bounds.right <= right + 1
          && bounds.top >= top - 1 && bounds.bottom <= bottom + 1;
      }), `${label}: focused link ${index + 1} is fully visible`).toBe(true);
      if (index < linkCount - 1) await targetPage.keyboard.press('Tab');
    }
    if (screenshots && ((viewport.width === 1440 && viewport.height === 900) || (viewport.width === 390 && viewport.height === 844))) {
      await footer.evaluate((element) => {
        if (element.contains(document.activeElement)) document.activeElement.blur();
        element.querySelector('.footer-frame').scrollTop = 0;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      });
      // Capture the visible viewport without the locator's extra auto-scroll.
      await targetPage.screenshot({ path: `artifacts/footer-${viewport.width}.png` });
    }
  }
}

async function agentTransforms(targetPage) {
  return targetPage.locator('.hero [data-agent] .agent-float').evaluateAll((cards) => cards.map((card) => getComputedStyle(card).transform));
}

async function expectStaticAgents(targetPage, label) {
  const before = await agentTransforms(targetPage);
  await targetPage.waitForTimeout(350);
  expect(await agentTransforms(targetPage), label).toEqual(before);
}

async function verifyAgentLabels(targetPage) {
  const cards = targetPage.locator('.hero [data-agent]');
  await expect(cards).toHaveCount(7);
  const names = targetPage.locator('.hero-agent-names li');
  await expect(names).toHaveCount(7);
  for (const name of await names.all()) {
    await expect(name).toBeVisible();
    await expect(name).toHaveText(/\S/);
  }
  expect(await names.allTextContents(), 'Readable labels identify all decorative cards')
    .toEqual(await cards.locator('.agent-card-name').allTextContents());
  await expect(targetPage.locator('.agent-constellation')).toHaveAttribute('aria-hidden', 'true');
  await expect(cards.locator('button, a, [tabindex]')).toHaveCount(0);
}

async function verifyLongFooterColophon(targetPage) {
  const colophon = targetPage.locator('.site-footer .footer-credits > p');
  const original = await colophon.textContent();
  // footer.colophon accepts trimmed text from 1 through 2000 characters.
  const longColophon = 'Made in the open, with room for every project. '.repeat(12).slice(0, 520).trim();
  expect(longColophon.length, 'Representative long CMS colophon').toBeGreaterThanOrEqual(500);
  expect(longColophon.length).toBeLessThanOrEqual(2000);
  try {
    await colophon.evaluate((element, value) => { element.textContent = value; }, longColophon);
    // Just above the short-window breakpoint: long copy must not squeeze links out.
    await verifyViewportFooter(targetPage, false, [{ width: 320, height: 400 }]);
  } finally {
    await colophon.evaluate((element, value) => { element.textContent = value; }, original);
  }
  await expect(colophon).toHaveText(original);
}

try {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/\S/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#download a[href="https://github.com/lomi-dev/lomi"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Newsletter signup' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toBeVisible();
  const desktopNavigation = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  const desktopLinks = await desktopNavigation.locator('a').evaluateAll((links) => links.map((link) => {
    const label = link.cloneNode(true);
    label.querySelectorAll('[aria-hidden="true"]').forEach((decoration) => decoration.remove());
    return { href: link.getAttribute('href'), label: link.getAttribute('aria-label') || label.textContent.trim() };
  }));
  expect(desktopLinks.length, 'Desktop navigation links').toBeGreaterThan(0);
  for (const [index, link] of desktopLinks.entries()) {
    await expect(desktopNavigation.locator('a').nth(index)).toHaveAccessibleName(link.label);
  }
  await expect(page.getByRole('contentinfo')).toBeVisible();
  for (const section of ['workflow', 'features', 'roadmap', 'faq', 'download', 'newsletter']) {
    await expect(page.locator(`#${section}`)).toBeVisible();
    await expect(page.locator(`#${section}`).getByRole('heading', { level: 2 })).toBeVisible();
  }
  const anchors = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return {
      duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
      missingTargets: [...document.querySelectorAll('a[href^="#"]')]
        .map((link) => link.getAttribute('href'))
        .filter((href) => href.length < 2 || !document.getElementById(decodeURIComponent(href.slice(1)))),
    };
  });
  expect(anchors.duplicates, 'Unique element IDs').toEqual([]);
  expect(anchors.missingTargets, 'Internal anchor destinations').toEqual([]);
  await expect(page.locator('#download-dialog')).not.toBeVisible();

  const hero = page.locator('.hero');
  const motionToggle = hero.locator('[data-motion-toggle]');
  await expect(page.locator('astro-island')).toHaveCount(1);
  await expect(hero.locator('astro-island')).toHaveCount(1);
  await expect(hero.locator('astro-island')).not.toHaveAttribute('ssr');
  await verifyAgentLabels(page);
  const agentAssets = await hero.locator('.agent-card-icon').evaluateAll((icons) => icons.map((icon) =>
    icon.getAttribute('src') || getComputedStyle(icon).maskImage.match(/url\(["']?(.*?)["']?\)/)?.[1]));
  expect(new Set(agentAssets).size, 'Seven distinct local agent assets').toBe(7);
  await Promise.all(agentAssets.map(async (asset) => {
    const address = new URL(asset, url);
    expect(address.origin).toBe(new URL(url).origin);
    expect(address.pathname).toMatch(/^\/agents\/[^/]+\.svg$/);
    const response = await page.request.get(address.href);
    expect(response.status(), address.pathname).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
    expect(await response.text(), address.pathname).toMatch(/<svg[\s>]/);
  }));
  expect(await page.evaluate(async (assets) => Promise.all(assets.map(async (asset) => {
    const image = new Image();
    image.src = new URL(asset, location.href).href;
    await image.decode();
    return image.naturalWidth > 0;
  })), agentAssets), 'Every agent asset decodes in the browser').toEqual(Array(7).fill(true));
  await page.mouse.move(0, 0);
  await expect(hero).toHaveAttribute('data-motion', 'running');
  await expect(motionToggle).toHaveAccessibleName('Pause motion');
  const runningTransforms = await agentTransforms(page);
  await expect.poll(() => agentTransforms(page), { message: 'Agent cards actually move while running' }).not.toEqual(runningTransforms);
  const codexTilt = hero.locator('[data-agent="codex"] .agent-tilt');
  const codexBody = codexTilt.locator('.tilted-card__body');
  const tiltTransform = () => codexBody.evaluate((element) => getComputedStyle(element).transform);
  const moveAcrossCodex = async (x, y) => {
    const box = await codexTilt.boundingBox();
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 5 });
  };
  const idleTilt = await tiltTransform();
  await moveAcrossCodex(.7, .3);
  await expect.poll(tiltTransform, { message: 'Pointer movement tilts the running Codex card' }).not.toBe(idleTilt);
  await motionToggle.evaluate((element) => element.focus({ preventScroll: true }));
  await page.keyboard.press('Space');
  await expect(hero).toHaveAttribute('data-motion', 'paused');
  await expect(motionToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(motionToggle).toHaveAccessibleName('Resume motion');
  await expectStaticAgents(page, 'Manual pause freezes card motion');
  await expect(codexTilt).toHaveCSS('pointer-events', 'none');
  await expect.poll(async () => {
    const before = await tiltTransform();
    await page.waitForTimeout(200);
    return await tiltTransform() === before;
  }, { message: 'Paused pointer tilt settles', timeout: 5000 }).toBe(true);
  const pausedTilt = await tiltTransform();
  await moveAcrossCodex(.3, .7);
  await moveAcrossCodex(.7, .3);
  await page.waitForTimeout(350);
  expect(await tiltTransform(), 'Moving over a paused card does not tilt it').toBe(pausedTilt);

  await page.keyboard.press('Enter');
  await expect(hero).toHaveAttribute('data-motion', 'running');
  await expect(motionToggle).toHaveAttribute('aria-pressed', 'false');
  const resumedTransforms = await agentTransforms(page);
  await expect.poll(() => agentTransforms(page), { message: 'Resuming restarts actual card movement' }).not.toEqual(resumedTransforms);
  await expect(codexTilt).toHaveCSS('pointer-events', 'auto');
  await page.mouse.move(0, 0);
  const resumedTilt = await tiltTransform();
  await moveAcrossCodex(.3, .7);
  await expect.poll(tiltTransform, { message: 'Resuming restores pointer tilt' }).not.toBe(resumedTilt);
  await page.mouse.move(0, 0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).toHaveAttribute('data-motion', 'reduced');
  await expect(motionToggle).not.toBeVisible();
  await expectStaticAgents(page, 'Live reduced-motion preference stops card movement');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(hero).toHaveAttribute('data-motion', 'running');
  await expect(motionToggle).toBeVisible();
  await motionToggle.click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await hero.evaluate((element) => {
      const protectedAreas = [element.querySelector('h1'), element.querySelector('.hero-actions [data-download-open]')]
        .map((item) => item.getBoundingClientRect());
      return [...element.querySelectorAll('.agent-card-icon')].every((icon) => {
        const bounds = icon.getBoundingClientRect();
        return protectedAreas.every((area) => bounds.right <= area.left || bounds.left >= area.right
          || bounds.bottom <= area.top || bounds.top >= area.bottom);
      });
    }), `Decorative icons clear the heading and primary action at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  const deck = page.locator('lomi-workspace-deck');
  const deckControls = deck.getByRole('group', { name: 'Choose a workspace view' });
  const deckButtons = deckControls.getByRole('button');
  const deckPanels = deck.locator('[data-deck-panel]');
  const deckCaption = deck.locator('figcaption');
  await expect(deckControls).toBeVisible();
  await expect(deckButtons).toHaveCount(3);
  await expect(deckPanels).toHaveCount(3);
  await expect(deckCaption).toHaveAttribute('aria-live', 'polite');
  const viewImages = new Set();
  const viewCaptions = new Set();
  async function expectDeckView(index) {
    await expect(deckButtons.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(deckControls.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(deck.locator('[data-deck-panel]:visible')).toHaveCount(1);
    for (const [panelIndex, panel] of (await deckPanels.all()).entries()) {
      if (panelIndex !== index) await expect(panel).not.toBeVisible();
    }
    const panel = deckPanels.nth(index);
    await expect(panel).toBeVisible();
    const image = panel.getByRole('img');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('alt', /\S/);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    await expect(deckCaption).toHaveText(await panel.getAttribute('data-caption'));
    await expect(deckCaption).toHaveText(/\S/);
    return { image: await image.getAttribute('src'), caption: await deckCaption.textContent() };
  }
  await expectDeckView(0);
  for (const [index, label] of ['Build', 'Preview', 'Review'].entries()) {
    await expect(deckButtons.nth(index)).toHaveAccessibleName(label);
    await deckButtons.nth(index).click();
    const view = await expectDeckView(index);
    viewImages.add(view.image);
    viewCaptions.add(view.caption);
  }
  expect(viewImages.size, 'Distinct product screenshots').toBe(3);
  expect(viewCaptions.size, 'View-specific captions').toBe(3);
  await deckButtons.first().focus();
  await page.keyboard.press('Enter');
  await expectDeckView(0);
  await page.keyboard.press('Tab');
  await expect(deckButtons.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expectDeckView(1);
  await page.keyboard.press('Tab');
  await expect(deckButtons.nth(2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectDeckView(2);
  await page.keyboard.press('Shift+Tab');
  await expect(deckButtons.nth(1)).toBeFocused();
  await expectDeckView(2);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await deckButtons.first().click();
  await expectDeckView(0);
  expect(await deck.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running').length), 'No deck animation with reduced motion').toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const width of [320, 390, 640, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `Layout at ${width}px`).toBe(width);
    await expect(deckControls).toBeVisible();
    for (const button of await deckButtons.all()) {
      const box = await button.boundingBox();
      expect(box.x, `Workspace control fits at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `Workspace control fits at ${width}px`).toBeLessThanOrEqual(width);
    }
    if (width === 640) {
      // 640 CSS pixels provides the reflow width of a 1280px window at 200% zoom.
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth), 'Heading reflows at 200% equivalent width').toBe(true);
    }
  }
  await verifyViewportFooter(page, true);
  await verifyLongFooterColophon(page);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.locator('#download').scrollIntoViewIfNeeded();
  await expect(page.locator('#download')).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('#mobile-navigation');
  const mobileSummary = mobileMenu.locator('summary');
  await expect(mobileSummary).toBeVisible();
  await expect(mobileMenu).not.toHaveAttribute('open');
  const navigationLinks = await mobileMenu.locator('a').evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute('href'),
    label: link.textContent.trim(),
  })));
  expect(navigationLinks.length, 'Mobile navigation links').toBeGreaterThan(0);
  expect(navigationLinks.slice(0, desktopLinks.length), 'Consistent desktop and mobile navigation').toEqual(desktopLinks);
  for (const [index, link] of navigationLinks.entries()) {
    expect(link.label, 'Nonempty navigation label').toMatch(/\S/);
    expect(link.href, 'Navigation destination').toMatch(/^(#.+|https:\/\/)/);
    if (!link.href.startsWith('#')) continue;
    await mobileSummary.click();
    await expect(mobileMenu).toHaveAttribute('open', '');
    const navigationLink = mobileMenu.getByRole('link').nth(index);
    await expect(navigationLink).toHaveAttribute('href', link.href);
    await expect(navigationLink).toBeVisible();
    await expect(navigationLink).toHaveAccessibleName(link.label);
    await navigationLink.click();
    await expect(page).toHaveURL(new URL(link.href, url).href);
    await expect(mobileMenu).not.toHaveAttribute('open');
    await expect(page.locator(link.href)).toBeInViewport();
  }
  await mobileSummary.focus();
  await page.keyboard.press('Enter');
  await expect(mobileMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(mobileMenu).not.toHaveAttribute('open');
  await expect(mobileSummary).toBeFocused();

  const faqItems = page.locator('#faq details');
  expect(await faqItems.count()).toBeGreaterThan(0);
  for (const item of await faqItems.all()) {
    const summary = item.locator('summary');
    await expect(item.locator('p')).not.toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('open', '');
    await expect(item.locator('p')).toBeVisible();
    await expect(item.locator('p')).not.toBeEmpty();
    await page.keyboard.press('Space');
    await expect(item).not.toHaveAttribute('open');
    await expect(item.locator('p')).not.toBeVisible();
  }

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
    let cookie;
    const endpoint = await page.locator('#newsletter-form').getAttribute('data-endpoint');
    expect(new URL(endpoint).pathname).toBe('/v1/newsletter/subscribe');
    await page.route(endpoint, async (route) => {
      requestBody = route.request().postDataJSON();
      authorization = route.request().headers().authorization;
      cookie = route.request().headers().cookie;
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) });
    });
    await email.fill('reader@example.com');
    await subscribe.click();
    await expect(page.locator('#newsletter-status')).toHaveText('You’re on the list. Thanks for joining!');
    expect(requestBody).toEqual({ email: 'reader@example.com' });
    expect(authorization).toBeUndefined();
    expect(cookie).toBeUndefined();
    await expect(email).toHaveValue('');

    await page.unroute(endpoint);
    for (const result of [
      { status: 500, body: '{}' },
      { status: 200, body: '{"accepted":true}' },
      { status: 202, body: '{"accepted":false}' },
    ]) {
      await page.route(endpoint, (route) => route.fulfill({ ...result, contentType: 'application/json' }));
      await email.fill('reader@example.com');
      await subscribe.click();
      await expect(page.locator('#newsletter-status')).toHaveText('Something went wrong. Please try again.');
      await expect(subscribe).toBeEnabled();
      await page.unroute(endpoint);
    }
  } else {
    await expect(email).toBeDisabled();
    await expect(page.locator('#newsletter-status')).toHaveText('Newsletter signup is temporarily unavailable.');
  }

  const downloadTriggers = page.locator('[data-download-open]');
  const downloadTrigger = page.locator('#download [data-download-open]');
  const downloadDialog = page.getByRole('dialog', { name: 'Choose your download' });
  const osSelect = page.getByLabel('Operating system');
  const typeSelect = page.getByLabel('Package type');
  const downloadAction = page.getByRole('link', { name: 'Download prerelease' });
  const osIconWrap = page.locator('[data-download-os-icon]');

  await expect(page.locator('dialog')).toHaveCount(1);
  expect(await downloadTriggers.count()).toBeGreaterThanOrEqual(2);
  for (const trigger of await downloadTriggers.all()) {
    const inMobileMenu = await trigger.evaluate((element) => Boolean(element.closest('#mobile-navigation')));
    await page.setViewportSize({ width: inMobileMenu ? 390 : 1440, height: 900 });
    if (inMobileMenu) await mobileSummary.click();
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-controls', 'download-dialog');
    await trigger.click();
    await expect(downloadDialog).toBeVisible();
    await expect(osSelect).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(downloadDialog).not.toBeVisible();
    await expect(inMobileMenu ? mobileSummary : trigger).toBeFocused();
  }
  const desktopHeaderDownload = page.locator('.site-header .header-actions [data-download-open]');
  const mobileHeaderDownload = mobileMenu.locator('[data-download-open]');
  await page.setViewportSize({ width: 390, height: 900 });
  await mobileSummary.click();
  await mobileHeaderDownload.click();
  await expect(downloadDialog).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(desktopHeaderDownload, 'Mobile download restores desktop header focus after resizing').toBeFocused();
  await desktopHeaderDownload.click();
  await expect(downloadDialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.keyboard.press('Escape');
  await expect(downloadDialog).not.toBeVisible();
  await expect(mobileSummary, 'Desktop download restores mobile menu focus after resizing').toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
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

  await expect(page.locator('astro-island')).toHaveCount(1);
  expect(errors).toEqual([]);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.route(releaseUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>GitHub releases</h1>' }));
  await staticPage.goto(url);
  await expect(staticPage.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  for (const section of ['workflow', 'features', 'roadmap', 'faq', 'download', 'newsletter']) {
    await expect(staticPage.locator(`#${section}`).getByRole('heading', { level: 2 })).toBeVisible();
  }
  await verifyAgentLabels(staticPage);
  await expect(staticPage.locator('.hero [data-motion-toggle]')).not.toBeVisible();
  await expectStaticAgents(staticPage, 'No-JavaScript hero remains static');
  await expect(staticPage.locator('.hero .hero-explore')).toHaveAttribute('href', '#workspace');
  const staticDeck = staticPage.locator('lomi-workspace-deck');
  await expect(staticDeck.locator('.deck-controls')).not.toBeVisible();
  await expect(staticDeck.getByRole('button')).toHaveCount(0);
  await expect(staticDeck.locator('[data-deck-panel]:visible')).toHaveCount(1);
  const staticImage = staticDeck.locator('[data-deck-panel]').first().getByRole('img');
  await expect(staticImage).toBeVisible();
  await expect(staticImage).toHaveAttribute('alt', /\S/);
  await expect.poll(() => staticImage.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(staticDeck.locator('figcaption')).toHaveText(/\S/);
  const staticHeroDownload = staticPage.locator('.hero [data-download-open]');
  await expect(staticHeroDownload).toBeVisible();
  await expect(staticHeroDownload).toHaveAttribute('href', releaseUrl);
  await staticHeroDownload.click();
  await expect(staticPage).toHaveURL(releaseUrl);
  await staticPage.goto(url);
  const staticReleaseLink = staticPage.locator('#download').getByRole('link', { name: 'Browse releases on GitHub' });
  await expect(staticReleaseLink).toBeVisible();
  await expect(staticReleaseLink).toHaveAttribute('href', releaseUrl);
  await expect(staticPage.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  await expect(staticPage.locator('.newsletter-noscript')).toBeVisible();
  const staticMenu = staticPage.locator('#mobile-navigation');
  await staticMenu.locator('summary').click();
  await expect(staticMenu.getByRole('navigation')).toBeVisible();
  const staticNavigationLink = staticMenu.locator('a[href^="#"]').first();
  const staticDestination = await staticNavigationLink.getAttribute('href');
  await staticNavigationLink.click();
  await expect(staticPage.locator(staticDestination)).toBeInViewport();
  const staticFaq = staticPage.locator('#faq details').first();
  await staticFaq.locator('summary').focus();
  await staticPage.keyboard.press('Enter');
  await expect(staticFaq.locator('p')).toBeVisible();
  await staticPage.keyboard.press('Space');
  await expect(staticFaq.locator('p')).not.toBeVisible();
  await verifyViewportFooter(staticPage);
  await verifyLongFooterColophon(staticPage);
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await staticPage.goto(url);
  await staticPage.keyboard.press('Tab');
  await expect(staticPage.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await staticPage.keyboard.press('Enter');
  await expect(staticPage.locator('#main')).toBeFocused();
  await staticContext.close();
  console.log('Passed: complete landing sections and anchors, 7 viewport widths including 200% equivalent reflow and landscape, seven agent assets/readable labels, actual motion/tilt/pause/resume/live reduced-motion/no-JS, workspace views/keyboard/reduced motion/no-JS, exact viewport footer/keyboard access across 8 sizes plus long CMS copy at 320x400 with and without JS, mobile navigation and FAQ keyboard behavior, newsletter form, all 7 download packages, release fallback, every download trigger and focus restoration across desktop/mobile resizing, no-JS reading and release links, and mobile/desktop/dialog accessibility.');
} finally {
  await browser.close();
}
