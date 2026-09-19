/**
 * Nexora — deploy.cjs
 * 
 * Compiles NexoraRegistry + NexoraEscrow with solc and deploys to Monad Testnet.
 * Also registers the seller agent and writes config/deployment.json + .env.local.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... VERIFIER_PRIVATE_KEY=0x... SELLER_AGENT_PRIVATE_KEY=0x... node scripts/deploy.cjs
 *
 * Or just set them in .env.local and they'll be read automatically.
 */

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

// Load .env.local manually
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
  encodeDeployData,
  encodeFunctionData,
  getAddress,
} = require(path.join(root, "node_modules/viem/_cjs/index.js"));
const {
  privateKeyToAccount,
} = require(path.join(root, "node_modules/viem/_cjs/accounts/index.js"));

const RPC = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;

// Read the Solidity source files
const registrySrc = fs.readFileSync(path.join(root, "contracts/NexoraRegistry.sol"), "utf8");
const escrowSrc = fs.readFileSync(path.join(root, "contracts/NexoraEscrow.sol"), "utf8");

function getKey(name) {
  const k = process.env[name]?.trim();
  if (!k) throw new Error(`${name} is not set. Add it to .env.local or export it.`);
  return k.startsWith("0x") ? k : `0x${k}`;
}

function makeTransport() {
  return http(RPC, { timeout: 30_000 });
}

function makeChain() {
  return {
    id: CHAIN_ID,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getReceipt(txHash, maxWaitMs = 90_000) {
  const publicClient = createPublicClient({ chain: makeChain(), transport: makeTransport() });
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      if (receipt) return receipt;
    } catch {}
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for tx ${txHash}`);
}

async function deploy() {
  console.log("\n=== Nexora → Monad Testnet Deployment ===\n");

  // Load keys
  const deployerKey = getKey("DEPLOYER_PRIVATE_KEY");
  const verifierKey = getKey("VERIFIER_PRIVATE_KEY");
  const sellerKey = getKey("SELLER_AGENT_PRIVATE_KEY");

  const deployerAccount = privateKeyToAccount(deployerKey);
  const verifierAccount = privateKeyToAccount(verifierKey);
  const sellerAccount = privateKeyToAccount(sellerKey);

  console.log(`Deployer:  ${deployerAccount.address}`);
  console.log(`Verifier:  ${verifierAccount.address}`);
  console.log(`Seller:    ${sellerAccount.address}`);
  console.log(`RPC:       ${RPC}`);
  console.log();

  // Compile contracts
  console.log("Compiling contracts with solc...");
  const input = {
    language: "Solidity",
    sources: {
      "NexoraRegistry.sol": { content: registrySrc },
      "NexoraEscrow.sol": { content: escrowSrc },
    },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  const outputRaw = solc.compile(JSON.stringify(input));
  const output = JSON.parse(outputRaw);

  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    if (errs.length > 0) {
      console.error("Compilation errors:");
      errs.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
    const warns = output.errors.filter(e => e.severity === "warning");
    if (warns.length > 0) {
      console.warn(`${warns.length} warning(s) — continuing.`);
    }
  }

  const registryArtifact = output.contracts["NexoraRegistry.sol"]["NexoraRegistry"];
  const escrowArtifact = output.contracts["NexoraEscrow.sol"]["NexoraEscrow"];

  if (!registryArtifact || !escrowArtifact) {
    console.error("Compilation output missing contracts. Check solc output.");
    process.exit(1);
  }

  const registryBytecode = "0x" + registryArtifact.evm.bytecode.object;
  const escrowBytecode = "0x" + escrowArtifact.evm.bytecode.object;

  console.log("✓ Compiled NexoraRegistry and NexoraEscrow\n");

  // Create wallet client for deployer
  const chain = makeChain();
  const deployerWallet = createWalletClient({
    account: deployerAccount,
    chain,
    transport: makeTransport(),
  });
  const publicClient = createPublicClient({ chain, transport: makeTransport() });

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  const balMON = Number(balance) / 1e18;
  console.log(`Deployer balance: ${balMON.toFixed(6)} MON`);
  if (balMON < 0.01) {
    console.error(`\n✗ Deployer needs MON to deploy. Current balance: ${balMON} MON`);
    console.error(`  Fund this address at https://faucet.monad.xyz:`);
    console.error(`  ${deployerAccount.address}`);
    process.exit(1);
  }

  // Deploy NexoraRegistry
  console.log("\nDeploying NexoraRegistry...");
  const registryDeployData = encodeDeployData({
    abi: registryArtifact.abi,
    bytecode: registryBytecode,
    args: [],
  });

  const registryTxHash = await deployerWallet.sendTransaction({
    data: registryDeployData,
    gas: 800_000n,
  });
  console.log(`  tx: ${registryTxHash}`);
  const registryReceipt = await getReceipt(registryTxHash);
  if (registryReceipt.status !== "success") throw new Error("Registry deploy reverted");
  const registryAddress = registryReceipt.contractAddress;
  console.log(`  ✓ NexoraRegistry: ${registryAddress}`);

  // Deploy NexoraEscrow
  console.log("\nDeploying NexoraEscrow...");
  const escrowDeployData = encodeDeployData({
    abi: escrowArtifact.abi,
    bytecode: escrowBytecode,
    args: [registryAddress, verifierAccount.address],
  });

  const escrowTxHash = await deployerWallet.sendTransaction({
    data: escrowDeployData,
    gas: 1_200_000n,
  });
  console.log(`  tx: ${escrowTxHash}`);
  const escrowReceipt = await getReceipt(escrowTxHash);
  if (escrowReceipt.status !== "success") throw new Error("Escrow deploy reverted");
  const escrowAddress = escrowReceipt.contractAddress;
  console.log(`  ✓ NexoraEscrow: ${escrowAddress}`);

  // Register seller agent in NexoraRegistry
  console.log("\nRegistering seller agent in NexoraRegistry...");
  const sellerWallet = createWalletClient({
    account: sellerAccount,
    chain,
    transport: makeTransport(),
  });

  // Check seller balance
  const sellerBalance = await publicClient.getBalance({ address: sellerAccount.address });
  const sellerBalMON = Number(sellerBalance) / 1e18;
  console.log(`  Seller balance: ${sellerBalMON.toFixed(6)} MON`);
  if (sellerBalMON < 0.001) {
    console.warn(`  ⚠ Seller wallet needs MON for registration tx.`);
    console.warn(`    Fund: ${sellerAccount.address}`);
  }

  const registerData = encodeFunctionData({
    abi: registryArtifact.abi,
    functionName: "registerAgent",
    args: ["Nexora-Tracking-Agent", "package-tracking", 0n],
  });

  const regTxHash = await sellerWallet.sendTransaction({
    to: registryAddress,
    data: registerData,
    gas: 200_000n,
  });
  console.log(`  tx: ${regTxHash}`);
  const regReceipt = await getReceipt(regTxHash);
  if (regReceipt.status !== "success") throw new Error("Agent registration reverted");
  console.log(`  ✓ Seller agent registered: ${sellerAccount.address}`);

  // Write deployment.json
  const deploymentRecord = {
    chainId: CHAIN_ID,
    registry: registryAddress,
    escrow: escrowAddress,
    verifier: verifierAccount.address,
    deployer: deployerAccount.address,
    deployedAt: Math.floor(Date.now() / 1000),
    blockNumber: Number(escrowReceipt.blockNumber),
  };

  const deploymentPath = path.join(root, "config/deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentRecord, null, 2));
  console.log(`\n✓ Written config/deployment.json`);

  // Update .env.local with new addresses (add them if missing)
  const envPath = path.join(root, ".env.local");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const updates = {
    MONAD_ESCROW_ADDRESS: escrowAddress,
    MONAD_REGISTRY_ADDRESS: registryAddress,
    MONAD_VERIFIER_ADDRESS: verifierAccount.address,
    SELLER_AGENT_PRIVATE_KEY: sellerKey,
    VERIFIER_PRIVATE_KEY: verifierKey,
  };

  for (const [key, val] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${val}`);
    } else {
      envContent += `\n${key}=${val}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
  console.log("✓ Updated .env.local\n");

  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log(`  NexoraRegistry : ${registryAddress}`);
  console.log(`  NexoraEscrow   : ${escrowAddress}`);
  console.log(`  Verifier       : ${verifierAccount.address}`);
  console.log(`  Seller Agent   : ${sellerAccount.address}`);
  console.log(`\nMonadscan:`);
  console.log(`  https://testnet.monadscan.com/address/${escrowAddress}`);
  console.log(`  https://testnet.monadscan.com/address/${registryAddress}`);
  console.log(`\nNext: npm run dev`);
}

deploy().catch(err => {
  console.error("\n✗ Deployment failed:", err.message || err);
  process.exit(1);
});
