# Data provenance

Each forecast retains its exact cutoff, source post IDs, extracted event IDs, feature snapshot, model version, configuration hash, simulation seed/count, and contribution math. “Export forecast audit JSON” exports these fields and no secrets. Live raw X payloads are retained server-side. Demo fixtures are version-controlled in `src/data/demo.json` and are synthetic.
