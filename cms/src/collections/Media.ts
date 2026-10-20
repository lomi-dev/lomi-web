import path from 'node:path'
import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Media file', plural: 'Media library' },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: { useAsTitle: 'alt', description: 'Upload images and videos used throughout the website. Add useful alternative text for meaningful images.' },
  upload: {
    // Runtime storage is mounted by the host, outside the bundled app.
    staticDir: path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_UPLOAD_DIR || 'data/media'),
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm'],
    filesRequiredOnCreate: true,
  },
  fields: [{ name: 'alt', label: 'Alternative text', type: 'text', maxLength: 2000, admin: { description: 'Describe the image for screen readers. Page or feature alternative text can override this description. Leave empty only for decorative assets.' } }],
}
