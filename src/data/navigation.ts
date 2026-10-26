import type { Landing } from '../../content/landing-schema';
import { site } from './site';

const removedAnchors = new Set(['#workflow', '#principles', '#faq', '#roadmap']);

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

// Keep older published Product menus in step with the current workspace routes.
// Empty menus and unrelated authored groups remain under the editor's control.
export function activeProductGroups(groups: Landing['navigation']['productGroups'], layout?: readonly { section: string; enabled: boolean }[]): Landing['navigation']['productGroups'] {
  const target = (href: string) => href.startsWith('/#') ? href.slice(1) : href.replace(/\/$/, '');
  const active = groups.map((group) => ({
    ...group,
    links: activeLandingLinks(group.links, layout).filter((link) => target(link.href) !== '#workspace'),
  })).filter((group) => group.links.length);
  const workspace = active.find((group) => group.links.some((link) =>
    ['#features', '/remote', '/mobile-app'].includes(target(link.href))));
  const hasMobile = active.some((group) => group.links.some((link) => target(link.href) === '/mobile-app'));
  if (workspace && !hasMobile) workspace.links.push({ label: 'Mobile App', href: '/mobile-app/' });

  const featureGroup = active.findIndex((group) => group.links.some((link) => target(link.href) === '#features'));
  if (featureGroup !== -1) {
    const [group] = active.splice(featureGroup, 1);
    const feature = group.links.findIndex((link) => target(link.href) === '#features');
    group.links.unshift(...group.links.splice(feature, 1));
    active.unshift(group);
  }
  return active;
}
