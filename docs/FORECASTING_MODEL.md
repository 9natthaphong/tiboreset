# Forecasting model

RESET ORACLE v1 uses six-hour discrete logistic hazards: `h = sigmoid(intercept + Σ feature × coefficient)`, and `P(horizon) = 1 − Π(1 − h)`. Coefficients are editable versioned expert priors because no credible training corpus is included. Predictions are capped at 97% unless confirmation evidence exists.

Five thousand seeded simulations sample coefficient uncertainty and return median, p10/p90, standard deviation, and histogram. The hero uses the median. Contributions reconcile in log-odds space. Signal Surge compares recent seven-day frequency with a 28-day baseline. Analog similarity never directly replaces the hazard model.

Walk-forward backtests filter all posts and derived evidence at the cutoff before feature building. Future outcomes are used only after the prediction is frozen.
