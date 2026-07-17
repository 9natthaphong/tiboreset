# OpenAI Build Week / Devpost submission pack

## Submission identity

| Field | Submission copy |
| --- | --- |
| Project | Sacred Forecast / TiboReset |
| Internal engine | Reset Oracle v2 |
| Tagline | Forecast the reset. Plan the next 36 hours of coding. |
| Repository | <https://github.com/9natthaphong/tiboreset> |
| Live app | <https://tiboreset.vercel.app> |
| Public Data Lab | <https://tiboreset.vercel.app/lab/data> |

Sacred Forecast is an unofficial, explainable 36-hour forecast for a possible Codex quota-reset announcement. It converts monitored public signals and verified milestone history into an auditable probability range and a practical quota plan.

## Inspiration

Codex users have limited capacity, and the timing of a reset can change whether a developer should spend remaining quota on an expensive agent run, save it for critical work, or queue the task. The clues are public but fragmented across posts, milestone announcements, operational context, and reset history. A token counter cannot answer the planning question, while rumor alone is not trustworthy enough.

## What it does

- Monitors new public posts from the configured official X account without scraping or historical account crawling.
- Screens obvious irrelevant posts locally before any model call.
- Uses GPT-5.6 through the OpenAI Responses API to extract strict, reviewable evidence from candidate posts.
- Blocks jokes, questions, metaphors, uncertain statements, and other ambiguous evidence from changing the public forecast automatically.
- Separates policy-driven milestone risk from discretionary signal-driven risk.
- Runs 5,000 deterministic seeded simulations to produce a 36-hour estimate and uncertainty interval.
- Exposes evidence, feature origins, coefficients, model version, data cutoff, seed, and audit records.
- Turns probability bands into deterministic spend, save, or queue guidance.
- Provides a public, read-only Data Lab and a no-credential offline Demo Mode.

## How we built it

The product uses Next.js App Router and strict TypeScript. Supabase Postgres stores monitored accounts, source posts, structured extraction records, verified milestones, forecasts, contributions, ingestion runs, backtests, subscriptions, and delivery state. The official X API adapter reads at most 10 posts during initial activation and uses `since_id` for unseen posts afterward.

Relevant candidate posts are sent to the OpenAI Responses API with a strict Zod-backed schema. GPT-5.6 returns evidence fields, not a probability. Reset Oracle v2 then calculates two independent branches:

1. A policy branch estimates whether the next pledged milestone will arrive inside 36 hours and the posterior probability of a reset announcement if it does.
2. A discretionary branch applies six-hour logistic hazards to live signal evidence using versioned expert-prior coefficients.

The two risks are combined as independent causes and sampled through 5,000 seeded simulations. Every successful ingestion run recalculates the time-dependent v2 forecast, while materiality and freshness rules prevent noisy duplicate snapshots.

## The role of OpenAI

GPT-5.6 is an evidence extractor. It interprets candidate public-post text and returns strict fields such as event type, milestone, denominator, reset type, confidence, short evidence excerpts, uncertainty, and review status. It never produces the final forecast probability.

Reset Oracle v2 calculates the probability deterministically in TypeScript. Obvious irrelevant posts are screened before an API call, and a separate deterministic safety layer prevents ambiguous language from moving the forecast.

## How Codex helped

Codex was used across the engineering lifecycle: repository implementation, database and API work, test creation, production debugging, responsive hardening, the ambiguity-safety backfill, construction of the strict one-month walk-forward evaluation, Reset Oracle v2 implementation, documentation, and deployment preparation. Private prompts, session content, credentials, and provider payloads are not part of the submission.

## Challenges

- **Separating extraction from prediction.** The language model had to structure evidence without being allowed to invent a percentage.
- **Handling playful public language safely.** A reset-button joke initially exposed why extraction confidence alone was insufficient. The deterministic ambiguity gate now assigns such evidence zero automatic impact and requires review.
- **Modeling consecutive milestone resets.** A generic cooldown suppressed risk after each reset even when the public policy allowed another reset at the next million-user milestone. V2 isolates policy risk so discretionary cooldown cannot suppress it.
- **Preventing leakage.** Every backtest cutoff reconstructs evidence, milestones, interval estimates, and posterior counts using only information available at that time.
- **Keeping a time-dependent forecast fresh.** V2 milestone-arrival pressure changes with elapsed time, so the ingestion loop recalculates even when no new relevant post is found and saves only material or hourly-fresh snapshots.

## Accomplishments

- A complete offline Demo Mode with deterministic local extraction and clearly labeled synthetic data.
- Incremental official-X ingestion with cursoring, deduplication, audit payloads, rate-limit handling, and local pre-screening.
- Strict OpenAI structured evidence extraction with deterministic fallback and ambiguity protection.
- A policy-aware, reproducible forecast with separate risk branches and public feature provenance.
- Human-reviewed 3M-9M announcement history that retains full, banked, and scheduled distinctions without inventing execution times.
- A public Data Lab, audit export, protected operational surface, double-opt-in alert lifecycle, and privacy-safe public visit counter.
- A cached, six-hour walk-forward backtest with announcement-post exclusion in the strict pre-announcement evaluation.

## Backtest result

Evaluation period: **17 June to 17 July 2026**.

| Measure | Strict pre-announcement result |
| --- | ---: |
| Forecasts generated | 120 |
| Scored windows | 115 |
| Verified announcements | 4 |
| Reset Oracle v1 Brier score | 0.1522 |
| Reset Oracle v2 Brier score | 0.1127 |
| Constant base-rate Brier score | 0.1320 |
| V2 Brier skill vs. constant | +0.1463 |
| Events crossing 30% before publication | 2 of 4 |
| Events crossing 50% before publication | 1 of 4 |
| Highest observed false-alarm probability | 5.1% |

The observed 30% lead time was 19.6 hours before the 8M announcement. Before the 9M announcement, v2 crossed 30% 52.2 hours early and 50% 28.2 hours early. It did not cross 30% before the 6M or 7M announcements.

**Interpretation: Promising but unvalidated.** V2 improved on v1 and the constant baseline in this cached month, but four announcements cannot establish general reliability. Historical simulation, not a guarantee of future resets. The evaluation target is the official announcement; verified execution timestamps were not available for a separate execution-time score.

## What we learned

Explainability is not an overlay added after forecasting. It changes the system design: evidence needs an origin, ambiguous text needs a non-probabilistic review state, policies need explicit validity boundaries, historical cutoffs need enforcement, and every displayed number needs a retained audit path. We also learned that a structurally correct causal split can matter more than making a single hazard model more aggressive.

## What's next

- Collect more prequential months without changing the frozen evaluation history.
- Add reviewed negative signal windows and verified execution timestamps when authoritative sources exist.
- Reassess calibration only after a larger sample is available.
- Add another official social-source adapter behind the existing interface.
- Enable production email delivery only after the Resend sender and webhook are fully configured and verified.

## Three-minute judge walkthrough

1. **0:00-0:25 - The question.** Open the cinematic hero, identify the 36-hour probability and uncertainty, and explain why quota timing matters.
2. **0:25-0:55 - The evidence.** Scroll to Latest Signals and show that every post has a screening or impact state.
3. **0:55-1:30 - The calculation.** Open Advanced Diagnostics and show policy-driven risk, signal-driven risk, the combined probability, feature origins, model version, cutoff, seed, and simulation count.
4. **1:30-1:55 - The historical policy.** Show the verified milestone ledger and the distinction between full, banked, and scheduled announcements.
5. **1:55-2:20 - The evaluation.** Present the v2 Brier result and lead times, then state the four-event limitation explicitly.
6. **2:20-2:40 - The audit.** Open the public Data Lab and show source, extraction, forecast, and resource records.
7. **2:40-3:00 - The offline proof.** Mention or run Demo Mode, inject a signal, and show deterministic movement without external credentials.

## Submission media

Repository-ready product images are under [`docs/readme/`](readme/). Use at most five in the Devpost gallery:

1. `01-current-forecast.jpg` - current 36-hour forecast.
2. `02-policy-model.jpg` - policy and signal branch explanation.
3. `03-latest-signals.jpg` - public evidence and screening states.
4. `04-reset-history.jpg` - verified milestone announcement ledger.
5. `05-data-lab.jpg` - public technical record.

## Judge setup without credentials

```bash
git clone https://github.com/9natthaphong/tiboreset.git
cd tiboreset
npm ci
npm run dev:demo
```

Open <http://localhost:3000>. All fixture posts, forecasts, and emails are labeled Demo Data or Demo Email.

## Disclaimer

Sacred Forecast / TiboReset is an unofficial experimental project. It is not affiliated with or endorsed by OpenAI or X. Its probability is a planning aid, not an official announcement or an account-level rollout promise.
