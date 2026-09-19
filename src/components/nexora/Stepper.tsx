"use client";

import { motion } from "framer-motion";
import {
  Briefcase,
  Lock,
  FileUp,
  Sparkles,
  Scale,
  Coins,
} from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

/**
 * The lifecycle rail — WHO acts, WHAT happens, WHEN. Each stage lights up
 * from real state (on-chain status / verification / settlement), never from
 * timers: what you see is what actually happened.
 */
const STAGES = [
  { key: "create", icon: Briefcase, title: "Create job", actor: "Buyer wallet", desc: "Specify requirements + acceptance criteria" },
  { key: "fund", icon: Lock, title: "Fund escrow", actor: "Buyer wallet", desc: "openJob() locks MON on Monad Testnet" },
  { key: "submit", icon: FileUp, title: "Submit work", actor: "Seller agent", desc: "submitWork() commits keccak256 hash" },
  { key: "verify", icon: Sparkles, title: "AI verification", actor: "Gemini (off-chain)", desc: "Evaluates submission vs criteria — 0 tx" },
  { key: "policy", icon: Scale, title: "Policy decision", actor: "Policy engine", desc: "Deterministic gate: RELEASE / REFUND / REVIEW" },
  { key: "settle", icon: Coins, title: "Settlement", actor: "Verifier operator", desc: "settle() on Monad — real MON moves" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function stageIndex(nx: Nx): number {
  if (nx.settlement || nx.job?.status === "Released" || nx.job?.status === "Refunded") return 6;
  if (nx.verification) return nx.verification.policy ? 5 : 4;
  if (nx.job?.status === "Submitted") return 3;
  if (nx.job?.status === "Open" || nx.jobId !== null) return 2;
  if (nx.scenario) return 1;
  return 0;
}

export function Stepper({ nx }: { nx: Nx }) {
  const current = stageIndex(nx);
  const failed = nx.verification?.policy.decision === "REFUND" ||
    nx.job?.status === "Refunded";
  const reviewing = nx.verification?.policy.decision === "MANUAL_REVIEW";

  return (
    <div className="ap-card rounded-xl p-4">
      <div className="ap-label">Lifecycle — trust boundary at every hop</div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((s, i) => {
          const idx = i + 1;
          const done = current > idx;
          const active = current === idx;
          const last = s.key === "settle" as StageKey;
          const terminalBad = last && (failed || reviewing);
          const terminalGood = last && current === 6 && !failed && !reviewing;
          const accent = terminalBad
            ? failed ? "#F43F5E" : "#F59E0B"
            : terminalGood
              ? "#10B981"
              : active
                ? "#836EF9"
                : "rgba(255,255,255,0.14)";
          return (
            <motion.div
              key={s.key}
              initial={false}
              animate={{ scale: active ? 1.02 : 1 }}
              transition={{ duration: 0.25 }}
              className={`rounded-lg border p-3 ${
                active
                  ? "border-[#836EF9]/50 bg-[#836EF9]/[0.08]"
                  : done
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-white/[0.06] bg-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <s.icon
                  className="h-4 w-4"
                  style={{ color: accent }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: accent, boxShadow: active ? `0 0 10px ${accent}` : "none" }}
                />
              </div>
              <div className="mt-2 text-[13px] font-medium leading-tight">{s.title}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-[#A78BFA]/80">
                {s.actor}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-white/35">{s.desc}</div>
              {nx.txs[s.key === "submit" ? "submit" : s.key === "settle" ? "settle" : s.key === "fund" ? "open" : undefined as never] && (
                <a
                  href={(nx.txs as Record<string, { explorerUrl: string } | undefined>)[
                    s.key === "submit" ? "submit" : s.key === "settle" ? "settle" : "open"
                  ]?.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-mono text-[9px] text-[#38BDF8] underline-offset-2 hover:underline"
                >
                  tx ↗
                </a>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
