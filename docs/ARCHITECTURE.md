# Architecture

The App Router public route reads a current forecast and lazy-loads client charts. Demo state is server-local and resettable; Live repositories map the same domain records to Supabase. Polling calls the protected, idempotent `/api/cron/ingest`. The first run resolves the configured X account and caps the timeline request at 10 posts; later runs reuse the account row and request only posts after `latest_processed_post_id`. The service deduplicates before extraction, screens locally before OpenAI, forecasts only when relevant evidence changes, and advances the cursor only after the complete transaction path succeeds. Supabase Realtime is the primary forecast update path; clients may poll every 30 seconds as fallback.

Forecasting is pure TypeScript under `src/lib/forecasting`. Social adapters, extraction, and notification evaluation are independent boundaries. `notification_events.event_key` and `email_deliveries.idempotency_key` provide database-enforced deduplication. Secrets never cross into client components.

Historical evidence is a separate, immutable-at-runtime input boundary. Strict Zod contracts validate the source manifest, verified reset ledger, and positive/negative signal windows. Stable UUID upserts populate `known_reset_events`; the same cutoff-safe records feed historical analog retrieval, calibration, blind backtesting, the reset history, and `/lab/data`. Neither extraction nor forecasting code writes these JSON files.

Rendering is semantic DOM, SVG, and Recharts. Motion owns probability/chart transitions only. Mobile recomposes the hero; reduced motion disables nonessential movement.

## Cinematic hero motion

`CinematicHero` is the sole owner of the pinned landing sequence. One ScrollTrigger maps normalized progress across four ordered chapters: Shadow `0-.18`, Discovery `.18-.44`, Revelation `.44-.70`, and Payoff `.70-1`. The same progress drives a paused GSAP story timeline and the target timestamp for the eight-second video. A requestAnimationFrame loop smooths `video.currentTime`; it is the only writer to media time after the short intro autoplay hands off. Wheel, touch, keyboard, anchor, and other nonzero scroll movement all trigger handoff. The scoped GSAP context, ScrollTrigger, animation frame, media playback, and listeners are destroyed on unmount.

Desktop uses a 4,300px pin range; mobile uses 2,800px with the same bidirectional scrub model and a recomposed data layout. Reduced-motion mode has no pin or scrub, seeks to a representative late frame, removes ambient animation, and exposes the final semantic data and CTA state.
