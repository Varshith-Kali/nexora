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
import { Loader2, PlayCircle, ShieldAlert, Coins, Sparkles } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

/**
 * The explicit action surface. Exactly one primary action per stage; every
 * blockchain transaction is confirmed before it is submitted, and the
 * confirmation states that this is a REAL Monad Testnet transaction.
 */
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
      <div className="ap-label">Actions — nothing runs automatically</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">

        {/* stage gates in order */}
        {!nx.scenario && (
          <Hint>Load one of the two demo scenarios above to begin.</Hint>
        )}

        {nx.scenario && nx.stage === "ready" && (
          <>
            {nx.isConnected && !nx.wrongNetwork ? (
              <PrimaryButton
                onClick={() => void nx.createAndFundJob()}
                loading={busy("create")}
                label="1 · Create &amp; fund job"
                sub="Wallet confirmation → openJob() locks the escrow"
              />
            ) : (
              <Hint>
                {nx.wrongNetwork
                  ? "Switch your wallet to Monad Testnet to continue."
                  : "Connect your wallet (buyer) to continue."}
              </Hint>
            )}
          </>
        )}

        {nx.canSubmit && (
          <PrimaryButton
            onClick={() => void nx.submitWork()}
            loading={busy("submit")}
            label="2 · Submit work"
            sub="Seller agent commits the output hash on-chain"
          />
        )}

        {nx.canVerify && (
          <PrimaryButton
            onClick={() => void nx.runVerification()}
            loading={busy("verify")}
            label="3 · Verify with Gemini"
            sub="Off-chain AI evaluation — no MON spent"
            icon={<Sparkles className="h-4 w-4" />}
          />
        )}

        {nx.stage === "verified" && decision === "MANUAL_REVIEW" && (
          <Hint>
            Policy decision: MANUAL_REVIEW — no automatic settlement. Funds stay
            in escrow. Re-run verification if the provider was unavailable.
          </Hint>
        )}

        {awaitingSettle && (
          <PrimaryButton
            onClick={() => setConfirmSettle(decision === "RELEASE" ? "RELEASE" : "REFUND")}
            label={decision === "RELEASE" ? "4 · Release escrow to seller" : "4 · Refund escrow to buyer"}
            sub="Real Monad Testnet transaction — confirmation required"
            tone={decision === "RELEASE" ? "green" : "red"}
            icon={decision === "RELEASE" ? <Coins className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          />
        )}

        {nx.stage === "settled" && (
          <Hint>
            Job #{nx.jobId} is settled on-chain ({nx.job?.status}). Load another
            scenario to run the second demo path.
          </Hint>
        )}

        {/* verification unavailable — allow retry */}
        {nx.stage === "verified" && !nx.verification?.receipt && decision === "MANUAL_REVIEW" && (
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

      {/* settlement confirmation — the last human gate */}
      <Dialog open={confirmSettle !== null} onOpenChange={(o) => !o && setConfirmSettle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmSettle === "RELEASE" ? "Release escrow to the seller?" : "Refund escrow to the buyer?"}
            </DialogTitle>
            <DialogDescription>
              You&apos;re about to submit a real Monad Testnet transaction.
              {confirmSettle === "RELEASE"
                ? " The locked MON moves to the seller agent's wallet."
                : " The locked MON returns to your wallet."}{" "}
              This cannot be undone after it confirms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmSettle(null)}>
              Cancel
            </Button>
            <Button
              className={confirmSettle === "RELEASE" ? "bg-[#10B981] hover:bg-[#34D399]" : "bg-[#F43F5E] hover:bg-[#FB7185]"}
              disabled={!!nx.busy}
              onClick={() => {
                const action = confirmSettle;
                setConfirmSettle(null);
                if (action) void nx.settle(action);
              }}
            >
              {busy("settle") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
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
      <span className="flex items-center gap-2 text-sm font-medium">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (icon ?? <PlayCircle className="h-4 w-4" />)}
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </span>
      <span className="text-[11px] font-normal text-white/75">{sub}</span>
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-white/50">
      {children}
    </p>
  );
}
