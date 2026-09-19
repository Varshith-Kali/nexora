/**
 * Nexora — setup-and-deploy.cjs
 *
 * ONE COMMAND to fund operator wallets from Account 1 (buyer) and deploy contracts.
 * 
 * Usage:
 *   BUYER_PRIVATE_KEY=0x... node scripts/setup-and-deploy.cjs
 *
 * This will:
 *   1. Read DEPLOYER/VERIFIER/SELLER keys from .env.local
 *   2. Send MON from your buyer wallet (Account 1) to fund those operator wallets
 *   3. Compile and deploy NexoraRegistry + NexoraEscrow
 *   4. Register the seller agent
 *   5. Update .env.local with contract addresses
 */

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const solc = require("solc");
const {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  encodeDeployData,
  encodeFunctionData,
} = require(path.join(root, "node_modules/viem/_cjs/index.js"));
const {
  privateKeyToAccount,
} = require(path.join(root, "node_modules/viem/_cjs/accounts/index.js"));

const RPC = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;
const chain = {
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

function makeTransport() { return http(RPC, { timeout: 30_000 }); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitReceipt(publicClient, txHash, label = "") {
  process.stdout.write(`  Waiting for ${label || txHash.slice(0, 12)}...`);
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    try {
      const r = await publicClient.getTransactionReceipt({ hash: txHash });
      if (r) {
        console.log(` ✓ block ${r.blockNumber}`);
        return r;
      }
    } catch {}
    await sleep(1500);
    process.stdout.write(".");
  }
  throw new Error(`Timed out for ${txHash}`);
}

function getKey(name, fallback) {
  const k = (process.env[name] || fallback || "").trim();
  if (!k) throw new Error(`${name} not set`);
  return k.startsWith("0x") ? k : `0x${k}`;
}

function patchEnvLocal(updates) {
  const envPath = path.join(root, ".env.local");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [key, val] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }
  fs.writeFileSync(envPath, content);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Nexora → Monad Testnet Setup & Deploy  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── Keys ────────────────────────────────────────────────────────────────
  const buyerKey = getKey("BUYER_PRIVATE_KEY");
  const deployerKey = getKey("DEPLOYER_PRIVATE_KEY");
  const verifierKey = getKey("VERIFIER_PRIVATE_KEY");
  const sellerKey = getKey("SELLER_AGENT_PRIVATE_KEY");

  const buyerAccount    = privateKeyToAccount(buyerKey);
  const deployerAccount = privateKeyToAccount(deployerKey);
  const verifierAccount = privateKeyToAccount(verifierKey);
  const sellerAccount   = privateKeyToAccount(sellerKey);

  console.log("Accounts:");
  console.log(`  Buyer (Account 1):  ${buyerAccount.address}  [your MetaMask, has MON]`);
  console.log(`  Deployer:           ${deployerAccount.address}  [operator]`);
  console.log(`  Verifier:           ${verifierAccount.address}  [operator]`);
  console.log(`  Seller Agent:       ${sellerAccount.address}  [operator]`);
  console.log();

  const publicClient = createPublicClient({ chain, transport: makeTransport() });
  const buyerWallet  = createWalletClient({ account: buyerAccount,    chain, transport: makeTransport() });

  // ── Buyer balance ────────────────────────────────────────────────────────
  const buyerBal = await publicClient.getBalance({ address: buyerAccount.address });
  console.log(`Buyer balance: ${formatEther(buyerBal)} MON`);
  if (buyerBal < parseEther("2")) {
    console.error("✗ Buyer needs at least 2 MON to fund wallets + escrow tests.");
    process.exit(1);
  }

  // ── Fund operator wallets ────────────────────────────────────────────────
  const fundTargets = [
    { label: "Deployer", address: deployerAccount.address, amount: "0.4" },
    { label: "Verifier", address: verifierAccount.address, amount: "1.0" },
    { label: "Seller",   address: sellerAccount.address,   amount: "0.5" },
  ];

  console.log("\n[1/3] Funding operator wallets...");
  for (const t of fundTargets) {
    const bal = await publicClient.getBalance({ address: t.address });
    if (bal >= parseEther(t.amount)) {
      console.log(`  ${t.label}: already funded (${formatEther(bal)} MON) — skipping`);
      continue;
    }
    const needed = parseEther(t.amount) - bal;
    const txHash = await buyerWallet.sendTransaction({
      to: t.address,
      value: needed,
      gas: 21_000n,
    });
    console.log(`  ${t.label}: sent ${formatEther(needed)} MON  tx: ${txHash}`);
    await waitReceipt(publicClient, txHash, t.label);
  }

  // ── Compile contracts ────────────────────────────────────────────────────
  console.log("\n[2/3] Compiling contracts with solc...");
  const registrySrc = fs.readFileSync(path.join(root, "contracts/NexoraRegistry.sol"), "utf8");
  const escrowSrc   = fs.readFileSync(path.join(root, "contracts/NexoraEscrow.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "NexoraRegistry.sol": { content: registrySrc },
      "NexoraEscrow.sol":   { content: escrowSrc },
    },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (output.errors || []).filter(e => e.severity === "error");
  if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); process.exit(1); }

  const regArtifact = output.contracts["NexoraRegistry.sol"]["NexoraRegistry"];
  const escArtifact = output.contracts["NexoraEscrow.sol"]["NexoraEscrow"];
  console.log("  ✓ Compiled NexoraRegistry + NexoraEscrow");

  // ── Deploy ───────────────────────────────────────────────────────────────
  console.log("\n[3/3] Deploying to Monad Testnet...");
  const deployerWallet = createWalletClient({ account: deployerAccount, chain, transport: makeTransport() });
  const sellerWallet   = createWalletClient({ account: sellerAccount,   chain, transport: makeTransport() });

  // Deploy Registry
  process.stdout.write("  Deploying NexoraRegistry...");
  const regHash = await deployerWallet.sendTransaction({
    data: encodeDeployData({ abi: regArtifact.abi, bytecode: "0x" + regArtifact.evm.bytecode.object, args: [] }),
    gas: 900_000n,
  });
  const regReceipt = await waitReceipt(publicClient, regHash, "Registry");
  if (regReceipt.status !== "success") throw new Error("Registry deploy reverted");
  const registryAddress = regReceipt.contractAddress;
  console.log(`  NexoraRegistry: ${registryAddress}`);

  // Deploy Escrow
  process.stdout.write("  Deploying NexoraEscrow...");
  const escHash = await deployerWallet.sendTransaction({
    data: encodeDeployData({
      abi: escArtifact.abi,
      bytecode: "0x" + escArtifact.evm.bytecode.object,
      args: [registryAddress, verifierAccount.address],
    }),
    gas: 1_500_000n,
  });
  const escReceipt = await waitReceipt(publicClient, escHash, "Escrow");
  if (escReceipt.status !== "success") throw new Error("Escrow deploy reverted");
  const escrowAddress = escReceipt.contractAddress;
  console.log(`  NexoraEscrow:   ${escrowAddress}`);

  // Register seller agent
  process.stdout.write("  Registering seller agent in Registry...");
  const regAgentHash = await sellerWallet.sendTransaction({
    to: registryAddress,
    data: encodeFunctionData({
      abi: regArtifact.abi,
      functionName: "registerAgent",
      args: ["Nexora-Tracking-Agent", "package-tracking", 0n],
    }),
    gas: 200_000n,
  });
  const regAgentReceipt = await waitReceipt(publicClient, regAgentHash, "RegisterAgent");
  if (regAgentReceipt.status !== "success") throw new Error("Agent registration reverted");
  console.log(`  Seller agent registered: ${sellerAccount.address}`);

  // ── Write deployment record ──────────────────────────────────────────────
  const record = {
    chainId: CHAIN_ID,
    registry: registryAddress,
    escrow: escrowAddress,
    verifier: verifierAccount.address,
    deployer: deployerAccount.address,
    deployedAt: Math.floor(Date.now() / 1000),
    blockNumber: Number(escReceipt.blockNumber),
  };
  fs.writeFileSync(path.join(root, "config/deployment.json"), JSON.stringify(record, null, 2));

  patchEnvLocal({
    MONAD_ESCROW_ADDRESS: escrowAddress,
    MONAD_REGISTRY_ADDRESS: registryAddress,
    MONAD_VERIFIER_ADDRESS: verifierAccount.address,
  });

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║         DEPLOYMENT COMPLETE ✓            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n  NexoraRegistry : ${registryAddress}`);
  console.log(`  NexoraEscrow   : ${escrowAddress}`);
  console.log(`  Verifier       : ${verifierAccount.address}`);
  console.log(`  Seller Agent   : ${sellerAccount.address}`);
  console.log(`\nMonadscan:`);
  console.log(`  https://testnet.monadscan.com/address/${escrowAddress}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Restart dev server: npm run dev`);
  console.log(`  2. Open http://localhost:3000`);
  console.log(`  3. Connect MetaMask (Account 1 - buyer)`);
  console.log(`  4. Load '📦 Live Tracking' scenario`);
  console.log(`  5. Set escrow = 0.004 MON → Create Job → Submit Work → Gemini verifies → Settle`);
}

main().catch(err => {
  console.error("\n✗ Setup failed:", err.message || err);
  process.exit(1);
});
