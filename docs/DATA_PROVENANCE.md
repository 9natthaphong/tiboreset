# Data provenance

Each forecast retains its exact cutoff, source post IDs, extracted event IDs, feature snapshot, model version, configuration hash, simulation seed/count, and contribution math. “Export forecast audit JSON” exports these fields and no secrets. Live raw X payloads are retained server-side from the activation date onward. Demo fixtures are version-controlled in `src/data/demo.json` and are synthetic.

Historical claims enter only through `source-manifest.json`, `verified-reset-ledger.json`, and `historical-signal-windows.json`. Every record carries source URL/post ID when available, observed and event timestamps, category, reset type, verification notes/status, positive or negative window, and manual provenance. Cross-file source references are validated before idempotent import. LLM output is never accepted into this seed boundary.
