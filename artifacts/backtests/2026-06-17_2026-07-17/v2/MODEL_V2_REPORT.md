# Reset Oracle v2 policy-model report

Model: reset-oracle-2.0.0

## Formula

P(policy reset) = P(next pledged milestone within 36h | survived to elapsed) × P(reset announcement | milestone).

P(total) = 1 − (1 − P(policy reset)) × (1 − P(discretionary reset)).

The policy branch uses a recency-aware log-normal renewal mixture. One trailing short interval receives 0.68 recent-regime weight, two receive 0.86, and three or more receive 0.93. The Beta(1,1) reset posterior is updated only by milestones completed before each cutoff. Discretionary cooldown never suppresses policy risk.

## Strict pre-announcement comparison

| Model | Brier | Base-rate Brier | Skill | Log loss | ROC AUC | Average precision |
|---|---:|---:|---:|---:|---:|---:|
| v1 | 0.1522 | 0.1320 | -0.1530 | 0.6866 | 0.1667 | 0.0870 |
| v2 | 0.1127 | 0.1320 | 0.1463 | 0.4845 | 0.4198 | 0.4636 |

V2 beats v1 and meets or beats the constant baseline. Production-default eligibility: **yes**.

The command generated 120 six-hour forecasts and scored 115. The final 5 horizons cross the evaluation boundary and are retained as forecasts but excluded from metrics and false-alarm counts rather than being mislabeled as negative outcomes.

### Simple baseline Brier scores

| Baseline | Brier |
|---|---:|
| Constant base rate | 0.1320 |
| Time since last reset | 0.2467 |
| Milestone proximity only | 0.3574 |
| Cooldown + milestone | 0.3130 |

## Current cached-period snapshot

- Policy-driven risk: 74.4%
- Signal-driven risk: 0.5%
- Combined risk: 74.6%
- Next pledged target: 10M
- Recent interval median: 25.1 hours
- Long-term interval median: 951.1 hours
- Regime weight: 0.93
- Reset-given-milestone posterior: 0.889 (7 successes, 0 failures)

## Event results

| Event | Maximum pre-announcement | 36h before | 24h before | 12h before | 6h before |
|---|---:|---:|---:|---:|---:|
| 2026-07-12T17:59:57.945Z | 5.1% | 4.9% | 4.9% | 4.9% | 4.9% |
| 2026-07-13T18:29:31.013Z | 5.1% | 4.9% | 0.5% | 0.5% | 0.5% |
| 2026-07-14T19:34:54.638Z | 36.1% | 0.5% | 0.5% | 31.9% | 27.7% |
| 2026-07-16T04:14:09.822Z | 66.2% | 27.7% | 62.9% | 65.3% | 61.5% |

### Earliest threshold crossings

| Event | 30% | 50% | 60% | 70% | 80% |
|---|---:|---:|---:|---:|---:|
| 2026-07-12T17:59:57.945Z | not reached | not reached | not reached | not reached | not reached |
| 2026-07-13T18:29:31.013Z | not reached | not reached | not reached | not reached | not reached |
| 2026-07-14T19:34:54.638Z | 19.6 | not reached | not reached | not reached | not reached |
| 2026-07-16T04:14:09.822Z | 52.2 | 28.2 | 28.2 | not reached | not reached |

### Highest-probability false-alarm windows

| Cutoff | Probability | Policy branch | Signal branch |
|---|---:|---:|---:|
| 2026-06-29T00:00:00.000Z | 5.1% | 4.2% | 0.9% |
| 2026-06-28T18:00:00.000Z | 5.1% | 4.2% | 0.9% |
| 2026-06-29T06:00:00.000Z | 5.1% | 4.2% | 0.9% |
| 2026-06-29T12:00:00.000Z | 5.1% | 4.2% | 0.9% |
| 2026-06-29T18:00:00.000Z | 5.1% | 4.2% | 0.9% |

Historical simulation, not a guarantee of future resets. The evaluation contains only four verified announcements.
