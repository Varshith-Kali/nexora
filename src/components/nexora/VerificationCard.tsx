"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { VerificationResult } from "@/lib/nexora/types";

/**
 * The WHY card — every criterion, signal, and policy check behind the
 * verdict. Only concise reasoning/evidence is shown; never the system
 * prompt, keys or server configuration.
 */
export function VerificationCard({ verification }: { verification: VerificationResult }) {
  const verdictColor =
    verification.verdict === "PASS"
      ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#34D399]"
      : verification.verdict === "FAIL"
        ? "border-[#F43F5E]/40 bg-[#F43F5E]/10 text-[#FB7185]"
        : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="ap-card rounded-xl p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="ap-label">AI verification — why this verdict</div>
        <div className="flex items-center gap-2">
          {verification.provider === "mock" && (
            <Badge variant="outline" className="border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]">
              DEMO MOCK MODE
            </Badge>
          )}
          <Badge variant="outline" className={`font-mono ${verdictColor}`}>
            {verification.verdict}
          </Badge>
        </div>
      </div>

      {verification.promptInjectionDetected && (
        <div className="mt-3 rounded-lg border border-[#F43F5E]/40 bg-[#F43F5E]/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[#FB7185]">
            <AlertTriangle className="h-4 w-4" /> PROMPT INJECTION DETECTED
          </div>
          {verification.injectionSignals.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-[#FDA4AF]">
              {verification.injectionSignals.slice(0, 5).map((s, i) => (
                <li key={i} className="font-mono">• {s}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-white/50">
            The deterministic policy override blocks release regardless of the
            model&apos;s verdict.
          </p>
        </div>
      )}

      {/* criteria matrix */}
      {verification.criteria.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {verification.criteria.map((c) => (
            <div
              key={c.name}
              className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
            >
              {c.status === "PASS" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#34D399]" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FB7185]" />
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{c.name}</div>
                {c.evidence && (
                  <div className="truncate text-[11px] text-white/40" title={c.evidence}>
                    {c.evidence}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* deterministic pre-checks + integrity */}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {[...verification.preChecks, {
          name: "Submission matches on-chain hash",
          passed: verification.hashMatches,
          detail: verification.hashMatches ? "keccak256 verified" : "MISMATCH",
        }].map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-[11px] text-white/45">
            {c.passed ? (
              <CheckCircle2 className="h-3 w-3 text-[#34D399]" />
            ) : (
              <XCircle className="h-3 w-3 text-[#FB7185]" />
            )}
            <span className="truncate">{c.name}</span>
          </div>
        ))}
      </div>

      {/* policy decision */}
      <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="ap-label">Policy engine — deterministic gate</span>
          <Badge
            variant="outline"
            className={
              verification.policy.decision === "RELEASE"
                ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#34D399]"
                : verification.policy.decision === "REFUND"
                  ? "border-[#F43F5E]/40 bg-[#F43F5E]/10 text-[#FB7185]"
                  : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]"
            }
          >
            {verification.policy.decision}
          </Badge>
        </div>
        <div className="mt-2 space-y-1">
          {verification.policy.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-2 text-[11px]">
              {c.passed ? (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#34D399]" />
              ) : (
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#FB7185]" />
              )}
              <span className="text-white/60">{c.name}</span>
              <span className="ml-auto shrink-0 font-mono text-white/30">{c.detail.slice(0, 48)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-white/55">
          {verification.policy.reason}
        </p>
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-white/35">
          <span>score {verification.score}/100</span>
          <span>confidence {verification.confidence.toFixed(2)}</span>
          <span className="truncate">
            {verification.provider === "mock" ? "provider: mock" : `model: ${verification.model}`}
          </span>
          {verification.receipt ? (
            <span className="text-[#34D399]">receipt: signed ✓</span>
          ) : (
            <span className="text-[#FBBF24]">receipt: none (no settlement authorized)</span>
          )}
        </div>
      </div>

      {verification.reason && (
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          {verification.reason}
        </p>
      )}
    </motion.div>
  );
}
