# OpenAI Build Week / Devpost submission pack

## Submission identity

| Field | Submission copy |
| --- | --- |
| Project | Sacred Forecast / TiboReset |
| Engines | Sacred Watch 2.0 + Reset Oracle v2 |
| Tagline | Forecast the reset. Plan the next 36 hours of coding. |
| Repository | <https://github.com/9natthaphong/tiboreset> |
| Live app | <https://tiboreset.vercel.app> |
| Public Data Lab | <https://tiboreset.vercel.app/lab/data> |

Sacred Forecast is an unofficial two-layer reset-risk product. The Reset Watch Score is a non-probabilistic operational-readiness score; Reset Oracle v2 remains the calibrated probability of an official reset announcement inside the next rolling 36 hours. A separate Reset Policy state reports whether current official evidence supports continuing resets without implying timing.

## Inspiration

Codex users have limited capacity, and reset timing can change whether a developer should spend remaining quota on an expensive agent run, save it for critical work, or queue the task. Public clues are fragmented across posts, milestones, operational context, and reset history. Sacred Forecast makes those signals inspectable instead of presenting rumor as certainty.

## What it does

- Monitors new public posts from the configured official X account without scraping or historical account crawling.
- Screens obvious irrelevant posts locally before any model call.
- Uses GPT-5.6 through the OpenAI Responses API to extract strict, reviewable evidence from candidate posts.
- Blocks jokes, questions, metaphors, uncertain statements, and review-gated evidence from changing either metric automatically.
- Calculates a primary Reset Watch Score from the maximum of calibrated timing, independent elapsed-cycle pressure, policy-timing, and strongest live-signal readiness, then applies negative evidence once. The score is not a probability.
- Preserves a clear official continuing-reset policy across cycle boundaries for up to seven days while moderating it by cycle maturity and age; there is no fixed policy floor.
- Preserves Reset Oracle v2 as a separate calibrated 36-hour probability with a credible interval and 5,000 deterministic seeded simulations.
- Resolves the previous announcement forecast when a completed reset or bounded official scheduled-reset announcement is verified, preserves execution-versus-schedule semantics for audit, and starts the next cycle immediately at zero cycle maturity.
- Exposes Forecast-moving and Screened out evidence, model provenance, resolved-event history, and active-cycle state through a public read-only Data Lab.

## How we built it

The product uses Next.js App Router and strict TypeScript. Supabase Postgres stores monitored accounts, source posts, structured extraction records, verified milestones and resets, forecasts, contributions, ingestion runs, and backtests. The official X API adapter reads at most 10 posts during initial activation and uses `since_id` for unseen posts afterward.

Candidate posts go to the OpenAI Responses API with a strict Zod-backed schema. GPT-5.6 returns evidence fields, never a final score. Deterministic TypeScript then calculates two distinct outputs:

1. **Reset Oracle v2 calibrated probability:** a policy branch estimates pledged-milestone arrival and reset-given-milestone risk; a discretionary branch applies six-hour logistic hazards to current evidence. Five thousand seeded simulations produce the rolling 36-hour probability interval.
2. **Reset Watch Score:** a separately versioned engine uses max-channel fusion so calibrated timing, elapsed-cycle pressure, policy-timing, and correlated live signals are not added together.

A canonical snapshot keeps the homepage, charts, public API, Latest Signals, and Data Lab synchronized. An eligible official announcement closes one forecast cycle at publication, records whether rollout is completed or scheduled, excludes pre-cycle evidence, and begins the active next-announcement forecast.

## The role of OpenAI

GPT-5.6 interprets candidate public-post text and returns strict fields such as signal type, reset type, confidence, evidence excerpts, uncertainties, and review status. It does not calculate the Reset Watch Score or Reset Oracle v2's calibrated probability. Obvious irrelevant posts are screened before a model call, and deterministic safety rules keep ambiguous evidence from moving the forecast automatically.

## How Codex helped

Codex was used across the engineering lifecycle: repository implementation, database and API work, test creation, production debugging, responsive hardening, ambiguity-safety work, the strict one-month walk-forward evaluation, Reset Oracle v2, the hybrid cycle engine, documentation, and deployment preparation. Private prompts, session content, credentials, and provider payloads are not part of the submission.

## Challenges

- **Separating extraction from prediction.** GPT-5.6 had to structure evidence without being allowed to invent either final metric.
- **Handling playful language safely.** Jokes, questions, metaphors, and uncertain claims receive zero automatic impact.
- **Modeling consecutive milestone resets.** Reset Oracle v2 isolates policy risk so discretionary cooldown cannot suppress rapid pledged milestones.
- **Closing resolved cycles correctly.** A completed reset remains auditable but contributes zero to the next cycle.
- **Preventing leakage.** Every backtest cutoff reconstructs evidence and model context using only information available at that time.

## Accomplishments

- A complete offline Demo Mode with deterministic local extraction and clearly labeled synthetic data.
- Incremental official-X ingestion with cursoring, deduplication, audit payloads, rate-limit handling, and local pre-screening.
- Strict OpenAI structured evidence extraction with deterministic fallback and ambiguity protection.
- Two inspectable outputs that answer different questions without conflating an operational score with a calibrated probability.
- Human-reviewed 3M–9M announcement history preserving full, banked, and scheduled distinctions without inventing execution times.
- A public Data Lab, canonical audit snapshot, protected operational surface, and privacy-safe public visit counter.
- A cached, six-hour walk-forward backtest with target-announcement exclusion in strict pre-announcement evaluation.

## Internal judge assessment

| Criterion | Evidence a judge can inspect |
| --- | --- |
| Technological Implementation | The OpenAI stage stops at structured evidence; deterministic TypeScript owns both outputs. Max-channel fusion prevents correlated evidence from being counted twice, and one canonical snapshot feeds every public consumer. |
| Design | Policy status, operational readiness, and calibrated probability are visually and semantically separate instead of being compressed into one impressive-looking number. |
| Potential Impact | The output maps fragmented reset evidence to a practical quota-planning decision: run work now, protect capacity, or keep heavy runs queued. |
| Quality of the Idea | The Data Lab exposes the winning channel, policy confidence, cycle maturity, decay, uncertainty, and audit cutoff, making disagreement inspectable rather than hidden behind model branding. |

This assessment is about product and implementation quality, not an accuracy claim. The four-event Reset Oracle evaluation remains **Promising but unvalidated**, and the Watch Score has not been calibrated or added to the Brier comparison.

## Backtest result

The historical comparison applies to Reset Oracle v2, not the Reset Watch Score.

| Measure | Strict pre-announcement result |
| --- | ---: |
| Evaluation period | 17 June to 17 July 2026 |
| Forecasts generated | 120 |
| Scored windows | 115 |
| Verified announcements | 4 |
| Reset Oracle v1 Brier score | 0.1522 |
| Reset Oracle v2 Brier score | 0.1127 |
| Constant baseline Brier score | 0.1320 |
| v2 skill versus constant | +14.63% |
| Events crossing 30% before publication | 2 of 4 |
| Events crossing 50% before publication | 1 of 4 |
| Highest observed false-alarm probability | 5.1% |

Observed lead time was 19.6 hours above 30% before the 8M announcement. Before the 9M announcement, v2 crossed 30% 52.2 hours early and 50% 28.2 hours early. It did not cross 30% before the 6M or 7M announcements.

**Promising but unvalidated.** V2 improved on v1 and the constant baseline in this cached month, but four announcements cannot establish general reliability. Historical simulation, not a guarantee of future resets. Verified execution timestamps were unavailable for a separate execution-time score.

## Three-minute judge walkthrough

1. **0:00–0:25 — Reset Released.** Show the latest completed event, its official timestamp and source, then explain that the previous forecast is resolved and a new cycle begins immediately.
2. **0:25–0:45 — Three distinct answers.** Show Reset Policy status, the Reset Watch Score `/ 100`, and Reset Oracle v2's calibrated next-36-hour probability. Explain that confidence in continuing policy is not the same as near-term readiness.
3. **0:45–1:05 — Reset Oracle v2.** Point to the separate calibrated 36-hour probability, credible interval, cutoff, seed, and evidence provenance.
4. **1:05–1:25 — Evidence states.** Switch between Forecast-moving and Screened out to show active, excluded, expired, and previous-cycle evidence.
5. **1:25–1:45 — Resolved trend.** Show the calibrated trend's 98% resolved-event marker and the visually separated active next cycle.
6. **1:45–2:10 — Diagnostics.** Open the policy and signal record, model version, feature origins, uncertainty, and simulation count.
7. **2:10–2:30 — Honest evaluation.** Present the v2 Brier result and lead times, then state the four-event limitation and “Promising but unvalidated” interpretation.
8. **2:30–3:00 — Public audit.** Open the Data Lab and compare RESOLVED EVENT with ACTIVE NEXT-RESET FORECAST, including cycle cutoff and exclusions.

No production data mutation is required for this walkthrough.

## Devpost media reference

Use the following current-production images from [`docs/readme/`](readme/). The recommended Devpost thumbnail is the first image.

1. `01-current-forecast.jpg`

   The hero separates the resolved reset, active reset policy, Reset Watch Score, and calibrated next-36-hour probability.

2. `02-policy-model.jpg`

   Max-channel diagnostics expose calibrated timing, policy-timing, strongest live-signal readiness, and the bounded negative penalty without double counting.

3. `03-latest-signals.jpg`

   Forecast-moving and Screened out tabs keep active evidence visible while preserving irrelevant and expired posts for audit.

4. `04-reset-history.jpg`

   The calibrated trend preserves the resolved 98% reset event while separating the active forecast for the next cycle.

5. `05-data-lab.jpg`

   The Public Data Lab exposes the resolved event, active-cycle Watch decomposition, policy regime, calibrated forecast, exclusions, and audit cutoff.

- Preferred thumbnail ratio: **3:2**
- Maximum Devpost file size: **5 MB**
- Do not use the obsolete 69% image.

## Judge setup without credentials

```bash
git clone https://github.com/9natthaphong/tiboreset.git
cd tiboreset
npm ci
npm run dev:demo
```

Open <http://localhost:3000>. Fixture posts and forecasts are explicitly labeled Demo Data. Demo Mode demonstrates the offline architecture and does not claim to reproduce the current production reset event.

## Disclaimer

Sacred Forecast / TiboReset is an unofficial experimental project. It is not affiliated with or endorsed by OpenAI or X. Its metrics are planning aids, not official announcements or account-level rollout promises.
