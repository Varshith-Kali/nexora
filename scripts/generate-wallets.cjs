/**
 * Nexora — generate-wallets.cjs
 * Uses viem's _cjs bundle to generate 3 throwaway Monad Testnet wallets.
 * Run from project root: node scripts/generate-wallets.cjs
 */
const path = require("path");
const root = path.resolve(__dirname, "..");

const { generatePrivateKey, privateKeyToAddress } = require(path.join(root, "node_modules/viem/_cjs/accounts/index.js"));

const keys = {
  deployer: generatePrivateKey(),
  verifier: generatePrivateKey(),
  seller: generatePrivateKey(),
};

const addrs = {
  deployer: privateKeyToAddress(keys.deployer),
  verifier: privateKeyToAddress(keys.verifier),
  seller: privateKeyToAddress(keys.seller),
};

console.log("=== DEPLOYER WALLET (deploys contracts, needs ~0.3 MON) ===");
console.log(`  Address:     ${addrs.deployer}`);
console.log(`  Private Key: ${keys.deployer}`);
console.log();

console.log("=== VERIFIER WALLET (signs settle txs, needs ~1 MON) ===");
console.log(`  Address:     ${addrs.verifier}`);
console.log(`  Private Key: ${keys.verifier}`);
console.log();

console.log("=== SELLER AGENT WALLET (signs submitWork txs, needs ~0.5 MON) ===");
console.log(`  Address:     ${addrs.seller}`);
console.log(`  Private Key: ${keys.seller}`);
console.log();

console.log("=== FUND THESE AT https://faucet.monad.xyz ===");
console.log(`  Deployer: ${addrs.deployer}  (need ~0.3 MON)`);
console.log(`  Verifier: ${addrs.verifier}  (need ~1 MON)`);
console.log(`  Seller:   ${addrs.seller}  (need ~0.5 MON)`);
console.log();
console.log("=== COPY TO .env.local ===");
console.log(`DEPLOYER_PRIVATE_KEY=${keys.deployer}`);
console.log(`VERIFIER_PRIVATE_KEY=${keys.verifier}`);
console.log(`SELLER_AGENT_PRIVATE_KEY=${keys.seller}`);
