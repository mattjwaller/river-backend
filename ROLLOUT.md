# RiverWatch v2 rollout status

Prepared 2026-11-08. Railway project: intelligent-analysis
(`4658f94e-e553-4d45-9307-06de52fcb63a`). Production environment:
`506fb0fa-9931-467b-9b16-0406421fecf2`. Backend service:
`63b1a18e-016e-483d-b999-9ac3e6b26fef`.

## Prepared in Railway

Four backend variables are staged, not live:
- ADMIN_API_KEY: newly generated 256-bit secret.
- RIVERWATCH_API_KEY: separate newly generated 256-bit secret.
- ALLOW_LEGACY_API_KEY: true, to preserve current clients during migration.
- CORS_ORIGINS: https://river-scribe-monitor-production.up.railway.app

Existing API_KEY and DATABASE_URL were preserved. Secret values are not stored
in this repository. Review staged variables in Railway's dashboard.

## Deployment prerequisites

1. Validate additive database migrations using staging PostgreSQL and a backup
   of the production schema. Test existing data and concurrent telemetry writes.
2. Publish the reviewed backend changes to its deployment source
   `mattjwaller/river-backend`, branch `main`. Production currently follows main.
   A redeploy of the existing build will not include these local changes.
3. Apply staged configuration as part of that deployment and smoke-test reads,
   telemetry, command polling/results, and the weather cron.
4. Register actual device IDs and provision Pi tokens using the admin endpoint.
   Install tokens securely on the Pis; never put tokens in the browser.
5. Deploy a RiverWatch server proxy that validates the caller's authenticated
   workspace role and uses RIVERWATCH_API_KEY. The connected tools in this chat
   do not expose Lovable Cloud/Supabase secret or function deployment access.
   The local Supabase project is ixeuchepuulubluwyipr.
6. Update check-levels' RAILWAY_API_KEY secret to the new server key. Route every
   dashboard read, command creation, and command-status request through the proxy.
7. Verify the browser bundle contains no backend credentials. Then disable
   legacy authentication and rotate the exposed legacy key after all Pis move.
8. Activate webhook delivery only when its destination URL and shared secret
   are available. Review retention before enabling its production deletion job.

## Observed compatibility concerns

The current browser still embeds the shared API key in src/lib/config.ts and
CommandCard.tsx. Most local dashboard wrappers do not yet pass device_id, despite
the supplied API spec's stated frontend status. The Pi code still uses x-api-key.
Do not retire that key before migrating those consumers.

Retention is now gated behind ENABLE_DATA_RETENTION=true and is disabled by
default. Command expiry continues to run regardless of that flag. Forecast refresh also changes from PostgreSQL
storage to a process cache; validate the scheduled weather service before cutover.
