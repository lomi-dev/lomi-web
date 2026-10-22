# Coolify deployment

Deploy the Astro website and Payload CMS as two separate Dockerfile apps from
the same `lomi-dev/lomi-web` repository. Both build contexts must be the
repository root (`/`) so the CMS build can read shared `content/` files. The
root `.dockerignore` excludes environment files, local credentials, databases,
uploads, dependencies and build outputs from both images.

## 1. Deploy and bootstrap the CMS first

Create a Coolify application connected to the repository and branch:

- Build pack: **Dockerfile**
- Base directory / build context: `/`
- Dockerfile: `/Dockerfile.cms`
- Exposed port: `3001`
- Domain: `https://cms.lomi.dev`
- Persistent volume: mount storage at `/data`

Set these build arguments and runtime environment variables:

| Name | Value |
| --- | --- |
| Build arg `NEXT_PUBLIC_SERVER_URL` | `https://cms.lomi.dev` |
| Runtime `NEXT_PUBLIC_SERVER_URL` | `https://cms.lomi.dev` |
| Runtime `PAYLOAD_SECRET` | A stable, private random secret (for example, `openssl rand -hex 32`) |
| Runtime `DATABASE_URL` | `file:/data/payload.db` |
| Runtime `MEDIA_UPLOAD_DIR` | `/data/media` |

Next.js bundles `NEXT_PUBLIC_SERVER_URL` at build time, so set the build
argument as well as the runtime value. The container applies checked-in Payload
migrations and then runs the idempotent content seed before starting Next.js on
`0.0.0.0:3001`. The seed creates initial landing content only when no content
or saved versions exist.

**Do not expose an uninitialized CMS publicly.** Payload allows registration
of its first user until that account is created. Bootstrap the first
administrator through a private flow before public access, or first configure
an access policy that protects both `/admin` and
`/api/users/first-register`. Cloudflare Access is not currently enabled; enable
and verify it as a prerequisite before opening the CMS to the public. Keep the
bootstrap route private until the first administrator exists. Create the
administrator at `/admin`, then verify that first-user registration is closed.
Back up the database and uploaded media from `/data`.

Once bootstrap and access controls are complete, verify the CMS public API.
Build and deploy the static site after the CMS is ready. Payload content changes
appear on the site after a new site build and deployment.

## 2. Deploy the static site

Create a second Coolify application from the same repository and branch:

- Build pack: **Dockerfile**
- Base directory / build context: `/`
- Dockerfile: `/Dockerfile.site`
- Exposed port: `80`
- Domains: `https://lomi.dev` and `https://www.lomi.dev`
- Persistent volume: none

Set these Docker build arguments (they are read during the Astro build):

| Build argument | Value |
| --- | --- |
| `CMS_URL` | `https://cms.lomi.dev` |
| `SITE_URL` | `https://lomi.dev` |

The site container serves generated `dist/` files with nginx and needs no
runtime environment variables. Rebuild and redeploy after publishing CMS
content so Astro fetches the latest published data.

## Newsletter

Newsletter signup remains disabled unless the qualification steps and
credential rotation in [auth-app/NEWSLETTER.md](../../auth-app/NEWSLETTER.md)
are complete. Do not configure a public Plunk key or expose any provider key as
a site build argument. Only after qualification, configure the documented
public auth-service endpoint; credentials belong only in the auth service's
server environment.
