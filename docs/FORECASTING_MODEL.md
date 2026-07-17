# Forecasting model

RESET ORACLE uses six-hour discrete logistic hazards: `h = sigmoid(intercept + Σ(feature × coefficient))`, and `P(horizon) = 1 − Π(1 − h)`. It is an expert-prior hazard model, not a statistically trained prediction model. Coefficients and their uncertainty are editable and versioned; predictions are capped at 97% unless confirmation evidence exists.

Five thousand seeded simulations sample coefficient uncertainty and return median, p10/p90, standard deviation, and histogram. The hero uses the median. Contributions reconcile in log-odds space. Signal Surge compares recent seven-day frequency with a 28-day baseline. Analog similarity never replaces the hazard model.

Feature values retain an origin: `measured`, `derived`, `expert_prior`, or `unavailable`. Reset timing, cooldown, milestone proximity and velocity, signal-frequency change, and source reliability are derived from cutoff-safe verified records. Historical analog outcomes remain unavailable until reviewed windows include real forward outcomes; the engine does not substitute fixed pseudo-historical rates.

Walk-forward backtests filter every post, reset, milestone observation, operational event, and derived feature at the cutoff before feature building. Future outcomes are used only after the prediction is frozen.
