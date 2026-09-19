/**
 * Nexora — in-memory rate limiter tests.
 */
import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/nexora/ratelimit";

describe("rateLimit", () => {
  it("allows the first burst of requests in a window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key).ok).toBe(true);
    }
  });

  it("blocks after the per-window cap is exceeded", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 20; i++) rateLimit(key);
    const blocked = rateLimit(key);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 20; i++) rateLimit(a);
    expect(rateLimit(a).ok).toBe(false);
    expect(rateLimit(b).ok).toBe(true);
  });
});
