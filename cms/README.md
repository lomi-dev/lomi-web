# Lomi content admin

A separate Payload CMS app for the launch landing page. The Astro site has its
own dependencies and build; run the following commands from `cms/` using Node
22.16+ (Node 22 LTS) and Bun. The CMS build also needs `../content/links.ts`,
the pure link policy shared with Astro. Deploy from a checkout containing both
`cms/` and `content/`; the Turbopack root includes their common parent.

```sh
bun install --frozen-lockfile
cp .env.example .env
# Set PAYLOAD_SECRET in .env (openssl rand -hex 32 produces a suitable value).
bun run seed
bun run dev
```

Open <http://localhost:3001/admin> and create the first administrator using
Payload's first-user form. There are no default credentials. All CMS users are
administrators; after the first account exists, only signed-in administrators
can create or manage users. Finish account creation before exposing the service
to the public. Configure `NEXT_PUBLIC_SERVER_URL` with the CMS's HTTPS origin
when hosting it.

The **Launch landing page** global contains all fields from
`../content/landing.json`. Navigation and footer destinations accept HTTPS URLs,
simple section anchors such as `#features`, or the local `/devlog/` route.
Feature icons and roadmap statuses have fixed choices matching the site. Save drafts while editing, then publish
when ready. The CMS retains up to 20 versions. Authenticated administrators can
read drafts and history; public requests see only published content.

The public REST endpoint is:

```text
http://localhost:3001/api/globals/landing?depth=0&draft=false
```

Set the Astro site's `CMS_URL` to the CMS origin to use this content during
its build. Publishing does not rebuild Astro: rebuild and redeploy the site to
show newly published content. No preview route or publishing webhook is included.
The CMS is separate from the static site's host.

`bun run seed` manually imports and publishes the checked-in JSON only when no
landing content or draft versions exist. Repeating it never overwrites edits.
It does not create an account and never runs automatically during startup.

```sh
bun run check          # TypeScript
bun run test           # Isolated SQLite integration checks
bun run generate:types # Regenerate Payload types after schema changes
bun run build          # Generate the admin import map and build Next.js
bun run start          # Serve the production build on port 3001
```

`PAYLOAD_SECRET` is required for every CMS command, including build. Keep it
stable and private. Local SQLite defaults to `file:./data/payload.db` relative to
`cms/`; `data/` is ignored by Git. Hosting requires a persistent, writable volume
and a single CMS instance for this local database. Set `DATABASE_URL` to a
`file:` URL on that volume. Back up the SQLite database and protect the secret.
Do not use an ephemeral/serverless filesystem for production storage.

Payload's SQLite adapter applies the schema automatically in development.
Before changing an existing production schema, create and apply Payload database
migrations (`bunx payload migrate:create`, then `bunx payload migrate`). The
initial schema migration is checked in and must be applied before the first
production start. Run `bunx payload migrate` with the production environment.

No email transport is configured: Payload logs emails locally. Configure a
production email adapter before relying on password-reset email delivery.
