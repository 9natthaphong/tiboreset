import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";
import type { ExtractionResult } from "@/lib/ingestion";

export const EXTRACTION_VERSION = "reset-extraction-1.0.0";

const systemPrompt = `You extract structured evidence from one public social post for RESET ORACLE.
Never estimate or output a forecast probability.
Treat playful language as uncertain unless there is a clear commitment.
A question or poll is not a confirmed reset.
Distinguish historical statements from future intent.
Do not infer a milestone unless the text explicitly supports it.
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
