/**
 * Nexora — verification pipeline orchestrator (SERVER-SIDE ONLY).
 *
 * POST /api/verify runs exactly this. NO blockchain transaction is ever
 * created here (AI verification is off-chain — §50 budget discipline).
 *
 * Pipeline:
 *   1. input validation (zod)
 *   2. on-chain job lookup + integrity (keccak256(submission) === outputHash)
 *   3. deterministic pre-scan (substance + injection patterns)
 *   4. ONE Gemini call (submission treated as untrusted data)
 *   5. zod schema validation — malformed output ⇒ REVIEW (fail-closed)
 *   6. deterministic policy engine — the authorization boundary
 *   7. signed receipt (only for RELEASE / REFUND)
 */
import { type Abi } from "viem";
import {
  ESCROW_ABI,
  escrowAddress,
  chainId as configuredChainId,
} from "./chain";
import { publicClient } from "./receipt";
import { detectInjection, substanceChecks } from "./injection";
import {
  verifyWithAI,
  providerName,
  geminiModel,
  type ProviderResult,
} from "./gemini";
import { evaluatePolicy } from "./policy";
import { parseAIVerification, deterministicScore } from "./schema";
import { signReceipt } from "./receipt";
import { submissionHash } from "./agents";
import type { OnChainJob, VerificationReceipt, VerificationResult } from "./types";

export interface VerifyParams {
  jobId: number;
  jobSpec: string;
  acceptanceCriteria: string[];
  submission: string;
}

export type VerifyOutcome =
  | { ok: true; result: VerificationResult }
  | { ok: false; error: string; message: string; httpStatus: number };

async function readOnChainJob(jobId: number): Promise<OnChainJob | null> {
  const escrow = escrowAddress();
  if (!escrow) return null;
  try {
    const raw = (await publicClient().readContract({
      address: escrow as `0x${string}`,
      abi: ESCROW_ABI as Abi,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })) as [string, string, bigint, string, number, bigint];
    if (raw[0] === "0x0000000000000000000000000000000000000000") return null;
    const statuses = ["Open", "Submitted", "Released", "Refunded"] as const;
    return {
      buyer: raw[0],
      seller: raw[1],
      amount: raw[2],
      outputHash: raw[3],
      status: statuses[Number(raw[4])] ?? "Open",
      createdAt: raw[5],
    };
  } catch {
    return null;
  }
}

export async function runVerification(
  params: VerifyParams,
): Promise<VerifyOutcome> {
  const { jobId, jobSpec, acceptanceCriteria, submission } = params;

  // ── 1. on-chain job must exist and be in Submitted state ───────────────
  const job = await readOnChainJob(jobId);
  if (!job) {
    return {
      ok: false,
      error: "JOB_NOT_FOUND",
      message: `Job #${jobId} does not exist on the configured deployment.`,
      httpStatus: 404,
    };
  }
  if (job.status !== "Submitted") {
    return {
      ok: false,
      error: "JOB_NOT_SUBMITTED",
      message: `Job #${jobId} is in state ${job.status} — work must be submitted before verification.`,
      httpStatus: 409,
    };
  }

  // ── 2. integrity: the text we evaluate IS what the seller committed ────
  const hash = submissionHash(submission);
  const hashMatches = job.outputHash === hash;

  // ── 3. deterministic pre-scan ──────────────────────────────────────────
  const substance = substanceChecks(submission);
  const injectionSignals = detectInjection(submission).map((s) => `${s.label}: "${s.matched}"`);
  const preChecks = [...substance.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail }))];
  const substanceFailed = substance.some((c) => !c.passed);

  // ── 4/5. AI evaluation (skipped only for empty submissions — nothing to
  // evaluate; the deterministic layer already decides). Otherwise exactly
  // ONE provider call, even when injection patterns were found: Gemini sees
  // the malicious text as untrusted data and judges it semantically.
  const provider: ProviderResult = await (substanceFailed
    ? Promise.resolve({
        ok: true,
        provider: providerName() as "gemini" | "mock",
        model: "deterministic-empty",
        raw: {
          verdict: "FAIL" as const,
          score: 0,
          confidence: 0.95,
          criteria: [
            "Tracking accuracy",
            "Timeline completeness",
            "Evidence and traceability",
            "Status correctness",
            "Security and manipulation",
          ].map((name) => ({
            name,
            status: "FAIL" as const,
            evidence: "submission empty or below minimum substance threshold",
          })),
          violations: injectionSignals.length > 0 ? ["empty or placeholder submission with injection signals"] : ["empty or placeholder submission"],
          promptInjectionDetected: injectionSignals.length > 0,
          missingRequirements: ["all required deliverables"],
          reason: "Deterministic gate: no usable work was delivered.",
        },
      })
    : verifyWithAI({
        jobSpec,
        acceptanceCriteria,
        submission,
        injectionSignals,
      }));

  // Provider hard-failure ⇒ fail-closed REVIEW. Never release on AI errors.
  if (!provider.ok || !provider.raw) {
    return {
      ok: true,
      result: {
        jobId,
        provider: providerName(),
        model: provider.model,
        submissionHash: hash,
        onChainHash: job.outputHash,
        hashMatches,
        preChecks,
        promptInjectionDetected: injectionSignals.length > 0,
        injectionSignals,
        verdict: "REVIEW",
        score: 0,
        confidence: 0,
        criteria: [],
        violations: [],
        missingRequirements: [],
        reason: `AI verification is temporarily unavailable (${provider.error ?? "AI_PROVIDER_ERROR"}). No funds were released — retry when the provider is reachable.`,
        policy: {
          decision: "MANUAL_REVIEW",
          checks: [
            ...preChecks.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail })),
            { name: "AI provider reachable", passed: false, detail: provider.error ?? "unavailable" },
          ],
          reason: "Provider failure — fail-closed. No settlement executed; escrow remains locked.",
        },
        receipt: null,
      },
    };
  }

  // zod validation of the structured output
  const parsed = parseAIVerification(provider.raw);
  const schemaValid = parsed !== null;
  const ai = parsed ?? {
    verdict: "REVIEW" as const,
    score: 0,
    confidence: 0,
    criteria: [],
    violations: [],
    promptInjectionDetected: false,
    missingRequirements: [],
    reason: "Model response failed runtime schema validation.",
  };

  // ── 6. policy engine ───────────────────────────────────────────────────
  const combinedInjection =
    ai.promptInjectionDetected || injectionSignals.length > 0;

  const policy = evaluatePolicy({
    schemaValid,
    verdict: ai.verdict,
    criteria: ai.criteria,
    confidence: ai.confidence,
    promptInjectionDetected: combinedInjection,
    missingRequirements: ai.missingRequirements,
    hashMatches,
  });

  const score = deterministicScore(ai.criteria);

  // ── 7. signed receipt for authorized decisions ─────────────────────────
  let receipt: VerificationReceipt | null = null;
  if (policy.decision === "RELEASE" || policy.decision === "REFUND") {
    const verificationHash = submissionHash(
      JSON.stringify({ verdict: ai.verdict, score, policy: policy.decision, jobId }),
    );
    receipt = await signReceipt({
      jobId,
      decision: policy.decision,
      submissionHash: hash,
      verificationHash,
    });
  }

  const result: VerificationResult = {
    jobId,
    provider: provider.provider,
    model: provider.model,
    submissionHash: hash,
    onChainHash: job.outputHash,
    hashMatches,
    preChecks,
    promptInjectionDetected: combinedInjection,
    injectionSignals,
    verdict: schemaValid ? ai.verdict : "REVIEW",
    score,
    confidence: ai.confidence,
    criteria: ai.criteria,
    violations: ai.violations,
    missingRequirements: ai.missingRequirements,
    reason: schemaValid ? ai.reason : ai.reason || "Schema validation failed.",
    policy,
    receipt,
  };

  // structured log line (no secrets, no submission content)
  console.log(
    JSON.stringify({
      event: "verification.completed",
      jobId,
      provider: provider.provider,
      verdict: result.verdict,
      score,
      decision: policy.decision,
      injection: combinedInjection,
      hashMatches,
      chainId: configuredChainId(),
      ts: new Date().toISOString(),
    }),
  );

  return { ok: true, result };
}
