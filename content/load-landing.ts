import seed from './landing.json';
import { landingSchema, type Landing } from './landing-schema';

export async function loadLanding(cmsUrl?: string): Promise<Landing> {
  if (!cmsUrl) return landingSchema.parse(seed);

  const origin = new URL(cmsUrl);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && isLocal)) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('CMS_URL must be an HTTPS origin (HTTP is allowed on localhost).');
  }

  const url = new URL('/api/globals/landing?depth=0&draft=false', origin);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Could not load published landing content: HTTP ${response.status}.`);
  const content: unknown = await response.json();
  if (!content || typeof content !== 'object' || !('_status' in content) || content._status !== 'published') {
    throw new Error('The CMS must return published landing content. Publish the page before building.');
  }
  return landingSchema.parse(content);
}
