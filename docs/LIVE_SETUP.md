# Live setup

1. Create a Supabase project, enable pgvector/pg_cron/pg_net, and apply all SQL files under `supabase/migrations`.
2. Create an X developer app with read access. Set `X_BEARER_TOKEN` and `X_USERNAME`. The adapter resolves the user ID and uses `since_id`; 429 responses expose reset timing for jittered retry orchestration.
3. Set `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5.6`. Use the Responses API with the strict extraction schema in `src/lib/extraction/schema.ts`; never ask extraction to output probability.
4. In Resend, verify the sending domain, set `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`. Configure the webhook URL as `/api/webhooks/resend` and set its signing secret.
5. Set `CRON_SECRET` and replace the placeholders in `003_pg_cron.sql` with the deployed HTTPS URL and a Vault-backed secret.
6. Set `NEXT_PUBLIC_APP_MODE=live` only after server-side credentials exist. Never prefix secrets with `NEXT_PUBLIC_`.

Confirmed opt-in links expire after `EMAIL_CONFIRMATION_EXPIRY_HOURS` (24 by default). Threshold alerts rearm only after probability is ten points below the selected threshold. Complaints permanently suppress future delivery; bounces should be reviewed before reactivation.
