import type { SVGProps } from 'react';

const paths = {
  arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
  diagonal: <><path d="M7 17 17 7M7 7h10v10" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
  panels: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M10 4v16m0-9h11" /></>,
  git: <><circle cx="7" cy="6" r="3" /><circle cx="7" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M7 9v6m11-6a9 9 0 0 1-8 9" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></>,
  play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
  replay: <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />,
  volume: <path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />,
  muted: <path d="m11 4-6 5H2v6h3l6 5ZM17 9l5 6m0-6-5 6" />,
  minimize: <path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" />,
  code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></>,
  github: <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.2-1.5 6.2-6.9a5.4 5.4 0 0 0-1.5-3.7A5 5 0 0 0 18.7.4S17.5 0 15 1.8a13.4 13.4 0 0 0-7 0C5.5 0 4.3.4 4.3.4a5 5 0 0 0-.1 3.7 5.4 5.4 0 0 0-1.5 3.8c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 0 0-.9 2.7v3.9" />,
  // Iconify tabler:brand-* geometry, MIT; see public/icons/LICENSE-tabler-MIT.txt.
  youtube: <g strokeWidth="2"><path d="M2 8a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="m10 9l5 3l-5 3z" /></g>,
  x: <path strokeWidth="2" d="m4 4l11.733 16H20L8.267 4zm0 16l6.768-6.768m2.46-2.46L20 4" />,
  linkedin: <g strokeWidth="2"><path d="M8 11v5m0-8v.01M12 16v-5m4 5v-3a2 2 0 1 0-4 0" /><path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /></g>,
  tiktok: <path strokeWidth="2" d="M21 7.917v4.034A9.95 9.95 0 0 1 16 10v4.5a6.5 6.5 0 1 1-8-6.326V12.5a2.5 2.5 0 1 0 4 2V3h4.083A6.005 6.005 0 0 0 21 7.917" />,
  apple: <path d="M16.5 2c.2 1.3-.4 2.5-1.2 3.3-.8.8-1.9 1.3-3.1 1.2-.1-1.2.5-2.4 1.2-3.2.9-.8 2-1.3 3.1-1.3ZM20 16c-.5 1.2-.8 1.8-1.5 2.9-.9 1.2-2.2 2.8-3.7 2.8-1.3 0-1.6-.9-3.4-.9s-2.1.9-3.4.9c-1.5 0-2.7-1.4-3.6-2.6-2.5-3.5-2.8-7.7-1.3-9.9C4.2 7.7 5.8 6.9 7.4 7c1.4 0 2.4.9 3.6.9s2-1 3.7-1c1.4 0 2.9.8 4 2.1-3.5 1.9-3 6.1 1.3 7Z" />,
  windows: <><path d="m3 5 8-1v7H3Zm10-1 8-1v8h-8ZM3 13h8v7l-8-1Zm10 0h8v8l-8-1Z" /></>,
  linux: <><path d="M8 9V7a4 4 0 0 1 8 0v2l3 7-2 4h-3l-2-1-2 1H7l-2-4Z" /><path d="m10 10 2 2 2-2M10 7h.01M14 7h.01M8 15l-1 5m9-5 1 5" /></>,
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
