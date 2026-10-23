import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function sitemapWithoutEmptyDevlog() {
  let config;
  let outputDirectory;
  const integration = sitemap({
    serialize: async (item) => {
      // Sitemap serialization receives URLs only, so inspect the generated page
      // metadata instead of making a second CMS request for episode state.
      const devlogUrl = new URL('devlog/', new URL(config.base, config.site));
      const itemPath = new URL(item.url).pathname;
      if (itemPath !== devlogUrl.pathname && itemPath !== devlogUrl.pathname.replace(/\/$/, '')) return item;

      const pageFile = config.build.format === 'file' ? 'devlog.html' : join('devlog', 'index.html');
      const html = await readFile(join(outputDirectory, pageFile), 'utf8');
      const robotsTag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0];
      return robotsTag && /\bnoindex\b/i.test(robotsTag) ? undefined : item;
    },
  });
  const configDone = integration.hooks['astro:config:done'];
  const buildDone = integration.hooks['astro:build:done'];

  return {
    ...integration,
    hooks: {
      ...integration.hooks,
      'astro:config:done': async (context) => {
        config = context.config;
        await configDone?.(context);
      },
      'astro:build:done': async (context) => {
        outputDirectory = fileURLToPath(context.dir);
        const robotsFile = join(outputDirectory, 'robots.txt');
        const robots = await readFile(robotsFile, 'utf8');
        const sitemapDirective = `Sitemap: ${new URL('sitemap-index.xml', new URL(config.base, config.site)).href}`;
        const directivePattern = /^Sitemap:\s*\S+.*$/m;
        await writeFile(robotsFile, directivePattern.test(robots)
          ? robots.replace(directivePattern, sitemapDirective)
          : `${robots.trimEnd()}\n\n${sitemapDirective}\n`);
        await buildDone?.(context);
      },
    },
  };
}

export default defineConfig({
  site: process.env.SITE_URL || 'https://lomi.dev',
  output: 'static',
  integrations: [react(), sitemapWithoutEmptyDevlog()],
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
});
