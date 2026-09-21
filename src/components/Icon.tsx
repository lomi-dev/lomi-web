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
  code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" /></>,
  github: <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.2-1.5 6.2-6.9a5.4 5.4 0 0 0-1.5-3.7A5 5 0 0 0 18.7.4S17.5 0 15 1.8a13.4 13.4 0 0 0-7 0C5.5 0 4.3.4 4.3.4a5 5 0 0 0-.1 3.7 5.4 5.4 0 0 0-1.5 3.8c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 0 0-.9 2.7v3.9" />,
  apple: <path d="M16.5 2c.2 1.3-.4 2.5-1.2 3.3-.8.8-1.9 1.3-3.1 1.2-.1-1.2.5-2.4 1.2-3.2.9-.8 2-1.3 3.1-1.3ZM20 16c-.5 1.2-.8 1.8-1.5 2.9-.9 1.2-2.2 2.8-3.7 2.8-1.3 0-1.6-.9-3.4-.9s-2.1.9-3.4.9c-1.5 0-2.7-1.4-3.6-2.6-2.5-3.5-2.8-7.7-1.3-9.9C4.2 7.7 5.8 6.9 7.4 7c1.4 0 2.4.9 3.6.9s2-1 3.7-1c1.4 0 2.9.8 4 2.1-3.5 1.9-3 6.1 1.3 7Z" />,
  windows: <><path d="m3 5 8-1v7H3Zm10-1 8-1v8h-8ZM3 13h8v7l-8-1Zm10 0h8v8l-8-1Z" /></>,
  linux: <><path d="M8 9V7a4 4 0 0 1 8 0v2l3 7-2 4h-3l-2-1-2 1H7l-2-4Z" /><path d="m10 10 2 2 2-2M10 7h.01M14 7h.01M8 15l-1 5m9-5 1 5" /></>,
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
