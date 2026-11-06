/**
 * Private Merkle reads: download the WHOLE tree (every LeafInserted event, through whatever transport the chain
 * uses, i.e. Anon-RPC in the browser) and do every lookup locally. Asking the RPC for "my" leaf, or filtering
 * LeafInserted by my commitment (it is an indexed topic), would tell the RPC which credential is mine.
 *
 * - `findLeafIndex`: after claimStandingPass / issue, learn your leafIndex without a filtered query.
 * - `merkleWitness`: leaves + index → path, index bits, root (the circuit's private inputs + public root).
 */
import { merklePath, type Poseidon2 } from "../credentials.js";
import type { Chain } from "./chain.js";

export type TreeName = "business" | "standing";

/** Index of `commitment` among all leaves, searched locally. `undefined` if not inserted (yet). */
export async function findLeafIndex(chain: Pick<Chain, "leaves">, tree: TreeName, commitment: bigint | `0x${string}`): Promise<number | undefined> {
  const want = typeof commitment === "bigint" ? commitment : BigInt(commitment);
  const leaves = await chain.leaves(tree);
  const i = leaves.indexOf(want);
  return i < 0 ? undefined : i;
}

/**
 * Wait for a just-submitted leaf to show up (the relayer's tx may still be mining). Polls the whole tree, never a
 * filtered query. Default: 10 tries, 3 s apart.
 */
export async function waitForLeafIndex(
  chain: Pick<Chain, "leaves">,
  tree: TreeName,
  commitment: bigint | `0x${string}`,
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<number | undefined> {
  const tries = opts.tries ?? 10;
  for (let i = 0; i < tries; i++) {
    const idx = await findLeafIndex(chain, tree, commitment);
    if (idx !== undefined) return idx;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, opts.intervalMs ?? 3_000));
  }
  return undefined;
}

/** Full private witness for a tree membership proof: whole-tree download + local path. */
export async function merkleWitness(
  chain: Pick<Chain, "leaves">,
  h2: Poseidon2,
  tree: TreeName,
  which: { leafIndex: number } | { commitment: bigint | `0x${string}` },
): Promise<{ leafIndex: number; leafCount: number; path: bigint[]; indexBits: boolean[]; root: bigint }> {
  const leaves = await chain.leaves(tree);
  const leafIndex = "leafIndex" in which ? which.leafIndex : leaves.indexOf(typeof which.commitment === "bigint" ? which.commitment : BigInt(which.commitment));
  if (leafIndex < 0 || leafIndex >= leaves.length) throw new RangeError("credential leaf not found in the tree");
  const { path, indexBits, root } = await merklePath(h2, leaves, leafIndex);
  return { leafIndex, leafCount: leaves.length, path, indexBits, root };
}
