# Architecture

The App Router public route reads a current forecast and lazy-loads client charts. Demo state is server-local and resettable; Live repositories map the same domain records to Supabase. Polling calls the protected, idempotent `/api/cron/ingest`. The first run resolves the configured X account and caps the timeline request at 10 posts; later runs reuse the account row and request only posts after `latest_processed_post_id`. The service deduplicates before extraction, screens locally before OpenAI, forecasts only when relevant evidence changes, and advances the cursor only after the complete transaction path succeeds. Supabase Realtime is the primary forecast update path. The visible-tab fallback is five minutes, refreshes on focus, uses exponential error backoff, and prevents overlapping requests.

Forecasting is pure TypeScript under `src/lib/forecasting`. Social adapters, extraction, and notification evaluation are independent boundaries. `notification_events.event_key` and `email_deliveries.idempotency_key` provide database-enforced deduplication. Secrets never cross into client components.

The public `/lab/data` route is read-only. `/lab` redirects there. Operational tools live at `/control-room`, which resolves to a 404 unless `CONTROL_ROOM_ENABLED` is exactly `true`; enabled Live controls still pass `ADMIN_SECRET` only in component memory to timing-safe server checks. Resend webhooks verify the raw request with the provider SDK and Svix headers before a replay-protected receipt can update delivery state.

Historical evidence is a separate, immutable-at-runtime input boundary. Strict Zod contracts validate the source manifest, verified reset ledger, and positive/negative signal windows. Stable UUID upserts populate `known_reset_events`; the same cutoff-safe records feed historical analog retrieval, calibration, blind backtesting, the reset history, and `/lab/data`. Neither extraction nor forecasting code writes these JSON files.

Rendering is semantic DOM, SVG, and Recharts. Motion owns probability/chart transitions only. Mobile recomposes the hero; reduced motion disables nonessential movement.

## Cinematic hero motion

`CinematicHero` is the sole owner of the pinned landing sequence. One ScrollTrigger maps normalized progress across the shadow, discovery, revelation, final-frame, and hold chapters. The same progress drives a paused GSAP story timeline and the target timestamp for the eight-second video. The video is paused and reset to frame zero before the loader exits; a requestAnimationFrame loop then smooths `video.currentTime` in both scroll directions. The scoped GSAP context, ScrollTrigger, animation frame, media state, and listeners are destroyed on unmount.

Desktop uses a 4,300px pin range; mobile uses 2,800px with the same bidirectional scrub model and a recomposed data layout. Reduced-motion mode has no pin or scrub, seeks to a representative late frame, removes ambient animation, and exposes the final semantic data and CTA state.
