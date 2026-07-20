# Limitations

Reset Oracle is a policy-aware expert-prior model, not a statistically trained prediction model. The discretionary intercept, coefficient means, and coefficient uncertainty are judgmental, versioned priors. GPT-5.6 extracts structured evidence but does not calculate the final probability.

Live Reset Likelihood is not calibrated. Its continuing-policy regime uses a 72-hour full-strength period, seven-day expiry, score floor, and policy-only cap as explicit product priors. A statement that resets will continue says nothing precise about the next reset time, so the operational score may remain materially above Reset Oracle v2's calibrated 36-hour probability.

The strict one-month evaluation contains only four verified reset announcements. V2 improved on v1 and the constant base-rate baseline in that cached period, but the sample is too small to establish general calibration, accuracy, or reliability. The correct interpretation is **Promising but unvalidated**. Historical simulation is not a guarantee of future resets.

The evaluation target is an official full, banked, or scheduled reset announcement. It does not silently treat announcement time as execution time. A separate execution-time evaluation remains unavailable when no genuinely verified execution timestamp exists.

The 3M-9M reset ledger contains reviewed official announcements. Combined Codex and ChatGPT Work user figures are not Codex-only counts. The 10M value is a pledged policy boundary until a verified event reports that it has been reached. The system does not infer an 11M promise.

One monitored public account is a sparse source. Public posts may be playful, incomplete, delayed, or operationally ambiguous. Deterministic safety rules exclude jokes, questions, metaphors, and uncertain or conditional language from automatic forecast impact, but human review remains important.

Historical analog outcomes and negative windows remain limited. Unsupported values are marked unavailable rather than replaced with pseudo-historical rates. External competitor events are context only and have zero model weight unless a future calibrated, reviewed relationship justifies a versioned change.

X API access, Supabase persistence, OpenAI extraction, and Resend delivery operate only when their complete server configuration is present. Demo Mode remains functional without those services and labels all synthetic information. The public forecast is an unofficial planning aid, not an OpenAI announcement or an account-level rollout promise.
