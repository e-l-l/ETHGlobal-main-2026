/** createChain's event-scan cache: parallel chunks, finalized ranges fetched once, only the tail after that. */
import { describe, expect, it } from "vitest";
import { createChain, FINALITY } from "../src/chain/chain.js";
import { deploymentFor } from "../src/index.js";

const D = deploymentFor("sepolia");
const DEPLOY = BigInt(D.deployBlock);

function fake(headRef: { head: bigint }) {
  const calls: { method: string; from?: bigint; to?: bigint }[] = [];
  const fetchFn = (async (_u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body));
    calls.push({ method: b.method, ...(b.method === "eth_getLogs" ? { from: BigInt(b.params[0].fromBlock), to: BigInt(b.params[0].toBlock) } : {}) });
    const result = b.method === "eth_blockNumber" ? `0x${headRef.head.toString(16)}` : b.method === "eth_chainId" ? `0x${D.chainId.toString(16)}` : b.method === "eth_getCode" ? "0x60806040" : [];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: b.id, result }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("chain log cache", () => {
  it("fetches finalized chunks once, then only the tail", async () => {
    const ref = { head: DEPLOY + 20_000n };
    const f = fake(ref);
    const chain = createChain({ deployment: D, url: "http://rpc.test", fetchFn: f.fetchFn as never, multicall: false, logChunk: 9_000 });
    const logs = () => f.calls.filter((c) => c.method === "eth_getLogs");

    await chain.bookLogs("Sale", undefined, undefined, ref.head);
    expect(logs().length).toBe(3); // 9,000 + 9,000 + 2,001 blocks
    expect(logs()[0]!.from).toBe(DEPLOY);

    f.calls.length = 0;
    await chain.bookLogs("Sale", undefined, undefined, ref.head);
    // Everything up to head - FINALITY is cached: one call for the last FINALITY blocks.
    expect(logs()).toEqual([{ method: "eth_getLogs", from: ref.head - FINALITY + 1n, to: ref.head }]);

    f.calls.length = 0;
    ref.head += 100n;
    await chain.bookLogs("Sale", undefined, undefined, ref.head);
    expect(logs()).toEqual([{ method: "eth_getLogs", from: ref.head - 100n - FINALITY + 1n, to: ref.head }]);

    // A different event or args has its own entry.
    f.calls.length = 0;
    await chain.bookLogs("Sale", { shopId: `0x${"01".repeat(32)}` }, undefined, ref.head);
    expect(logs().length).toBe(3);
  });

  it("serves a later window inside the cached range without refetching it", async () => {
    const ref = { head: DEPLOY + 20_000n };
    const f = fake(ref);
    const chain = createChain({ deployment: D, url: "http://rpc.test", fetchFn: f.fetchFn as never, multicall: false });
    await chain.bookLogs("AdvanceOpened", undefined, undefined, ref.head);
    f.calls.length = 0;
    await chain.bookLogs("AdvanceOpened", undefined, DEPLOY + 15_000n, ref.head);
    expect(f.calls.filter((c) => c.method === "eth_getLogs").length).toBe(1);
  });

  it("shares identical scans in flight, and caches code sizes", async () => {
    const ref = { head: DEPLOY + 5_000n };
    const f = fake(ref);
    const chain = createChain({ deployment: D, url: "http://rpc.test", fetchFn: f.fetchFn as never, multicall: false });
    await Promise.all([chain.bookLogs("Sale", undefined, undefined, ref.head), chain.bookLogs("Sale", undefined, undefined, ref.head)]);
    expect(f.calls.filter((c) => c.method === "eth_getLogs").length).toBe(1);
    expect(await chain.codeSize(D.AdvanceBook as `0x${string}`)).toBe(4);
    await chain.codeSize(D.AdvanceBook as `0x${string}`);
    expect(f.calls.filter((c) => c.method === "eth_getCode").length).toBe(1);
  });
});
