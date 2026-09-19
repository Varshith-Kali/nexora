/**
 * Nexora — ABI sync
 * Extracts the compiled ABIs from Foundry's `out/` directory and writes them
 * to `config/abis/`, from which the Next.js app imports them
 * (single source of truth after every `forge build`).
 *
 * Run:  bun scripts/sync-abis.ts   (after `forge build`)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const DEST = join(ROOT, "config", "abis");

const artifacts: Array<[string, string]> = [
  ["NexoraRegistry", join(OUT, "NexoraRegistry.sol", "NexoraRegistry.json")],
  ["NexoraEscrow", join(OUT, "NexoraEscrow.sol", "NexoraEscrow.json")],
];

if (!existsSync(DEST)) mkdirSync(DEST, { recursive: true });

for (const [name, file] of artifacts) {
  if (!existsSync(file)) {
    console.error(`✗ ${name}: forge artifact not found at ${file} — run \`forge build\` first`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(file, "utf8"));
  const abi = artifact.abi;
  if (!Array.isArray(abi) || abi.length === 0) {
    console.error(`✗ ${name}: artifact has no ABI`);
    process.exit(1);
  }
  const target = join(DEST, `${name}.json`);
  writeFileSync(target, JSON.stringify(abi, null, 2) + "\n");
  const fns = abi.filter((e: any) => e.type === "function").length;
  const evs = abi.filter((e: any) => e.type === "event").length;
  console.log(`✓ ${name} ABI → config/abis/${name}.json (${fns} functions, ${evs} events)`);
}
