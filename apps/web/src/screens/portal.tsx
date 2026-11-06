"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ActionBar, LinkButton, Main, Note, Screen, Stat, TopBar } from "@/jar/app";
import { Bars } from "@/jar/app-data";
import { Button, Pill } from "@/jar/controls";
import { routes, verifyingHref, type FailReason } from "@/lib/routes";

/*
 * Demo seller portal (X01–X02). A separate, deliberately unbranded site: neutral greys,
 * no dollarjar mark. It stands in for the marketplace the private check reads from.
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

export function PortalLogin() {
  const router = useRouter();
  const [key, setKey] = useState(ACCOUNTS[0]!.key);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const emailId = useId();
  const passId = useId();
  const a = account(key);

  return (
    <Screen mode="portal">
      <TopBar back={routes.prove} backLabel="Back to dollarjar" title={PORTAL} heading={false} world={false} />
      <Main tight>
        <div className="dj-stack" style={{ gap: 6 }}>
          <h1 className="app-display" style={{ fontSize: 28 }}>
            Log in
          </h1>
          <p className="dj-small">Seeded accounts for the demo. Each one ends in a different result.</p>
        </div>
        <div role="radiogroup" aria-label="Demo account" className="dj-stack" style={{ gap: 8 }}>
          {ACCOUNTS.map((acc) => (
            <label key={acc.key} className="app-pick">
              <input type="radio" name={name} value={acc.key} checked={key === acc.key} onChange={() => setKey(acc.key)} />
              <span className="app-pick__radio" aria-hidden />
              <span className="dj-stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{acc.name}</span>
                <span className="dj-small">{acc.shop}</span>
              </span>
              <Pill kind={acc.outcome ? "risk" : "saving"}>{acc.tag}</Pill>
            </label>
          ))}
        </div>
        <div className="app-stats">
          <div className="dj-stack" style={{ gap: 6, minWidth: 0 }}>
            <label className="dj-label" htmlFor={emailId}>
              Email
            </label>
            <input id={emailId} className="dj-input" type="email" value={a.email} readOnly autoComplete="username" style={{ fontWeight: 400, fontSize: 16 }} />
          </div>
          <div className="dj-stack" style={{ gap: 6, minWidth: 0 }}>
            <label className="dj-label" htmlFor={passId}>
              Password
            </label>
            <input id={passId} className="dj-input" type="password" value="demo-pass" readOnly autoComplete="current-password" />
          </div>
        </div>
      </Main>
      <ActionBar>
        <Button
          block
          loading={busy}
          loadingLabel="Logging in"
          onClick={() => {
            setBusy(true);
            window.setTimeout(() => router.push(`${routes.portal}?acct=${a.key}`), 600);
          }}
        >
          Log in as {a.name}
        </Button>
      </ActionBar>
    </Screen>
  );
}

export function PortalDashboard({ acct }: { acct?: string }) {
  const a = account(acct);
  return (
    <Screen mode="portal">
      <TopBar
        title={PORTAL}
        world={false}
        end={
          <Link href={routes.portalLogin} className="app-chip">
            Log out
          </Link>
        }
      />
      <Main tight enter="fade">
        <div className="dj-stack" style={{ gap: 2 }}>
          <span className="dj-label">Available · {a.name}</span>
          <span className="dj-balance">{a.balance}</span>
          <span className="dj-small">Selling since {a.since}</span>
        </div>
        {a.outcome === "suspended" ? <Note tone="risk">This account is suspended. Payouts are on hold.</Note> : null}
        <section className="dj-card" style={{ gap: 12 }}>
          <div className="dj-between">
            <span className="dj-label">Sales, last 12 weeks</span>
            <span className="dj-mono">{a.month} / mo</span>
          </div>
          <Bars values={a.weeks} label={`Weekly sales for ${a.name}, last 12 weeks`} />
        </section>
        <div className="app-stats">
          <Stat label="This month" value={a.month.replace("ARS ", "")} sub="ARS" />
          <Stat label="Account" value={a.outcome === "suspended" ? "Suspended" : "Active"} sub={`since ${a.since}`} />
        </div>
        <ul className="app-rows" aria-label="Latest transactions">
          {a.tx.map((t) => (
            <li key={t.what + t.when} className="app-row" style={{ cursor: "default", minHeight: 52 }}>
              <span className="app-row__body">
                <span className="app-row__title">{t.what}</span>
                <span className="app-row__sub">{t.when}</span>
              </span>
              <span className="app-row__end dj-mono">{t.amount}</span>
            </li>
          ))}
        </ul>
      </Main>
      <ActionBar hint="dollarjar asks for 4 facts: country, revenue band, months selling, standing. Not these rows.">
        <LinkButton href={verifyingHref(a.outcome)}>Share 4 facts privately</LinkButton>
      </ActionBar>
    </Screen>
  );
}
