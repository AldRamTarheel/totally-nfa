import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { getServerEnv } from "@/lib/env";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: getServerEnv().GEMINI_API_KEY });
  }
  return client;
}

/**
 * Calls Gemini asking for strict JSON output, validates the result against
 * `schema`, and retries once with a "your JSON was invalid" repair prompt if
 * parsing/validation fails the first time.
 */
export async function generateStructured<T>(prompt: string, schema: ZodType<T>): Promise<T> {
  const env = getServerEnv();
  const ai = getClient();

  async function attempt(fullPrompt: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: fullPrompt,
      config: { responseMimeType: "application/json" },
    });
    return response.text ?? "";
  }

  const raw = await attempt(prompt);
  const parsed = tryParse(raw);
  const validated = parsed === null ? undefined : schema.safeParse(parsed);
  if (validated?.success) return validated.data;

  // Repair attempt: tell the model exactly what was wrong.
  const errorDetail = validated && !validated.success ? validated.error.message : "invalid JSON syntax";
  const repairPrompt = `${prompt}\n\nYour previous response was invalid (${errorDetail}). Respond with ONLY valid JSON matching the required shape, no markdown fences, no commentary. Previous response was:\n${raw}`;
  const repaired = await attempt(repairPrompt);
  const reparsed = tryParse(repaired);
  const revalidated = reparsed === null ? undefined : schema.safeParse(reparsed);
  if (revalidated?.success) return revalidated.data;

  throw new Error(
    `Gemini returned invalid JSON twice. Last error: ${
      revalidated && !revalidated.success ? revalidated.error.message : "parse failure"
    }. Raw: ${repaired.slice(0, 500)}`
  );
}

function tryParse(text: string): unknown {
  // Gemini occasionally wraps JSON in ```json fences despite instructions; strip them defensively.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
