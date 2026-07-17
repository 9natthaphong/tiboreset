import { MODEL_CONFIG } from "../model-config";
import { sigmoid } from "../hazard-model";
import type { Features } from "../types";

const discretionaryNames: Array<keyof Features> = ["explicit_reset_hint", "public_commitment_strength", "recent_reset_suppression", "usage_incident_strength", "capacity_concern", "promotional_signal", "product_launch_signal", "community_poll_signal", "signal_frequency_change", "evidence_recency", "source_reliability", "unresolved_ambiguity_penalty"];

export function discretionaryProbability(features: Features, horizonHours: number, coefficients?: Partial<Record<keyof Features, number>>, intercept = MODEL_CONFIG.intercept) {
  const logOdds = discretionaryNames.reduce((sum, name) => sum + features[name] * (coefficients?.[name] ?? MODEL_CONFIG.coefficients[name].mean), intercept);
  const hazard = sigmoid(logOdds);
  return Math.max(.005, Math.min(.97, 1 - (1 - hazard) ** Math.ceil(horizonHours / MODEL_CONFIG.intervalsHours)));
}

export { discretionaryNames };
