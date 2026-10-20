// Keep CMS authoring and build-time validation on the same link policy.
export function isSafeHref(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const href = value.trim();
  if (!href || href.length > 2000 || /[\u0000-\u0020\u007f\\]/.test(href)) return false;
  if (['/devlog', '/devlog/', '/download', '/download/', '/remote', '/remote/'].includes(href)) return true;
  if (/^#[a-z][a-z0-9-]*$/.test(href)) return true;
  if (!/^https:\/\/[^/?#]/.test(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
