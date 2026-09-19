/**
 * Nexora — runtime schema validation for AI verifier output.
 *
 * NEVER blindly trust model-generated JSON. Every Gemini response is parsed
 * through this zod schema. If validation fails, the verdict degrades to
 * REVIEW (fail-closed: no settlement, funds stay in escrow).
 */
import { z } from "zod";

export const CRITERIA_WEIGHTS = {
  "Requirement completeness": 30,
  "Acceptance criteria": 25,
  "Evidence quality": 20,
  "Correctness and consistency": 15,
  "Security and manipulation": 10,
} as const;

export const CRITERIA_NAMES = Object.keys(CRITERIA_WEIGHTS) as Array<
  keyof typeof CRITERIA_WEIGHTS
>;

export const PASS_THRESHOLD = Number(process.env.POLICY_PASS_THRESHOLD ?? 80);
export const CONFIDENCE_THRESHOLD = Number(
  process.env.POLICY_CONFIDENCE_THRESHOLD ?? 0.7,
);

const criterionSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["PASS", "FAIL"]),
  evidence: z.string().default(""),
});

export const aiVerificationSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "REVIEW"]),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  criteria: z.array(criterionSchema).min(1),
  violations: z.array(z.string()).default([]),
  promptInjectionDetected: z.boolean(),
  missingRequirements: z.array(z.string()).default([]),
  reason: z.string().default(""),
});

export type ParsedAIVerification = z.infer<typeof aiVerificationSchema>;

/**
 * Parse + clamp an AI response. Returns null when the payload does not
 * conform to the schema (→ caller must treat as REVIEW).
 */
export function parseAIVerification(
  raw: unknown,
): ParsedAIVerification | null {
  const result = aiVerificationSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data;
}

/**
 * Deterministic score: sum of weights of the five fixed criteria categories
 * whose status is PASS. The model's self-reported score is informational
 * only — the policy engine always uses THIS number.
 */
export function deterministicScore(
  criteria: Array<{ name: string; status: "PASS" | "FAIL" }>,
): number {
  let score = 0;
  const byName = new Map(criteria.map((c) => [c.name, c.status]));
  for (const name of CRITERIA_NAMES) {
    if (byName.get(name) === "PASS") score += CRITERIA_WEIGHTS[name];
  }
  return score;
}

/** Input schema for POST /api/verify. */
export const verifyInputSchema = z.object({
  jobId: z.number().int().positive(),
  jobSpec: z.string().min(1).max(20_000),
  acceptanceCriteria: z.array(z.string().min(1).max(2_000)).min(1).max(20),
  submission: z.string().max(200_000),
});
export type VerifyInput = z.infer<typeof verifyInputSchema>;

/** Input schema for POST /api/settle. */
export const settleInputSchema = z.object({
  jobId: z.number().int().positive(),
  action: z.enum(["RELEASE", "REFUND"]),
  receipt: z.object({
    jobId: z.number().int().positive(),
    decision: z.enum(["RELEASE", "REFUND"]),
    submissionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    verificationHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    expiresAt: z.number().int().positive(),
    nonce: z.string().regex(/^0x[0-9a-fA-F]{8,64}$/),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  }),
});
export type SettleInput = z.infer<typeof settleInputSchema>;

/** Input schema for POST /api/submit-work. */
export const submitWorkInputSchema = z.object({
  jobId: z.number().int().positive(),
  submission: z.string().min(1).max(200_000),
});
export type SubmitWorkInput = z.infer<typeof submitWorkInputSchema>;
