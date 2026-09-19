"use client";

import { motion } from "framer-motion";
import { Lock, FileUp, Sparkles, Scale, Coins, PlusCircle } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

const STAGES = [
  { key: "fund",   icon: PlusCircle, title: "Open Job",      actor: "Buyer",    desc: "Lock MON in escrow" },
  { key: "submit", icon: FileUp,     title: "Submit Work",   actor: "Seller",   desc: "Hash committed on-chain" },
  { key: "verify", icon: Sparkles,   title: "AI Verify",     actor: "Gemini",   desc: "Evaluate vs criteria" },
  { key: "policy", icon: Scale,      title: "Policy Gate",   actor: "Engine",   desc: "PASS / FAIL decision" },
  { key: "settle", icon: Coins,      title: "Settle",        actor: "Verifier", desc: "MON released or refunded" },
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
  const failed =
    nx.verification?.policy.decision === "REFUND" || nx.job?.status === "Refunded";
  const reviewing = nx.verification?.policy.decision === "MANUAL_REVIEW";

  return (
    <div className="ap-card rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-4 w-4 text-[#A78BFA]" />
        <span className="ap-label">Flow</span>
        <div className="ml-auto flex items-center gap-1.5">
          {STAGES.map((_, i) => {
            const done = current > i + 1;
            const active = current === i + 1;
            return (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: active ? "16px" : "6px",
                  background: done
                    ? "#10B981"
                    : active
                      ? "#836EF9"
                      : "rgba(255,255,255,0.12)",
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {STAGES.map((s, i) => {
          const idx = i + 1;
          const done = current > idx;
          const active = current === idx;
          const isLast = s.key === "settle" as StageKey;
          const terminalBad = isLast && (failed || reviewing);
          const terminalGood = isLast && current === 6 && !failed && !reviewing;

          const color = terminalBad
            ? failed
              ? "#F43F5E"
              : "#F59E0B"
            : terminalGood
              ? "#10B981"
              : done
                ? "#10B981"
                : active
                  ? "#836EF9"
                  : "rgba(255,255,255,0.2)";

          return (
            <motion.div
              key={s.key}
              initial={false}
              animate={{ scale: active ? 1.03 : 1 }}
              transition={{ duration: 0.2 }}
              className={`rounded-xl border p-3 transition-colors ${
                active
                  ? "border-[#836EF9]/50 bg-[#836EF9]/[0.08]"
                  : done
                    ? "border-[#10B981]/20 bg-[#10B981]/[0.04]"
                    : "border-white/[0.06] bg-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <s.icon className="h-4 w-4" style={{ color }} />
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: color,
                    boxShadow: active ? `0 0 8px ${color}` : "none",
                  }}
                />
              </div>
              <div className="mt-2 text-[12px] font-semibold leading-tight">{s.title}</div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>
                {s.actor}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-white/30">{s.desc}</div>

              {/* tx link */}
              {(nx.txs as Record<string, { explorerUrl: string } | undefined>)[
                s.key === "submit" ? "submit" : s.key === "settle" ? "settle" : s.key === "fund" ? "open" : ""
              ] && (
                <a
                  href={(nx.txs as Record<string, { explorerUrl: string } | undefined>)[
                    s.key === "submit" ? "submit" : s.key === "settle" ? "settle" : "open"
                  ]?.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block font-mono text-[9px] text-[#38BDF8] hover:underline"
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
