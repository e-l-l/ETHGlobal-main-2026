/**
 * Round-trip budget for the live hot paths. A fake JSON-RPC (every call costs LATENCY ms, like a slow mixnet hop)
 * counts requests and the serial depth (elapsed / LATENCY) of merchant.home(), junior.trade(), proofCenter() and
 * agent.approveView(), cold and then warm (same instance). Logs carry no events, so per-event fan-out (block times
 * of each sale) isn't exercised here: these are the floor costs of the scans and reads.
 *
 *   MRA_RT_REPORT=/tmp/rt.txt npx vitest run test/rpc-roundtrips.test.ts   # appends the table to that file
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryVault } from "../src/adapters/vault.js";
import { createMRA, deploymentFor } from "../src/index.js";

const LATENCY = 15;
const D = deploymentFor("sepolia");
/** ~5.5 days of Sepolia blocks after the deploy: 5 log chunks of 9,000 from the deploy block. */
const HEAD = BigInt(D.deployBlock) + 40_000n;
const hex = (n: bigint | number) => `0x${BigInt(n).toString(16)}`;

function fakeRpc() {
  const stats = { requests: 0, byMethod: {} as Record<string, number> };
  const one = (m: string, params: any[]): unknown => {
    stats.requests++;
    stats.byMethod[m] = (stats.byMethod[m] ?? 0) + 1;
    switch (m) {
      case "eth_chainId":
        return hex(D.chainId);
      case "eth_blockNumber":
        return hex(HEAD);
      case "eth_getLogs":
        return [];
      case "eth_call":
        return `0x${"00".repeat(32 * 48)}`;
      case "eth_getCode":
        return "0x6080604052";
      case "eth_getBlockByNumber": {
        const n = params[0] === "latest" ? HEAD : BigInt(params[0]);
        return { number: hex(n), hash: `0x${"11".repeat(32)}`, parentHash: `0x${"22".repeat(32)}`, timestamp: hex(1_760_000_000n + n * 12n), transactions: [], gasLimit: "0x0", gasUsed: "0x0", baseFeePerGas: "0x1", difficulty: "0x0", logsBloom: null, nonce: null, miner: `0x${"00".repeat(20)}`, extraData: "0x", size: "0x0", stateRoot: `0x${"00".repeat(32)}`, receiptsRoot: `0x${"00".repeat(32)}`, transactionsRoot: `0x${"00".repeat(32)}`, sha3Uncles: `0x${"00".repeat(32)}`, uncles: [], totalDifficulty: "0x0", mixHash: `0x${"00".repeat(32)}` };
      }
      default:
        throw new Error(`fake rpc: ${m}`);
    }
  };
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    await new Promise((r) => setTimeout(r, LATENCY));
    const answer = (b: any) => {
      try {
        return { jsonrpc: "2.0", id: b.id, result: one(b.method, b.params ?? []) };
      } catch (e) {
        return { jsonrpc: "2.0", id: b.id, error: { code: -32601, message: (e as Error).message } };
      }
    };
    const out = Array.isArray(body) ? body.map(answer) : answer(body);
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { stats, fetchFn };
}

const apiFetch = (async () => new Response(JSON.stringify({ detail: "not here" }), { status: 404, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

async function instance() {
  const rpc = fakeRpc();
  const vault = new MemoryVault();
  await vault.put("session", { shopId: `0x7f3a${"00".repeat(30)}`, payout: "0x1111111111111111111111111111111111111111" } as never);
  const mra = createMRA({
    mode: "sepolia",
    apiUrl: "http://api.test",
    issuerUrl: "http://issuer.test",
    fetch: apiFetch as never,
    vault,
    timeoutMs: 5_000,
    rpc: { url: "http://rpc.test", anonRpc: true, anonFetch: rpc.fetchFn as never, multicall: false },
  });
  return { mra, stats: rpc.stats };
}

type M = Awaited<ReturnType<typeof instance>>["mra"];
const PATHS: [string, (m: M) => Promise<unknown>][] = [
  ["merchant.home", (m) => m.merchant.home()],
  ["junior.trade", (m) => m.lender.junior.trade()],
  ["protocol.proofCenter", (m) => m.protocol.proofCenter({ skipChecks: true })],
  ["agent.approveView", (m) => m.agent.approveView({ perAdvance: 100, perMonth: 200 })],
];

async function measure(mra: M, stats: { requests: number }, fn: (m: M) => Promise<unknown>) {
  const before = stats.requests;
  const t0 = Date.now();
  let err: string | undefined;
  try {
    await fn(mra);
  } catch (e) {
    err = (e as { code?: string }).code ?? String(e);
  }
  return { requests: stats.requests - before, depth: Math.round((Date.now() - t0) / LATENCY), err };
}

describe("RPC round trips per hot path (fake RPC)", () => {
  for (const [name, fn] of PATHS) {
    it(name, async () => {
      const { mra, stats } = await instance();
      const cold = await measure(mra, stats, fn);
      const warm = await measure(mra, stats, fn);
      if (process.env.MRA_RT_REPORT) appendFileSync(process.env.MRA_RT_REPORT, `RT ${name.padEnd(22)} cold ${cold.requests} req / depth ~${cold.depth}   warm ${warm.requests} req / depth ~${warm.depth}${cold.err ? `   (threw ${cold.err})` : ""}\n`);
      expect(cold.err).toBeUndefined();
      expect(warm.requests).toBeLessThanOrEqual(cold.requests);
    }, 30_000);
  }
});
