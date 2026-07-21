import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";
import type { ExtractionResult } from "@/lib/ingestion";

export const EXTRACTION_VERSION = "reset-extraction-1.3.0";

const systemPrompt = `You extract structured evidence from one public social post for RESET ORACLE.
Analyze only the monitored official post supplied below. Do not invent missing parent, thread, image, or quoted-post context.
Never estimate or output a forecast probability, Reset Watch Score, or readiness channel.
Treat playful language as uncertain unless there is a clear commitment.
A question or poll is not a confirmed reset.
Distinguish historical statements from future intent.
Do not infer a milestone unless the text explicitly supports it.
Extract whether the user count is Codex-only, Codex plus ChatGPT Work, or unknown.
Distinguish a completed full reset, a banked reset, a scheduled reset, and a milestone announcement with no reset.
Distinguish generic assistance, operator intervention, operational work underway, a reset hint, a near-term commitment, and completed action.
A clear official statement such as "The resets will continue" is reset_policy_continuation: high policy relevance, low time immediacy, ongoing active policy, and not a reset confirmation.
"Working on the next reset now" is operational_work_underway with higher immediacy. "I'll reset usage later today" is near_term_reset_commitment. "Usage limits have been reset" is reset_confirmation.
"Will the resets continue?" is a question requiring review and zero automatic impact. "No more resets" is negative_or_delaying_signal with withdrawn policy persistence.
A willingness to investigate is not a reset promise. A reset hint is not a reset confirmation.
A question, joke, metaphor, conditional statement, or vague "soon" wording is not a commitment.
Never output a Reset Watch Score, calibrated probability, channel value, or fixed score addition.
Use only minimal verbatim evidence excerpts and mark ambiguous posts for review.`;

export async function extractWithOpenAI(text: string, client?: OpenAI): Promise<Extraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!client && !apiKey) throw new Error("OpenAI is not configured");
  const openai = client ?? new OpenAI({ apiKey });
  const response = await openai.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Post text:\n${text}` },
    ],
    text: { format: zodTextFormat(ExtractionSchema, "reset_oracle_extraction") },
  });
  if (!response.output_parsed) throw new Error("OpenAI returned no structured extraction");
  return ExtractionSchema.parse(response.output_parsed);
}

function safeFallbackReason(error: unknown): string {
  if (!(error instanceof Error)) return "OpenAI extraction unavailable";
  if (/configured/i.test(error.message)) return "OpenAI not configured";
  return "OpenAI extraction failed";
}

export async function extractRelevantWithFallback(text: string, localScreen: Extraction): Promise<ExtractionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { extraction: localScreen, extractionVersion: `${EXTRACTION_VERSION}+heuristic`, source: "local", fallbackReason: "OpenAI not configured" };
  }
  try {
    const extraction = await extractWithOpenAI(text);
    return { extraction, extractionVersion: EXTRACTION_VERSION, source: "openai" };
  } catch (error) {
    return { extraction: localScreen, extractionVersion: `${EXTRACTION_VERSION}+heuristic-fallback`, source: "local_fallback", fallbackReason: safeFallbackReason(error) };
  }
}
