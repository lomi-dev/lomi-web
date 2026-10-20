import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';
import { devlogSchema, devlogWatchUrl } from '../content/devlog-schema';
import { loadDevlogs } from '../content/load-devlogs';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const episode = (id = 1, publishedAt = '2026-10-20T12:00:00Z') => ({ id, _status: 'published', title: 'A test episode', videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=tracking', publishedAt });
const feed = (docs: unknown[] = [], hasNextPage = false, nextPage: number | null = null) => ({ docs, hasNextPage, nextPage });

describe('Devlog content', () => {
  it('normalizes optional fields without generating an episode', () => {
    expect(devlogSchema.parse(episode())).toMatchObject({ thumbnail: null, thumbnailAlt: '', description: '', duration: '' });
    expect(devlogSchema.safeParse({ _status: 'published' }).success).toBe(false);
  });

  it('accepts valid YouTube forms and removes authored parameters from destinations', () => {
    for (const url of ['https://youtu.be/dQw4w9WgXcQ?si=x', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=example', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) {
      expect(devlogSchema.safeParse({ ...episode(), videoUrl: url }).success).toBe(true);
      expect(devlogWatchUrl(url)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    }
  });

  it('rejects drafts, missing publication fields, unsafe video URLs, dates and durations', () => {
    for (const patch of [
      { _status: 'draft' }, { title: '  ' }, { title: 'x'.repeat(161) },
      { videoUrl: 'javascript:alert(1)' }, { videoUrl: 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ' },
      { videoUrl: 'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ' }, { videoUrl: 'http://youtu.be/dQw4w9WgXcQ' },
      { publishedAt: 'not a date' }, { publishedAt: '2026-02-30T00:00:00Z' }, { duration: '10:99' }, { duration: '-1:00' },
      { thumbnail: 12 }, { thumbnail: { id: 12, url: '/api/media/file/video.mp4', mimeType: 'video/mp4' } },
    ]) expect(devlogSchema.safeParse({ ...episode(), ...patch }).success).toBe(false);
    for (const duration of ['', '0:59', '12:34', '1:03:12']) expect(devlogSchema.safeParse({ ...episode(), duration }).success).toBe(true);
    expect(() => devlogWatchUrl('https://evil.test/')).toThrow();
  });
});

describe('published Devlog feed', () => {
  it('returns an empty archive without a CMS or any network requests', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'));
    expect(await loadDevlogs()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests published populated rows, paginates and sorts newest first', async () => {
    const fetch = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(feed([episode(1, '2026-10-18T00:00:00Z')], true, 2)))
      .mockResolvedValueOnce(Response.json(feed([episode(2)])));
    expect((await loadDevlogs('http://127.0.0.1:3001')).map(({ id }) => id)).toEqual([2, 1]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, call] of fetch.mock.calls.entries()) {
      const url = new URL(String(call[0]));
      expect(url.pathname).toBe('/api/devlogs');
      expect(Object.fromEntries(url.searchParams)).toEqual({ depth: '1', draft: 'false', limit: '100', page: String(index + 1), sort: '-publishedAt,-id', 'where[_status][equals]': 'published' });
      expect(call[1]?.redirect).toBe('error');
    }
  });

  it('keeps an empty published collection empty', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(feed()));
    expect(await loadDevlogs('https://cms.example.test')).toEqual([]);
  });

  it('fails on CMS outages, drafts or malformed pagination rather than deploying an empty archive', async () => {
    const fetch = spyOn(globalThis, 'fetch');
    for (const response of [new Response('', { status: 503 }), Response.json(feed([{ ...episode(), _status: 'draft' }])), Response.json(feed([episode()], true, 1)), Response.json(feed([], true, 2)), Response.json({})]) {
      fetch.mockResolvedValueOnce(response);
      await assert.rejects(loadDevlogs('https://cms.example.test'));
    }
    fetch.mockResolvedValueOnce(Response.json(feed([episode()], true, 2))).mockResolvedValueOnce(Response.json(feed([episode()])));
    await assert.rejects(loadDevlogs('https://cms.example.test'), /duplicate/);
  });

  it('rejects unsafe CMS origins before fetching', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'));
    for (const url of ['http://cms.example.test', 'https://user:pass@cms.example.test', 'https://cms.example.test/admin', 'https://cms.example.test/?draft=true', 'https://cms.example.test/#draft']) await assert.rejects(loadDevlogs(url), /CMS_URL/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
