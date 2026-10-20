import { z } from 'zod';
import { devlogSchema, type Devlog } from './devlog-schema';

const responseSchema = z.object({
  docs: z.array(devlogSchema).max(100),
  hasNextPage: z.boolean(),
  nextPage: z.number().int().positive().nullable(),
});

/** Fetch only published episodes at build time. An unavailable CMS fails the build. */
export async function loadDevlogs(cmsUrl?: string): Promise<Devlog[]> {
  if (!cmsUrl) return [];
  const origin = new URL(cmsUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('CMS_URL must be an HTTPS origin (HTTP is allowed on localhost).');
  }
  const episodes: Devlog[] = [];
  const ids = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const url = new URL('/api/devlogs', origin);
    url.search = new URLSearchParams({ depth: '1', draft: 'false', limit: '100', page: String(page), sort: '-publishedAt,-id', 'where[_status][equals]': 'published' }).toString();
    const response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Could not load published Devlogs: HTTP ${response.status}.`);
    const feed = responseSchema.parse(await response.json());
    for (const episode of feed.docs) {
      const id = String(episode.id);
      if (ids.has(id)) throw new Error('The CMS returned a duplicate Devlog.');
      ids.add(id);
      episodes.push(episode);
    }
    if (!feed.hasNextPage) return episodes.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    if (!feed.docs.length || feed.nextPage !== page + 1) throw new Error('The CMS returned invalid Devlog pagination.');
  }
  throw new Error('The Devlog archive exceeds the build-time page limit.');
}
