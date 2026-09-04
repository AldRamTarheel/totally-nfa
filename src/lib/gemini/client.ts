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

function isRetryableStatus(err: unknown): boolean {
  const message = (err as Error)?.message ?? "";
  return /"code":\s*(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(message);
}

// Gemini's free tier returns a RetryInfo block with a server-suggested
// `retryDelay` (e.g. "51s") on 429 quota errors — respect that instead of a
// blind exponential backoff, since guessing short delays just burns the
// retry budget against a quota that won't reset any sooner.
function extractRetryDelayMs(err: unknown): number | null {
  const message = (err as Error)?.message ?? "";
  const match = message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]) * 1000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini asking for strict JSON output, validates the result against
 * `schema`, and retries once with a "your JSON was invalid" repair prompt if
 * parsing/validation fails the first time. Transient server errors (429/500/
 * 503 — Gemini's free tier is prone to momentary "high demand" 503s, and to
 * strict per-minute quota limits) are retried with backoff independently of
 * the JSON-repair retry, capped so a single call can't stall a cron run
 * past Vercel's function execution limit.
 */
export async function generateStructured<T>(prompt: string, schema: ZodType<T>): Promise<T> {
  const env = getServerEnv();
  const ai = getClient();
  // Vercel Hobby enforces a real ~60s function ceiling regardless of the
  // `maxDuration` a route requests (see daily-pick/route.ts's comment on
  // this). The old budget here (3 retries x 20s max wait = 60s of sleeping
  // ALONE, before counting any actual network latency) could by itself
  // exceed that ceiling for a single Gemini call — and a normal run makes
  // up to 4 of them. When that happens the platform kills the function
  // mid-retry, which skips this module's own try/catch entirely: no
  // pipeline_runs row, no cron-failure ntfy alert, just a raw timeout that
  // only an external scheduler's own failure notification ever sees
  // (observed for real on 2026-09-04 — a GitHub Actions run failed after
  // ~2 minutes with zero corresponding log). Tightened so a bad Gemini day
  // fails gracefully (caught, logged, alerted) well inside the real ceiling
  // instead of getting killed by the platform.
  const MAX_TRANSIENT_RETRIES = 2;
  const MAX_RETRY_WAIT_MS = 8_000;

  async function attempt(fullPrompt: string): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        const response = await ai.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: fullPrompt,
          config: { responseMimeType: "application/json" },
        });
        return response.text ?? "";
      } catch (err) {
        if (i >= MAX_TRANSIENT_RETRIES - 1 || !isRetryableStatus(err)) throw err;
        const suggested = extractRetryDelayMs(err);
        const wait = Math.min(suggested ?? 1000 * 2 ** i, MAX_RETRY_WAIT_MS);
        await sleep(wait);
      }
    }
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
