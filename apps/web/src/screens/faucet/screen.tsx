"use client";

import { useEffect, useState } from "react";
import { deploymentFor, parseDeployment, type Deployment } from "@repo/sdk";
import { Banner, Button, Card, Heading, Label, Text, TextField, TextLink } from "@/final";
import { MRA_ENV, MRA_MODE, getMRA, isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";
import { LendShell } from "@/screens/lend/shell";

type Eip1193 = { request(args: { method: string; params?: unknown }): Promise<unknown> };
const ethereum = (): Eip1193 | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The bundled (or overridden) deployment for this mode: USDC and JuniorVault (DRIP) addresses. */
function deployment(): Deployment {
  if (MRA_ENV.deployment) {
    try {
      return parseDeployment(JSON.parse(MRA_ENV.deployment));
    } catch {
      /* fall back to the bundled copy */
    }
  }
  return deploymentFor(MRA_MODE === "local" ? "local" : "sepolia");
}

/** The faucet's error codes (agents/src/mra_agents/faucet.py), in plain English. */
const MESSAGES: Record<string, string> = {
  already_funded: "This address has already been funded. Each address gets gas + USDC once, and DRIP once.",
  ip_limit: "Too many requests from your network today. Try again tomorrow, or ask the team.",
  daily_budget: "The faucet's daily budget is used up. Try again later, or ask the team.",
  drip_unavailable: "The DRIP vault isn't taking deposits right now (a junior cover or delinquency rule). Gas and USDC were still sent.",
  relayer_balance_low: "The faucet wallet is low on Sepolia ETH. Ask the team to top it up.",
  chain_unavailable: "Couldn't reach Sepolia. Try again in a moment.",
  send_failed: "A faucet transaction didn't confirm. It may still land; check the address on Etherscan.",
  bad_address: "That isn't a valid wallet address.",
  not_found: "The faucet is off on this deployment.",
  "Not found": "The faucet is off on this deployment.",
};
const explain = (code: string) => MESSAGES[code] ?? `The faucet refused (${code}).`;

type FaucetResult = {
  eth_wei: string;
  usdc: number;
  eth_tx: string | null;
  usdc_tx: string | null;
  drip?: number;
  drip_tx?: string | null;
  drip_error?: string | null;
};

const txUrl = (h: string) =>
  MRA_MODE === "sepolia" ? `https://sepolia.etherscan.io/tx/${h}` : undefined;

function TxLine({ label, hash }: { label: string; hash: string }) {
  const url = txUrl(hash);
  return (
    <li className="font-body text-note">
      {label}:{" "}
      {url ? (
        <a className="font-ledger text-hunter underline" href={url} target="_blank" rel="noreferrer">
          {hash.slice(0, 10)}…{hash.slice(-6)}
        </a>
      ) : (
        <span className="font-ledger">{hash.slice(0, 10)}…</span>
      )}
    </li>
  );
}

export function FaucetScreen() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"base" | "drip" | null>(null);
  const [result, setResult] = useState<FaucetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const dep = deployment();

  // Prefill: the browser wallet's account, else this device's burner wallet.
  useEffect(() => {
    let alive = true;
    const eth = ethereum();
    setHasWallet(!!eth);
    void (async () => {
      try {
        const accts = eth ? ((await eth.request({ method: "eth_accounts" })) as string[]) : [];
        if (accts?.[0]) {
          if (alive) setAddress((a) => a || accts[0]!);
          return;
        }
        if (isMock) return;
        const m = await getMRA();
        const a = m.wallet.address();
        if (alive && a) setAddress((cur) => cur || a);
      } catch {
        /* prefill is best effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const valid = ADDRESS_RE.test(address.trim());

  async function claim(drip: boolean) {
    setBusy(drip ? "drip" : "base");
    setError(null);
    setResult(null);
    try {
      if (!MRA_ENV.apiUrl) throw new Error("not_found");
      const r = await fetch(`${MRA_ENV.apiUrl.replace(/\/$/, "")}/demo/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(drip ? { address: address.trim(), drip: true } : { address: address.trim() }),
      });
      const body = (await r.json().catch(() => ({}))) as FaucetResult & { detail?: unknown };
      if (!r.ok) {
        const d = body.detail;
        throw new Error(typeof d === "string" ? d : r.status === 429 ? "ip_limit" : r.status === 422 ? "bad_address" : `http_${r.status}`);
      }
      setResult(body);
    } catch (e) {
      const code = e instanceof Error ? e.message : "error";
      setError(code === "Failed to fetch" ? "Couldn't reach the faucet. Check your connection and try again." : explain(code));
    } finally {
      setBusy(null);
    }
  }

  async function watch(symbol: "USDC" | "DRIP", tokenAddress: string) {
    try {
      await ethereum()?.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: tokenAddress, symbol, decimals: 6 } },
      });
      setAdded(symbol);
    } catch {
      /* the user said no */
    }
  }

  return (
    <LendShell width="narrow">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>Sepolia testnet</Label>
          <Heading level={1}>Get test tokens</Heading>
          <Text>Gas, test USDC and DripCoin (DRIP) for any wallet, so you can try the vault and DRIP trading.</Text>
        </div>

        <Banner tone="caution">Testnet only. Test USDC and DRIP have no value.</Banner>

        <Card gap="lg">
          <TextField
            label="Wallet address"
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            error={address && !valid ? "Enter a 0x address (42 characters)." : undefined}
            hint="Prefilled with your wallet. Paste any address."
          />
          <div className="flex flex-col gap-3 md:flex-row">
            <Button onClick={() => claim(false)} disabled={!valid || busy !== null} loading={busy === "base"}>
              Get gas + test USDC
            </Button>
            <Button variant="tonal" onClick={() => claim(true)} disabled={!valid || busy !== null} loading={busy === "drip"}>
              Also get 20 DRIP
            </Button>
          </div>
          {isMock ? <Text size="note" tone="muted">Demo mode: the faucet only runs on the Sepolia app.</Text> : null}

          {error ? <Banner tone="risk">{error}</Banner> : null}
          {result ? (
            <Banner tone="tint">
              <p className="font-semibold">
                {result.eth_tx || result.usdc_tx || result.drip_tx ? "Sent." : "This address already holds enough gas and test USDC."}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {result.eth_tx ? <TxLine label={`Gas (${(Number(result.eth_wei) / 1e18).toFixed(5)} ETH)`} hash={result.eth_tx} /> : null}
                {result.usdc_tx ? <TxLine label={`${result.usdc / 1e6} test USDC`} hash={result.usdc_tx} /> : null}
                {result.drip_tx ? <TxLine label={`DRIP (${(result.drip ?? 0) / 1e6} test USDC deposited)`} hash={result.drip_tx} /> : null}
              </ul>
              {result.drip_error ? <p className="mt-1">{explain(result.drip_error)}</p> : null}
            </Banner>
          ) : null}
        </Card>

        {hasWallet ? (
          <Card gap="sm">
            <Heading level={2} size="h2">Add to MetaMask</Heading>
            <Text size="note">Show the test tokens in your wallet.</Text>
            <div className="flex flex-col gap-3 md:flex-row">
              <Button variant="secondary" size="sm" onClick={() => watch("USDC", dep.USDC)}>Add USDC</Button>
              <Button variant="secondary" size="sm" onClick={() => watch("DRIP", dep.JuniorVault)}>Add DRIP</Button>
            </div>
            {added ? <Text size="note" tone="muted">{added} sent to your wallet.</Text> : null}
          </Card>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label>Next</Label>
          <TextLink href={routes.trade} arrow>Trade DRIP</TextLink>
          <TextLink href={routes.earn} arrow>Deposit in the vault</TextLink>
        </div>
      </div>
    </LendShell>
  );
}
