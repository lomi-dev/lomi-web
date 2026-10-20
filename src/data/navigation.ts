import type { Landing } from '../../content/landing-schema';
import { site } from './site';

const removedAnchors = new Set(['#workflow', '#principles', '#faq']);

// Older CMS drafts may still contain links to sections removed from the page.
export function activeLandingLinks(links: Landing['navigation']['links']): Landing['navigation']['links'] {
  return links.flatMap((link) => {
    const anchor = link.href.startsWith('/#') ? link.href.slice(1) : link.href;
    const legacyDownload = link.href.replace(/\/$/, '') === site.releases
      && /^download(?:\s+lomi)?$/i.test(link.label.trim());
    if (anchor === '#download' || legacyDownload) return [{ ...link, href: site.download }];
    return removedAnchors.has(anchor) ? [] : [link];
  });
}
