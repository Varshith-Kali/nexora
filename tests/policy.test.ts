/**
 * Nexora — deterministic policy engine tests.
 *
 * The policy engine is THE authorization boundary: these tests prove that
 *   - a full-PASS verification authorizes RELEASE
 *   - prompt injection makes RELEASE impossible even when the model said PASS
 *   - FAIL verdicts route to REFUND
 *   - schema/hash failures fail closed to MANUAL_REVIEW (never release)
 */
import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "@/lib/nexora/policy";

const ALL_PASS_CRITERIA = [
  { name: "Requirement completeness", status: "PASS" as const },
  { name: "Acceptance criteria", status: "PASS" as const },
  { name: "Evidence quality", status: "PASS" as const },
  { name: "Correctness and consistency", status: "PASS" as const },
  { name: "Security and manipulation", status: "PASS" as const },
];

const base = {
  schemaValid: true,
  verdict: "PASS" as const,
  criteria: ALL_PASS_CRITERIA,
  confidence: 0.9,
  promptInjectionDetected: false,
  missingRequirements: [],
  hashMatches: true,
};

describe("evaluatePolicy — release path", () => {
  it("authorizes RELEASE when every check passes", () => {
    const r = evaluatePolicy(base);
    expect(r.decision).toBe("RELEASE");
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it("computes deterministic score 100/100 for all five criteria PASS", () => {
    const r = evaluatePolicy(base);
    expect(r.checks.find((c) => c.name.startsWith("Deterministic score"))?.passed).toBe(true);
  });
});

describe("evaluatePolicy — prompt injection override (§28)", () => {
  it("blocks RELEASE even when the model verdict is PASS", () => {
    const r = evaluatePolicy({ ...base, promptInjectionDetected: true });
    expect(r.decision).not.toBe("RELEASE");
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("routes to REFUND when injection is detected AND the work failed", () => {
    const r = evaluatePolicy({
      ...base,
      promptInjectionDetected: true,
      verdict: "FAIL",
    });
    expect(r.decision).toBe("REFUND");
  });
});

describe("evaluatePolicy — fail-closed behavior", () => {
  it("MANUAL_REVIEW when the AI response failed schema validation", () => {
    const r = evaluatePolicy({ ...base, schemaValid: false, verdict: "PASS" });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("MANUAL_REVIEW when the submission does not match the on-chain hash", () => {
    const r = evaluatePolicy({ ...base, hashMatches: false });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("REFUND for a clean FAIL verdict (no injection)", () => {
    const r = evaluatePolicy({
      ...base,
      verdict: "FAIL",
      criteria: ALL_PASS_CRITERIA.map((c) => ({ ...c, status: "FAIL" as const })),
    });
    expect(r.decision).toBe("REFUND");
  });

  it("MANUAL_REVIEW for a REVIEW verdict — never auto-settle", () => {
    const r = evaluatePolicy({ ...base, verdict: "REVIEW" });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("MANUAL_REVIEW when a required criterion failed (score below threshold)", () => {
    const r = evaluatePolicy({
      ...base,
      criteria: ALL_PASS_CRITERIA.map((c, i) =>
        i === 0 ? { ...c, status: "FAIL" as const } : c,
      ),
    });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("MANUAL_REVIEW when confidence is below threshold", () => {
    const r = evaluatePolicy({ ...base, confidence: 0.3 });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });

  it("MANUAL_REVIEW when requirements are missing", () => {
    const r = evaluatePolicy({ ...base, missingRequirements: ["remediation section"] });
    expect(r.decision).toBe("MANUAL_REVIEW");
  });
});
