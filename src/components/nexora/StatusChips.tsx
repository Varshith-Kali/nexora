"use client";

import { Badge } from "@/components/ui/badge";
import type { HealthInfo } from "@/hooks/use-nexora";

/** Deployment status chips — never fabricated, always live from /api/health. */
export function StatusChips({ health }: { health: HealthInfo | null }) {
  if (!health) {
    return <Badge variant="outline" className="text-white/50">checking status…</Badge>;
  }
  const netOk = health.network.testnetOnly && health.network.rpcReachable;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className={
          netOk
            ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#34D399]"
            : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]"
        }
      >
        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${netOk ? "ap-pulse-dot bg-[#10B981]" : "bg-[#F59E0B]"}`} />
        Monad Testnet{health.network.blockNumber !== null ? ` · #${health.network.blockNumber}` : ""}
      </Badge>
      <Badge
        variant="outline"
        className={
          health.ai.mockMode
            ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]"
            : "border-[#836EF9]/40 bg-[#836EF9]/10 text-[#A78BFA]"
        }
      >
        {health.ai.mockMode ? "DEMO MOCK MODE (no GEMINI_API_KEY)" : `Gemini · ${health.ai.model}`}
      </Badge>
      <Badge
        variant="outline"
        className={
          health.contracts.configured
            ? "border-white/15 bg-white/5 text-white/70"
            : "border-[#F43F5E]/40 bg-[#F43F5E]/10 text-[#FB7185]"
        }
      >
        {health.contracts.configured ? "contracts deployed" : "contracts: TBD"}
      </Badge>
    </div>
  );
}
