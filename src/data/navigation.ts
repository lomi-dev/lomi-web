import type { Landing } from '../../content/landing-schema';
import { site } from './site';

const removedAnchors = new Set(['#workflow', '#principles', '#faq', '#newsletter']);

// Older CMS drafts may still contain links to sections removed from the page.
export function activeLandingLinks(links: Landing['navigation']['links']): Landing['navigation']['links'] {
  return links.flatMap((link) => {
    const anchor = link.href.startsWith('/#') ? link.href.slice(1) : link.href;
    if (anchor === '#download') return [{ ...link, href: site.releases }];
    return removedAnchors.has(anchor) ? [] : [link];
  });
}
