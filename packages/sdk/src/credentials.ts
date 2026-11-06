/**
 * Credential math shared by the Business Pass and Standing Pass (circuits/{business_pass,standing_pass}/src/main.nr).
 * Hashing is Poseidon2 over BN254, supplied by the Prover (bb.js in the browser). The SDK never ships its own
 * Poseidon2, so there is exactly one implementation and it is the one the circuits are tested against.
 */
import { encodeAbiParameters, keccak256, type Hex } from "viem";

/** BN254 scalar field. */
export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const TREE_DEPTH = 16;

export const TAG_COMMIT = 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1n;
export const TAG_BIZ = 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8bn;
export const TAG_BIZ_NULL = 0x075964a690d1888b50278bf8b2aed0ca04febb6b1f1c68514fe4450e85164226n;
export const TAG_NULL = 0x0f08cced1499e13a50af6f29ab9ee272a40d4e4713313e8ff11d52bfe9fb2f42n;

/** ISO 3166 numeric codes, as the circuit and BusinessPassRegistry.countrySet use them. */
export const COUNTRY_CODE = { AR: 32, NG: 566, KE: 404 } as const;
export type CountryAlpha2 = keyof typeof COUNTRY_CODE;

export type Poseidon2 = (inputs: bigint[]) => Promise<bigint>;

/** A uniformly random field element (rejection-sampled), from WebCrypto. */
export function randomField(): bigint {
  for (;;) {
    const b = new Uint8Array(32);
    globalThis.crypto.getRandomValues(b);
    b[0]! &= 0x3f; // < 2^254, so ~ 1/4 rejection rate
    const v = BigInt(`0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
    if (v !== 0n && v < P) return v;
  }
}

export function randomBytes32(): Hex {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** 0x + exactly 64 lowercase hex: the format the issuer compares `contextMessage` against. */
export function toHex32(v: bigint): Hex {
  return `0x${v.toString(16).padStart(64, "0")}`;
}

export async function businessLeaf(h2: Poseidon2, secret: bigint, country: number, band: number, ageOk: 0 | 1) {
  const h = await h2([secret]);
  const leaf = await h2([TAG_BIZ, h, BigInt(country), BigInt(band), BigInt(ageOk)]);
  return { h, leaf };
}

export const businessNullifier = (h2: Poseidon2, secret: bigint) => h2([TAG_BIZ_NULL, secret]);
export const standingNullifier = (h2: Poseidon2, secret: bigint) => h2([TAG_NULL, secret]);

/** Standing Pass leaf = Poseidon2(TAG_COMMIT, Poseidon2(secret), count). */
export async function standingCommitment(h2: Poseidon2, secret: bigint, count: number) {
  const h = await h2([secret]);
  return { h, commitment: await h2([TAG_COMMIT, h, BigInt(count)]) };
}

/** drawFirst / drawWithPass context = keccak(recipient, offerId) % P. */
export function drawContext(recipient: Hex, offerId: Hex): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [recipient, offerId]))) % P;
}

/**
 * Merkle path for `index` in an append-only depth-16 tree with zero leaf 0 (node = Poseidon2(left, right)).
 * Build it from the WHOLE leaf list (all LeafInserted events) so the RPC never learns which leaf is yours.
 */
export async function merklePath(h2: Poseidon2, leaves: bigint[], index: number, depth = TREE_DEPTH) {
  if (index < 0 || index >= leaves.length) throw new RangeError("leaf index out of range");
  const zeros: bigint[] = [0n];
  for (let i = 0; i < depth; i++) zeros.push(await h2([zeros[i]!, zeros[i]!]));
  let level = leaves.slice();
  let idx = index;
  const path: bigint[] = [];
  const bits: boolean[] = [];
  for (let d = 0; d < depth; d++) {
    const sib = idx ^ 1;
    path.push(sib < level.length ? level[sib]! : zeros[d]!);
    bits.push((idx & 1) === 1);
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(await h2([level[i]!, i + 1 < level.length ? level[i + 1]! : zeros[d]!]));
    level = next.length ? next : [zeros[d + 1]!];
    idx >>= 1;
  }
  return { path, indexBits: bits, root: level[0]! };
}
