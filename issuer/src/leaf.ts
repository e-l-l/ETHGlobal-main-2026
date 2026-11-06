// Optional leaf recomputation: leaf = Poseidon2::hash([TAG_BIZ, h, country, revenue_band, age_ok], 5), exactly as
// circuits/business_pass/src/main.nr, the SDK (credentials.ts businessLeaf) and agents zk.py compute it.
// (An older packed form, [TAG_BIZ, h, country + 2^16*band + 2^24*ageOk], made every real issue fail with
// commitment_mismatch.) bb.js 6.0.0 is the same Poseidon2 the app/circuit use.
// Loaded lazily: the WASM costs ~1 s on first use and is never needed when the leaf check is off.
import { P } from "./nullifier.js";

export const TAG_BIZ = 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8bn;


type Hasher = (inputs: bigint[]) => bigint;
let hasher: Promise<Hasher> | null = null;

const fr = (x: bigint) => Uint8Array.from(Buffer.from(x.toString(16).padStart(64, "0"), "hex"));

export function poseidon2(): Promise<Hasher> {
  hasher ??= import("@aztec-foundation/bb.js").then(async ({ BarretenbergSync }) => {
    const bb = await BarretenbergSync.new();
    return (inputs: bigint[]) => BigInt("0x" + Buffer.from(bb.poseidon2Hash({ inputs: inputs.map(fr) }).hash).toString("hex"));
  });
  return hasher;
}

export async function bizLeaf(h: bigint, country: number, band: number, ageOk: number): Promise<bigint> {
  if (h <= 0n || h >= P) throw new RangeError("h out of field");
  return (await poseidon2())([TAG_BIZ, h, BigInt(country), BigInt(band), BigInt(ageOk)]);
}
