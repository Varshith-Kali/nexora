/**
 * Nexora — minimal fixed-window rate limiter (per-instance, in-memory).
 *
 * Purpose: protect /api/verify from accidental or abusive hammering (each
 * Gemini call costs tokens). Not a security boundary — a convenience guard.
 * Zero infrastructure: no Redis, no store. On serverless this is per-warm-
 * instance, which is exactly the scale a hackathon demo needs.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimit(key: string): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client identity (first proxy hop). Never used for logging PII. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || "local";
}
