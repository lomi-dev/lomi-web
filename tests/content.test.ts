/// <reference types="bun" />
import { afterEach, describe, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';
import seed from '../content/landing.json';
import { landingSchema } from '../content/landing-schema';
import { loadLanding } from '../content/load-landing';
import { activeLandingLinks } from '../src/data/navigation';

afterEach(() => { globalThis.fetch = originalFetch; });
const originalFetch = globalThis.fetch;

describe('published landing content', () => {
  it('renders the checked-in outline without a CMS or a network request', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    assert.deepEqual(await loadLanding(), seed);
    assert.equal(fetch.mock.calls.length, 0);
  });

  it('requests only published content and strips CMS metadata', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      ...seed, _status: 'published', id: 1, createdAt: '2026-10-19',
    }));
    assert.deepEqual(await loadLanding('http://127.0.0.1:3001'), seed);
    assert.equal(fetch.mock.calls[0][0].toString(), 'http://127.0.0.1:3001/api/globals/landing?depth=0&draft=false');
  });

  it('rejects a draft even if a misconfigured CMS returns HTTP 200', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...seed, _status: 'draft' }));
    await assert.rejects(loadLanding('https://cms.example.test'), /published landing content/);
  });

  it('fails the build on CMS outages instead of silently deploying old copy', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await assert.rejects(loadLanding('https://cms.example.test'), /HTTP 503/);
  });

  it('rejects an incomplete published page', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ _status: 'published', hero: seed.hero }));
    await assert.rejects(loadLanding('https://cms.example.test'));
  });

  it('accepts the Devlog route, HTTPS links, and section anchors', () => {
    for (const href of ['/devlog', '/devlog/', 'https://docs.lomi.dev', '#roadmap']) {
      assert.equal(landingSchema.safeParse({ ...seed, navigation: { ...seed.navigation, links: [{ label: 'Link', href }] } }).success, true, href);
    }
  });

  it('rejects executable, credentialed, malformed, and unknown internal links from the CMS', () => {
    for (const href of [
      'javascript:alert(1)', 'data:text/html,test', '//example.com',
      'http://example.com', 'https://user:password@example.com',
      'https:example.com', 'https:///example.com', 'https://example.com\\@evil.test',
      'https://exam\nple.com', '/unknown', '/devlog/../admin',
      '/devlog?draft=true', '/devlog//', '/%64evlog',
    ]) {
      assert.equal(landingSchema.safeParse({ ...seed, navigation: { ...seed.navigation, links: [{ label: 'Unsafe', href }] } }).success, false, href);
    }
  });

  it('keeps published CMS links usable after removing landing sections', () => {
    const publishedLinks = [
      ...['workflow', 'features', 'principles', 'faq', 'newsletter'].map((id) => ({ label: id, href: `#${id}` })),
      { label: 'Overview', href: '#workspace' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Download', href: '#download' },
      { label: 'Devlog', href: '/devlog/' },
      { label: 'Docs', href: 'https://docs.lomi.dev' },
    ];
    const original = structuredClone(publishedLinks);
    assert.deepEqual(activeLandingLinks(publishedLinks), [
      { label: 'Overview', href: '#workspace' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Download', href: 'https://github.com/lomi-dev/lomi/releases' },
      { label: 'Devlog', href: '/devlog/' },
      { label: 'Docs', href: 'https://docs.lomi.dev' },
    ]);
    assert.deepEqual(publishedLinks, original);
  });

  it('rejects unencrypted remote origins, credentials, and unexpected paths', async () => {
    for (const url of ['http://cms.example.test', 'https://user:password@cms.example.test', 'https://cms.example.test/other', 'https://cms.example.test/?draft=true']) {
      await assert.rejects(loadLanding(url), /CMS_URL/);
    }
  });
});
