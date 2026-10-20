import type { IconName } from '../components/Icon';

export const site = {
  name: 'lomi',
  github: 'https://github.com/lomi-dev/lomi',
  releases: 'https://github.com/lomi-dev/lomi/releases',
  download: '/download/',
  remote: '/remote/',
  docs: 'https://docs.lomi.dev',
};

// Use service homepages until Lomi's profile URLs are available.
export const footerSocials: { label: string; icon: IconName; href: string }[] = [
  { label: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/' },
  { label: 'X', icon: 'x', href: 'https://x.com/' },
  { label: 'LinkedIn', icon: 'linkedin', href: 'https://www.linkedin.com/' },
  { label: 'TikTok', icon: 'tiktok', href: 'https://www.tiktok.com/' },
];
