"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { SettlementResult } from "@/lib/nexora/types";

/** Final settlement card — real tx hash, real block, real explorer link. */
export function SettlementCard({ settlement }: { settlement: SettlementResult }) {
  const released = settlement.action === "RELEASE";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl border p-4 ${
        settlement.status !== "success"
          ? "border-[#F59E0B]/40 bg-[#F59E0B]/[0.06]"
          : released
            ? "border-[#10B981]/40 bg-[#10B981]/[0.06]"
            : "border-[#F43F5E]/40 bg-[#F43F5E]/[0.06]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="ap-label">Monad settlement</div>
        <Badge
          variant="outline"
          className={
            settlement.status !== "success"
              ? "border-[#F59E0B]/40 text-[#FBBF24]"
              : released
                ? "border-[#10B981]/40 text-[#34D399]"
                : "border-[#F43F5E]/40 text-[#FB7185]"
          }
        >
          {settlement.status === "success"
            ? released
              ? "RELEASED"
              : "REFUNDED"
            : "TX FAILED — escrow unchanged"}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {released ? (
          <ArrowUpRight className="h-5 w-5 text-[#34D399]" />
        ) : (
          <ArrowDownLeft className="h-5 w-5 text-[#FB7185]" />
        )}
        <span className="text-lg font-semibold">
          {settlement.amountMon} MON{" "}
          {released ? "released to seller" : "refunded to buyer"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-[11px] text-white/50">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-white/30">job</span>
          <span className="font-mono">#{settlement.jobId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-white/30">recipient</span>
          <span className="truncate font-mono">{settlement.recipient}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-white/30">block</span>
          <span className="font-mono">{settlement.blockNumber ?? "pending"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-white/30">tx</span>
          <a
            href={settlement.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate font-mono text-[#38BDF8] hover:underline"
          >
            {settlement.txHash.slice(0, 18)}… <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={settlement.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition hover:border-white/25 hover:text-white"
        >
          View Settlement Tx <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a
          href={`https://testnet.monadscan.com/address/${settlement.recipient}#internaltx`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-[#38BDF8]/80 transition hover:border-white/25 hover:text-[#38BDF8]"
        >
          View Recipient Internal Txns ↗
        </a>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">
        💡 <strong>Note for explorers:</strong> Contract payouts/refunds are native contract transfers. On Monadscan, they are credited immediately to the account balance and listed under the <span className="text-white/70 font-medium">“Internal Transactions”</span> tab.
      </p>
    </motion.div>
  );
}
