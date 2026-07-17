# Live setup

Demo Mode is the recommended no-credential judge path. Live Mode requires Supabase and the official X API; OpenAI extraction and Resend delivery activate only when their complete server configuration is present.

## Core services

1. Create a Supabase project, enable `vector`, `pg_cron`, and `pg_net`, then apply every SQL file under `supabase/migrations` in order.
2. Create an X developer app with read access. Set `X_BEARER_TOKEN` and `X_USERNAME`. The first successful run resolves the user ID once and reads at most the latest 10 posts. Every later run uses `latest_processed_post_id` as `since_id`. Do not use ingestion to backfill history.
3. Set `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5.6` to enable structured evidence extraction. The Responses API uses the strict schema in `src/lib/extraction/schema.ts`; extraction never outputs probability. If the call fails, the ingestion service stores a labeled local-fallback result.
4. Set strong, independent `CRON_SECRET` and `ADMIN_SECRET` values. Replace deployment placeholders in `003_pg_cron.sql` with the deployed HTTPS URL and a Vault-backed cron secret.
5. Keep `CONTROL_ROOM_ENABLED=false` in Production unless an operator explicitly needs the hidden `/control-room` surface. Enabling the route does not bypass `ADMIN_SECRET` on mutations.
6. Set `NEXT_PUBLIC_APP_MODE=live` only after the server credentials are ready. Never prefix a secret with `NEXT_PUBLIC_`.

Verify with `GET /api/health`. It returns only safe configuration and freshness states; it never returns URLs, keys, provider errors, or authorization values.

Profile imagery uses the cached `monitored_accounts` record. Attached post media is intentionally not fetched to avoid additional X Media Read usage; media-rich posts retain a **View original post** action.

## Historical bootstrap

Supply reviewed history through the version-controlled `src/data/source-manifest.json`, `src/data/verified-reset-ledger.json`, and `src/data/historical-signal-windows.json`, then run:

```bash
npm run seed:history
```

These files are human-owned and must never be generated or rewritten by an LLM. Review their public read-only representation at `/lab/data`. Historical X acquisition and extraction caches used for isolated backtests are private local artifacts and must not be committed.

## Scheduled ingestion

Apply and customize the pg_cron setup in `supabase/migrations/003_pg_cron.sql`. The route requires `Authorization: Bearer ${CRON_SECRET}`. Each successful run:

- fetches only unseen posts;
- screens locally before OpenAI;
- stores ingestion success or failure;
- recalculates the time-dependent Reset Oracle v2 forecast even when no relevant evidence changed; and
- saves a new snapshot only for material change, model/configuration change, an alert-band transition, or hourly freshness.

The standalone `npm run reforecast:current` command recalculates from stored state without calling X or OpenAI.

## Resend production setup

1. Verify a Resend sending subdomain.
2. Create a Sending-access API key.
3. Set `RESEND_API_KEY` and set `EMAIL_FROM` to an address on the verified subdomain.
4. Set `EMAIL_REPLY_TO` to a real monitored inbox.
5. Deploy the application.
6. Create the Production webhook at `https://DEPLOYED_DOMAIN/api/webhooks/resend`.
7. Subscribe to `email.delivered`, `email.bounced`, and `email.complained`.
8. Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.
9. Redeploy.
10. Send one confirmation email, follow the double-opt-in link, and verify that its delivery webhook updates the stored record.

Confirmation links expire after `EMAIL_CONFIRMATION_EXPIRY_HOURS` (24 by default). Threshold alerts rearm only after probability falls ten points below the selected threshold. Complaints suppress future delivery. Bounces are recorded for review.

The Resend Free plan is expected to allow 3,000 transactional emails per month and 100 per day. Each recipient counts as one email; confirmation and alert emails both consume quota. These are operator-planning expectations, not application-enforced limits. Confirm current provider limits before launch.

If any required Resend value is absent, the public form does not claim that external delivery is active. Demo Mode uses the clearly labeled Demo Outbox.

## Analytics and public visits

Vercel Web Analytics is mounted once in the root layout through `@vercel/analytics`. Enable Web Analytics in the Vercel dashboard, deploy, generate production traffic, and allow dashboard processing time before diagnosing a zero count. The integration does not use advertising trackers or custom fingerprinting, strips query strings, and suppresses `/control-room` analytics.

The small public footer counter is separate. In Production Live Mode, `/api/visits` uses the Supabase service role to store a one-way hash of a random browser token plus the UTC date. A uniqueness constraint limits ordinary reloads to one row per browser token per day. The raw token stays in browser local storage; the database never stores it. If Supabase or the migration is unavailable, the metric hides instead of rendering a fake zero.

No Vercel API token is required for the public counter.

## Deployment checks

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

On Windows networks with a private TLS inspection root, prefer `NODE_OPTIONS=--use-system-ca`; never disable TLS verification.
