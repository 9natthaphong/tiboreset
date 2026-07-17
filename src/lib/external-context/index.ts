import datasetJson from "@/data/external-context-events.json";
import { externalContextDatasetSchema, type ExternalContextDataset, type ExternalContextEvent } from "./schema";

export function loadExternalContextEvents(): ExternalContextDataset {
  return externalContextDatasetSchema.parse(datasetJson);
}

export interface ReviewedOperationalSourceAdapter {
  load(): ExternalContextEvent[];
}

export class ReviewedOpenAIStatusAdapter implements ReviewedOperationalSourceAdapter {
  constructor(private readonly input: unknown = datasetJson) {}
  load() {
    return externalContextDatasetSchema.parse(this.input).events.filter(event =>
      event.provider.toLowerCase() === "openai"
      && event.category === "openai_status_incident"
      && event.sourceType === "official_status_page"
      && event.verificationStatus === "reviewed",
    );
  }
}

export class ManualReviewedOpenAIStatusAdapter extends ReviewedOpenAIStatusAdapter {}

export function reviewedOperationalEventsAt(cutoff: string, adapter: ReviewedOperationalSourceAdapter = new ReviewedOpenAIStatusAdapter()) {
  return adapter.load().filter(event => Date.parse(event.occurredAt) <= Date.parse(cutoff));
}

export * from "./schema";
