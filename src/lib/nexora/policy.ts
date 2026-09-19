/**
 * Nexora — deterministic policy engine. THE authorization boundary.
 *
 * Gemini produces an opinion. THIS module decides whether settlement is
 * possible at all. Funds move only when every check below passes — otherwise
 * the decision is REFUND (clear failure) or MANUAL_REVIEW (uncertainty).
 * When uncertain, Nexora NEVER releases.
 *
 * Hard rules:
 *   - prompt injection detected ⇒ RELEASE is impossible (even if the model
 *     said PASS — the deterministic layer overrides the model, §28).
 *   - schema invalid / AI unavailable ⇒ REVIEW (fail-closed).
 *   - score < threshold or confidence < threshold ⇒ REVIEW, never RELEASE.
 *   - REVIEW never moves funds automatically.
 */
import {
  CONFIDENCE_THRESHOLD,
  PASS_THRESHOLD,
  deterministicScore,
} from "./schema";
import type {
  PolicyDecision,
  PolicyResult,
  Verdict,
} from "./types";

export interface PolicyInput {
  /** false when the AI response failed schema validation or the provider errored. */
  schemaValid: boolean;
  verdict: Verdict;
  criteria: Array<{ name: string; status: "PASS" | "FAIL" }>;
  confidence: number;
  promptInjectionDetected: boolean;
  missingRequirements: string[];
  /** integrity: keccak256(submission) === on-chain outputHash */
  hashMatches: boolean;
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const checks: PolicyResult["checks"] = [];
  const score = deterministicScore(input.criteria);

  checks.push({
    name: "AI response schema valid",
    passed: input.schemaValid,
    detail: input.schemaValid
      ? "structured output passed runtime validation"
      : "model response malformed — treating as uncertain",
  });

  checks.push({
    name: "Submission matches on-chain hash",
    passed: input.hashMatches,
    detail: input.hashMatches
      ? "keccak256(submission) matches the submitted outputHash"
      : "submission text differs from what the seller committed on-chain",
  });

  checks.push({
    name: "No prompt injection detected",
    passed: !input.promptInjectionDetected,
    detail: input.promptInjectionDetected
      ? "verifier-directed instructions found in the submission — release blocked by policy override"
      : "no verifier-directed instructions detected",
  });

  checks.push({
    name: `AI verdict is PASS (score ≥ ${PASS_THRESHOLD})`,
    passed: input.verdict === "PASS" && input.schemaValid,
    detail: `verdict ${input.verdict}, deterministic score ${score}/100`,
  });

  checks.push({
    name: `Deterministic score ≥ ${PASS_THRESHOLD}`,
    passed: score >= PASS_THRESHOLD,
    detail: `${score} / 100 (weighted criteria)`,
  });

  checks.push({
    name: `Confidence ≥ ${CONFIDENCE_THRESHOLD}`,
    passed: input.confidence >= CONFIDENCE_THRESHOLD,
    detail: `${input.confidence.toFixed(2)} model confidence`,
  });

  checks.push({
    name: "No missing requirements",
    passed: input.missingRequirements.length === 0,
    detail:
      input.missingRequirements.length === 0
        ? "all required deliverables accounted for"
        : `missing: ${input.missingRequirements.join("; ").slice(0, 200)}`,
  });

  // ---------------------------------------------------------------- decide
  let decision: PolicyDecision;
  let reason: string;

  const releaseBlocked = checks.some((c) => !c.passed);

  if (input.promptInjectionDetected && input.verdict === "FAIL") {
    // adversarial submission AND the model rejected the work → buyer refund
    decision = "REFUND";
    reason =
      "Prompt injection detected and work rejected — escrow refunded to buyer.";
  } else if (input.promptInjectionDetected) {
    // model may have been manipulated into PASS — deterministic override wins
    decision = "MANUAL_REVIEW";
    reason =
      "Prompt injection detected — the model's verdict is untrusted. Release blocked by the deterministic policy override; a human must review this job.";
  } else if (!input.schemaValid || !input.hashMatches) {
    decision = "MANUAL_REVIEW";
    reason = !input.hashMatches
      ? "Submission text does not match the on-chain commitment — verification cannot be bound to this job. No settlement."
      : "AI response failed schema validation — verification could not be safely completed. No settlement.";
  } else if (input.verdict === "FAIL") {
    decision = "REFUND";
    reason = "Work failed verification against the job requirements — escrow refunded to buyer.";
  } else if (releaseBlocked || input.verdict === "REVIEW") {
    decision = "MANUAL_REVIEW";
    reason = input.verdict === "REVIEW"
      ? "Verifier returned REVIEW — insufficient certainty. No automatic settlement; funds remain in escrow."
      : `Pass thresholds not met (score/confidence/requirements) — no automatic release; funds remain in escrow.`;
  } else {
    decision = "RELEASE";
    reason = `All policy checks passed (score ${score}/100, confidence ${input.confidence.toFixed(2)}) — release authorized.`;
  }

  return { decision, checks, reason };
}
