import type { Prover } from "../src/adapters/prover.js";
import { findLeafIndex, merkleWitness } from "../src/chain/tree.js";

/** A chain stub whose only read is the whole-tree download; records every call so tests can assert on it. */
export function treeChain(leaves: bigint[]) {
  const calls: string[] = [];
  return {
    calls,
    async leaves(t: "business" | "standing") {
      calls.push(t);
      return leaves.slice();
    },
  };
}

export async function tree(prover: Pick<Prover, "poseidon2">) {
  const chain = treeChain([11n, 22n, 33n, 44n]);
  const idx = await findLeafIndex(chain, "standing", 33n);
  const witness = await merkleWitness(chain, (x) => prover.poseidon2(x), "standing", { commitment: `0x${(33n).toString(16)}` });
  return { idx, witness, calls: chain.calls };
}
