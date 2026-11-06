import { createHmac } from "node:crypto";

/** BN254 scalar field modulus (contracts/src/Constants.sol SNARK_FIELD). */
export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * businessNullifier = HMAC-SHA256(pepper, accountId) as a big-endian uint256, mod P.
 * Deterministic per business; without the pepper it cannot be brute-forced back to an account id.
 * The caller must drop `accountId` right after this returns.
 */
export function businessNullifier(pepper: Buffer, accountId: string): bigint {
  const mac = createHmac("sha256", pepper).update(accountId, "utf8").digest("hex");
  const n = BigInt("0x" + mac) % P;
  // Probability ~2^-254; the registry rejects 0, so fail loudly rather than issue an unusable attestation.
  if (n === 0n) throw new Error("degenerate nullifier");
  return n;
}

export const toHex32 = (x: bigint): `0x${string}` => `0x${x.toString(16).padStart(64, "0")}`;
