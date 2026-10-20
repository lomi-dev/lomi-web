import { z } from 'zod';
import { isSafeHref } from './links';
import { editorDefaults } from './editor-defaults';
import { pageDefaults } from './page-defaults';
import { hydrateEditorContent } from './editor-content';
import { schemaFromDefaults } from './editor-schema';
import seed from './landing.json';

const text = z.string().trim().min(1).max(2000);
export const safeHref = text.refine(isSafeHref, 'Use an HTTPS link, email address, known website route or section anchor.');
const link = z.object({ label: text, href: safeHref });
const item = z.object({ title: text, description: text });
// Retired fields remain in Payload history, but do not constrain new edits.
const retiredText = z.string().trim().max(2000).nullish().transform((value) => value ?? '');

// Shared build-time contract. Unknown Payload IDs and timestamps are stripped.
const coreLandingSchema = z.object({
  seo: z.object({ title: text, description: text }),
  navigation: z.object({ links: z.array(link).min(1).max(6), actionLabel: text }),
  hero: z.object({
    eyebrow: retiredText, title: text, accent: text, description: text,
    primaryLabel: text, secondaryLabel: text, note: retiredText,
    previewCaption: retiredText, previewAlt: text,
  }),
  workflow: z.object({ eyebrow: text, title: text, description: text, items: z.array(item).min(1).max(6) }).catch(seed.workflow),
  features: z.object({
    eyebrow: retiredText, title: text, accent: text, description: text,
    items: z.array(item.extend({
      icon: z.enum(['terminal', 'panels', 'code', 'expand', 'git', 'spark']).catch('terminal'), detail: text,
    })).min(1).max(12),
  }),
  principles: z.object({ eyebrow: text, title: text, description: text, items: z.array(item).min(1).max(6) }).catch(seed.principles),
  roadmap: z.object({
    eyebrow: retiredText, title: text, description: text, linkLabel: text,
    items: z.array(item.extend({
      phase: text, status: z.enum(['available', 'next', 'later']),
      points: z.array(z.object({
        label: text,
        status: z.enum(['completed', 'in-progress', 'not-started']).nullish(),
      })).min(1).max(8),
    })).min(1).max(6),
  }),
  faq: z.object({
    eyebrow: text, title: text,
    items: z.array(z.object({ question: text, answer: text })).min(1).max(16),
  }).catch(seed.faq),
  download: z.object({
    eyebrow: text, title: text, accent: text, description: text,
    primaryLabel: text, secondaryLabel: text, note: text,
  }).catch(seed.download),
  newsletter: z.object({ eyebrow: retiredText, title: text, description: text }),
  footer: z.object({
    tagline: retiredText, githubLabel: text, signoff: text, backToTopLabel: text,
    licenseLabel: text, colophon: retiredText,
    groups: z.array(z.object({ title: text, links: z.array(link).min(1).max(8) })).min(1).max(4),
  }),
});

const featureItemSchema = coreLandingSchema.shape.features.shape.items.element.extend({
  image: schemaFromDefaults(null, 'features.items[].image'),
  video: schemaFromDefaults(null, 'features.items[].video'),
  alt: z.string().max(2000).nullish().transform((value) => value ?? ''),
});
const websiteSchema = coreLandingSchema.extend({
  editorVersion: z.number().int().min(0).max(1).nullish().transform((value) => value ?? 0),
  site: schemaFromDefaults(editorDefaults.site, 'site'),
  layout: schemaFromDefaults(editorDefaults.layout, 'layout'),
  pages: schemaFromDefaults(pageDefaults, 'pages'),
  navigation: z.intersection(coreLandingSchema.shape.navigation, schemaFromDefaults(editorDefaults.navigation, 'navigation')),
  footer: z.intersection(coreLandingSchema.shape.footer, schemaFromDefaults(editorDefaults.footer, 'footer')),
  newsletter: z.intersection(coreLandingSchema.shape.newsletter, schemaFromDefaults(editorDefaults.newsletter, 'newsletter')),
  hero: z.intersection(coreLandingSchema.shape.hero, schemaFromDefaults(editorDefaults.hero, 'hero')),
  features: z.intersection(coreLandingSchema.shape.features.extend({ items: z.array(featureItemSchema).min(1).max(12) }), schemaFromDefaults(editorDefaults.features, 'features')),
  roadmap: z.intersection(coreLandingSchema.shape.roadmap, schemaFromDefaults(editorDefaults.roadmap, 'roadmap')),
});
export const landingSchema = z.preprocess((value) => value && typeof value === 'object' && !Array.isArray(value)
  ? hydrateEditorContent(value as Record<string, unknown>) : value, websiteSchema);
export type Landing = z.infer<typeof landingSchema>;
