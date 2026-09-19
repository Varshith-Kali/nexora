"use client";

import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explorerAddress } from "@/config/contracts";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

function short(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

const STATUS_TONE: Record<string, string> = {
  Open: "border-[#836EF9]/40 bg-[#836EF9]/10 text-[#A78BFA]",
  Submitted: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]",
  Released: "border-[#10B981]/40 bg-[#10B981]/10 text-[#34D399]",
  Refunded: "border-[#F43F5E]/40 bg-[#F43F5E]/10 text-[#FB7185]",
};

/** Right rail: live on-chain job state, escrow balance, and tx history. */
export function JobCard({ nx }: { nx: Nx }) {
  const h = nx.health;
  return (
    <div className="flex flex-col gap-5">
      <div className="ap-card rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="ap-label">On-chain job</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-white/40 hover:text-white/70"
            onClick={() => {
              void nx.refreshHealth();
            }}
            aria-label="refresh chain state"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {nx.job ? (
          <div className="mt-3 space-y-2.5 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-white/35">Job ID</span>
              <span className="font-mono text-white/85">#{nx.jobId}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/35">Status</span>
              <Badge variant="outline" className={STATUS_TONE[nx.job.status] ?? ""}>
                {nx.job.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/35">Escrow</span>
              <span className="font-mono text-[#A78BFA]">{nx.job.amount} MON</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-white/35">Buyer</span>
              <a
                href={explorerAddress(nx.job.buyer)}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[#38BDF8] hover:underline"
              >
                {short(nx.job.buyer)}
              </a>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-white/35">Seller</span>
              <a
                href={explorerAddress(nx.job.seller)}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[#38BDF8] hover:underline"
              >
                {short(nx.job.seller)}
              </a>
            </div>
            {nx.job.outputHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
              <div className="border-t border-white/[0.06] pt-2">
                <div className="text-white/35">Output hash (on-chain)</div>
                <div className="mt-0.5 break-all font-mono text-[10px] text-white/45">
                  {nx.job.outputHash}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12px] leading-relaxed text-white/40">
            {nx.jobId
              ? "Looking up the job on-chain…"
              : "No job yet — create one in the console after loading a scenario."}
          </p>
        )}

        {h?.contracts.escrowBalanceMon && (
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[12px]">
            <span className="text-white/35">Contract escrow balance</span>
            <span className="font-mono text-white/70">{h.contracts.escrowBalanceMon} MON</span>
          </div>
        )}
      </div>

      {/* tx trail */}
      <div className="ap-card rounded-xl p-4">
        <div className="ap-label">Transactions (this demo)</div>
        <div className="mt-3 space-y-2">
          {Object.values(nx.txs).length === 0 && (
            <p className="text-[12px] text-white/35">
              None yet. Each demo path costs exactly 3 transactions.
            </p>
          )}
          {Object.entries(nx.txs).map(([k, t]) => (
            <a
              key={k}
              href={t!.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] transition hover:border-white/20"
            >
              <span className="text-white/60">{t!.label}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[#38BDF8]">
                {t!.txHash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* links */}
      <div className="ap-card rounded-xl p-4">
        <div className="ap-label">Inspect</div>
        <div className="mt-3 flex flex-col gap-2 text-[12px]">
          <LinkRow
            label="Escrow contract"
            value={h?.contracts.configured ? short(h.contracts.escrow) : "TBD — not deployed"}
            href={h?.contracts.configured ? explorerAddress(h.contracts.escrow) : null}
          />
          <LinkRow
            label="Registry contract"
            value={h?.contracts.configured ? short(h.contracts.registry) : "TBD — not deployed"}
            href={h?.contracts.configured ? explorerAddress(h.contracts.registry) : null}
          />
          <LinkRow
            label="Verifier operator"
            value={h?.agents.verifierSignerConfigured ? short(h.agents.verifierSigner) : "not configured"}
            href={h?.agents.verifierSignerConfigured ? explorerAddress(h.agents.verifierSigner) : null}
          />
        </div>
        {h && !h.network.testnetOnly && (
          <p className="mt-3 rounded-lg border border-[#F43F5E]/40 bg-[#F43F5E]/10 px-3 py-2 text-[11px] text-[#FB7185]">
            Configured chain is NOT Monad Testnet — settlement is refused.
          </p>
        )}
      </div>
    </div>
  );
}

function LinkRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/35">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[#38BDF8] hover:underline"
        >
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="font-mono text-white/40">{value}</span>
      )}
    </div>
  );
}
