import { z } from 'zod';
import { isSafeHref } from './links';

const text = z.string().trim().min(1).max(2000);
export const safeHref = text.refine(isSafeHref, 'Use an HTTPS URL, /devlog/, /download/, /remote/, or a section anchor.');
const link = z.object({ label: text, href: safeHref });
const item = z.object({ title: text, description: text });

// Shared build-time contract. Unknown Payload IDs and timestamps are stripped.
export const landingSchema = z.object({
  seo: z.object({ title: text, description: text }),
  navigation: z.object({ links: z.array(link).min(1).max(6), actionLabel: text }),
  hero: z.object({
    eyebrow: text, title: text, accent: text, description: text,
    primaryLabel: text, secondaryLabel: text, note: text,
    previewCaption: text, previewAlt: text,
  }),
  workflow: z.object({ eyebrow: text, title: text, description: text, items: z.array(item).min(1).max(6) }),
  features: z.object({
    eyebrow: text, title: text, accent: text, description: text,
    items: z.array(item.extend({
      icon: z.enum(['terminal', 'panels', 'code', 'expand', 'git', 'spark']), detail: text,
    })).min(1).max(12),
  }),
  principles: z.object({ eyebrow: text, title: text, description: text, items: z.array(item).min(1).max(6) }),
  roadmap: z.object({
    eyebrow: text, title: text, description: text, linkLabel: text,
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
  }),
  download: z.object({
    eyebrow: text, title: text, accent: text, description: text,
    primaryLabel: text, secondaryLabel: text, note: text,
  }),
  newsletter: z.object({ eyebrow: text, title: text, description: text }),
  footer: z.object({
    tagline: text, githubLabel: text, signoff: text, backToTopLabel: text,
    licenseLabel: text, colophon: text,
    groups: z.array(z.object({ title: text, links: z.array(link).min(1).max(8) })).min(1).max(4),
  }),
});

export type Landing = z.infer<typeof landingSchema>;
