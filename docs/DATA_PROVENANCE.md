# Data provenance

## Live records

Every current forecast retains its exact cutoff, source post IDs, extracted event IDs, feature snapshot, feature origins and derivation notes, model version, configuration hash, simulation seed and count, probability interval, policy and discretionary branch summaries, and contribution math. The audit JSON export contains those fields and no secrets.

Live source posts enter through the official X API from the system activation date onward. The initial activation reads at most 10 posts. Later reads use `since_id`, deduplicate by platform post ID, and preserve the raw provider payload server-side for audit. Browser scraping, unofficial mirrors, and post-media expansions are not used. Cached account profile imagery comes from the monitored-account record.

Candidate posts pass through a deterministic relevance screen before OpenAI. Strict extraction records preserve schema and model versions, fallback status, confidence, uncertainty, and review state. Ambiguous evidence cannot act as verified forecast evidence automatically.

For the current public snapshot, a stored extraction is not trusted as a completed reset solely because of its label. The canonical builder also requires the monitored official account, full or banked reset type, no review flag, confirmation-safe confidence, and deterministic completed operational language in the stored post text. Derived confirmation state records its source post, extraction version, verification method, and whether the source is synchronized into `known_reset_events` or `milestone_events`.

The current hybrid score is derived read-only from the same cutoff, calibrated forecast context, reset history, and evidence used by the public API and Data Lab. It is not a page-local estimate and is not written into the calibrated forecast row. The latest persisted forecast ID and probability remain attached as an audit reference. Failure to build the canonical Live snapshot produces an unavailable state rather than a fabricated hybrid value.

Long-lived reset-policy state is derived from the newest applicable stored structured extraction. The record exposes its source post, activation and expiry timestamps, confidence, reason, score floor, cap, decay factor, and calibrated counterfactual delta. The prior extraction remains in `extracted_events` when a post is safely reprocessed; no historical row is overwritten.

## Human-reviewed historical records

Historical reset claims enter only through:

- `src/data/source-manifest.json`;
- `src/data/verified-reset-ledger.json`; and
- `src/data/historical-signal-windows.json`.

Every seed record carries a source URL and post ID when available, observation and event timestamps, category, reset type, verification status and notes, window polarity, and manual provenance. Cross-file references are schema-validated before idempotent import. LLM output is never accepted into or used to rewrite this seed boundary.

The 3M-9M ledger represents verified official announcement records. Full, banked, scheduled, and announcement-only states remain distinct. An announcement timestamp is not presented as a verified execution timestamp.

## Milestone state

Historical seeds bootstrap the database. New milestone candidates are stored from live extracted evidence, deduplicated by source post, and assigned `extracted`, `needs_review`, `verified`, or `rejected` state. Public latest-milestone values and history derive from verified database records, not UI constants. A lower or ambiguous candidate cannot overwrite a higher verified milestone.

The current versioned policy ends at the verified pledged 10M target. The system does not infer an 11M promise without a new verified commitment.

## External context

Reviewed official market and operational context lives in `external-context-events.json` behind a strict Zod schema. Competitor events have forecast weight zero and remain context only. An OpenAI Status event can affect usage-incident strength only when it comes from the official status source, is reviewed, and has an explicit configured weight.

## Backtest publication boundary

The one-month backtest is isolated from production tables. Public repository artifacts contain aggregate metrics, event-level derived results, rolling forecasts, and human-readable reports. Raw historical X acquisition data and extraction caches are local-only, gitignored, and intentionally excluded from the public submission.

At each cutoff, the evaluator sees only posts, evidence, milestones, interval lengths, posterior outcomes, and operational records available at or before that time. Future outcomes are used only after the forecast has been frozen for scoring.

## Demo data

Demo fixtures are version-controlled and synthetic. The UI labels them Demo Data, Demo Posts, or Demo Email. They must not be presented as historical facts.
