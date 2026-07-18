# Architecture

## System flow

```text
Official X API
  -> deterministic local relevance screen
  -> GPT-5.6 structured evidence extraction for candidate posts
  -> ambiguity and review safety gate
  -> Supabase evidence and verified milestone state
  -> Reset Oracle v2 policy + discretionary branches
  -> 5,000 seeded simulations
  -> stored 36-hour forecast and public audit record
```

GPT-5.6 extracts structured, reviewable evidence through the OpenAI Responses API. It does not calculate the probability. Reset Oracle v2 owns the final calculation in pure TypeScript.

## Canonical current snapshot

The current public state uses a read-only derivation architecture. `loadCanonicalHybridSnapshot` selects one cutoff from the latest successful forecast calculation, then loads the monitored account, stored posts, latest extractions, verified reset records, milestone records, and the latest persisted forecast reference. One pure builder recalculates Reset Oracle v2 and Sacred Likelihood from that same cutoff-safe record set.

The homepage, cinematic hero, forecast views, Latest Signals, `/api/hybrid/current`, the read-only inspector, and Data Lab all consume this canonical snapshot. A completed full or banked reset found in an official stored post is deterministically validated before it can become the newest cycle boundary. It immediately resolves the previous forecast and starts the next cycle at 30. Evidence at or before the boundary is excluded, the completed confirmation contributes zero to the active signal score, and Reset Oracle v2 is recalculated from cutoff-safe post-reset evidence.

Hybrid state is not persisted in a separate table for this implementation. `persistedHybridScore: null` therefore means "derived from the canonical stored record set," not zero. If that derivation is unavailable, the Live hybrid state is reported as unavailable rather than reconstructed independently by a page or labeled Live from a stale fallback. Current-state routes use `no-store`; forecast history remains the stored, auditable Reset Oracle timeline.

## Runtime boundaries

The Next.js App Router public route reads the latest stored forecast and lazy-loads below-the-fold visualizations. Demo state is server-local and resettable; Live repositories map the same domain records to Supabase. Supabase Realtime is the primary forecast update path. When Realtime is unavailable, the visible-tab fallback refreshes every five minutes, refreshes on focus, applies exponential error backoff, and prevents overlapping requests.

The protected, idempotent `/api/cron/ingest` route drives polling. The first successful Live run resolves the configured X account and caps its timeline request at 10 posts. Later runs reuse the account row and request only posts after `latest_processed_post_id`. The service deduplicates before extraction, screens locally before OpenAI, and advances the cursor only after the complete processing path succeeds.

Every successful ingestion run recalculates the time-dependent production v2 forecast, even when no posts were inserted or no relevant evidence changed. A snapshot is saved only when the model or configuration changes, probability moves by at least 0.5 percentage points, the credible interval changes materially, the semantic alert band changes, or the latest stored snapshot is at least 60 minutes old. This preserves freshness without producing 15-minute history noise.

## Forecasting

Forecasting code lives under `src/lib/forecasting`. V1 remains available as `reset-oracle-1.1.0` for comparison. The production model is the policy-aware `reset-oracle-2.0.0` implementation under `src/lib/forecasting/v2`.

V2 separates:

- a **policy branch**, which estimates conditional next-milestone arrival and the Beta-Binomial probability of a reset announcement at a pledged milestone; and
- a **discretionary branch**, which applies six-hour logistic hazards to structured public-signal evidence using versioned expert-prior coefficients.

The branches combine as independent causes. Discretionary cooldown does not suppress policy risk. Five thousand deterministic seeded simulations sample interval, regime, posterior, and coefficient uncertainty.

## Data and security

Supabase migrations define monitored accounts, source posts, extractions, verified resets and milestones, model snapshots, contributions, ingestion records, backtests, alert subscriptions, delivery records, and the minimal public visit-day counter. Public access is limited by RLS. The service-role key, X bearer token, OpenAI key, Resend key, webhook secret, cron secret, and admin secret are server-only.

Social adapters, extraction, forecasting, milestone verification, notification evaluation, and repositories remain independent boundaries. Database uniqueness constraints enforce X post deduplication, notification event idempotency, email delivery idempotency, and one public visit per anonymous browser token per UTC day.

The public `/lab/data` route is read-only. `/lab` redirects there. Operational tools live at `/control-room`, which resolves to a 404 unless `CONTROL_ROOM_ENABLED` is exactly `true`. Even when enabled, Live mutations require timing-safe `ADMIN_SECRET` authorization; the browser retains the secret only in component memory.

Resend webhooks read the raw body and verify the Svix ID, timestamp, and signature with the provider SDK before replay-protected delivery state can change. Complaints suppress future delivery. Production email is considered enabled only when the complete server-side configuration is present.

## Historical inputs and evaluation

Historical evidence is a human-reviewed input boundary. Strict Zod contracts validate `source-manifest.json`, `verified-reset-ledger.json`, and `historical-signal-windows.json`. Stable upserts seed verified records without giving an LLM write access to historical facts.

The one-month evaluation runs outside production tables. Published reports and aggregate forecast outputs live under `artifacts/backtests/2026-06-17_2026-07-17`; raw acquisition and extraction caches stay local and are gitignored. Every walk-forward cutoff rebuilds milestones, posterior counts, interval estimates, evidence, and features using only data available at that cutoff.

## Cinematic public experience

`CinematicHero` owns the pinned landing sequence. One ScrollTrigger maps normalized progress across the shadow, discovery, revelation, final frame, and post-reveal hold. The same master timeline controls the title, probability, metadata, navigation, overlays, and handoff. The video is paused, reset to frame zero, and decoded before the loader exits. Reduced-motion mode avoids pinning and scrubbing while preserving the final semantic data.

The rest of the interface uses semantic DOM, Recharts, and restrained GSAP transitions. Mobile sections recompose instead of relying on page-level horizontal scrolling. Advanced Diagnostics remains expanded by default but loads below the initial hero shell.
