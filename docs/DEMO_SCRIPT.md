# Three-minute demo script

The complete judge flow works without X, OpenAI, Supabase, or Resend credentials.

## Start

```bash
npm ci
npm run dev:demo
```

Open <http://localhost:3000>. Point out the **Demo Mode** label before using any fixture evidence.

## Walkthrough

### 0:00-0:25 - Arrival and current answer

Scroll through the cinematic reveal. Identify the current 36-hour probability, likely interval, horizon, trend, and freshness. Explain the user decision: spend, save, or queue quota-heavy Codex work.

### 0:25-0:55 - Evidence, not a generated percentage

Open **Latest Signals**. Show that each post has an event type, confidence or screening state, review state, and forecast impact. State that obvious irrelevant posts are screened locally and ambiguous wording receives zero automatic impact.

### 0:55-1:30 - Reset Oracle v2

Open **Advanced Diagnostics**. Show policy-driven risk, signal-driven risk, and the combined probability. Point to the model version, cutoff, seed, 5,000 simulations, feature origins, and contribution ranking.

State clearly: GPT-5.6 extracts structured evidence. Reset Oracle v2 calculates the probability.

### 1:30-1:55 - Verified reset history

Show the 3M-9M ledger. Highlight the distinction between full, banked, and scheduled announcements and explain that announcement times are not presented as execution times.

### 1:55-2:20 - Honest evaluation

Show the cached one-month backtest record. V2's strict pre-announcement Brier score is 0.1127 versus 0.1522 for v1 and 0.1320 for the constant baseline. It crossed 30% before two of four announcements and 50% before one.

Use the required interpretation: **Promising but unvalidated.** Four announcements cannot establish general reliability.

### 2:20-2:40 - Public audit trail

Open `/lab/data`. Show the read-only source, extraction, milestone, forecast, feature-origin, backtest, and X-resource records. Operational controls and secrets are not public.

### 2:40-3:00 - Offline movement and alerts

Open `/control-room` in Demo Mode. Inject the demo signal, show the deterministic forecast change, and demonstrate the labeled Demo Email outbox and deduplication. Do not describe this as an externally delivered email.

## Close

Sacred Forecast is an unofficial planning aid. It is not affiliated with OpenAI or X, and its historical simulation is not a guarantee of future resets.
