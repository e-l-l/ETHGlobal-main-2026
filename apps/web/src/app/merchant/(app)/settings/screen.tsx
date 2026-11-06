"use client";

import { useEffect, useState } from "react";
import type { HumanStatusView } from "@repo/sdk";
import { Button, Card, Columns, CopyHash, KeyValue, Page, PageHead, Pill, Stack, Text } from "@/final";
import { CURRENCIES, setCurrency, useCurrency, type CurrencyCode } from "@/lib/currency";
import { isMock, withMRA } from "@/lib/mra";
import { routes, worldIdHref } from "@/lib/routes";
import { shop } from "@/lib/mock/shop";
import { CardTitle, DarkBlock, HeroLabel } from "../../_ui";

/** This device's burner wallet and the shop's World ID status, read once on mount. */
function useDeviceFacts() {
  const [wallet, setWallet] = useState<string | undefined>();
  const [human, setHuman] = useState<HumanStatusView | undefined>();
  useEffect(() => {
    let alive = true;
    void withMRA(async (m) => {
      const address = m.wallet.address();
      const status = await m.onboarding.humanStatus().catch(() => undefined);
      if (!alive) return;
      setWallet(address);
      setHuman(status);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return { wallet, human };
}

export function SettingsScreen() {
  const cur = useCurrency();
  const { wallet, human } = useDeviceFacts();
  const walletLabel = isMock ? "0x12…ab" : "Not set up yet";
  const worldRows: [string, string][] = human
    ? [
        ["Unique person", human.humanVerified ? "Verified ✓" : "Not verified"],
        ["What we keep", "An anonymous code only"],
        ["Advances", human.banned ? "Off for this World ID" : human.humanVerified ? "Available" : "After World ID"],
      ]
    : [
        ["Unique person", "Checking…"],
        ["What we keep", "An anonymous code only"],
      ];
  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label={`${shop.name} · ${shop.id}`} title="Settings">
        Saved on this device only.
      </PageHead>

      <Columns ratio="3:2">
        <Stack>
          <Card padding="lg">
            <CardTitle end={<Pill tone="saving">Demo network</Pill>}>This phone</CardTitle>
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-well px-4 py-3 font-body">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-read font-semibold text-charcoal">
                  Your device wallet{wallet ? null : <> <span className="font-ledger text-note">{walletLabel}</span></>}
                </span>
                <span className="text-note text-charcoal-muted">funded by demo faucet · made on this phone, no wallet app needed</span>
              </div>
              {wallet ? <CopyHash value={wallet} short /> : null}
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-3 font-body sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col">
                <label htmlFor="local-currency" className="text-read font-semibold text-charcoal">
                  Local currency
                </label>
                <span id="local-currency-hint" className="text-note text-charcoal-muted">
                  {cur.dollarsOnly ? "Only dollars are shown." : `Shown next to dollars. Example rate: ${cur.rateLine}.`}
                </span>
              </div>
              <div className="relative w-full sm:w-64 sm:shrink-0">
                <select
                  id="local-currency"
                  aria-describedby="local-currency-hint"
                  value={cur.code}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="min-h-12 w-full cursor-pointer appearance-none truncate rounded-md border border-control bg-surface py-2.5 pr-10 pl-3.5 font-body text-read font-semibold text-charcoal transition-colors duration-150 hover:border-charcoal-muted focus-visible:border-hunter focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-hunter"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-charcoal-muted"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <CardTitle>World ID</CardTitle>
            <KeyValue rows={worldRows} />
            {human && !human.humanVerified && !human.banned ? (
              <Button href={worldIdHref({ bind: true })} variant="secondary" width="auto">
                Verify with World ID
              </Button>
            ) : null}
          </Card>
        </Stack>
        <Stack>
          <DarkBlock>
            <HeroLabel>Not backed up yet</HeroLabel>
            <h2 className="m-0 font-display text-h2 text-canvas">Lose this phone, keep your shop.</h2>
            <Text className="text-honeydew">
              Your passes and shop key live only on this phone. Back them up, locked with a passphrase and your World ID.
            </Text>
            <Button href={routes.backup} variant="lime">
              Back up with World ID
            </Button>
          </DarkBlock>
          <Button href={routes.restore} variant="secondary">
            Restore on this phone
          </Button>
        </Stack>
      </Columns>
    </Page>
  );
}
