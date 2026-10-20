/// <reference types="bun" />
import { afterEach, describe, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';
import seed from '../content/landing.json';
import { landingSchema, safeHref } from '../content/landing-schema';
import { loadLanding } from '../content/load-landing';
import { summarizeRoadmapStage } from '../content/roadmap-progress';
import { activeLandingLinks } from '../src/data/navigation';

afterEach(() => { globalThis.fetch = originalFetch; });
const originalFetch = globalThis.fetch;

describe('roadmap task progress', () => {
  const stage = seed.roadmap.items[0];

  it('uses authored statuses and counts only completed tasks', () => {
    const parsed = landingSchema.parse({ ...seed, roadmap: { ...seed.roadmap, items: [{
      ...stage, status: 'available', points: [
        { label: 'Done', status: 'completed' },
        { label: 'Building', status: 'in-progress' },
        { label: 'Planned', status: 'not-started' },
      ],
    }] } });
    assert.deepEqual(summarizeRoadmapStage(parsed.roadmap.items[0]), {
      tasks: parsed.roadmap.items[0].points,
      completed: 1, total: 3, percent: 33,
    });
  });

  it('inherits milestone status for missing and null task statuses', () => {
    for (const status of ['available', 'next', 'later'] as const) {
      const result = summarizeRoadmapStage({ ...stage, status, points: [{ label: 'Legacy' }, { label: 'Unset', status: null }] });
      const expected = status === 'available' ? 'completed' : 'not-started';
      assert.deepEqual(result.tasks, [{ label: 'Legacy', status: expected }, { label: 'Unset', status: expected }]);
      assert.equal(result.completed, status === 'available' ? 2 : 0);
      assert.equal(result.total, 2);
      assert.equal(result.percent, status === 'available' ? 100 : 0);
      assert.equal(landingSchema.safeParse({ ...seed, roadmap: { ...seed.roadmap, items: [{ ...stage, status, points: [{ label: 'Unset', status: null }] }] } }).success, true);
    }
  });

  it('rejects unsupported task statuses', () => {
    assert.equal(landingSchema.safeParse({ ...seed, roadmap: { ...seed.roadmap, items: [{
      ...stage, points: [{ label: 'Invalid', status: 'done' }],
    }] } }).success, false);
  });
});

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

  it('accepts the Devlog, Download, and Remote routes, HTTPS links, and section anchors', () => {
    for (const href of ['/devlog', '/devlog/', '/download', '/download/', '/remote', '/remote/', 'https://docs.lomi.dev', '#roadmap']) {
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
      '/download/../admin', '/download?draft=true', '/download//', '/%64ownload',
      '/remote/../admin', '/remote?draft=true', '/remote/?draft=true',
      '/remote//', '/%72emote', '/remote/%2e%2e/admin', '/remote#section',
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
      { label: 'features', href: '#features' },
      { label: 'newsletter', href: '#newsletter' },
      { label: 'Overview', href: '#workspace' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Download', href: '/download/' },
      { label: 'Devlog', href: '/devlog/' },
      { label: 'Docs', href: 'https://docs.lomi.dev' },
    ]);
    assert.deepEqual(publishedLinks, original);
  });

  it('normalizes legacy download destinations without changing release notes', () => {
    const releases = 'https://github.com/lomi-dev/lomi/releases';
    const links = [
      { label: 'Download', href: '/#download' },
      { label: 'Download', href: releases },
      { label: 'Download lomi', href: `${releases}/` },
      { label: 'Release notes', href: releases },
      { label: 'Releases', href: `${releases}/` },
      { label: 'Download', href: 'https://example.test/releases' },
      { label: 'Download', href: '/download/' },
    ];
    assert.deepEqual(activeLandingLinks(links), [
      { label: 'Download', href: '/download/' },
      { label: 'Download', href: '/download/' },
      { label: 'Download lomi', href: '/download/' },
      ...links.slice(3),
    ]);
  });

  it('trims an authored download URL before exposing it to the page', () => {
    assert.equal(safeHref.parse('  /download/  '), '/download/');
  });

  it('preserves feature links that point back to the landing page', () => {
    assert.deepEqual(activeLandingLinks([{ label: 'Features', href: '/#features' }]), [
      { label: 'Features', href: '/#features' },
    ]);
  });

  it('preserves newsletter links that point back to the landing page', () => {
    assert.deepEqual(activeLandingLinks([{ label: 'Newsletter', href: '/#newsletter' }]), [
      { label: 'Newsletter', href: '/#newsletter' },
    ]);
  });

  it('rejects unencrypted remote origins, credentials, and unexpected paths', async () => {
    for (const url of ['http://cms.example.test', 'https://user:password@cms.example.test', 'https://cms.example.test/other', 'https://cms.example.test/?draft=true']) {
      await assert.rejects(loadLanding(url), /CMS_URL/);
    }
  });
});
