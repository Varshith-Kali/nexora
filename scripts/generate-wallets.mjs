#!/usr/bin/env node
/**
 * Nexora — generate-wallets.mjs
 * Generates 3 throwaway Monad Testnet wallets using ethers.js (already in node_modules).
 * Run: node scripts/generate-wallets.mjs
 */
import { ethers } from "ethers";

console.log("Generating 3 throwaway Monad Testnet wallets...\n");

const deployer = ethers.Wallet.createRandom();
const verifier = ethers.Wallet.createRandom();
const seller = ethers.Wallet.createRandom();

console.log("=== DEPLOYER WALLET (deploy contracts, needs ~0.3 MON) ===");
console.log(`Address:     ${deployer.address}`);
console.log(`Private Key: ${deployer.privateKey}`);
console.log();

console.log("=== VERIFIER WALLET (settle transactions, needs ~1 MON) ===");
console.log(`Address:     ${verifier.address}`);
console.log(`Private Key: ${verifier.privateKey}`);
console.log();

console.log("=== SELLER AGENT WALLET (submitWork transactions, needs ~0.5 MON) ===");
console.log(`Address:     ${seller.address}`);
console.log(`Private Key: ${seller.privateKey}`);
console.log();

console.log("=== FUND THESE ADDRESSES FROM https://faucet.monad.xyz ===");
console.log(`Deployer:  ${deployer.address}  (need ~0.3 MON)`);
console.log(`Verifier:  ${verifier.address}  (need ~1 MON)`);
console.log(`Seller:    ${seller.address}  (need ~0.5 MON)`);
console.log();
console.log("After funding, paste into .env.local:");
console.log(`DEPLOYER_PRIVATE_KEY=${deployer.privateKey}`);
console.log(`VERIFIER_PRIVATE_KEY=${verifier.privateKey}`);
console.log(`SELLER_AGENT_PRIVATE_KEY=${seller.privateKey}`);
