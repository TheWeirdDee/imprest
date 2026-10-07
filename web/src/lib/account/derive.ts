import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** secp256k1 group order. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const te = new TextEncoder();

function toBig(b: Uint8Array): bigint {
  let x = 0n;
  for (const v of b) x = (x << 8n) | BigInt(v);
  return x;
}

/**
 * Derives the trader's EVM key from the passkey's PRF output. Application-defined and
 * versioned: changing SALT/INFO changes the account, so they never change for v1.
 * The PRF output never leaves the device; the derived key lives only in a Mera
 * signing session in memory.
 */
export function deriveEvmKey(prfOutput: Uint8Array): Uint8Array {
  for (let counter = 0; counter < 16; counter++) {
    const key = hkdf(sha256, prfOutput, te.encode("imprest.account.v1"), te.encode(`evm-secp256k1/${counter}`), 32);
    const k = toBig(key);
    if (k > 0n && k < N) return key;
  }
  throw new Error("could not derive a valid secp256k1 key");
}
