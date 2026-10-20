import { z } from 'zod';
import { mediaAssetSchema, youtubeVideoId } from './editor-schema';

export const devlogFields = {
  title: z.string().trim().min(1).max(160),
  description: z.preprocess((value) => value ?? '', z.string().trim().max(1000)),
  videoUrl: z.string().trim().max(2000).refine((value) => Boolean(youtubeVideoId(value)), 'Enter an HTTPS YouTube watch, share, shorts or embed URL.'),
  publishedAt: z.iso.datetime({ offset: true }),
  duration: z.preprocess((value) => value ?? '', z.string().trim().max(12).regex(/^(?:|(?:\d{1,3}:)?[0-5]?\d:[0-5]\d)$/, 'Use m:ss or h:mm:ss, or leave empty.')),
  thumbnailAlt: z.preprocess((value) => value ?? '', z.string().trim().max(500)),
  thumbnail: z.preprocess((value) => value ?? null, mediaAssetSchema.refine((asset) => asset.mimeType.startsWith('image/'), 'Choose an image for the thumbnail.').nullable()),
};

export const devlogSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[A-Za-z0-9_-]+$/)]),
  _status: z.literal('published'),
  ...devlogFields,
});
export type Devlog = z.infer<typeof devlogSchema>;

/** Normalize destinations so authored parameters cannot change the link's behavior. */
export function devlogWatchUrl(videoUrl: string) {
  const id = youtubeVideoId(videoUrl);
  if (!id) throw new Error('Invalid Devlog YouTube URL.');
  return `https://www.youtube.com/watch?v=${id}`;
}
