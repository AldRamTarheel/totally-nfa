import "server-only";
import { getServerEnv } from "@/lib/env";

/**
 * Validates the CRON_SECRET on an incoming request before any external
 * calls are made — cron routes are public URLs unless protected, and an
 * unauthorized hit should never burn Gemini/Yahoo/scraping quota.
 * Accepts `Authorization: Bearer <secret>` (how you'd configure a custom
 * header) or a `?secret=` query param (for older Vercel Cron configs /
 * manual curl testing).
 */
export function isAuthorizedCronRequest(req: Request): boolean {
  const { CRON_SECRET } = getServerEnv();
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === CRON_SECRET) return true;
  return false;
}

export function unauthorizedResponse(): Response {
  return new Response("Unauthorized", { status: 401 });
}
