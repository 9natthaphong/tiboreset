# WILL TIBO RESET? — RESET ORACLE

An unofficial experimental forecasting system for public Codex reset signals. The LLM can extract evidence, but the displayed probability is produced by a deterministic, versioned six-hour logistic hazard model with seeded Monte Carlo uncertainty.

## Demo Mode quick start

```bash
npm install
npm run dev:demo
```

Open `http://localhost:3000`. No credentials are required. Every synthetic item is labeled Demo Data. Subscribe, then open `/lab` to simulate confirmation, a 70% crossing, deduplication, confirmed reset, and local email previews.

## Live Mode

Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_APP_MODE=live`, then add X, Supabase, OpenAI, and Resend credentials. Missing optional credentials never crash startup; email falls back to the Demo Outbox. Apply `supabase/migrations` in order. See [Live Setup](docs/LIVE_SETUP.md).

## Commands

`npm run dev`, `dev:demo`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `ingest`, `forecast`, and `backtest` are supported.

## Architecture and data

- Official X API v2 adapters only; no scraping.
- OpenAI Responses API/strict extraction is designed as a replaceable extractor. Demo Mode uses a visibly labeled deterministic heuristic.
- Supabase RLS exposes approved public forecast data only. The service role stays server-side.
- Resend is enabled only with `RESEND_API_KEY` and `EMAIL_FROM`.
- Tokens are random, stored as SHA-256 hashes, and confirmation expires.
- Expert-prior coefficients are not claimed as trained. Synthetic backtests do not establish accuracy.

## Cinematic image usage

The active hero uses the supplied video and does not fabricate or hotlink a portrait. The optional legacy still paths remain `public/cinematic/tibo-opening.webp` and `public/cinematic/tibo-ending.webp`; only add images you have permission to use.

## Cinematic video hero

`assets/TIBORESET.mp4` remains the untouched 4K source master. The browser uses the derived `public/cinematic/tiboreset-hero.mp4`: a silent 1080p fast-start H.264 encode with half-second keyframes for bidirectional GSAP/ScrollTrigger scrubbing. Desktop and mobile use the same smoothed scroll-to-time mapping; reduced-motion mode skips pinning and exposes a readable late-frame composition.

## Disclaimer

Unofficial experimental project. Not affiliated with OpenAI or X. No synthetic event is presented as a real historical fact.
