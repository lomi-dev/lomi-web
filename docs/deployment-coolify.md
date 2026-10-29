# Coolify deployment

Follow the maintained [production deployment guide](../deploy/coolify.md) for
both the Astro website and Payload CMS. It includes the Dockerfile settings,
HTTPS domains, persistent storage, administrator initialization, automatic
rebuild queue, verification, and backup procedure.

For `/remote/install.sh` and `/remote/install.ps1`, configure the two public
catalog build arguments described in [Remote installation](remote-installation.md).
Both endpoints report unavailable until a reviewed signed release is configured.

The CMS Docker image initializes its first administrator from the runtime-only
`CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD` variables before opening its HTTP
port. An empty production database without valid credentials fails startup.
Existing administrators and their passwords are preserved on every restart.
Do not use the public first-user form to bootstrap this production image.

The current example mounts the database and media volume at `/app/cms/data`.
An existing installation may retain `/data` when its `DATABASE_URL`,
`MEDIA_UPLOAD_DIR`, and persistent mount all agree. Preserve existing volumes;
changing a mount location without migrating its contents creates an empty CMS.

Newsletter enablement still requires the qualification and credential rotation
in [auth-app/NEWSLETTER.md](../../auth-app/NEWSLETTER.md). Provider credentials
belong only in the auth service's server environment.
