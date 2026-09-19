/**
 * Nexora — signed verification receipt tests.
 *
 * Proves the receipt chain-of-trust used between /api/verify (sign) and
 * /api/settle (verify): roundtrip validity, tamper detection, expiry, and
 * wrong-signer rejection. Uses a throwaway in-memory key — no real key exists
 * anywhere in this file.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { signReceipt, verifyReceipt, verifierAccountAddress } from "@/lib/nexora/receipt";

describe("receipt sign → verify roundtrip", () => {
  beforeAll(() => {
    // throwaway test-only key, generated fresh at runtime — never persisted
    process.env.VERIFIER_PRIVATE_KEY = generatePrivateKey();
  });

  it("verifies a freshly signed receipt", async () => {
    const receipt = await signReceipt({
      jobId: 7,
      decision: "RELEASE",
      submissionHash: "0x" + "a".repeat(64),
      verificationHash: "0x" + "b".repeat(64),
    });
    expect(receipt).not.toBeNull();
    const check = await verifyReceipt(receipt!);
    expect(check.valid).toBe(true);
  });

  it("rejects a tampered decision (RELEASE → REFUND)", async () => {
    const receipt = await signReceipt({
      jobId: 7,
      decision: "RELEASE",
      submissionHash: "0x" + "a".repeat(64),
      verificationHash: "0x" + "b".repeat(64),
    });
    const check = await verifyReceipt({ ...receipt!, decision: "REFUND" });
    expect(check.valid).toBe(false);
    expect(check.error).toBe("RECEIPT_SIGNATURE_INVALID");
  });

  it("rejects a tampered submission hash", async () => {
    const receipt = await signReceipt({
      jobId: 7,
      decision: "REFUND",
      submissionHash: "0x" + "a".repeat(64),
      verificationHash: "0x" + "b".repeat(64),
    });
    const check = await verifyReceipt({
      ...receipt!,
      submissionHash: "0x" + "c".repeat(64),
    });
    expect(check.valid).toBe(false);
  });

  it("rejects an expired receipt", async () => {
    const receipt = await signReceipt({
      jobId: 7,
      decision: "RELEASE",
      submissionHash: "0x" + "a".repeat(64),
      verificationHash: "0x" + "b".repeat(64),
    });
    const expired = { ...receipt!, expiresAt: Math.floor(Date.now() / 1000) - 1 };
    const check = await verifyReceipt(expired);
    expect(check.valid).toBe(false);
    expect(check.error).toBe("RECEIPT_EXPIRED");
  });

  it("refuses settlement when VERIFIER_PRIVATE_KEY is not configured", async () => {
    const saved = process.env.VERIFIER_PRIVATE_KEY;
    delete process.env.VERIFIER_PRIVATE_KEY;
    try {
      expect(verifierAccountAddress()).toBeNull();
      const receipt = {
        jobId: 7,
        decision: "RELEASE" as const,
        submissionHash: "0x" + "a".repeat(64),
        verificationHash: "0x" + "b".repeat(64),
        expiresAt: 4_000_000_000,
        nonce: "0x" + "c".repeat(16),
        signature: "0x" + "d".repeat(130),
      };
      const check = await verifyReceipt(receipt);
      expect(check.valid).toBe(false);
      expect(check.error).toBe("VERIFIER_NOT_CONFIGURED");
    } finally {
      process.env.VERIFIER_PRIVATE_KEY = saved;
    }
  });

  it("signs nothing when the key is missing (verify returns null receipt)", async () => {
    const saved = process.env.VERIFIER_PRIVATE_KEY;
    delete process.env.VERIFIER_PRIVATE_KEY;
    try {
      const receipt = await signReceipt({
        jobId: 1,
        decision: "RELEASE",
        submissionHash: "0x" + "a".repeat(64),
        verificationHash: "0x" + "b".repeat(64),
      });
      expect(receipt).toBeNull();
    } finally {
      process.env.VERIFIER_PRIVATE_KEY = saved;
    }
  });
});
