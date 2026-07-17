# WILL TIBO RESET? — RESET ORACLE

An unofficial experimental forecasting system for public Codex reset signals. The LLM can extract evidence, but the displayed probability is produced by a deterministic, versioned six-hour logistic hazard model with seeded Monte Carlo uncertainty.

## Demo Mode quick start

```bash
npm install
npm run dev:demo
```

Open `http://localhost:3000`. No credentials are required. Every synthetic item is labeled Demo Data. `npm run dev:demo` enables the local `/control-room` route so the confirmation, 70% crossing, deduplication, confirmed-reset, and Demo Outbox flows remain available. `/lab` redirects to the public read-only Data Lab.

## Live Mode

Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_APP_MODE=live`, then add X, Supabase, OpenAI, and Resend credentials. Missing optional credentials never crash startup; the public email form stays disabled unless the complete delivery and webhook configuration is present. Apply `supabase/migrations` in order. See [Live Setup](docs/LIVE_SETUP.md).

## Commands

`npm run dev`, `dev:demo`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `ingest`, `forecast`, `backtest`, and `seed:history` are supported.

## Architecture and data

- Official X API v2 adapters only; no scraping.
- Live activation resolves the monitored account once, reads at most 10 current posts, then advances only with `since_id`. It never backfills the account timeline.
- Human-reviewed history lives in `src/data/source-manifest.json`, `verified-reset-ledger.json`, and `historical-signal-windows.json`. Strict schemas reject extra fields and broken provenance references; `npm run seed:history` performs stable UUID upserts.
- `/lab/data` is a public, read-only technical record covering data sources, feature origins, forecast inputs, historical windows, context events, blind-backtest rows, data cutoffs, and X resource audits. `/control-room` does not exist unless `CONTROL_ROOM_ENABLED=true`, and its Live mutations still require `ADMIN_SECRET`.
- The public homepage reads one reconciled forecast snapshot for the hero, trend, contributions, range, usage guidance, and evidence annotations.
- `GET /api/posts/latest?limit=6` returns safe stored post fields (maximum 20) and falls back to clearly labelled Demo Posts when Live Mode is unavailable.
- `GET /api/health` exposes only safe connection state, source configuration, and last-run timestamps; it never returns credentials or internal errors.
- OpenAI Responses API/strict extraction is designed as a replaceable extractor. Demo Mode uses a visibly labeled deterministic heuristic.
- Supabase RLS exposes approved public forecast data only. The service role stays server-side.
- Live clients subscribe to inserted forecast rows with the anon key. If Realtime is unavailable, visible tabs refresh public forecast/post data every five minutes, refresh on focus, back off after errors, and never overlap refreshes.
- Resend is enabled only when its API key, sender, reply-to address, and webhook signing secret form a complete configuration. Signed webhook receipts are replay-protected and update delivery/subscription state.
- Tokens are random, stored as SHA-256 hashes, and confirmation expires.
- Expert-prior coefficients are not claimed as trained. Synthetic backtests do not establish accuracy.

## Cinematic image usage

The active hero uses the supplied video and does not fabricate or hotlink a portrait. The optional legacy still paths remain `public/cinematic/tibo-opening.webp` and `public/cinematic/tibo-ending.webp`; only add images you have permission to use.

## Cinematic video hero

`assets/TIBORESET.mp4` remains the untouched 4K source master. The browser uses the derived `public/cinematic/tiboreset-hero.mp4`: a silent 1080p fast-start H.264 encode with half-second keyframes for bidirectional GSAP/ScrollTrigger scrubbing. Desktop and mobile use the same smoothed scroll-to-time mapping; reduced-motion mode skips pinning and exposes a readable late-frame composition.

## Disclaimer

Unofficial experimental project. Not affiliated with OpenAI or X. No synthetic event is presented as a real historical fact.
