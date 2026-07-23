# Limitations

Reset Oracle is a policy-aware expert-prior model, not a statistically trained prediction model. The discretionary intercept, coefficient means, and coefficient uncertainty are judgmental, versioned priors. GPT-5.6 extracts structured evidence but does not calculate the final probability.

The Reset Watch Score is not calibrated and must not be read as a probability. Its structured-signal ceilings, continuing-policy lifetime, and sparse-history cycle-pressure transform are explicit expert priors. Policy evidence remains at full confidence for 72 hours and decays to expiry at seven days, but it affects readiness only through `policy confidence × cycle maturity × decay`; there is no policy floor. Independent cycle pressure is monotonic operational context derived from verified cadence and horizon coverage, not an empirical conditional probability. A statement that resets will continue says nothing precise about the next reset time, so high policy confidence can coexist with a low Watch Score.

The strict one-month evaluation contains only four verified reset announcements. V2 improved on v1 and the constant base-rate baseline in that cached period, but the sample is too small to establish general calibration, accuracy, or reliability. The correct interpretation is **Promising but unvalidated**. Historical simulation is not a guarantee of future resets.

The evaluation target is an official full, banked, or scheduled reset announcement. It does not silently treat announcement time as execution time. A separate execution-time evaluation remains unavailable when no genuinely verified execution timestamp exists.

The human-reviewed seed ledger covers the 3M-9M official announcements. Live verified records can extend that history without editing seed JSON. Combined Codex and ChatGPT Work user figures are not Codex-only counts, and the documented pledge ends at 10M; the system does not infer an 11M promise.

One monitored public account is a sparse source. Public posts may be playful, incomplete, delayed, or operationally ambiguous. Deterministic safety rules exclude jokes, questions, metaphors, and uncertain or conditional language from automatic forecast impact, but human review remains important.

Historical analog percentages are cosine-similarity scores used only as supporting context, not probabilities or historical success rates. Unscored analog windows are excluded from performance evaluation and do not affect the published calibration result. Historical forward outcomes and negative windows remain limited; unsupported values are marked unavailable rather than replaced with pseudo-historical rates. External competitor events are context only and have zero model weight unless a future calibrated, reviewed relationship justifies a versioned change.

X API access, Supabase persistence, and OpenAI extraction operate only when their complete server configuration is present. Demo Mode remains functional without those services and labels all synthetic information. The public forecast is an unofficial planning aid, not an OpenAI announcement or an account-level rollout promise.
