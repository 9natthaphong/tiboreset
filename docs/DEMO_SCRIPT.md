# Three-minute demo script

The no-credential judge path works without X, OpenAI, or Supabase credentials. Demo posts and forecasts are synthetic fixtures and remain explicitly labeled; they should not be presented as the current production reset event.

## Start

```bash
npm ci
npm run dev:demo
```

Open <http://localhost:3000> and point out the **Demo Mode** label before using fixture evidence. For the current live story, use <https://tiboreset.vercel.app> and the read-only <https://tiboreset.vercel.app/lab/data>.

## Production walkthrough

### 0:00–0:25 — Reset Released and the new cycle

Open the production hero. Show the latest official completed reset, its timestamp and source, then explain that it resolved the previous forecast and immediately began a new active cycle.

### 0:25–0:45 — Policy, readiness, and probability

Show the three separate readouts. **Reset Policy** reports whether official evidence supports continuing resets. **Reset Watch Score** reports operational readiness as `/ 100`, not a probability. **Reset Oracle v2** remains the calibrated next-36-hour estimate.

### 0:45–1:05 — Calibrated 36-hour probability

Point to Reset Oracle v2's separate calibrated probability, credible interval, rolling horizon, model version, cutoff, and deterministic simulation record. The two values answer different questions.

State clearly: GPT-5.6 extracts structured, reviewable evidence. Deterministic TypeScript calculates both final metrics.

### 1:05–1:25 — Forecast-moving versus Screened out

Switch between the Latest Signals tabs. Show that active evidence remains concise while irrelevant, expired, review-blocked, and previous-cycle posts remain inspectable without affecting the current cycle.

### 1:25–1:45 — Calibrated trend and resolution marker

Open the calibrated probability trend. Show the historical rise to the resolved 98% event and its RESET RELEASED marker. Explain that the active next-cycle forecast is separated rather than fabricated as a continuation of the completed event.

### 1:45–2:10 — Policy and signal diagnostics

Open **Advanced Diagnostics**. Show the active cycle, calibrated model version, policy and signal components, credible interval, seed, 5,000 simulations, evidence cutoff, and feature origins.

### 2:10–2:30 — Honest historical evaluation

Show the cached one-month backtest. Reset Oracle v2's strict pre-announcement Brier score is 0.1127 versus 0.1522 for v1 and 0.1320 for the constant baseline. It crossed 30% before two of four announcements and 50% before one.

Use the required interpretation: **Promising but unvalidated.** Four announcements cannot establish general reliability. The Reset Watch Score is not part of this Brier-score comparison.

### 2:30–3:00 — Public Data Lab

Open `/lab/data`. Compare **RESOLVED EVENT** with **ACTIVE NEXT-RESET FORECAST**. Show the latest reset source, active cycle start, calibrated and operational values, excluded pre-cycle evidence, and audit cutoff. Operational controls and secrets are not public.

## Demo Mode note

Demo Mode remains useful for an offline walkthrough of synthetic ingestion, extraction, deterministic recalculation, charts, and audit records. Keep fixture provenance visible and do not claim that its state mirrors the live July 18 reset unless the fixtures explicitly do so.

## Close

Sacred Forecast is an unofficial planning aid. It is not affiliated with OpenAI or X. Reset Oracle v2's historical simulation is not a guarantee of future resets, and the Reset Watch Score is an operational-readiness score rather than a calibrated probability.
