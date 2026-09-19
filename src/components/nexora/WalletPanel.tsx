"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Wallet, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

const ACCOUNTS = [
  {
    label: "Buyer",
    address: "0x7Ac59E62656CA555009900BD85dfA3a225cb8653",
    color: "#836EF9",
    tag: "YOU",
    role: "buyer",
  },
  {
    label: "Seller",
    address: "0x04Afc4Bd311F522cAed7951C28096846D7FE6209",
    color: "#10B981",
    tag: "AGENT",
    role: "seller",
  },
  {
    label: "Deployer",
    address: "0x7d1111A97D275491573B4e9F289207e948f3b923",
    color: "#38BDF8",
    tag: "OPS",
    role: "deployer",
  },
  {
    label: "Verifier",
    address: "0x6a41c280BC8904f8Fc8FdC809b5D18C0A5da2032",
    color: "#F59E0B",
    tag: "OPS",
    role: "verifier",
  },
] as const;

const MONADSCAN = "https://testnet.monadscan.com/address/";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

async function fetchMONBalance(address: string): Promise<string> {
  try {
    const res = await fetch("https://testnet-rpc.monad.xyz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    const d = (await res.json()) as { result?: string };
    if (!d.result) return "—";
    const mon = Number(BigInt(d.result)) / 1e18;
    return mon >= 1 ? mon.toFixed(3) : mon.toFixed(4);
  } catch {
    return "—";
  }
}

export function WalletPanel({ nx }: { nx: Nx }) {
  const { address, isConnected } = useAccount();
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [spinning, setSpinning] = useState(false);

  const refresh = useCallback(async () => {
    setSpinning(true);
    const results: Record<string, string> = {};
    await Promise.all(
      ACCOUNTS.map(async (acc) => {
        results[acc.address] = await fetchMONBalance(acc.address);
      }),
    );
    setBalances(results);
    setSpinning(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // also refresh when wallet connects
  useEffect(() => {
    if (isConnected) void refresh();
  }, [isConnected, refresh]);

  return (
    <div className="ap-card rounded-xl p-4">
      {/* header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#A78BFA]" />
          <span className="text-sm font-semibold text-white/80">Wallets</span>
          <span className="rounded border border-[#836EF9]/30 bg-[#836EF9]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#A78BFA]">
            Monad Testnet
          </span>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={spinning}
          className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition hover:text-white/70 disabled:opacity-50"
          title="Refresh balances"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* wallet rows */}
      <div className="space-y-1.5">
        {ACCOUNTS.map((acc) => {
          const isMe = address?.toLowerCase() === acc.address.toLowerCase();
          const isBuyer = acc.role === "buyer";
          const bal = balances[acc.address] ?? "…";

          return (
            <div
              key={acc.address}
              className="flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors"
              style={{
                borderColor: isMe ? `${acc.color}50` : "rgba(255,255,255,0.06)",
                background: isMe ? `${acc.color}0A` : "rgba(255,255,255,0.02)",
              }}
            >
              {/* role badge */}
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: `${acc.color}22`, color: acc.color }}
              >
                {acc.label}
              </span>

              {/* address */}
              <a
                href={`${MONADSCAN}${acc.address}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[11px] text-white/45 transition hover:text-white/70"
                title={acc.address}
              >
                {short(acc.address)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>

              {/* spacer */}
              <div className="flex-1" />

              {/* balance */}
              <span
                className="shrink-0 font-mono text-sm font-semibold tabular-nums"
                style={{ color: acc.color }}
              >
                {bal}
                <span className="ml-1 text-[10px] font-normal text-white/30">MON</span>
              </span>

              {/* status */}
              {isBuyer &&
                (isConnected && isMe ? (
                  <span className="shrink-0 flex items-center gap-1 rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 text-[10px] text-[#34D399]">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </span>
                ) : !isConnected ? (
                  <Button
                    size="sm"
                    onClick={() => void nx.connect()}
                    className="h-6 shrink-0 px-2.5 text-[10px] bg-[#836EF9] hover:bg-[#957FFB] shadow-sm shadow-[#836EF9]/25"
                  >
                    Connect
                  </Button>
                ) : (
                  <span className="shrink-0 text-[10px] text-white/30">switch acct</span>
                ))}
            </div>
          );
        })}
      </div>

      {/* wrong network warning */}
      {nx.isConnected && nx.wrongNetwork && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
            <AlertTriangle className="h-3.5 w-3.5" /> Switch to Monad Testnet
          </span>
          <Button
            size="sm"
            onClick={() => void nx.switchToMonad()}
            className="h-6 px-2.5 text-[10px] bg-[#836EF9] hover:bg-[#957FFB]"
          >
            Switch
          </Button>
        </div>
      )}
    </div>
  );
}
