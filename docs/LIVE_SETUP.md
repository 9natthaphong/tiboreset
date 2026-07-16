# Live setup

1. Create a Supabase project, enable pgvector/pg_cron/pg_net, and apply all SQL files under `supabase/migrations`.
2. Create an X developer app with read access. Set `X_BEARER_TOKEN` and `X_USERNAME`. The first successful run resolves the user ID once and reads at most the latest 10 posts. Every later run uses the stored `latest_processed_post_id` as `since_id`. Do not use ingestion to backfill history.
3. Set `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5.6`. Use the Responses API with the strict extraction schema in `src/lib/extraction/schema.ts`; never ask extraction to output probability.
4. In Resend, verify the sending domain, set `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`. Configure the webhook URL as `/api/webhooks/resend` and set its signing secret.
5. Set `CRON_SECRET` and replace the placeholders in `003_pg_cron.sql` with the deployed HTTPS URL and a Vault-backed secret.
6. Set `NEXT_PUBLIC_APP_MODE=live` only after server-side credentials exist. Never prefix secrets with `NEXT_PUBLIC_`.

Verify the deployment with `GET /api/health`. A ready Live Mode response reports `database: "connected"`; `xSource` reports `configured` only when the X bearer token is present. The endpoint intentionally omits URLs, keys, and raw errors. `GET /api/posts/latest?limit=6` reads approved stored posts for the configured account and caches Live responses briefly.

Supply reviewed history separately through the three `src/data/*` seed files, then run `npm run seed:history`. These files are human-owned inputs and must never be generated or rewritten by an LLM. Review `/lab/data` after import. On Windows networks with a private TLS inspection root, run Node with `NODE_OPTIONS=--use-system-ca`; do not disable TLS verification.

Confirmed opt-in links expire after `EMAIL_CONFIRMATION_EXPIRY_HOURS` (24 by default). Threshold alerts rearm only after probability is ten points below the selected threshold. Complaints permanently suppress future delivery; bounces should be reviewed before reactivation.
