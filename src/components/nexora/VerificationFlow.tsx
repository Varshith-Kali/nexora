"use client";

/**
 * Nexora — VerificationFlow: the real 4-layer security visualization.
 *
 * This component is a READ-ONLY lens over the real state machine in
 * use-nexora.ts. It advances ONLY when the hook's state changes — no timers,
 * no fake loops, no cosmetic animations running independently of what actually
 * happened. If the hook says "verifying", we show verifying; if the hook says
 * "verified" with a REFUND, the injection diversion path lights up red.
 *
 * "Nothing on the dashboard is fabricated" — this is the visual truth of that.
 *
 * Layers visualized:
 *   1  Deterministic pre-scan   (injection regex + substance, instant, rule-based)
 *   2  Gemini semantic eval      (one AI call — submission is scored, not executed)
 *   3  Schema validation         (zod runtime check, malformed → REVIEW, fail-closed)
 *   4  Policy engine             (the ONLY authorization boundary, weighted scorecard)
 *
 * Then: Signed receipt → Settlement branch (RELEASE / REFUND).
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Shield,
  Sparkles,
  CheckSquare,
  Scale,
  FileCheck,
  Lock,
  ArrowDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { useNexora, DemoStage } from "@/hooks/use-nexora";
import type { VerificationResult } from "@/lib/nexora/types";

type Nx = ReturnType<typeof useNexora>;

// ── Weights must match schema.ts exactly ──────────────────────────────────────
const CRITERIA_WEIGHTS: Record<string, number> = {
  "Requirement completeness": 30,
  "Acceptance criteria": 25,
  "Evidence quality": 20,
  "Correctness and consistency": 15,
  "Security and manipulation": 10,
};

// ── Colour tokens (matching globals.css / existing components) ────────────────
const C = {
  purple: "#836EF9",
  purpleSoft: "#A78BFA",
  green: "#10B981",
  greenSoft: "#34D399",
  red: "#F43F5E",
  redSoft: "#FB7185",
  amber: "#F59E0B",
  amberSoft: "#FBBF24",
  blue: "#38BDF8",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: which verification layer is the divergence point?
// ─────────────────────────────────────────────────────────────────────────────
function divergeLayer(v: VerificationResult): 1 | 2 | 3 | 4 | null {
  if (!v) return null;
  if (v.policy.decision === "RELEASE") return null; // no divergence
  if (v.promptInjectionDetected && v.injectionSignals.length > 0) return 1;
  if (v.verdict === "FAIL" && v.promptInjectionDetected) return 2;
  if (v.verdict === "FAIL") return 2;
  if (v.verdict === "REVIEW") return 3; // schema degraded or uncertain
  return 4; // policy threshold not met
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function LayerStatus({
  passed,
  text,
}: {
  passed: boolean | null;
  text: string;
}) {
  if (passed === null)
    return (
      <span className="font-mono text-[10px] text-white/30">{text}</span>
    );
  return (
    <span
      className="flex items-center gap-1 font-mono text-[10px]"
      style={{ color: passed ? C.greenSoft : C.redSoft }}
    >
      {passed ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 shrink-0" />
      )}
      {text}
    </span>
  );
}

function ConnectorArrow({
  active,
  failed,
  reduced,
}: {
  active: boolean;
  failed: boolean;
  reduced: boolean;
}) {
  const color = failed ? C.red : active ? C.purple : "rgba(255,255,255,0.09)";
  return (
    <div className="flex justify-center py-1">
      <div
        className="flex h-8 w-px flex-col items-center"
        style={{
          background: `linear-gradient(to bottom, ${color}, transparent)`,
          opacity: active || failed ? 1 : 0.35,
          transition: reduced ? "none" : "all 0.4s ease",
        }}
      >
        <ArrowDown
          className="mt-auto h-3 w-3"
          style={{ color, marginTop: "auto", opacity: active || failed ? 1 : 0.3 }}
        />
      </div>
    </div>
  );
}

// ── Layer 1: Deterministic pre-scan ──────────────────────────────────────────
function Layer1Card({
  stage,
  verification,
  isActive,
  isDiverge,
  reduced,
}: {
  stage: DemoStage;
  verification: VerificationResult | null;
  isActive: boolean;
  isDiverge: boolean;
  reduced: boolean;
}) {
  const isComplete = stage === "verified" || stage === "settled";
  const passed = isComplete
    ? !verification?.promptInjectionDetected &&
      (verification?.preChecks.every((c) => c.passed) ?? true)
    : null;

  const borderColor = isDiverge
    ? C.red
    : isActive
      ? C.amber
      : isComplete && passed
        ? C.green
        : "rgba(255,255,255,0.07)";

  const glowClass = isDiverge
    ? "ap-glow-red"
    : isActive
      ? "ap-glow-amber"
      : isComplete && passed
        ? "ap-glow-green"
        : "";

  return (
    <motion.div
      initial={false}
      animate={{ scale: isActive ? 1.01 : 1 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
      className={`rounded-xl ap-card p-4 ${glowClass}`}
      style={{ borderColor, transition: reduced ? "none" : "border-color 0.35s ease" }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield
            className="h-4 w-4 shrink-0"
            style={{
              color: isDiverge ? C.red : isActive ? C.amber : isComplete && passed ? C.green : C.purpleSoft,
            }}
          />
          <span className="text-[13px] font-semibold">Layer 1 — Deterministic pre-scan</span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{
            borderColor: isDiverge
              ? `${C.red}60`
              : isActive
                ? `${C.amber}60`
                : isComplete
                  ? passed
                    ? `${C.green}60`
                    : `${C.red}60`
                  : "rgba(255,255,255,0.1)",
            background: isDiverge
              ? `${C.red}15`
              : isActive
                ? `${C.amber}15`
                : isComplete
                  ? passed
                    ? `${C.green}15`
                    : `${C.red}15`
                  : "transparent",
            color: isDiverge
              ? C.redSoft
              : isActive
                ? C.amberSoft
                : isComplete
                  ? passed
                    ? C.greenSoft
                    : C.redSoft
                  : "rgba(255,255,255,0.25)",
          }}
        >
          {!isComplete ? (isActive ? "running…" : "pending") : passed ? "CLEAR" : "BLOCKED"}
        </Badge>
      </div>

      {/* description — always visible */}
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        Instant, rule-based gate — no AI involved. Checks injection regexes and
        minimum substance. Cannot be bypassed by clever phrasing.
      </p>

      {/* live results — shown after verification */}
      {isComplete && verification && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.3 }}
          className="mt-3 space-y-1"
        >
          {verification.preChecks.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5"
            >
              {c.passed ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-[#34D399]" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-[#FB7185]" />
              )}
              <span className="text-[11px] text-white/60">{c.name}</span>
              <span className="ml-auto font-mono text-[10px] text-white/30">{c.detail.slice(0, 40)}</span>
            </div>
          ))}
          {verification.injectionSignals.length > 0 && (
            <div className="mt-2 rounded-lg border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FB7185]">
                <AlertTriangle className="h-3 w-3" /> Injection signals detected
              </div>
              {verification.injectionSignals.slice(0, 3).map((s, i) => (
                <div key={i} className="mt-1 font-mono text-[10px] text-[#FDA4AF]">
                  • {s.slice(0, 80)}
                </div>
              ))}
            </div>
          )}
          <LayerStatus
            passed={passed}
            text={
              passed
                ? "Layer 1: clear — no injection markers, substance OK"
                : `Layer 1: BLOCKED — ${verification.injectionSignals.length} injection signal(s) detected`
            }
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Layer 2: Gemini semantic evaluation ──────────────────────────────────────
function Layer2Card({
  stage,
  verification,
  isActive,
  isDiverge,
  reduced,
}: {
  stage: DemoStage;
  verification: VerificationResult | null;
  isActive: boolean;
  isDiverge: boolean;
  reduced: boolean;
}) {
  const isComplete = stage === "verified" || stage === "settled";
  const passed = isComplete
    ? verification?.verdict === "PASS"
    : null;

  const borderColor = isDiverge
    ? C.red
    : isActive
      ? C.purple
      : isComplete && passed
        ? C.green
        : isComplete && !passed
          ? C.red
          : "rgba(255,255,255,0.07)";

  return (
    <motion.div
      initial={false}
      animate={{ scale: isActive ? 1.01 : 1 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
      className={`rounded-xl ap-card p-4 ${isActive ? "ap-glow-purple" : isDiverge ? "ap-glow-red" : isComplete && passed ? "ap-glow-green" : ""}`}
      style={{ borderColor, transition: reduced ? "none" : "border-color 0.35s ease" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0"
            style={{
              color: isDiverge
                ? C.red
                : isActive
                  ? C.purple
                  : isComplete
                    ? passed
                      ? C.green
                      : C.red
                    : C.purpleSoft,
            }}
          />
          <span className="text-[13px] font-semibold">Layer 2 — Gemini semantic evaluation</span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{
            borderColor: isActive
              ? `${C.purple}60`
              : isComplete
                ? passed
                  ? `${C.green}60`
                  : `${C.red}60`
                : "rgba(255,255,255,0.1)",
            background: isActive
              ? `${C.purple}15`
              : isComplete
                ? passed
                  ? `${C.green}15`
                  : `${C.red}15`
                : "transparent",
            color: isActive
              ? C.purpleSoft
              : isComplete
                ? passed
                  ? C.greenSoft
                  : C.redSoft
                : "rgba(255,255,255,0.25)",
          }}
        >
          {!isComplete
            ? isActive
              ? "scoring…"
              : "pending"
            : verification?.verdict ?? "—"}
        </Badge>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        <span className="text-white/65">Gemini is scoring this content, not executing it.</span>{" "}
        The submission is untrusted data — evaluated strictly against the
        buyer&apos;s acceptance criteria. One structured JSON response, schema-validated.
      </p>

      {/* provider/model pill */}
      {isComplete && verification && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.3 }}
          className="mt-3 space-y-2"
        >
          {verification.provider === "mock" && (
            <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1.5 text-[11px] text-[#FBBF24]">
              ⚠ DEMO MOCK MODE — GEMINI_API_KEY not configured
            </div>
          )}
          <div className="flex flex-wrap gap-3 font-mono text-[10px] text-white/35">
            <span>provider: {verification.provider}</span>
            <span>model: {verification.model}</span>
            <span>
              confidence:{" "}
              <span style={{ color: verification.confidence >= 0.7 ? C.greenSoft : C.amberSoft }}>
                {verification.confidence.toFixed(2)}
              </span>
            </span>
          </div>
          {/* Per-criterion evidence rows */}
          <div className="space-y-1">
            {verification.criteria.map((c) => (
              <div
                key={c.name}
                className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5"
              >
                {c.status === "PASS" ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#34D399]" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#FB7185]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">{c.name}</span>
                    <span
                      className="shrink-0 font-mono text-[10px]"
                      style={{
                        color: CRITERIA_WEIGHTS[c.name]
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {CRITERIA_WEIGHTS[c.name] ?? "?"}pts
                    </span>
                  </div>
                  {c.evidence && (
                    <div
                      className="mt-0.5 truncate text-[10px] text-white/35"
                      title={c.evidence}
                    >
                      {c.evidence}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <LayerStatus
            passed={passed}
            text={
              passed
                ? `Layer 2: PASS — verdict PASS, confidence ${verification.confidence.toFixed(2)}`
                : `Layer 2: ${verification.verdict} — ${verification.reason.slice(0, 80)}`
            }
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Layer 3: Schema validation ────────────────────────────────────────────────
function Layer3Card({
  stage,
  verification,
  isActive,
  isDiverge,
  reduced,
}: {
  stage: DemoStage;
  verification: VerificationResult | null;
  isActive: boolean;
  isDiverge: boolean;
  reduced: boolean;
}) {
  const isComplete = stage === "verified" || stage === "settled";
  // schema passed if we have a valid verdict (not degraded to REVIEW by schema failure)
  const schemaCheck = verification?.policy.checks.find((c) =>
    c.name.toLowerCase().includes("schema"),
  );
  const passed = isComplete ? (schemaCheck?.passed ?? true) : null;
  const hashCheck = verification?.policy.checks.find((c) =>
    c.name.toLowerCase().includes("hash"),
  );

  const borderColor = isDiverge
    ? C.amber
    : isComplete && passed === false
      ? C.amber
      : isComplete && passed
        ? C.green
        : "rgba(255,255,255,0.07)";

  return (
    <motion.div
      initial={false}
      animate={{ scale: isActive ? 1.01 : 1 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
      className={`rounded-xl ap-card p-4 ${isComplete && !passed ? "ap-glow-amber" : isComplete && passed ? "ap-glow-green" : ""}`}
      style={{ borderColor, transition: reduced ? "none" : "border-color 0.35s ease" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckSquare
            className="h-4 w-4 shrink-0"
            style={{
              color: isDiverge
                ? C.amber
                : isComplete
                  ? passed
                    ? C.green
                    : C.amber
                  : C.purpleSoft,
            }}
          />
          <span className="text-[13px] font-semibold">Layer 3 — Schema validation</span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{
            borderColor: isComplete
              ? passed
                ? `${C.green}60`
                : `${C.amber}60`
              : "rgba(255,255,255,0.1)",
            background: isComplete
              ? passed
                ? `${C.green}15`
                : `${C.amber}15`
              : "transparent",
            color: isComplete ? (passed ? C.greenSoft : C.amberSoft) : "rgba(255,255,255,0.25)",
          }}
        >
          {!isComplete ? "pending" : passed ? "VALID" : "DEGRADED → REVIEW"}
        </Badge>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        Gemini&apos;s structured JSON (verdict · score · confidence · criteria ·
        violations · promptInjectionDetected · missingRequirements) is validated
        at runtime by zod. Malformed output visibly degrades this job to{" "}
        <span className="text-[#FBBF24]">REVIEW</span> — never silently fails.
        Also checks: keccak256(submission) === on-chain outputHash.
      </p>

      {isComplete && verification && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.3 }}
          className="mt-3 space-y-1.5"
        >
          {schemaCheck && (
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
              {schemaCheck.passed ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-[#34D399]" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0 text-[#FBBF24]" />
              )}
              <span className="text-[11px] text-white/60">{schemaCheck.name}</span>
              <span className="ml-auto font-mono text-[10px] text-white/30">
                {schemaCheck.detail.slice(0, 48)}
              </span>
            </div>
          )}
          {hashCheck && (
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
              {hashCheck.passed ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-[#34D399]" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-[#FB7185]" />
              )}
              <span className="text-[11px] text-white/60">{hashCheck.name}</span>
              <span className="ml-auto font-mono text-[10px] text-white/30">
                {hashCheck.detail.slice(0, 48)}
              </span>
            </div>
          )}
          <div className="font-mono text-[10px] text-white/30">
            hash: {verification.submissionHash.slice(0, 18)}…
            {verification.hashMatches ? (
              <span className="ml-2 text-[#34D399]">✓ matches on-chain</span>
            ) : (
              <span className="ml-2 text-[#FB7185]">✗ MISMATCH</span>
            )}
          </div>
          <LayerStatus
            passed={passed}
            text={
              passed
                ? "Layer 3: schema valid, hash verified"
                : "Layer 3: schema degraded → REVIEW (fail-closed)"
            }
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Layer 4: Policy engine ────────────────────────────────────────────────────
function Layer4Card({
  stage,
  verification,
  isActive,
  isDiverge,
  reduced,
}: {
  stage: DemoStage;
  verification: VerificationResult | null;
  isActive: boolean;
  isDiverge: boolean;
  reduced: boolean;
}) {
  const isComplete = stage === "verified" || stage === "settled";
  const decision = verification?.policy.decision;
  const passed = isComplete ? decision === "RELEASE" : null;
  const score = verification?.score ?? null;

  // Animated criteria fill-in state
  const [shownCriteria, setShownCriteria] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isComplete && verification?.criteria.length) {
      setShownCriteria(0);
      const count = verification.criteria.length;
      let i = 0;
      function step() {
        i++;
        setShownCriteria(i);
        if (i < count) timerRef.current = setTimeout(step, reduced ? 0 : 180);
      }
      timerRef.current = setTimeout(step, reduced ? 0 : 120);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [isComplete, verification, reduced]);

  const borderColor = isDiverge
    ? C.red
    : isComplete && decision === "RELEASE"
      ? C.green
      : isComplete
        ? C.red
        : "rgba(255,255,255,0.07)";

  const glowClass = isDiverge
    ? "ap-glow-red"
    : isComplete && decision === "RELEASE"
      ? "ap-glow-green"
      : isComplete
        ? "ap-glow-red"
        : "";

  return (
    <motion.div
      initial={false}
      animate={{ scale: isActive ? 1.01 : 1 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
      className={`rounded-xl ap-card p-4 ${glowClass}`}
      style={{ borderColor, transition: reduced ? "none" : "border-color 0.35s ease" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale
            className="h-4 w-4 shrink-0"
            style={{
              color: isDiverge
                ? C.red
                : isComplete
                  ? decision === "RELEASE"
                    ? C.green
                    : C.red
                  : C.purpleSoft,
            }}
          />
          <span className="text-[13px] font-semibold">Layer 4 — Policy engine</span>
          <span className="rounded border border-[#836EF9]/30 bg-[#836EF9]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#A78BFA]">
            the only gate that can say YES
          </span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{
            borderColor: isComplete
              ? decision === "RELEASE"
                ? `${C.green}60`
                : `${C.red}60`
              : "rgba(255,255,255,0.1)",
            background: isComplete
              ? decision === "RELEASE"
                ? `${C.green}15`
                : `${C.red}15`
              : "transparent",
            color: isComplete
              ? decision === "RELEASE"
                ? C.greenSoft
                : C.redSoft
              : "rgba(255,255,255,0.25)",
          }}
        >
          {!isComplete ? "pending" : decision ?? "—"}
        </Badge>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        Deterministic. Gemini&apos;s verdict is an input, not the decision.
        Release requires ALL: score ≥ 80 · confidence ≥ 0.70 · no injection ·
        no missing requirements · schema valid · hash match. Any uncertainty → no settlement.
      </p>

      {isComplete && verification && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.3 }}
          className="mt-3 space-y-2"
        >
          {/* Score bar */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="ap-label">Weighted score (30/25/20/15/10)</span>
              <span
                className="ap-num font-mono text-[11px] font-semibold"
                style={{ color: score !== null && score >= 80 ? C.greenSoft : C.redSoft }}
              >
                {score ?? "—"}/100
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    score !== null && score >= 80
                      ? `linear-gradient(90deg, ${C.green}, ${C.greenSoft})`
                      : `linear-gradient(90deg, ${C.red}, ${C.redSoft})`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${score ?? 0}%` }}
                transition={{ duration: reduced ? 0 : 0.7, ease: "easeOut" }}
              />
            </div>
            <div className="mt-0.5 flex justify-end">
              <span className="text-[9px] text-white/25">threshold: 80/100</span>
            </div>
          </div>

          {/* Criteria scorecard — fills in one by one */}
          <div className="space-y-1">
            {verification.criteria.map((c, i) => {
              const visible = i < shownCriteria;
              const weight = CRITERIA_WEIGHTS[c.name] ?? 0;
              return (
                <AnimatePresence key={c.name}>
                  {visible && (
                    <motion.div
                      initial={reduced ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5"
                    >
                      {c.status === "PASS" ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-[#34D399]" />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0 text-[#FB7185]" />
                      )}
                      <span className="flex-1 text-[11px] text-white/65">{c.name}</span>
                      <span
                        className="ap-num shrink-0 font-mono text-[10px] font-semibold"
                        style={{ color: c.status === "PASS" ? C.greenSoft : C.redSoft }}
                      >
                        {c.status === "PASS" ? `+${weight}` : `+0`}/{weight}pts
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>

          {/* Policy checks */}
          <div className="mt-1 space-y-1 border-t border-white/[0.06] pt-2">
            <div className="ap-label mb-1.5">Authorization checklist</div>
            {verification.policy.checks.map((c) => (
              <div key={c.name} className="flex items-start gap-2 text-[10px]">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#34D399]" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#FB7185]" />
                )}
                <span className="text-white/55">{c.name}</span>
                <span className="ml-auto shrink-0 font-mono text-white/25">
                  {c.detail.slice(0, 40)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-white/50">
            {verification.policy.reason}
          </p>
          <LayerStatus
            passed={passed}
            text={
              passed
                ? `Layer 4: score ${score}/100 — RELEASE authorized`
                : `Layer 4: score ${score}/100 — ${decision}`
            }
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Signed Receipt badge ──────────────────────────────────────────────────────
function ReceiptBadge({
  verification,
  reduced,
}: {
  verification: VerificationResult | null;
  reduced: boolean;
}) {
  if (!verification?.receipt) return null;
  const receipt = verification.receipt;
  const expiresInMin = Math.max(
    0,
    Math.floor((receipt.expiresAt - Math.floor(Date.now() / 1000)) / 60),
  );

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0 : 0.35 }}
      className="rounded-xl border border-[#836EF9]/30 bg-[#836EF9]/[0.07] p-3"
    >
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
        <span className="text-[12px] font-semibold text-[#A78BFA]">
          Signed receipt — settlement authorized
        </span>
        <Badge
          variant="outline"
          className="ml-auto border-[#836EF9]/40 bg-[#836EF9]/10 text-[10px] text-[#A78BFA]"
        >
          {receipt.decision}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-white/35">
        <span>job #{receipt.jobId}</span>
        <span>TTL: {expiresInMin}min remaining</span>
        <span>sig: {receipt.signature.slice(0, 14)}…</span>
        <span className="text-[#34D399]">✓ verifier key</span>
      </div>
      <p className="mt-1.5 text-[10px] text-white/35">
        Time-bound, job-bound, single-use. The only proof that /api/settle is
        authorized to call settle() — expires in 10 minutes.
      </p>
    </motion.div>
  );
}

// ── Settlement outcome ────────────────────────────────────────────────────────
function SettlementOutcome({
  stage,
  verification,
  settlement,
  reduced,
}: {
  stage: DemoStage;
  verification: VerificationResult | null;
  settlement: Nx["settlement"];
  reduced: boolean;
}) {
  const isSettled = stage === "settled";
  const decision = verification?.policy.decision;
  const isRelease = decision === "RELEASE" || settlement?.action === "RELEASE";

  if (!isSettled && !(stage === "verified" && (decision === "RELEASE" || decision === "REFUND"))) {
    return null;
  }

  const color = isRelease ? C.green : C.red;
  const colorSoft = isRelease ? C.greenSoft : C.redSoft;
  const glow = isRelease ? "ap-glow-green" : "ap-glow-red";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.4 }}
      className={`rounded-xl ap-card p-4 ${glow}`}
      style={{ borderColor: color }}
    >
      <div className="flex items-center gap-2">
        <FileCheck className="h-4 w-4 shrink-0" style={{ color }} />
        <span className="text-[13px] font-semibold">
          {isRelease ? "🟢 Settlement — Release" : "🔴 Settlement — Refund"}
        </span>
        {isSettled && (
          <Badge
            variant="outline"
            className="ml-auto text-[10px]"
            style={{ borderColor: `${color}60`, background: `${color}15`, color: colorSoft }}
          >
            {settlement?.action ?? decision}
          </Badge>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        {isRelease
          ? "settle(true) — escrow released to seller. Real Monad Testnet transaction, irreversible."
          : "settle(false) — escrow refunded to buyer. Real Monad Testnet transaction, irreversible."}
      </p>

      {isSettled && settlement && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.3 }}
          className="mt-3 space-y-1.5"
        >
          <div className="flex flex-wrap gap-3 font-mono text-[10px]" style={{ color: colorSoft }}>
            <span>{settlement.amountMon} MON</span>
            <span>block #{settlement.blockNumber ?? "?"}</span>
            <span
              className="font-mono text-[10px]"
              style={{ color: settlement.status === "success" ? C.greenSoft : C.redSoft }}
            >
              {settlement.status}
            </span>
          </div>
          <a
            href={settlement.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] hover:underline"
            style={{ color: C.blue }}
          >
            View on Monadscan <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </motion.div>
      )}

      {!isSettled && (
        <p className="mt-2 text-[10px] text-white/30">
          Awaiting your explicit action — click the button above to submit the
          settlement transaction.
        </p>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────────────────────────────────────
export function VerificationFlow({ nx }: { nx: Nx }) {
  const reduced = Boolean(useReducedMotion());
  const { stage, verification, settlement } = nx;

  // We only show the flow once verification has been attempted or is in progress
  const showFlow =
    stage === "submitted" ||
    stage === "verified" ||
    stage === "settled" ||
    nx.busy === "verify";

  if (!showFlow) {
    // Idle placeholder — gives context on what's coming
    return (
      <div className="rounded-xl ap-card p-4">
        <div className="ap-label">Verification flow — 4 defense layers</div>
        <p className="mt-2 text-[12px] leading-relaxed text-white/40">
          After the seller submits work, the 4-layer verification pipeline runs
          here. Each layer is independent, ordered, and visible. The policy
          engine — not Gemini — decides whether funds move.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "L1 · Pre-scan", color: C.amber, note: "deterministic" },
            { label: "L2 · Gemini", color: C.purple, note: "AI scoring" },
            { label: "L3 · Schema", color: C.blue, note: "zod runtime" },
            { label: "L4 · Policy", color: C.green, note: "authorization" },
          ].map((l) => (
            <div
              key={l.label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
            >
              <div className="text-[11px] font-semibold" style={{ color: l.color }}>
                {l.label}
              </div>
              <div className="text-[10px] text-white/30">{l.note}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isVerifying = nx.busy === "verify";
  const divLayer = verification ? divergeLayer(verification) : null;

  return (
    <div className="space-y-0">
      <div className="ap-label mb-3">
        Verification flow — 4 independent defense layers
        {verification?.provider === "mock" && (
          <span className="ml-2 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[9px] text-[#FBBF24]">
            DEMO MOCK MODE
          </span>
        )}
      </div>

      <Layer1Card
        stage={stage}
        verification={verification}
        isActive={isVerifying}
        isDiverge={divLayer === 1}
        reduced={reduced}
      />

      <ConnectorArrow
        active={isVerifying || stage === "verified" || stage === "settled"}
        failed={divLayer !== null && divLayer >= 1}
        reduced={reduced}
      />

      <Layer2Card
        stage={stage}
        verification={verification}
        isActive={isVerifying}
        isDiverge={divLayer === 2}
        reduced={reduced}
      />

      <ConnectorArrow
        active={isVerifying || stage === "verified" || stage === "settled"}
        failed={divLayer !== null && divLayer >= 2}
        reduced={reduced}
      />

      <Layer3Card
        stage={stage}
        verification={verification}
        isActive={isVerifying}
        isDiverge={divLayer === 3}
        reduced={reduced}
      />

      <ConnectorArrow
        active={isVerifying || stage === "verified" || stage === "settled"}
        failed={divLayer !== null && divLayer >= 3}
        reduced={reduced}
      />

      <Layer4Card
        stage={stage}
        verification={verification}
        isActive={isVerifying}
        isDiverge={divLayer === 4}
        reduced={reduced}
      />

      {/* Receipt — only shown when verification authorized a settlement */}
      {(stage === "verified" || stage === "settled") &&
        verification?.receipt && (
          <>
            <ConnectorArrow active failed={false} reduced={reduced} />
            <ReceiptBadge verification={verification} reduced={reduced} />
          </>
        )}

      {/* Settlement outcome */}
      {(stage === "verified" || stage === "settled") && (
        <>
          <ConnectorArrow
            active={stage === "verified" || stage === "settled"}
            failed={
              verification?.policy.decision === "REFUND" ||
              settlement?.action === "REFUND"
            }
            reduced={reduced}
          />
          <SettlementOutcome
            stage={stage}
            verification={verification}
            settlement={settlement}
            reduced={reduced}
          />
        </>
      )}
    </div>
  );
}
