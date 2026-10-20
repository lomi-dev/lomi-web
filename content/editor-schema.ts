import { z } from 'zod';
import { isSafeHref } from './links';

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(host)
        ? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]
        : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function isSafeMediaURL(value: string): boolean {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value, 'https://cms.invalid');
    if (url.username || url.password || url.hash) return false;
    if (value.startsWith('/')) return value.startsWith('/api/media/file/') && url.pathname.startsWith('/api/media/file/');
    return url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export const mediaAssetSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  url: z.string().refine(isSafeMediaURL, 'Choose a valid uploaded media file.'),
  alt: z.string().max(2000).nullish().transform((value) => value ?? ''),
  mimeType: z.string().regex(/^(image\/(?:png|jpeg|webp|avif|gif)|video\/(?:mp4|webm))$/),
  width: z.number().int().positive().max(100000).nullish(),
  height: z.number().int().positive().max(100000).nullish(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

/** Null slots in the editor defaults represent optional upload relationships. */
export type Editable<T> = T extends null ? MediaAsset | null
  : T extends string ? string : T extends boolean ? boolean : T extends number ? number
    : T extends readonly (infer U)[] ? Editable<U>[]
      : T extends object ? { [K in keyof T]: Editable<T[K]> } : never;

/** The same default tree defines the editor and the build-time content contract. */
export function schemaFromDefaults<T>(defaults: T, path = ''): z.ZodType<Editable<T>> {
  let schema: z.ZodType;
  if (defaults === null) schema = mediaAssetSchema.refine((asset) =>
    asset.mimeType.startsWith(path.split('.').at(-1) === 'video' ? 'video/' : 'image/'),
    'Choose the appropriate image or video file.').nullable();
  else if (Array.isArray(defaults)) {
    if (!defaults.length) throw new Error(`Editor arrays need a row template: ${path}`);
    schema = z.array(schemaFromDefaults(defaults[0], `${path}[]`)).max(50);
    if (path === 'layout') schema = schema.refine((rows) => {
      const names = (rows as { section: string }[]).map((row) => row.section);
      return new Set(names).size === names.length;
    }, 'Each homepage section can appear only once.');
  } else if (typeof defaults === 'object') {
    schema = z.object(Object.fromEntries(Object.entries(defaults as object).map(([key, value]) =>
      [key, schemaFromDefaults(value, path ? `${path}.${key}` : key)])));
  } else if (typeof defaults === 'boolean') schema = z.boolean();
  else if (typeof defaults === 'number') schema = z.number().min(0).max(1000000);
  else {
    const key = path.split('.').at(-1) ?? '';
    let stringSchema = z.string().trim().max(20000);
    if (String(defaults).length && !['accent', 'eyebrow', 'note', 'caption'].includes(key)) stringSchema = stringSchema.min(1);
    schema = stringSchema;
    if (/^(?:section)$/.test(key)) schema = z.enum(['hero', 'features', 'roadmap', 'newsletter']);
    else if (key === 'mediaMode') schema = z.enum(['image', 'youtube', 'video']);
    else if (path.startsWith('site.theme.')) schema = stringSchema.regex(/^#[a-fA-F0-9]{6}$/, 'Use a six-digit hex color, such as #c8ff3d.');
    else if (key === 'videoUrl') schema = stringSchema.refine((value) => Boolean(youtubeVideoId(value)), 'Enter an HTTPS YouTube watch, share or embed URL.');
    else if (/(?:href|url)$/i.test(key)) schema = stringSchema.refine(isSafeHref, 'Use a safe HTTPS link or a supported website route.');
    else if (path.includes('footer.socials') && key === 'icon') schema = z.enum(['youtube', 'x', 'linkedin', 'tiktok']);
  }
  // Existing published documents and drafts can contain null for new columns.
  return z.preprocess((value) => value == null ? structuredClone(defaults) : value, schema) as z.ZodType<Editable<T>>;
}

export function resolveMedia(asset: MediaAsset | null | undefined, cmsOrigin?: string): MediaAsset | null {
  if (!asset) return null;
  const parsed = mediaAssetSchema.parse(asset);
  if (!parsed.url.startsWith('/')) return parsed;
  if (!cmsOrigin) throw new Error('Relative uploaded media requires CMS_URL.');
  const url = new URL(parsed.url, cmsOrigin).href;
  if (!isSafeMediaURL(url)) throw new Error('Unsafe CMS media origin.');
  return { ...parsed, url };
}
