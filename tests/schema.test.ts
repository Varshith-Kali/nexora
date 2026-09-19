/**
 * Nexora — runtime schema validation tests.
 *
 * Proves that malformed model output degrades to REVIEW (parse → null) and
 * that the deterministic score, not the model's self-reported score, is what
 * the policy engine consumes.
 */
import { describe, it, expect } from "vitest";
import {
  parseAIVerification,
  deterministicScore,
  verifyInputSchema,
  settleInputSchema,
  submitWorkInputSchema,
  CRITERIA_WEIGHTS,
} from "@/lib/nexora/schema";

const validAI: {
  verdict: "PASS";
  score: number;
  confidence: number;
  criteria: Array<{ name: string; status: "PASS"; evidence: string }>;
  violations: string[];
  promptInjectionDetected: boolean;
  missingRequirements: string[];
  reason: string;
} = {
  verdict: "PASS",
  score: 95,
  confidence: 0.92,
  criteria: [
    { name: "Requirement completeness", status: "PASS", evidence: "all deliverables present" },
    { name: "Acceptance criteria", status: "PASS", evidence: "each criterion addressed" },
    { name: "Evidence quality", status: "PASS", evidence: "concrete PoC output quoted" },
    { name: "Correctness and consistency", status: "PASS", evidence: "no contradictions" },
    { name: "Security and manipulation", status: "PASS", evidence: "no manipulation" },
  ],
  violations: [],
  promptInjectionDetected: false,
  missingRequirements: [],
  reason: "complete, evidenced, consistent",
};

describe("parseAIVerification", () => {
  it("accepts a conforming payload", () => {
    expect(parseAIVerification(validAI)).not.toBeNull();
  });

  it("rejects an unknown verdict", () => {
    expect(parseAIVerification({ ...validAI, verdict: "GREAT" })).toBeNull();
  });

  it("rejects a missing criteria array", () => {
    const { criteria, ...noCriteria } = validAI;
    void criteria;
    expect(parseAIVerification(noCriteria)).toBeNull();
  });

  it("rejects out-of-range confidence", () => {
    expect(parseAIVerification({ ...validAI, confidence: 7 })).toBeNull();
  });

  it("rejects non-object garbage", () => {
    expect(parseAIVerification("PASS")).toBeNull();
    expect(parseAIVerification(null)).toBeNull();
    expect(parseAIVerification([1, 2, 3])).toBeNull();
  });
});

describe("deterministicScore — model score is informational only", () => {
  it("scores 100 when all five weighted criteria pass", () => {
    expect(deterministicScore(validAI.criteria)).toBe(100);
  });

  it("sums only the weights of passing criteria", () => {
    const criteria = validAI.criteria.map((c, i) =>
      i < 2 ? c : { ...c, status: "FAIL" as const },
    );
    expect(deterministicScore(criteria)).toBe(
      CRITERIA_WEIGHTS["Requirement completeness"] + CRITERIA_WEIGHTS["Acceptance criteria"],
    );
  });

  it("ignores unknown criterion names (model cannot invent weight)", () => {
    const criteria = [
      ...validAI.criteria,
      { name: "Bonus points I invented", status: "PASS" as const },
    ];
    expect(deterministicScore(criteria)).toBe(100);
  });

  it("scores 0 when everything fails", () => {
    expect(
      deterministicScore(validAI.criteria.map((c) => ({ ...c, status: "FAIL" as const }))),
    ).toBe(0);
  });
});

describe("verifyInputSchema (POST /api/verify)", () => {
  it("accepts a well-formed request", () => {
    expect(
      verifyInputSchema.safeParse({
        jobId: 1,
        jobSpec: "Produce a security assessment",
        acceptanceCriteria: ["identify auth weaknesses"],
        submission: "FINDING 1: …",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-positive jobId", () => {
    expect(
      verifyInputSchema.safeParse({ jobId: 0, jobSpec: "x", acceptanceCriteria: ["y"], submission: "z" })
        .success,
    ).toBe(false);
  });

  it("rejects empty acceptance criteria", () => {
    expect(
      verifyInputSchema.safeParse({ jobId: 1, jobSpec: "x", acceptanceCriteria: [], submission: "z" })
        .success,
    ).toBe(false);
  });

  it("rejects oversized submissions (200k cap)", () => {
    expect(
      verifyInputSchema.safeParse({
        jobId: 1,
        jobSpec: "x",
        acceptanceCriteria: ["y"],
        submission: "A".repeat(200_001),
      }).success,
    ).toBe(false);
  });
});

describe("settleInputSchema (POST /api/settle)", () => {
  const receipt = {
    jobId: 1,
    decision: "RELEASE",
    submissionHash: "0x" + "a".repeat(64),
    verificationHash: "0x" + "b".repeat(64),
    expiresAt: 4_000_000_000,
    nonce: "0x" + "c".repeat(16),
    signature: "0x" + "d".repeat(130),
  };

  it("accepts a well-formed settlement request", () => {
    expect(
      settleInputSchema.safeParse({ jobId: 1, action: "RELEASE", receipt }).success,
    ).toBe(true);
  });

  it("rejects an unknown action", () => {
    expect(
      settleInputSchema.safeParse({ jobId: 1, action: "STEAL", receipt }).success,
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    expect(
      settleInputSchema.safeParse({
        jobId: 1,
        action: "REFUND",
        receipt: { ...receipt, signature: "0xdeadbeef" },
      }).success,
    ).toBe(false);
  });
});

describe("submitWorkInputSchema (POST /api/submit-work)", () => {
  it("accepts a well-formed submission", () => {
    expect(
      submitWorkInputSchema.safeParse({ jobId: 3, submission: "real work text" }).success,
    ).toBe(true);
  });

  it("rejects an empty submission", () => {
    expect(submitWorkInputSchema.safeParse({ jobId: 3, submission: "" }).success).toBe(false);
  });
});
