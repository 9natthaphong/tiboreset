# Live setup

## Core services

1. Create a Supabase project, enable `vector`, `pg_cron`, and `pg_net`, then apply every SQL file under `supabase/migrations` in order.
2. Create an X developer app with read access. Set `X_BEARER_TOKEN` and `X_USERNAME`. The first successful run resolves the user ID once and reads at most the latest 10 posts. Every later run uses `latest_processed_post_id` as `since_id`. Do not use ingestion to backfill history.
3. Set `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5.6`. Extraction uses the Responses API and the strict schema in `src/lib/extraction/schema.ts`; extraction never outputs probability.
4. Set strong, independent `CRON_SECRET` and `ADMIN_SECRET` values. Replace the deployment placeholders in `003_pg_cron.sql` with the deployed HTTPS URL and a Vault-backed cron secret.
5. Keep `CONTROL_ROOM_ENABLED=false` in Production unless an operator explicitly needs the hidden `/control-room` surface. Enabling the route does not bypass `ADMIN_SECRET` on mutating actions.
6. Set `NEXT_PUBLIC_APP_MODE=live` only after the server credentials are ready. Never prefix a secret with `NEXT_PUBLIC_`.

Verify the deployment with `GET /api/health`. It returns only safe state: database, X, OpenAI, email, and latest activity status. It never returns URLs, keys, provider errors, or authorization values.

Supply reviewed history separately through the three version-controlled `src/data/*` seed files, then run `npm run seed:history`. These files are human-owned and must never be generated or rewritten by an LLM. Review the read-only record at `/lab/data`. On Windows networks with a private TLS inspection root, use `NODE_OPTIONS=--use-system-ca`; never disable TLS verification.

## Resend production setup

1. Verify a Resend sending subdomain.
2. Create a Sending-access API key.
3. Set `RESEND_API_KEY` and set `EMAIL_FROM` to an address on the verified subdomain.
4. Set `EMAIL_REPLY_TO` to a real monitored inbox.
5. Deploy the application.
6. Create the Production webhook at `https://DEPLOYED_DOMAIN/api/webhooks/resend`.
7. Subscribe the webhook to `email.delivered`, `email.bounced`, and `email.complained` events.
8. Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.
9. Redeploy so the signing secret and complete email configuration are active.
10. Send one confirmation email, follow the double-opt-in link, and verify that the delivery webhook updates the stored delivery record.

Confirmation links expire after `EMAIL_CONFIRMATION_EXPIRY_HOURS` (24 by default). Threshold alerts rearm only after probability falls ten points below the selected threshold. Complaints suppress all future delivery. Bounces are recorded and the subscription is held for review.

The Resend Free plan is expected to allow 3,000 transactional emails per month and 100 per day. Each recipient counts as one email, and both confirmation and alert emails consume quota. These expectations are documented for operator planning only and are not hardcoded into application behavior.

## Vercel Web Analytics

1. Enable Web Analytics in the Vercel project dashboard.
2. Deploy the root-layout `Analytics` component.
3. Confirm that page views reach the Web Analytics dashboard.
4. Create a restricted Vercel access token.
5. Add `WEB_ANALYTICS_API_TOKEN` as a server-only environment variable.
6. Add `WEB_ANALYTICS_PROJECT_ID` and `WEB_ANALYTICS_TEAM_ID`.
7. Set `SHOW_PUBLIC_PAGE_VIEWS=true` only after a supported aggregate API integration is available.
8. Redeploy.
9. Verify that the footer displays a cached monthly page-view count before treating the public metric as enabled.

Page-view and privacy-safe custom interaction tracking is active through `@vercel/analytics`. Query strings are removed before analytics events are sent, and `/control-room` analytics are suppressed. The optional public monthly counter remains disabled because the installed official package does not define a supported aggregated visits response contract. Do not implement a browser-side Vercel API call or expose the token. If a future analytics or advertising provider introduces non-essential cookies, add an appropriate consent mechanism before that provider loads.
