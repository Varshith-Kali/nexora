"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, PlayCircle, ShieldAlert, Coins, Sparkles, Zap } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

export function ActionPanel({ nx }: { nx: Nx }) {
  const [confirmSettle, setConfirmSettle] = useState<null | "RELEASE" | "REFUND">(null);

  const decision = nx.verification?.policy.decision;
  const awaitingSettle =
    nx.stage === "verified" &&
    (decision === "RELEASE" || decision === "REFUND") &&
    !!nx.verification?.receipt;

  const busy = (label: string) => nx.busy === label;

  return (
    <div className="ap-card rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-[#A78BFA]" />
        <span className="ap-label">Actions</span>
        <span className="ml-auto text-[11px] text-white/30">nothing runs automatically</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!nx.scenario && (
          <p className="text-[12px] text-white/40">← Load a scenario first</p>
        )}

        {nx.scenario && nx.stage === "ready" && (
          <>
            {nx.isConnected && !nx.wrongNetwork ? (
              <PrimaryButton
                onClick={() => void nx.createAndFundJob()}
                loading={busy("create")}
                label="1 · Create &amp; Fund Job"
                sub={`openJob() locks ${nx.escrowAmount} MON on-chain`}
              />
            ) : (
              <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] text-white/50">
                {nx.wrongNetwork
                  ? "⚠ Switch to Monad Testnet"
                  : "Connect your wallet (Account 1) to start"}
              </p>
            )}
          </>
        )}

        {nx.canSubmit && (
          <PrimaryButton
            onClick={() => void nx.submitWork()}
            loading={busy("submit")}
            label="2 · Submit Work"
            sub="Seller agent commits keccak256 hash on-chain"
          />
        )}

        {nx.canVerify && (
          <PrimaryButton
            onClick={() => void nx.runVerification()}
            loading={busy("verify")}
            label="3 · Verify with Gemini"
            sub="AI evaluates report vs criteria — no gas"
            icon={<Sparkles className="h-4 w-4" />}
          />
        )}

        {nx.stage === "verified" && decision === "MANUAL_REVIEW" && (
          <p className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/5 px-4 py-3 text-[12px] text-[#FBBF24]">
            ⚠ MANUAL_REVIEW — funds held in escrow. Retry verification.
          </p>
        )}

        {awaitingSettle && (
          <PrimaryButton
            onClick={() => setConfirmSettle(decision === "RELEASE" ? "RELEASE" : "REFUND")}
            label={
              decision === "RELEASE"
                ? "4 · Release to Seller ✓"
                : "4 · Refund to Buyer ✗"
            }
            sub={
              decision === "RELEASE"
                ? "Gemini PASS → MON moves to seller wallet"
                : "Gemini FAIL → MON returns to buyer wallet"
            }
            tone={decision === "RELEASE" ? "green" : "red"}
            icon={
              decision === "RELEASE" ? (
                <Coins className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )
            }
          />
        )}

        {nx.stage === "settled" && (
          <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] text-white/50">
            ✓ Job #{nx.jobId} settled ({nx.job?.status}). Load the other scenario to test the opposite path.
          </p>
        )}

        {nx.stage === "verified" &&
          !nx.verification?.receipt &&
          decision === "MANUAL_REVIEW" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void nx.runVerification()}
              disabled={!!nx.busy}
            >
              Retry verification
            </Button>
          )}
      </div>

      {/* settlement confirm dialog */}
      <Dialog
        open={confirmSettle !== null}
        onOpenChange={(o) => !o && setConfirmSettle(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmSettle === "RELEASE"
                ? "Release escrow → Seller?"
                : "Refund escrow → Buyer?"}
            </DialogTitle>
            <DialogDescription>
              Real Monad Testnet transaction — cannot be undone.
              {confirmSettle === "RELEASE"
                ? " MON moves to the seller agent wallet."
                : " MON returns to your wallet."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmSettle(null)}>
              Cancel
            </Button>
            <Button
              className={
                confirmSettle === "RELEASE"
                  ? "bg-[#10B981] hover:bg-[#34D399]"
                  : "bg-[#F43F5E] hover:bg-[#FB7185]"
              }
              disabled={!!nx.busy}
              onClick={() => {
                const action = confirmSettle;
                setConfirmSettle(null);
                if (action) void nx.settle(action);
              }}
            >
              {busy("settle") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrimaryButton({
  onClick,
  loading,
  label,
  sub,
  icon,
  tone = "purple",
}: {
  onClick: () => void;
  loading?: boolean;
  label: string;
  sub: string;
  icon?: React.ReactNode;
  tone?: "purple" | "green" | "red";
}) {
  const cls =
    tone === "green"
      ? "bg-[#10B981] hover:bg-[#059669] shadow-lg shadow-[#10B981]/20"
      : tone === "red"
        ? "bg-[#F43F5E] hover:bg-[#E11D48] shadow-lg shadow-[#F43F5E]/20"
        : "bg-[#836EF9] hover:bg-[#957FFB] shadow-lg shadow-[#836EF9]/25";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group inline-flex flex-col items-start gap-0.5 rounded-xl px-5 py-3 text-left text-white transition disabled:opacity-60 ${cls}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (icon ?? <PlayCircle className="h-4 w-4" />)}
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </span>
      <span className="text-[11px] font-normal text-white/70">{sub}</span>
    </button>
  );
}
