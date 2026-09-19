/**
 * Nexora — fund-wallets.cjs
 *
 * Sends MON from Account 1 (buyer) to the deployer, verifier, and seller wallets.
 * 
 * This uses MetaMask's injected provider via a simple HTTP call to the RPC.
 * Since we're server-side, we need the buyer's private key to send directly.
 *
 * ALTERNATIVELY: just paste these 3 addresses in the Monad faucet:
 *   Deployer: 0x8fF967Ff8C95F95231090b031cA2D9bE724B1502
 *   Verifier: 0x44ba3bBc0e50FfB21B54AE5E0b2AB23DF999E81D  
 *   Seller:   0xa5f7BA32E06Eb9Cac082f90258099e3210f4e33B
 *
 * Usage: BUYER_PRIVATE_KEY=0x... node scripts/fund-wallets.cjs
 */

const path = require("path");
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const fs = require("fs");
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

const {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} = require(path.join(root, "node_modules/viem/_cjs/index.js"));
const {
  privateKeyToAccount,
} = require(path.join(root, "node_modules/viem/_cjs/accounts/index.js"));

const RPC = "https://testnet-rpc.monad.xyz";
const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForReceipt(publicClient, txHash) {
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    try {
      const r = await publicClient.getTransactionReceipt({ hash: txHash });
      if (r) return r;
    } catch {}
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${txHash}`);
}

async function main() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY?.trim();
  if (!buyerKey) {
    console.error("Usage: BUYER_PRIVATE_KEY=0x... node scripts/fund-wallets.cjs");
    console.error("\nAlternatively, fund these addresses manually from https://faucet.monad.xyz:");
    console.error("  Deployer: 0x8fF967Ff8C95F95231090b031cA2D9bE724B1502  (need 0.3 MON)");
    console.error("  Verifier: 0x44ba3bBc0e50FfB21B54AE5E0b2AB23DF999E81D  (need 1 MON)");
    console.error("  Seller:   0xa5f7BA32E06Eb9Cac082f90258099e3210f4e33B  (need 0.5 MON)");
    process.exit(1);
  }

  const buyerAccount = privateKeyToAccount(buyerKey.startsWith("0x") ? buyerKey : `0x${buyerKey}`);
  console.log(`Sender: ${buyerAccount.address}`);

  const publicClient = createPublicClient({ chain, transport: http(RPC, { timeout: 20_000 }) });
  const walletClient = createWalletClient({ account: buyerAccount, chain, transport: http(RPC, { timeout: 20_000 }) });

  const buyerBalance = await publicClient.getBalance({ address: buyerAccount.address });
  console.log(`Buyer balance: ${formatEther(buyerBalance)} MON\n`);

  const targets = [
    { label: "Deployer", address: "0x8fF967Ff8C95F95231090b031cA2D9bE724B1502", amount: "0.4" },
    { label: "Verifier", address: "0x44ba3bBc0e50FfB21B54AE5E0b2AB23DF999E81D", amount: "1.0" },
    { label: "Seller",   address: "0xa5f7BA32E06Eb9Cac082f90258099e3210f4e33B", amount: "0.5" },
  ];

  for (const target of targets) {
    console.log(`Sending ${target.amount} MON → ${target.label} (${target.address})...`);
    const txHash = await walletClient.sendTransaction({
      to: target.address,
      value: parseEther(target.amount),
      gas: 21_000n,
    });
    console.log(`  tx: ${txHash}`);
    const receipt = await waitForReceipt(publicClient, txHash);
    console.log(`  ✓ confirmed in block ${receipt.blockNumber}`);
    await sleep(500);
  }

  console.log("\n✓ All wallets funded. Now run: npm run deploy");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
