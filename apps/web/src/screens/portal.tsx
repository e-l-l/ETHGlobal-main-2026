"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { ActionBar, Banner, Button, Card, ChevronLeftIcon, Heading, Label, Ledger, ListRow, Page, Pill, RowList, StatGrid, Text, TextField } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { routes, verifyingHref, type FailReason } from "@/lib/routes";

/*
 * Demo seller portal (S01–S02). A fictional third-party marketplace, deliberately NOT DripMoni:
 * plain neutral header, no logo, no brand colours. It stands in for the site the private check reads from.
 */

type Account = {
  key: string;
  name: string;
  shop: string;
  email: string;
  since: string;
  outcome?: FailReason;
  tag: string;
  balance: string;
  month: string;
  weeks: number[];
  tx: { what: string; when: string; amount: string }[];
};

const ACCOUNTS: Account[] = [
  {
    key: "luna",
    name: "Luna",
    shop: "Kiosk, 20 months selling",
    email: "luna@seller.demo",
    since: "Mar 2025",
    tag: "Passes",
    balance: "ARS 1.252.400",
    month: "ARS 3.434.000",
    weeks: [62, 70, 58, 81, 77, 90, 72, 95, 88, 101, 93, 110],
    tx: [
      { what: "Card sale", when: "14:32", amount: "+ARS 10.100" },
      { what: "Transfer in", when: "11:48", amount: "+ARS 22.000" },
      { what: "Supplier payout", when: "09:02", amount: "−ARS 40.000" },
    ],
  },
  {
    key: "nuevo",
    name: "Tomás",
    shop: "Opened Aug 2026",
    email: "tomas@seller.demo",
    since: "Aug 2026",
    outcome: "too-new",
    tag: "Too new",
    balance: "ARS 210.300",
    month: "ARS 890.000",
    weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 22, 35, 41],
    tx: [{ what: "Card sale", when: "13:10", amount: "+ARS 8.200" }],
  },
  {
    key: "sur",
    name: "Río Sur",
    shop: "Payouts on hold",
    email: "riosur@seller.demo",
    since: "Jan 2024",
    outcome: "suspended",
    tag: "Suspended",
    balance: "ARS 0",
    month: "ARS 0",
    weeks: [80, 74, 66, 60, 41, 20, 0, 0, 0, 0, 0, 0],
    tx: [{ what: "Account suspended", when: "Oct 12", amount: "—" }],
  },
  {
    key: "norte",
    name: "Kiosco Norte",
    shop: "Small monthly sales",
    email: "norte@seller.demo",
    since: "May 2023",
    outcome: "revenue-low",
    tag: "Low sales",
    balance: "ARS 96.500",
    month: "ARS 320.000",
    weeks: [12, 9, 14, 10, 11, 8, 13, 9, 12, 10, 11, 9],
    tx: [{ what: "Card sale", when: "12:40", amount: "+ARS 3.100" }],
  },
];

function account(key?: string) {
  return ACCOUNTS.find((a) => a.key === key) ?? ACCOUNTS[0]!;
}

const PORTAL = "Demo Seller Portal";

const neutralButton = "bg-charcoal hover:bg-charcoal-soft";

function PortalHeader({ back, end }: { back?: boolean; end?: ReactNode }) {
  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-4 px-4 md:px-8">
        <span className="font-body text-read font-bold text-charcoal">{PORTAL}</span>
        <div className="flex items-center gap-2">
          {back ? (
            <Link href={routes.prove} className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-body text-note font-semibold text-charcoal-soft hover:bg-well">
              <ChevronLeftIcon size={16} />
              Back to {APP_NAME}
            </Link>
          ) : null}
          {end}
        </div>
      </div>
    </header>
  );
}

function DemoBanner() {
  return <Banner>This is a demo marketplace, not part of {APP_NAME}. {APP_NAME} reads it only to run a private check.</Banner>;
}

export function PortalLogin() {
  const router = useRouter();
  const [key, setKey] = useState(ACCOUNTS[0]!.key);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const a = account(key);

  return (
    <>
      <PortalHeader back />
      <Page width="narrow">
        <DemoBanner />
        <div className="flex flex-col gap-1.5">
          <Heading level={1}>Log in</Heading>
          <Text size="note">Seeded accounts for the demo. Each one ends in a different result.</Text>
        </div>
        <div role="radiogroup" aria-label="Demo account" className="flex flex-col gap-2">
          {ACCOUNTS.map((acc) => (
            <label
              key={acc.key}
              className={cn(
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-charcoal",
                key === acc.key ? "border-charcoal" : "border-hairline hover:bg-well",
              )}
            >
              <input type="radio" name={name} value={acc.key} checked={key === acc.key} onChange={() => setKey(acc.key)} className="size-4.5 shrink-0 accent-charcoal" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-body text-read font-semibold text-charcoal">{acc.name}</span>
                <span className="font-body text-note text-charcoal-muted">{acc.shop}</span>
              </span>
              <Pill tone={acc.outcome ? "risk" : "locked"}>{acc.tag}</Pill>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <TextField label="Email" type="email" value={a.email} readOnly autoComplete="username" />
          <TextField label="Password" type="password" value="demo-pass" readOnly autoComplete="current-password" />
        </div>
        <ActionBar>
          <Button
            className={neutralButton}
            loading={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => router.push(`${routes.portal}?acct=${a.key}`), 600);
            }}
          >
            Log in as {a.name}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}

function WeeklyBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <div role="img" aria-label={label} className="flex h-32 items-end gap-1.5">
      {values.map((v, i) => (
        <span key={i} className="flex-1 rounded-t-[3px] bg-charcoal-muted" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function PortalDashboard({ acct }: { acct?: string }) {
  const a = account(acct);
  return (
    <>
      <PortalHeader
        end={
          <Link href={routes.portalLogin} className="inline-flex min-h-11 items-center rounded-md px-3 font-body text-note font-semibold text-charcoal-soft hover:bg-well">
            Log out
          </Link>
        }
      />
      <Page>
        <DemoBanner />
        <div className="flex flex-col gap-1">
          <Label>Available · {a.name}</Label>
          <span className="font-display text-amount text-charcoal tabular-nums">{a.balance}</span>
          <Text size="note" tone="muted">
            Selling since {a.since}
          </Text>
        </div>
        {a.outcome === "suspended" ? <Banner tone="risk">This account is suspended. Payouts are on hold.</Banner> : null}
        <Card as="section">
          <div className="flex items-center justify-between gap-3">
            <Label>Sales, last 12 weeks</Label>
            <Ledger>{a.month} / mo</Ledger>
          </div>
          <WeeklyBars values={a.weeks} label={`Weekly sales for ${a.name}, last 12 weeks`} />
        </Card>
        <StatGrid
          items={[
            { label: "This month", value: a.month.replace("ARS ", ""), sub: "ARS" },
            { label: "Account", value: a.outcome === "suspended" ? "Suspended" : "Active", sub: `since ${a.since}` },
          ]}
        />
        <RowList label="Latest transactions">
          {a.tx.map((t) => (
            <ListRow key={t.what + t.when} title={t.what} sub={t.when} end={<Ledger className="text-charcoal">{t.amount}</Ledger>} />
          ))}
        </RowList>
        <ActionBar hint={`${APP_NAME} asks for 4 facts: country, revenue band, months selling, standing. Not these rows.`}>
          <Button href={verifyingHref(a.outcome)} className={neutralButton}>
            Share 4 facts privately
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}
