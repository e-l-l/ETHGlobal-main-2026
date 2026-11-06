import { describe, expect, it } from "vitest";
import sepoliaJson from "../src/deployments/sepolia.json" with { type: "json" };
import localJson from "../src/deployments/local.json" with { type: "json" };
import { ConfigError, DEPLOYMENTS, abi, createChain, createMRA, deploymentFor, parseDeployment } from "../src/index.js";

describe("deployments", () => {
  it("bundled sepolia config matches the copied agents/deployments/sepolia.json", () => {
    expect(DEPLOYMENTS.sepolia).toEqual(sepoliaJson);
    expect(DEPLOYMENTS.sepolia.chainId).toBe(11155111);
    expect(DEPLOYMENTS.sepolia.AdvanceBook).toBe("0x873bb34ad35a66947dbd2f9482d15ba5d400d8db");
    expect(DEPLOYMENTS.sepolia.poolKey.hooks).toBe(DEPLOYMENTS.sepolia.RiskHook);
    expect(deploymentFor("local")).toEqual(localJson);
  });

  it("parseDeployment rejects broken configs", () => {
    expect(() => parseDeployment({ ...sepoliaJson, AdvanceBook: "0x123" })).toThrow(ConfigError);
    expect(() => parseDeployment({ ...sepoliaJson, deployBlock: undefined })).toThrow(/deployBlock/);
    expect(() => parseDeployment(null)).toThrow(ConfigError);
  });

  it("ABIs carry the functions and events the SDK calls", () => {
    const names = (a: readonly { type: string; name?: string }[], type: string) => a.filter((x) => x.type === type).map((x) => x.name);
    expect(names(abi.advanceBookAbi, "function")).toEqual(
      expect.arrayContaining(["getAdvance", "shops", "tierCap", "reserve", "pay", "registerShop", "mandateContext", "getMandate", "contextFor"]),
    );
    expect(names(abi.advanceBookAbi, "event")).toEqual(expect.arrayContaining(["Sale", "AdvanceOpened", "LeafInserted", "MandateRegistered", "RepaymentSplit"]));
    expect(names(abi.trancheVaultAbi, "function")).toEqual(expect.arrayContaining(["deposit", "withdraw", "convertToAssets", "outstanding", "maxWithdraw"]));
    expect(names(abi.businessPassRegistryAbi, "function")).toEqual(expect.arrayContaining(["issue", "countrySet"]));
    expect(names(abi.riskHookAbi, "function")).toContain("consult");
  });

  it("createChain builds a client without touching the network", () => {
    const c = createChain({ deployment: DEPLOYMENTS.sepolia, url: "https://rpc.invalid" });
    expect(c.chain.id).toBe(11155111);
    expect(c.addresses.senior).toBe(DEPLOYMENTS.sepolia.SeniorVault);
    expect(c.hasWallet()).toBe(false);
  });

  it("network() reports mode, chain and Anon-RPC routing", async () => {
    expect(createMRA({ mode: "mock" }).network()).toEqual({ mode: "mock", chainId: 0, rpc: "none" });
    expect(createMRA({ mode: "local" }).network()).toMatchObject({ chainId: 31337, rpc: "direct", apiUrl: "http://localhost:8000", issuerUrl: "http://localhost:8787" });
    const anon = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: { anonRpc: true, anonFetch: async () => new Response("{}") } });
    expect(anon.network()).toMatchObject({ chainId: 11155111, rpc: "anon" });
    // Fail closed: anonRpc without a worker refuses to read directly.
    const noWorker = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: { anonRpc: true } });
    expect(() => noWorker.raw.chain()).toThrow(/anonWorker/);
  });

  it("chain reads route through the injected Anon-RPC fetch", async () => {
    const seen: string[] = [];
    const anonFetch = async (url: string, init?: RequestInit) => {
      seen.push(String(url).replace(/\/$/, ""));
      const req = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: "0x10" }), { headers: { "content-type": "application/json" } });
    };
    const mra = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: { url: "https://rpc.test", anonRpc: true, anonFetch } });
    expect(await mra.raw.chain().blockNumber()).toBe(16n);
    expect(seen).toEqual(["https://rpc.test"]);
  });

  it("rejects an unknown mode", () => {
    expect(() => createMRA({ mode: "prod" as never })).toThrow(/mode must be/);
  });
});
