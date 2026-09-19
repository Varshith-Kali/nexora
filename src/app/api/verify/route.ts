/**
 * POST /api/verify — AI verification. OFF-CHAIN ONLY.
 *
 * Input : { jobId, jobSpec, acceptanceCriteria, submission }
 * Effect: exactly ONE Gemini call (or the labeled mock provider), full
 *         deterministic pipeline, policy decision, signed receipt.
 * NEVER : creates a blockchain transaction, releases or moves funds.
 *         A page load or a verification request never spends MON.
 */
import { NextResponse } from "next/server";
import { verifyInputSchema } from "@/lib/nexora/schema";
import { runVerification } from "@/lib/nexora/verify";
import { rateLimit, clientKey } from "@/lib/nexora/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const limit = rateLimit(`verify:${clientKey(req)}`);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: `Too many verification requests — retry in ${limit.retryAfterSeconds}s.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => null);
  const input = verifyInputSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      {
        error: "INVALID_INPUT",
        message:
          "Required: jobId (positive int), jobSpec (text), acceptanceCriteria (non-empty string[]), submission (text).",
      },
      { status: 400 },
    );
  }

  const outcome = await runVerification(input.data);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, message: outcome.message },
      { status: outcome.httpStatus },
    );
  }
  return NextResponse.json(outcome.result);
}
