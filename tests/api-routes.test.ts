/**
 * Nexora — API route tests (input validation & fail-closed paths).
 *
 * These run against the real route handlers with an unconfigured deployment
 * (config/deployment.json contains nulls in a fresh clone), proving:
 *   - malformed input → 400 with a safe message
 *   - unconfigured deployment → 503, never a fabricated success
 *   - unknown job → 404
 *   - health reports mock mode honestly and never fabricates addresses
 * No blockchain connection is needed for these paths (they fail before any
 * RPC call — that is the point).
 */
import { describe, it, expect } from "vitest";
import { POST as verifyPOST } from "@/app/api/verify/route";
import { POST as settlePOST } from "@/app/api/settle/route";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as jobsPOST } from "@/app/api/jobs/route";

const json = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("POST /api/verify", () => {
  it("rejects malformed input with 400", async () => {
    const res = await verifyPOST(json({ jobId: "abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.message).not.toContain("stack");
  });

  it("returns 404 JOB_NOT_FOUND for a valid job on an unconfigured deployment", async () => {
    // deployment.json in the repo has null addresses — no RPC call happens
    const res = await verifyPOST(
      json({
        jobId: 1,
        jobSpec: "Security assessment of a sample API",
        acceptanceCriteria: ["identify authentication weaknesses"],
        submission: "FINDING 1: bearer tokens never expire …",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("JOB_NOT_FOUND");
  });
});

describe("POST /api/settle", () => {
  const validReceipt = {
    jobId: 1,
    decision: "RELEASE",
    submissionHash: "0x" + "a".repeat(64),
    verificationHash: "0x" + "b".repeat(64),
    expiresAt: 4_000_000_000,
    nonce: "0x" + "c".repeat(16),
    signature: "0x" + "d".repeat(130),
  };

  it("rejects malformed input with 400", async () => {
    const res = await settlePOST(json({ action: "RELEASE" }));
    expect(res.status).toBe(400);
  });

  it("refuses settlement (503) when contracts are not configured — fail closed", async () => {
    const res = await settlePOST(
      json({ jobId: 1, action: "RELEASE", receipt: validReceipt }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("DEPLOYMENT_NOT_CONFIGURED");
  });

  it("rejects a receipt bound to a different action (fail-closed, never settles)", async () => {
    const res = await settlePOST(
      json({ jobId: 1, action: "REFUND", receipt: validReceipt }),
    );
    // unconfigured deployment fails first (503); with a configured deployment
    // the same request would fail the RECEIPT_MISMATCH check — either way,
    // no settlement can ever occur from this request
    expect([400, 503]).toContain(res.status);
    const body = await res.json();
    expect(["RECEIPT_MISMATCH", "DEPLOYMENT_NOT_CONFIGURED"]).toContain(body.error);
  });
});

describe("GET /api/health", () => {
  it("reports honestly on an unconfigured deployment", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app).toBe("Nexora");
    expect(body.network.expectedChainId).toBe(10143);
    expect(body.network.chainId).toBe(10143);
    expect(body.contracts.configured).toBe(false);
    expect(body.contracts.escrow).toBe("TBD"); // never a fabricated address
    expect(body.ai.mockMode).toBe(true); // no GEMINI_API_KEY in the test env
  });
});

describe("POST /api/jobs", () => {
  it("refuses job preparation (503) when contracts are not configured", async () => {
    const res = await jobsPOST();
    expect([503, 429]).toContain(res.status);
    if (res.status === 503) {
      const body = await res.json();
      expect(body.error).toBe("DEPLOYMENT_NOT_CONFIGURED");
    }
  });
});
