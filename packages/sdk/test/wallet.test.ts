import { describe, expect, it } from "vitest";
import { createMRA, loadOrCreateBurner, MemoryVault, type FetchFn } from "../src/index.js";
import { payUrlFor } from "../src/domains/util.js";

const SHOP = `0x${"ab".repeat(32)}`;

/** A fake JSON-RPC node (balances change when the fake faucet pays) + a fake agents API. */
function fakeNet(opts: { faucetStatus?: number; startEth?: bigint; startUsdc?: bigint } = {}) {
  const state = { eth: opts.startEth ?? 0n, usdc: opts.startUsdc ?? 0n, faucetCalls: 0, rpc: [] as string[] };
  const hex = (n: bigint) => `0x${n.toString(16)}`;
  const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
  const rpc: FetchFn = async (_url, init) => {
    const req = JSON.parse(String(init?.body));
    state.rpc.push(req.method);
    const result =
      req.method === "eth_getBalance" ? hex(state.eth)
      : req.method === "eth_gasPrice" ? hex(15n)
      : req.method === "eth_chainId" ? hex(11155111n)
      : req.method === "eth_call" ? word(state.usdc) // USDC.balanceOf
      : null;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { headers: { "content-type": "application/json" } });
  };
  const api: FetchFn = async (url, init) => {
    if (!url.endsWith("/demo/faucet")) return new Response("{}", { status: 404 });
    state.faucetCalls++;
    const status = opts.faucetStatus ?? 200;
    if (status !== 200) return new Response(JSON.stringify({ detail: status === 409 ? "already_funded" : "x" }), { status, headers: { "content-type": "application/json" } });
    const { address } = JSON.parse(String(init?.body));
    state.eth += 250_000_000_000_000n;
    state.usdc += 50_000_000n;
    return new Response(
      JSON.stringify({ address, eth_wei: "250000000000000", usdc: 50_000_000, eth_tx: `0x${"01".repeat(32)}`, usdc_tx: `0x${"02".repeat(32)}`, gas_per_tx: 250000, fee_cap_wei: "100000000", txs: 10 }),
      { headers: { "content-type": "application/json" } },
    );
  };
  return { state, rpc, api };
}

async function realMra(net: ReturnType<typeof fakeNet>, extra: Record<string, unknown> = {}) {
  const vault = new MemoryVault();
  const { wallet } = await loadOrCreateBurner(vault, { chainId: 11155111, rpcUrl: "http://rpc.test" });
  return createMRA({
    mode: "sepolia",
    apiUrl: "http://api.test",
    rpc: { url: "http://rpc.test", anonRpc: true, anonFetch: net.rpc },
    fetch: net.api,
    vault,
    wallet,
    payUrl: "https://app.test/pay/corner-kiosk",
    ...extra,
  });
}

describe("burner wallet", () => {
  it("is created once, reused, and travels in the encrypted backup", async () => {
    const vault = new MemoryVault();
    const a = await loadOrCreateBurner(vault, { chainId: 11155111, rpcUrl: "http://rpc.test" });
    const b = await loadOrCreateBurner(vault, { chainId: 11155111, rpcUrl: "http://rpc.test" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.address).toBe(a.address);
    const blob = await vault.export("correct horse battery");
    expect(blob).not.toContain(a.address.slice(2)); // encrypted, not just encoded
    const phone2 = new MemoryVault();
    expect(await phone2.import(blob, "correct horse battery")).toContain("wallet");
    expect((await loadOrCreateBurner(phone2, { chainId: 11155111, rpcUrl: "http://rpc.test" })).address).toBe(a.address);
  });

  it("refuses any chain but Sepolia / anvil", async () => {
    await expect(loadOrCreateBurner(new MemoryVault(), { chainId: 1, rpcUrl: "http://rpc.test" })).rejects.toMatchObject({ code: "config_invalid" });
  });

  it("wallet.address() exposes it for the chip (never in mock mode)", async () => {
    const mra = await realMra(fakeNet());
    expect(mra.wallet.address()).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(createMRA({ mode: "mock" }).wallet.address()).toBeUndefined();
  });
});

describe("wallet.ensureFunded (demo faucet)", () => {
  it("asks the faucet once when the wallet is empty, then reports ready without asking again", async () => {
    const net = fakeNet();
    const mra = await realMra(net);
    let funding = 0;
    const r = await mra.wallet.ensureFunded({ usdc: 10, onFunding: () => funding++ });
    expect(r.status).toBe("funded");
    expect(r.txHashes).toHaveLength(2);
    expect(r.usdc).toBe(50);
    expect(funding).toBe(1);
    expect((await mra.wallet.ensureFunded()).status).toBe("ready");
    expect((await mra.wallet.ensureFunded({ usdc: 10 })).status).toBe("ready");
    expect(net.state.faucetCalls).toBe(1);
  });

  it("does not ask when the wallet already has gas and USDC", async () => {
    const net = fakeNet({ startEth: 10n ** 16n, startUsdc: 100_000_000n });
    expect((await (await realMra(net)).wallet.ensureFunded({ usdc: 10 })).status).toBe("ready");
    expect(net.state.faucetCalls).toBe(0);
  });

  it("maps faucet refusals to statuses instead of throwing", async () => {
    expect((await (await realMra(fakeNet({ faucetStatus: 409 }))).wallet.ensureFunded()).status).toBe("already_funded");
    expect((await (await realMra(fakeNet({ faucetStatus: 429 }))).wallet.ensureFunded()).status).toBe("limited");
    expect((await (await realMra(fakeNet({ faucetStatus: 404 }))).wallet.ensureFunded()).status).toBe("unavailable");
    const off = fakeNet();
    expect((await (await realMra(off, { faucet: false })).wallet.ensureFunded()).status).toBe("unavailable");
    expect(off.state.faucetCalls).toBe(0);
  });

  it("mock mode never funds", async () => {
    expect((await createMRA({ mode: "mock" }).wallet.ensureFunded()).status).toBe("unavailable");
  });
});

describe("pay link (SDK gap 6)", () => {
  it("carries the bytes32 shop id and the display name", () => {
    const url = new URL(payUrlFor("https://app.test/pay/corner-kiosk", "Kiosco Don Pepe & Hijos", SHOP));
    expect(url.origin + url.pathname).toBe("https://app.test/pay/corner-kiosk");
    expect(url.searchParams.get("shop")).toBe(SHOP);
    expect(url.searchParams.get("name")).toBe("Kiosco Don Pepe & Hijos");
    expect(payUrlFor(undefined, "Corner Kiosk", SHOP)).toMatch(/^https:\/\/pay\..+\/corner-kiosk\?shop=0x(ab){32}&name=Corner\+Kiosk$/);
  });

  it("merchant.qr() returns it for the device's shop", async () => {
    const net = fakeNet();
    const mra = await realMra(net);
    await mra.raw.vault.put("session", { shopId: SHOP, shopName: "Corner Kiosk", pseudonym: "shop_abab" });
    const realRpc = net.rpc;
    // qr() reads the last week of Sale logs: answer block number + empty logs.
    const rpc: FetchFn = async (url, init) => {
      const req = JSON.parse(String(init?.body));
      if (req.method === "eth_blockNumber") return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: "0xc00000" }));
      if (req.method === "eth_getLogs") return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: [] }));
      return realRpc(url, init);
    };
    const mra2 = createMRA({
      mode: "sepolia",
      apiUrl: "http://api.test",
      rpc: { url: "http://rpc.test", anonRpc: true, anonFetch: rpc },
      vault: mra.raw.vault,
      payUrl: "https://app.test/pay/corner-kiosk",
    });
    const qr = await mra2.merchant.qr();
    const url = new URL(qr.payLink);
    expect(url.searchParams.get("shop")).toBe(SHOP);
    expect(url.searchParams.get("name")).toBe("Corner Kiosk");
  });
});

describe("writes retry transient pre-broadcast RPC errors", () => {
  it("classifies errors (nested causes; never a revert)", async () => {
    const { isTransientWriteError } = await import("../src/index.js");
    const nested = (msg: string) => Object.assign(new Error("outer"), { cause: Object.assign(new Error("inner"), { details: msg }) });
    expect(isTransientWriteError(nested("insufficient funds for gas * price + value"))).toBe(true);
    expect(isTransientWriteError(nested("rate limit exceeded"))).toBe(true);
    expect(isTransientWriteError(nested("execution reverted: BusinessAlreadyHasPass"))).toBe(false);
    expect(isTransientWriteError(new Error("User rejected the request"))).toBe(false);
  });

  it("retries a write the node refused for funds, then waits for the receipt", async () => {
    const { createChain, deploymentFor } = await import("../src/index.js");
    const hash = `0x${"cd".repeat(32)}` as const;
    let attempts = 0;
    const account = { address: `0x${"11".repeat(20)}` as const, type: "local" };
    const wallet = {
      account,
      writeContract: async () => {
        attempts++;
        if (attempts < 3) throw Object.assign(new Error("tx failed"), { cause: { details: "insufficient funds for gas" } });
        return hash;
      },
    };
    const receipt = {
      transactionHash: hash, blockHash: `0x${"ef".repeat(32)}`, blockNumber: "0x10", transactionIndex: "0x0", from: account.address,
      to: `0x${"22".repeat(20)}`, cumulativeGasUsed: "0x1", gasUsed: "0x1", effectiveGasPrice: "0x1", logs: [], logsBloom: `0x${"00".repeat(256)}`,
      status: "0x1", type: "0x2", contractAddress: null,
    };
    const fetchFn: FetchFn = async (_u, init) => {
      const req = JSON.parse(String(init?.body));
      const result = req.method === "eth_getTransactionReceipt" ? receipt : req.method === "eth_blockNumber" ? "0x10" : req.method === "eth_chainId" ? "0xaa36a7" : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    };
    const chain = createChain({ deployment: deploymentFor("sepolia"), url: "http://rpc.test", fetchFn, wallet: wallet as never, retryDelayMs: 1 });
    const r = await chain.registerShop(`0x${"ab".repeat(32)}`, account.address);
    expect(r.transactionHash).toBe(hash);
    expect(attempts).toBe(3);
  });
});
