import { describe, expect, it } from "vitest";
import { mockProver } from "../src/adapters/prover.js";
import { findLeafIndex, merkleWitness, waitForLeafIndex } from "../src/chain/tree.js";
import { merklePath } from "../src/credentials.js";
import { tree, treeChain } from "./tree-helpers.js";

describe("chain/tree (whole-tree download, local lookups)", () => {
  const h2 = (x: bigint[]) => mockProver().poseidon2(x);

  it("finds the leaf index locally and builds the same path as merklePath", async () => {
    const r = await tree(mockProver());
    expect(r.idx).toBe(2);
    expect(r.calls).toEqual(["standing", "standing"]); // only unfiltered whole-tree reads
    const ref = await merklePath(h2, [11n, 22n, 33n, 44n], 2);
    expect(r.witness).toMatchObject({ leafIndex: 2, leafCount: 4, root: ref.root, path: ref.path, indexBits: ref.indexBits });
  });

  it("undefined / RangeError when the leaf is missing; waitForLeafIndex polls the whole tree", async () => {
    const chain = treeChain([1n]);
    expect(await findLeafIndex(chain, "business", 9n)).toBeUndefined();
    await expect(merkleWitness(chain, h2, "business", { commitment: 9n })).rejects.toThrow(RangeError);
    let n = 0;
    const growing = { async leaves() { return ++n >= 3 ? [1n, 9n] : [1n]; } };
    expect(await waitForLeafIndex(growing, "standing", 9n, { intervalMs: 1 })).toBe(1);
    expect(n).toBe(3);
  });
});
