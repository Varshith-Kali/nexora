"use client";

/**
 * Nexora — demo orchestration hook.
 *
 * The single state machine behind the dashboard. Every state transition is
 * EXPLICIT (triggered by a button). Nothing runs in the background:
 *   - no loops, no scheduled transactions
 *   - no polling except viem's waitForTransactionReceipt (starts on a
 *     submitted tx, stops when the receipt lands)
 *   - page load performs health + one read-only job lookup, never a tx
 *
 * Transaction budget per demo path (all user-confirmed):
 *   openJob (buyer wallet) → submitWork (seller agent) → settle (verifier)
 */
import { useCallback, useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";
import {
  ESCROW_ADDRESS,
  JOB_STATUSES,
  escrowAbi,
  explorerTx,
  isDeployed,
} from "@/config/contracts";
import {
  DEMO_SCENARIOS,
  DEFAULT_ESCROW_MON,
  type DemoScenario,
} from "@/lib/nexora/demoData";
import type { JobStatusName } from "@/config/contracts";
import type { SettlementResult, VerificationResult } from "@/lib/nexora/types";
import { monadTestnet } from "@/lib/wallet";

export interface HealthInfo {
  network: {
    chainId: number;
    expectedChainId: number;
    testnetOnly: boolean;
    rpcReachable: boolean;
    blockNumber: number | null;
    explorer: string;
    faucet: string;
  };
  contracts: {
    configured: boolean;
    escrow: string;
    registry: string;
    onChainVerifier: string;
    escrowBalanceMon: string | null;
  };
  agents: {
    sellerAgentConfigured: boolean;
    sellerAgent: string;
    verifierSignerConfigured: boolean;
    verifierSigner: string;
    verifierSignerMatchesOnChain: boolean | null;
  };
  ai: { provider: "gemini" | "mock"; model: string; mockMode: boolean };
}

export interface TxRecord {
  label: string;
  txHash: string;
  explorerUrl: string;
}

interface OnChainJobLite {
  buyer: string;
  seller: string;
  amount: string; // formatted MON
  amountRaw: bigint;
  outputHash: string;
  status: JobStatusName;
  createdAt: number;
}

export type DemoStage =
  | "idle" // nothing loaded
  | "ready" // scenario loaded, waiting for job creation
  | "funded" // job open on-chain (Open)
  | "submitted" // work submitted (Submitted)
  | "verified" // AI verification complete
  | "settled"; // Released / Refunded

const STORAGE_KEY = "nexora-demo-v1";

interface PersistedState {
  jobId: number | null;
  scenarioId: "green" | "injection" | null;
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") return { jobId: null, scenarioId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { jobId: null, scenarioId: null };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      jobId: typeof parsed.jobId === "number" ? parsed.jobId : null,
      scenarioId: parsed.scenarioId === "green" || parsed.scenarioId === "injection" ? parsed.scenarioId : null,
    };
  } catch {
    return { jobId: null, scenarioId: null };
  }
}

export function useNexora() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useBalance({ address });

  const [health, setHealth] = useState<HealthInfo | null>(null);
  // localStorage hydration happens ONCE via lazy initializers (no setState in
  // effects — see React's "you might not need an effect" guidance).
  const [initial] = useState(loadPersisted);
  const [scenario, setScenario] = useState<DemoScenario | null>(() =>
    initial.scenarioId ? DEMO_SCENARIOS[initial.scenarioId] : null,
  );
  const [jobSpec, setJobSpec] = useState(
    () => (initial.scenarioId ? DEMO_SCENARIOS[initial.scenarioId].jobSpec : ""),
  );
  const [criteria, setCriteria] = useState<string[]>(
    () => (initial.scenarioId ? DEMO_SCENARIOS[initial.scenarioId].acceptanceCriteria : []),
  );
  const [submission, setSubmission] = useState(
    () => (initial.scenarioId ? DEMO_SCENARIOS[initial.scenarioId].submission : ""),
  );
  const [escrowAmount, setEscrowAmount] = useState(DEFAULT_ESCROW_MON);

  const [jobId, setJobId] = useState<number | null>(initial.jobId);
  const [job, setJob] = useState<OnChainJobLite | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [txs, setTxs] = useState<{ open?: TxRecord; submit?: TxRecord; settle?: TxRecord }>({});
  const [busy, setBusy] = useState<string | null>(null);

  // ── health (read-only, once per mount + on demand) ─────────────────────
  // setState lives inside a promise callback, never in the effect body.
  const refreshHealth = useCallback(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HealthInfo | null) => {
        if (d) setHealth(d);
      })
      .catch(() => {
        /* status chips simply stay in their last known state */
      });
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // ── restore a persisted demo job (read-only lookup — never a tx) ───────
  const readJob = useCallback(async (id: number): Promise<OnChainJobLite | null> => {
    try {
      const r = await fetch(`/api/job-state?jobId=${id}`);
      if (!r.ok) return null;
      const data = (await r.json()) as { job: OnChainJobLite | null };
      return data.job;
    } catch {
      return null;
    }
  }, []);

  // if a jobId was persisted, pull its current on-chain state once
  useEffect(() => {
    if (initial.jobId === null) return;
    const id = initial.jobId;
    readJob(id).then((j) => {
      if (j) setJob(j);
    });
  }, [initial, readJob]);

  useEffect(() => {
    if (jobId !== null || scenario) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ jobId, scenarioId: scenario?.id ?? null }),
      );
    }
  }, [jobId, scenario]);

  // ── derived ────────────────────────────────────────────────────────────
  const stage: DemoStage = (() => {
    if (settlement || job?.status === "Released" || job?.status === "Refunded") return "settled";
    if (verification) return "verified";
    if (job?.status === "Submitted") return "submitted";
    if (job?.status === "Open" || jobId !== null) return "funded";
    if (scenario) return "ready";
    return "idle";
  })();

  const wrongNetwork = isConnected && chainId !== monadTestnet.id;
  const canCreate = isConnected && !wrongNetwork && isDeployed && !!scenario && stage === "ready";
  const canSubmit = stage === "funded" && job?.status === "Open";
  const canVerify = stage === "submitted" && job?.status === "Submitted";
  const canSettle =
    stage === "verified" &&
    (verification?.policy.decision === "RELEASE" || verification?.policy.decision === "REFUND") &&
    !!verification?.receipt;

  // ── actions ────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const injected = connectors.find((c) => c.id === "injected" || c.type === "injected");
    if (!injected) {
      toast.error("No injected wallet found. Install MetaMask or use a browser wallet.");
      return;
    }
    try {
      await connectAsync({ connector: injected });
      toast.success("Wallet connected.");
    } catch {
      toast.error("Wallet connection was declined.");
    }
  }, [connectAsync, connectors]);

  const switchToMonad = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: monadTestnet.id });
      toast.success("Switched to Monad Testnet.");
    } catch {
      toast.error("Could not switch the wallet to Monad Testnet.");
    }
  }, [switchChainAsync]);

  const loadScenario = useCallback((id: "green" | "injection") => {
    const s = DEMO_SCENARIOS[id];
    setScenario(s);
    setJobSpec(s.jobSpec);
    setCriteria(s.acceptanceCriteria);
    setSubmission(s.submission);
    setVerification(null);
    setSettlement(null);
    setJobId(null);
    setJob(null);
    setTxs({});
    toast.info(`Loaded: ${s.title}`, { description: "Review the job, then trigger each step explicitly." });
  }, []);

  const reset = useCallback(() => {
    setScenario(null);
    setJobSpec("");
    setCriteria([]);
    setSubmission("");
    setJobId(null);
    setJob(null);
    setVerification(null);
    setSettlement(null);
    setTxs({});
    window.localStorage.removeItem(STORAGE_KEY);
    toast.info("Demo console reset. On-chain history is immutable — cleared only here.");
  }, []);

  // ── 1. create + fund the job (BUYER wallet signs — user confirms) ──────
  const createAndFundJob = useCallback(async () => {
    if (!scenario || !ESCROW_ADDRESS) return;
    setBusy("create");
    try {
      // server-side prep: ensure the demo seller agent is registered
      let seller: string | null = null;
      const prepRes = await fetch("/api/jobs", { method: "POST" });
      const prep = await prepRes.json().catch(() => null);
      if (!prepRes.ok || !prep?.ready) {
        toast.error(prep?.message ?? "Seller agent preparation failed.");
        return;
      }
      seller = prep.seller as string;

      toast.info("Confirm the transaction in your wallet…", {
        description: "This locks the escrow amount on Monad Testnet.",
      });

      // buyer's wallet signs openJob(seller, {value})
      const amountWei = BigInt(Math.floor(Number(escrowAmount || "0") * 1e18));
      if (amountWei <= 0n) {
        toast.error("Enter a valid escrow amount in MON.");
        return;
      }
      const hash = (await writeContractAsync({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: escrowAbi,
        functionName: "openJob",
        args: [seller as `0x${string}`],
        value: amountWei,
        chainId: monadTestnet.id,
      })) as `0x${string}`;

      // poll the receipt (starts and stops — no continuous loop)
      const { waitForTransactionReceipt } = await import("viem/actions");
      const { createPublicClient, http } = await import("viem");
      const client = createPublicClient({
        chain: monadTestnet,
        transport: http(),
      });
      const receipt = await waitForTransactionReceipt(client, { hash, timeout: 90_000 });
      if (receipt.status !== "success") {
        toast.error("Transaction failed. Escrow state was not changed.");
        return;
      }

      // parse JobOpened(jobId) from logs
      const { decodeEventLog } = await import("viem");
      let openedJobId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: escrowAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "JobOpened") {
            openedJobId = Number(
              (decoded.args as unknown as { jobId: bigint }).jobId,
            );
          }
        } catch {
          /* not a JobOpened log */
        }
      }
      if (openedJobId === null) {
        toast.error("Job opened but the jobId could not be read from the receipt.");
        return;
      }

      setJobId(openedJobId);
      setTxs((t) => ({ ...t, open: { label: "openJob — escrow locked", txHash: hash, explorerUrl: explorerTx(hash) } }));
      toast.success(`Job #${openedJobId} funded. Escrow locked on Monad Testnet.`, {
        description: `${escrowAmount} MON is now held by the escrow contract.`,
      });

      const j = await readJob(openedJobId);
      if (j) setJob(j);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job creation failed";
      toast.error(message.includes("user rejected")
        ? "Transaction rejected in wallet — nothing was spent."
        : `Job creation failed: ${message}`);
    } finally {
      setBusy(null);
    }
  }, [scenario, escrowAmount, writeContractAsync, readJob]);

  // ── 2. submit work (SELLER agent key — server-side, explicit trigger) ──
  const submitWork = useCallback(async () => {
    if (jobId === null || !submission) return;
    setBusy("submit");
    try {
      const res = await fetch("/api/submit-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, submission }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        toast.error(data?.message ?? "Work submission failed.");
        return;
      }
      setTxs((t) => ({
        ...t,
        submit: { label: "submitWork — output hash committed", txHash: data.txHash, explorerUrl: data.explorerUrl },
      }));
      toast.success(`Work submitted for job #${jobId}.`, {
        description: "The keccak256 hash of the submission is now on-chain.",
      });
      const j = await readJob(jobId);
      if (j) setJob(j);
    } catch {
      toast.error("Work submission failed. Escrow state was not changed.");
    } finally {
      setBusy(null);
    }
  }, [jobId, submission, readJob]);

  // ── 3. AI verification (OFF-CHAIN — no MON spent) ──────────────────────
  const runVerification = useCallback(async () => {
    if (jobId === null || !jobSpec || criteria.length === 0) return;
    setBusy("verify");
    try {
      toast.info("Gemini is verifying the work…", {
        description: health?.ai.mockMode ? "DEMO MOCK MODE — GEMINI_API_KEY is not configured." : "Evaluating against the job specification.",
      });
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          jobSpec,
          acceptanceCriteria: criteria,
          submission,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        toast.error(data?.message ?? "Verification failed.");
        return;
      }
      setVerification(data as VerificationResult);
      const v = data as VerificationResult;
      toast[v.policy.decision === "RELEASE" ? "success" : v.policy.decision === "REFUND" ? "error" : "warning"](
        `Verdict: ${v.verdict} · Policy: ${v.policy.decision}`,
        { description: v.policy.reason },
      );
    } catch {
      toast.error("AI verification is temporarily unavailable. No funds were released.");
    } finally {
      setBusy(null);
    }
  }, [jobId, jobSpec, criteria, submission, health]);

  // ── 4. settlement (VERIFIER key — policy-gated, user-confirmed) ────────
  const settle = useCallback(async (action: "RELEASE" | "REFUND") => {
    if (jobId === null || !verification?.receipt) return;
    setBusy("settle");
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action, receipt: verification.receipt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        toast.error(data?.message ?? "Settlement failed. Escrow state was not changed.");
        return;
      }
      if (data.alreadySettled) {
        toast.info(data.message ?? "Job already settled — no new transaction.");
        const j = await readJob(jobId);
        if (j) setJob(j);
        return;
      }
      const s = data as SettlementResult;
      setSettlement(s);
      setTxs((t) => ({
        ...t,
        settle: {
          label: s.action === "RELEASE" ? "settle(true) — escrow released" : "settle(false) — buyer refunded",
          txHash: s.txHash,
          explorerUrl: s.explorerUrl,
        },
      }));
      toast[action === "RELEASE" ? "success" : "info"](
        `${s.amountMon} MON ${action === "RELEASE" ? "released to the seller" : "refunded to the buyer"}.`,
        { description: `Settled in block ${s.blockNumber ?? "?"} — view it on Monadscan.` },
      );
      const j = await readJob(jobId);
      if (j) setJob(j);
    } catch {
      toast.error("Settlement failed. Escrow state was not changed.");
    } finally {
      setBusy(null);
    }
  }, [jobId, verification, readJob]);

  return {
    // health & wallet
    health,
    refreshHealth,
    address,
    isConnected,
    chainId,
    wrongNetwork,
    walletBalanceMon: balance
      ? (Number(balance.value) / 10 ** balance.decimals).toFixed(4)
      : null,
    connect,
    switchToMonad,
    // demo state
    scenario,
    jobSpec,
    setJobSpec,
    criteria,
    setCriteria,
    submission,
    setSubmission,
    escrowAmount,
    setEscrowAmount,
    jobId,
    job,
    stage,
    verification,
    settlement,
    txs,
    busy,
    // gates
    canCreate,
    canSubmit,
    canVerify,
    canSettle,
    // actions
    loadScenario,
    reset,
    createAndFundJob,
    submitWork,
    runVerification,
    settle,
  };
}
