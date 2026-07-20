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

## Live Reset Likelihood state boundary

Sacred Likelihood (`sacred-likelihood-1.1.0`) is a separate operational score. In a normal cycle it combines a 30-point baseline with monotonic cycle pressure, a cooldown-gated contribution from Reset Oracle v2, capped and decayed transient signals, negative evidence, and an independently inspectable continuing-policy regime. Normal values remain non-calibrated.

A verified official completed full or banked reset immediately closes the previous forecast cycle. Its timestamp becomes `cycleStartAt`, `hybridState` becomes `new_cycle`, and the ordinary active-cycle baseline starts at exactly 30. The completed confirmation is retained as a resolved event but contributes zero to current `signalPoints`; transient evidence at or before the boundary is excluded.

### Continuing reset-policy regime

A clear monitored-official statement that resets will continue activates `reset_policy_active`. It is high policy relevance but low time immediacy: it is neither confirmation nor a near-term commitment. Full regime strength lasts 72 hours, then decays smoothly to zero at seven days unless refreshed. A newer withdrawal such as “No more resets” supersedes it immediately, and repeated compatible statements never stack.

The regime uses a max/floor operation rather than adding a flat 30 points:

```text
ordinaryHybrid = 30 + cycle + historical + transient - negative
policyFloor = 30 + policyContinuationBoost
scoreBeforeCap = max(ordinaryHybrid, policyFloor)
```

A fresh, explicit, high-confidence official continuation produces a 30-point boost and a floor of 60. Without credible timing evidence the result is capped at 80. Operational work with timing or a milestone commitment may lift that cap; only a credible near-term commitment produces 95. The 72-hour window, seven-day expiry, 30-point maximum boost, and 80 cap are expert product priors, not learned parameters.

The calibrated Reset Oracle v2 probability remains a separate result. A continuing-policy statement can enter its normal public-commitment feature path and is measured with a no-write counterfactual, but it never receives a fixed probability addition or override. The resolved 98% confirmation forecast stays in stored audit history, while the active probability is rebuilt from cutoff-safe evidence.
