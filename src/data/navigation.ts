import type { Landing } from '../../content/landing-schema';
import { site } from './site';

const removedAnchors = new Set(['#workflow', '#principles', '#faq']);

export const agentWorkflowLinks = [
  { label: 'Claude Code in lomi', href: '/claude-code/' },
  { label: 'Codex CLI in lomi', href: '/codex/' },
];

export const workspaceResourceLinks = [
  {
    label: 'Compare coding workspaces',
    footerLabel: 'Compare workspaces',
    href: '/compare/',
    description: 'Find the right fit among terminals, agent workspaces and coding agents.',
  },
  {
    label: 'Claude Code + Codex together',
    footerLabel: 'Claude + Codex',
    href: '/claude-code-and-codex/',
    description: 'A practical workflow for implementation, review and separate working trees.',
  },
];

// Older CMS drafts may still contain links to sections removed from the page.
export function activeLandingLinks(links: Landing['navigation']['links'], layout?: readonly { section: string; enabled: boolean }[]): Landing['navigation']['links'] {
  return links.flatMap((link) => {
    const anchor = link.href.startsWith('/#') ? link.href.slice(1) : link.href;
    const legacyDownload = link.href.replace(/\/$/, '') === site.releases
      && /^download(?:\s+lomi)?$/i.test(link.label.trim());
    if (anchor === '#download' || legacyDownload) return [{ ...link, href: site.download }];
    const section = anchor === '#workspace' ? 'hero' : anchor.slice(1);
    const hidden = anchor.startsWith('#') && ['hero', 'features', 'roadmap', 'newsletter'].includes(section)
      && layout && !layout.some((row) => row.section === section && row.enabled);
    return removedAnchors.has(anchor) || hidden ? [] : [link];
  });
}
