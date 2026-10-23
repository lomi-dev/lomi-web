# Coolify production deployment

Deploy this repository as two Dockerfile applications in the Lomi production
environment. Both builds use the repository root as their build context and
Node.js 22 with Bun 1.3.14. The website is static; Payload runs continuously and
keeps its SQLite database and uploaded media on one persistent disk.

| Setting | Website | Payload CMS |
| --- | --- | --- |
| Repository | `lomi-dev/lomi-web` | `lomi-dev/lomi-web` |
| Build pack | Dockerfile | Dockerfile |
| Base directory | `/` | `/` |
| Dockerfile | `/Dockerfile.site` | `/Dockerfile.cms` |
| Container port | `80` | `3001` |
| Public domains | `https://lomi.dev`, `https://www.lomi.dev` | `https://cms.lomi.dev` |
| Persistent mount | None | `/app/cms/data` |
| Replicas | One or more | **Exactly one** |
| Container naming | Default | **Consistent name (no rolling updates)** |

The site redirects `www.lomi.dev` to its canonical `https://lomi.dev` origin,
preserving the path and query. Configure HTTPS redirects and valid origin
certificates in Coolify. Keep the CMS container port private to the Docker
network; expose only HTTPS through the proxy. Both images include health checks.
For the CMS, select **Advanced → Container naming → Consistent name (no rolling
updates)** so Coolify stops the old process before starting its replacement.
The SQLite migration and CMS scheduler must never overlap another CMS instance.
CMS restarts briefly interrupt admin and media requests; the static website
continues serving from its separate container.

## CMS environment

Set `NEXT_PUBLIC_SERVER_URL=https://cms.lomi.dev` for both build and runtime.
Set the following only at runtime, keeping secrets out of build arguments:

```dotenv
PAYLOAD_SECRET=<independent random secret of at least 32 bytes>
DATABASE_URL=file:/app/cms/data/payload.db
MEDIA_UPLOAD_DIR=/app/cms/data/media
CMS_ADMIN_EMAIL=<an email address you control>
CMS_ADMIN_PASSWORD=<unique random password, at least 16 characters>
```

Attach a named persistent volume to `/app/cms/data` before the first start.
The container applies the checked-in migrations, creates its first administrator,
seeds the initial published website, and recovers interrupted rebuild jobs
before listening on port 3001. Startup
fails when a new database has no administrator credentials. An existing account,
published edits, drafts, and uploaded files survive restarts and redeployments.
Remove `CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD` from the service environment
after successful initialization; later starts do not need them or change users.
Keep `PAYLOAD_SECRET` stable across deployments. Production login cookies require
HTTPS. Sign in at `https://cms.lomi.dev/admin`.

For a new deployment, initialize an empty production database using migrations.
Do not copy the development `cms/data/payload.db` into production: it uses
development schema push rather than the production migration history.
If migrating existing authored content, back it up and plan a separate import;
the startup seed never overwrites edits or drafts.

No email adapter is configured. Administrators can change their password while
signed in; password-reset emails require a separately configured email adapter.
Store the initial password securely until login and password change succeed.

## Website environment and rollout order

Deploy and verify the CMS first. Then configure these website **build** values:

```dotenv
CMS_URL=https://cms.lomi.dev
SITE_URL=https://lomi.dev
```

The build fetches only published website content and Devlogs. It fails on an
unavailable CMS, invalid content, or draft responses. Uploaded media remains
publicly served by the CMS, so its domain must stay available to visitors.

Only configure `PUBLIC_NEWSLETTER_ENDPOINT` when the existing auth service's
newsletter backend has been qualified and enabled according to
`../auth-app/NEWSLETTER.md`. This public build value is an HTTPS subscribe URL,
never a provider key. The website otherwise shows its existing unavailable
newsletter state. Do not deploy `PUBLIC_PLUNK_API_KEY`.

Enable automatic rebuilds only after the first website deployment succeeds, as
described below. Verify the full flow by publishing a small reversible change,
waiting for the build to finish, checking the public page, and restoring the
original content through the CMS.

## Rebuilds after publication

Set the following on the CMS at **runtime only**:

```dotenv
SITE_REBUILD_URL=https://<coolify-host>/api/v1/deploy?uuid=<website-uuid>&force=true
SITE_REBUILD_TOKEN=<Coolify API token with deployment permission>
```

Keep `force=true`: CMS publication does not change the Git commit, so reusing
an existing image or cached build would retain the previous static content.
Use the website application's UUID, never the CMS UUID. Limit the token's team
and abilities to the deployment needs of this integration. Its bearer token
stays server-side and is not stored in content or queue input.

Published website and Devlog changes, publication removals, and public media
changes enqueue a durable Payload job in the same database transaction. Draft
saves do not trigger a website build. The long-running CMS processes the queue
once per minute, after the content transaction commits. Pending requests are
coalesced and failed webhook calls are retried. Allow the queue interval plus
the website build time before checking the public page. Monitor the website's
deployment result in Coolify: an accepted rebuild request does not prove the
subsequent build succeeded.
Interrupted in-flight jobs are reclaimed on the next CMS start, before the
scheduler starts. Recovery may repeat an accepted rebuild request after a crash;
the task carries no content changes and rebuilding current published data is safe.

Without these two variables, publishing remains available and the website must
be rebuilt manually in Coolify. Never add the rebuild token to browser code,
public environment variables, URLs containing credentials, or Git.

## DNS and verification

Inspect the existing Cloudflare records and routing before changing DNS. Reuse
the existing origin or tunnel convention used by the other `lomi.dev` services.
Update only the website, `www`, and CMS hostnames; retain mail records and other
applications. Use valid TLS from Cloudflare to the origin as well as to visitors.

Before declaring the deployment complete, verify:

- HTTPS certificates, HTTP-to-HTTPS redirects, and the `www` canonical redirect.
- Home, Download, Remote, Devlog, Cookies, and the legal-information routes.
- CMS login and logout, authenticated edits, media upload, and public media reads.
- Anonymous users cannot create users, upload media, edit content, or read drafts.
- A published change rebuilds the site while a draft save leaves it unchanged.
- Restarting the CMS preserves its administrator, content, queue, and media.

## Backups and upgrades

Back up the complete `/app/cms/data` volume, including its SQLite database and
media, and keep the `PAYLOAD_SECRET` in a separate secure secret store. Use a
SQLite-aware backup or pause writes and stop the CMS before taking a filesystem
snapshot; copying a live database file alone is not a consistent backup. Keep
copies outside the application volume and test restoration before relying on
them. A persistent volume alone is not a backup.

Take a consistent backup before deploying schema changes. The container applies
forward migrations before serving traffic and stops if migration fails. Preserve
the volume when rolling back the image, and assess schema compatibility before
starting an older version. Never delete the data volume as part of a redeploy.
