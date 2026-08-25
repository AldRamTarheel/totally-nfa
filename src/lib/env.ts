import { z } from "zod";

/**
 * Zod-validated accessor for process.env. Import this instead of reading
 * process.env directly so misconfiguration fails loudly and early rather
 * than as a confusing runtime error deep in a cron run.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  NTFY_DEFAULT_TOPIC: z.string().min(1),
  CRON_SECRET: z.string().min(16, "CRON_SECRET should be a long random string"),
  MACRO_TICKERS: z
    .string()
    .default("QQQ,GLD,USO")
    .transform((val) => val.split(",").map((s) => s.trim()).filter(Boolean)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Validates and returns server-only env vars. Call only from server code (API routes, cron routes). */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid/missing environment variables. Copy .env.local.example to .env.local and fill in real values:\n${issues}`
    );
  }
  cached = parsed.data;
  return cached;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Validated accessor for the two env vars safe to use in client components. */
export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
