"use client";

import { Card, Page, PageHead, SettingRow, Stack, TextLink } from "@/final";
import { CURRENCIES, setCurrency, useCurrency, type CurrencyCode } from "@/lib/currency";
import { routes } from "@/lib/routes";

export function SettingsScreen() {
  const cur = useCurrency();
  return (
    <Page tabs width="narrow">
      <PageHead back={routes.merchant} backLabel="Home" title="Settings">
        Saved on this device only.
      </PageHead>

      <Stack>
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

        <Card>
          <SettingRow title="Back up with World ID" hint="Keep your passes safe if you lose this phone.">
            <TextLink href={routes.backup} className="min-h-11 shrink-0 text-note">
              Open
            </TextLink>
          </SettingRow>
        </Card>
      </Stack>
    </Page>
  );
}
