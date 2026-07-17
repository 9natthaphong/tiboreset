# Reset Oracle one-month walk-forward backtest

Report version: walk-forward-2026-07-17.1

## Scope

- Evaluation: 2026-06-17T00:00:00Z through 2026-07-17T00:00:00Z
- Step: 6 hours
- Horizon: 36 hours
- Frozen production model; 5,000 seeded simulations per cutoff
- X resources read: 298
- OpenAI extraction calls: 41

## Primary result

**Insufficient data**

The strict pre-announcement test produced a Brier score of 0.1621 versus 0.1389 for the constant base-rate baseline (skill -0.1673). The model did not beat every listed simple baseline.

One month and 4 reset announcements cannot establish general reliability. This is a historical simulation, not a guarantee of future resets.

## Data audit

- Earliest production post before acquisition: 2026-07-16T04:28:15+00:00
- Latest production post before acquisition: 2026-07-17T04:11:18+00:00
- Production posts inside period: 14
- Historical posts evaluated: 286
- Verified announcement outcomes: 4
- Verified execution target: unavailable; the reviewed ledger does not assert separate execution timestamps

## Test separation

Real-time observable forecasts include confirmation detection after an announcement becomes public. Strict forecasts exclude verified target announcement posts and direct confirmation evidence from the evaluation month. Metrics are not mixed.

## Strict metrics

- Cutoffs: 120
- Positive windows: 20
- Negative windows: 100
- Event base rate: 16.7%
- Brier score: 0.1621
- Constant baseline Brier: 0.1389
- Brier skill: -0.1673
- Log loss: 0.7312
- ROC AUC: 0.1545
- Average precision: 0.0928

## Thresholds

| Threshold | Precision | Recall | False positives | False negatives |
|---:|---:|---:|---:|---:|
| 30.0% | Unavailable | 0.0% | 0 | 20 |
| 50.0% | Unavailable | 0.0% | 0 | 20 |
| 60.0% | Unavailable | 0.0% | 0 | 20 |
| 70.0% | Unavailable | 0.0% | 0 | 20 |
| 80.0% | Unavailable | 0.0% | 0 | 20 |

## Event-by-event

| Event | Type | Milestone | Maximum pre-announcement | Predicted above 50% |
|---|---|---:|---:|---|
| 2026-07-12T17:59:57.945Z | full | 6M | 2.5% | No |
| 2026-07-13T18:29:31.013Z | banked | 7M | 2.5% | No |
| 2026-07-14T19:34:54.638Z | full | 8M | 2.5% | No |
| 2026-07-16T04:14:09.822Z | full | 9M | 2.5% | No |

## Interpretation guardrail

There are too few independent reset events to make a public accuracy claim.
