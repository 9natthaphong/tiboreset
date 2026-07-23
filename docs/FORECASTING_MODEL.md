# Forecasting model

## What the model is

Reset Oracle is a versioned expert-prior forecasting system, not a statistically trained prediction model. GPT-5.6 can extract strict evidence from candidate public posts, but it never outputs the final probability. The probability is calculated by deterministic TypeScript and a reproducible seeded simulation.

Reset Oracle v1 (`reset-oracle-1.1.0`) remains available for comparison. The production model is the policy-aware Reset Oracle v2 (`reset-oracle-2.0.0`).

## V2 causal branches

### Policy-driven reset risk

```text
P(policy reset within H)
  = P(next pledged milestone within H | survived to elapsed)
    * P(reset announcement | pledged milestone)
```

The milestone-arrival model is a recency-aware mixture of log-normal renewal distributions. It uses only completed inter-milestone intervals available before the forecast cutoff. Conditional survival is:

```text
P(arrival within H | survived to elapsed)
  = 1 - S(elapsed + H) / S(elapsed)
```

The model exposes the long-term interval median, recent interval median, recent-regime weight, elapsed time, and conditional 36-hour arrival probability. It does not treat `reported milestone / next target` as a live user-progress measurement because the count between announcements is unknown.

The reset-given-milestone probability uses a Beta-Binomial posterior with a `Beta(1,1)` prior. Full, banked, and scheduled reset announcements count as successes; announcement-only milestones count as failures. Each cutoff uses only outcomes known before it. The target policy currently covers one-million-user milestones through 10M; after that target is fulfilled, the model does not invent an 11M pledge.

### Signal-driven reset risk

The discretionary branch uses six-hour discrete logistic hazards:

```text
h = sigmoid(intercept + sum(feature * coefficient))
P(horizon) = 1 - product(1 - h_interval)
```

Features include explicit reset language, public commitments, usage incidents, capacity concern, promotions, launches, community polls, signal-frequency change, evidence recency, source reliability, and unresolved ambiguity. Coefficient means and uncertainty are versioned expert priors. Recent-reset cooldown applies only to this discretionary branch.

### Combined risk

```text
P(total reset)
  = 1 - (1 - P(policy reset)) * (1 - P(discretionary reset))
```

Verified explicit reset confirmation raises the result to at least 98%. A credible official scheduled reset or direct future commitment can establish a high-confidence floor according to extraction confidence and timing. Jokes, questions, metaphors, uncertain wording, and conditional statements without a credible operational commitment receive zero automatic impact and require review.

## Simulation and reproducibility

Five thousand seeded simulations sample:

- milestone interval uncertainty;
- recent-regime weight uncertainty;
- the reset-given-milestone Beta posterior; and
- discretionary coefficient uncertainty.

The output retains median, p10, p25, p75, p90, standard deviation, histogram buckets, policy and discretionary distributions, configuration hash, seed, count, cutoff, and evidence identifiers. Repeating the same input with the same seed reproduces the same result.

## Feature origins

Every feature is labeled as one of:

| Origin | Meaning |
| --- | --- |
| `measured` | Directly observed in structured public evidence |
| `derived` | Deterministically calculated from cutoff-safe verified records |
| `expert_prior` | A versioned judgmental assumption or coefficient |
| `unavailable` | Not supported by the current reviewed dataset |

Time since last reset, discretionary cooldown, milestone arrival, milestone velocity, signal-frequency change, and source reliability are derived from verified data at the cutoff. Historical analog success remains unavailable unless reviewed windows support a real forward outcome; the engine does not substitute fixed pseudo-history.

## Walk-forward evaluation

The cached evaluation covers 17 June through 17 July 2026 at six-hour cutoffs and a 36-hour horizon. The strict pre-announcement test excludes each target announcement and any direct summary published at or after it. Interval distributions and policy posteriors update prequentially: an earlier milestone becomes available only after it occurs.

| Measure | V1 | V2 | Constant baseline |
| --- | ---: | ---: | ---: |
| Brier score | 0.1522 | **0.1127** | 0.1320 |
| Brier skill vs. constant | -0.1530 | **+0.1463** | 0.0000 |
| Log loss | 0.6866 | **0.4845** | - |

V2 generated 120 forecasts, scored 115 non-censored windows, and evaluated four verified reset announcements. It crossed 30% before two announcements and 50% before one. The highest observed false-alarm probability was 5.1%.

**Promising but unvalidated.** V2 improved on v1 and the constant baseline in this month, but four announcements cannot establish general accuracy or reliability. The target is an official reset announcement. A separate execution-time target remains unavailable where no genuinely verified execution timestamp exists.

See the [full v2 report](../artifacts/backtests/2026-06-17_2026-07-17/v2/MODEL_V2_REPORT.md) and [comparison JSON](../artifacts/backtests/2026-06-17_2026-07-17/v2/v1-v2-comparison.json).

## Alert bands

| Probability | Label |
| --- | --- |
| 0-20% | Low |
| 20-40% | Watch |
| 40-60% | Elevated |
| 60-80% | High |
| 80-97% | Imminent |
| 98%+ | Confirmed |

These are communication labels, not accuracy claims.

## Reset Watch Score

Sacred Watch (`sacred-watch-2.1.0`) is a separate operational-readiness model. It is not statistically calibrated and never carries a percent sign. Reset Oracle v2 remains the only calibrated next-36-hour probability.

Four bounded channels are calculated from the same canonical cutoff:

```text
timingChannel = Reset Oracle v2 calibrated probability

cycleMaturity = clamp(cyclePoints / 20, 0, 1)
cyclePressureChannel =
  cycleMaturity × clamp(36h / expectedCycleHours, 0, 1)

policyTimingChannel = policyConfidence × cycleMaturity × policyDecay

liveSignalChannel = max(eligible structured-signal readiness)

rawWatch = max(
  timingChannel,
  cyclePressureChannel,
  policyTimingChannel,
  liveSignalChannel
)
adjustedWatch = rawWatch × (1 - boundedNegativePenalty)
watchScore = round(clamp(adjustedWatch × 100, 0, 94))
```

A credible near-term commitment is the sole active-cycle override at 95. A completed reset or bounded official scheduled-reset announcement resolves the previous announcement forecast at publication time, becomes the new `cycleStartAt`, and contributes zero to the next cycle. Scheduled rollout remains distinct from completed execution. Cycle maturity and cycle pressure are exactly zero at that timestamp. Transient evidence at or before the boundary is excluded.

### Cycle maturity

The existing cutoff-safe cycle estimator supplies monotonic points from 0 to 20. It uses a recent/long-term median blend when enough verified intervals exist, then falls back through recent median, long-term median, a single interval, and finally a conservative 168-hour prior. Normalizing those points by 20 preserves the same transparent curve: 0 at reset, 0.25 at one-quarter cycle, 0.50 at one-half cycle, 0.75 at the expected cycle, and 1.00 at twice the expected cycle.

The verified interval sample remains too small for a stable empirical conditional-survival estimate. Sacred Watch therefore derives independent cycle pressure from normalized maturity multiplied by the fraction of the expected cycle covered by the 36-hour horizon. It is monotonic, bounded, zero at the cycle boundary, and explicitly labeled an expert-prior operational signal—not a probability. Policy timing uses the same maturity but remains a separate channel; max fusion prevents the two from being added.

### Continuing reset-policy regime

A clear monitored-official statement that resets will continue activates `reset_policy_active`. It is high policy relevance but low time immediacy: it is neither confirmation nor a near-term commitment. Full evidence strength lasts 72 hours, then decays smoothly to zero at seven days unless refreshed. A newer withdrawal such as “No more resets” supersedes it immediately, and repeated compatible statements never stack.

Policy state and timing readiness are deliberately separated. The regime carries confidence, source, age, expiry, and decay, but no fixed boost or score floor. Consequently, a 92%-confidence policy statement at cycle maturity 0 contributes 0 to the policy-timing channel; at 50% maturity it contributes 0.46 while fully fresh.

### Structured live-signal channel

Each eligible signal receives one bounded readiness value based on semantic type, operational relevance, reset intent, time immediacy, source authority, extraction confidence, and recency. General updates are bounded at 0.15, untimed operator intervention at 0.35, work underway at 0.75, reset hints at 0.80, milestone commitments at 0.92, and credible near-term commitments at 0.95. These bands are expert priors, not learned probabilities. Only the strongest signal in each semantic group survives, and only the strongest surviving live-signal value enters the score.

The strongest eligible negative signal supplies one multiplicative penalty. Negative posts do not stack, and the penalty is not applied separately to every channel. A continuing-policy statement can also enter Reset Oracle v2 through its existing deterministic public-commitment feature path, measured with a no-write counterfactual, but it never receives a fixed probability addition or confirmation override.

### Deterministic scenario table

The table is generated by `npm run watch:scenarios`; values below are fixed test scenarios, not live claims.

| Scenario | Timing | Cycle | Policy | Signal | Negative | Winner | Watch | Calibrated |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Just after reset, no policy or signals | 0.03 | 0.00 | 0.00 | 0.00 | 0.00 | Timing | 3 / 100 | 3% |
| Just after reset, active policy | 0.03 | 0.00 | 0.00 | 0.00 | 0.00 | Timing | 3 / 100 | 3% |
| Quarter cycle, no policy | 0.05 | 0.25 | 0.00 | 0.00 | 0.00 | Cycle pressure | 25 / 100 | 5% |
| Quarter cycle, active policy | 0.12 | 0.25 | 0.23 | 0.00 | 0.00 | Cycle pressure | 25 / 100 | 12% |
| Half cycle, no policy | 0.08 | 0.50 | 0.00 | 0.00 | 0.00 | Cycle pressure | 50 / 100 | 8% |
| Half cycle, active policy | 0.20 | 0.50 | 0.46 | 0.00 | 0.00 | Cycle pressure | 50 / 100 | 20% |
| Expected cycle, no policy | 0.10 | 0.75 | 0.00 | 0.00 | 0.00 | Cycle pressure | 75 / 100 | 10% |
| Expected cycle, active policy | 0.35 | 0.75 | 0.69 | 0.00 | 0.00 | Cycle pressure | 75 / 100 | 35% |
| 1.5 expected cycles, no policy | 0.12 | 0.88 | 0.00 | 0.00 | 0.00 | Cycle pressure | 88 / 100 | 12% |
| 1.5 expected cycles, active policy | 0.38 | 0.88 | 0.81 | 0.00 | 0.00 | Cycle pressure | 88 / 100 | 38% |
| Operator intervention without timing | 0.08 | 0.06 | 0.00 | 0.17 | 0.00 | Live signal | 17 / 100 | 8% |
| Operational work underway | 0.18 | 0.06 | 0.00 | 0.63 | 0.00 | Live signal | 63 / 100 | 18% |
| Reset hint | 0.22 | 0.06 | 0.00 | 0.64 | 0.00 | Live signal | 64 / 100 | 22% |
| Milestone commitment | 0.32 | 0.06 | 0.00 | 0.78 | 0.00 | Live signal | 78 / 100 | 32% |
| Near-term reset commitment | 0.40 | 0.06 | 0.00 | 0.84 | 0.00 | Override | 95 / 100 | 40% |
| Completed reset | 0.03 | 0.00 | 0.00 | 0.00 | 0.00 | Timing | 3 / 100 | 3% |
| Policy withdrawn | 0.15 | 0.06 | 0.00 | 0.00 | 0.47 | Timing | 8 / 100 | 15% |
| Strong negative evidence | 0.45 | 0.06 | 0.00 | 0.63 | 0.45 | Live signal | 35 / 100 | 45% |

The scenarios demonstrate the intended epistemic distinction: policy confidence can remain high while readiness is low, and the Watch Score can diverge from the calibrated probability without pretending to be calibrated itself.
