import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Claim } from "@imprest/core";

/** Repo root: the web app runs from web/, evidence lives in ../proof. */
const ROOT = resolve(/*turbopackIgnore: true*/ process.cwd(), "..");

function readJson<T = any>(p: string): T | null {
  const f = resolve(/*turbopackIgnore: true*/ ROOT, p);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Claims exactly as generated from evidence. Display code never upgrades a status. */
export function getClaims(): Record<string, Claim> {
  const dir = resolve(/*turbopackIgnore: true*/ ROOT, "proof/claims");
  if (!existsSync(dir)) return {};
  const out: Record<string, Claim> = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const c = readJson<Claim>(`proof/claims/${f}`);
    if (c) out[c.claim_id] = c;
  }
  return out;
}

export function claim(id: string): Claim | null {
  return getClaims()[id] ?? null;
}

export const getForge = () => readJson("proof/local/forge-test-results.json");
export const getFork = () => readJson("proof/local/testnet-fork-run.json");
export const getReference = () => readJson("proof/reference_model/results.json");
export const getGas = () => readJson("proof/local/gas-profile.json");
export const getGate0 = (env: "testnet" | "mainnet") => readJson(`proof/receipts/${env}/gate0.json`);
export const getStaleness = () => readJson("proof/experiments/mark-staleness-testnet.json");
export const getReplay = () => readJson("proof/experiments/replay/results.json");

export function getPairedDesk(): any[] {
  const dir = resolve(/*turbopackIgnore: true*/ ROOT, "proof/experiments/paired-desk");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(`proof/experiments/paired-desk/${f}`))
    .filter(Boolean);
}

export function getDeployments(): any[] {
  const dir = resolve(/*turbopackIgnore: true*/ ROOT, "proof/receipts/deployments");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `proof/receipts/deployments/${f}`, ...readJson(`proof/receipts/deployments/${f}`) }));
}

export function getReceipts(env: "testnet" | "mainnet"): any[] {
  const dir = resolve(/*turbopackIgnore: true*/ ROOT, `proof/receipts/${env}`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `proof/receipts/${env}/${f}`, ...readJson(`proof/receipts/${env}/${f}`) }));
}

export function readDoc(name: string): string | null {
  const f = resolve(/*turbopackIgnore: true*/ ROOT, "docs", name);
  if (!/^[A-Z_]+\.md$/.test(name) || !existsSync(f)) return null;
  return readFileSync(f, "utf8");
}

export function listDocs(): string[] {
  const dir = resolve(/*turbopackIgnore: true*/ ROOT, "docs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[A-Z_]+\.md$/.test(f)).sort();
}

/** Public repository URL for source links, when configured. */
export const repoUrl = process.env.NEXT_PUBLIC_REPO_URL || null;
