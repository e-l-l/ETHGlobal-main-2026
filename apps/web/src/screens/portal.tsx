"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import {
  ActionBar,
  Accent,
  Banner,
  BrandPanel,
  Button,
  Card,
  ChevronLeftIcon,
  Heading,
  Label,
  Ledger,
  Page,
  Pill,
  SplitPage,
  Text,
  TextField,
} from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { routes, verifyingHref, type FailReason } from "@/lib/routes";

/*
 * Demo seller portal (S01–S02). A fictional third-party marketplace, deliberately NOT DripMoney:
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
    name: "Sharma General Store",
    shop: "Kirana store, 20 months selling",
    email: "sharmageneral@seller.demo",
    since: "Mar 2025",
    tag: "Passes",
    balance: "$1,240",
    month: "$3,400",
    weeks: [62, 70, 58, 81, 77, 90, 72, 95, 88, 101, 93, 110],
    tx: [
      { what: "Card sale", when: "14:32", amount: "+$10.00" },
      { what: "Transfer in", when: "11:48", amount: "+$22.00" },
      { what: "Supplier payout", when: "09:02", amount: "−$40.00" },
    ],
  },
  {
    key: "nuevo",
    name: "Verma Fresh Mart",
    shop: "Opened Aug 2026",
    email: "vermafresh@seller.demo",
    since: "Aug 2026",
    outcome: "too-new",
    tag: "Too new",
    balance: "$208",
    month: "$880",
    weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 22, 35, 41],
    tx: [{ what: "Card sale", when: "13:10", amount: "+$8.20" }],
  },
  {
    key: "sur",
    name: "Green Valley Stores",
    shop: "Payouts on hold",
    email: "greenvalley@seller.demo",
    since: "Jan 2024",
    outcome: "suspended",
    tag: "Suspended",
    balance: "$0",
    month: "$0",
    weeks: [80, 74, 66, 60, 41, 20, 0, 0, 0, 0, 0, 0],
    tx: [{ what: "Account suspended", when: "Oct 12", amount: "—" }],
  },
  {
    key: "norte",
    name: "Daily Needs",
    shop: "Small monthly sales",
    email: "dailyneeds@seller.demo",
    since: "May 2023",
    outcome: "revenue-low",
    tag: "Low sales",
    balance: "$96",
    month: "$320",
    weeks: [12, 9, 14, 10, 11, 8, 13, 9, 12, 10, 11, 9],
    tx: [{ what: "Card sale", when: "12:40", amount: "+$3.10" }],
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
      <div className="mx-auto flex h-14 w-full max-w-280 items-center justify-between gap-4 px-4 md:px-8">
        <span className="font-body text-read font-bold text-charcoal">
          {PORTAL}
        </span>
        <div className="flex items-center gap-2">
          {back ? (
            <Link
              href={routes.prove}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-body text-note font-semibold text-charcoal-soft hover:bg-well"
            >
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
  return (
    <Banner>
      This is a demo marketplace, not part of {APP_NAME}. {APP_NAME} reads it
      only to run a private check.
    </Banner>
  );
}

export function PortalLogin() {
  const router = useRouter();
  const [key, setKey] = useState(ACCOUNTS[0]!.key);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const a = account(key);

  return (
    <>
      <SplitPage
        panel={
          <BrandPanel
            blocks={{ seed: 13, calm: true }}
            logo={
              <Link
                href={routes.prove}
                className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-3 pl-1 font-body text-read font-semibold text-canvas hover:bg-canvas/10"
              >
                <ChevronLeftIcon size={18} />
                Back to {APP_NAME}
              </Link>
            }
            title={
              <>
                {PORTAL} <Accent>Log in.</Accent>
              </>
            }
            body="Pick a demo account. Each one ends in a different result."
          />
        }
      >
        <DemoBanner />
        <div className="flex flex-col gap-1.5">
          <Heading level={2} size="h1">Log in</Heading>
          <Text size="note">
            Seeded accounts for the demo. Each one ends in a different result.
          </Text>
        </div>
        <div
          role="radiogroup"
          aria-label="Demo account"
          className="flex flex-col gap-2"
        >
          {ACCOUNTS.map((acc) => (
            <label
              key={acc.key}
              className={cn(
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-charcoal",
                key === acc.key
                  ? "border-charcoal"
                  : "border-hairline hover:bg-well",
              )}
            >
              <input
                type="radio"
                name={name}
                value={acc.key}
                checked={key === acc.key}
                onChange={() => setKey(acc.key)}
                className="size-4.5 shrink-0 accent-charcoal"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-body text-read font-semibold text-charcoal">
                  {acc.name}
                </span>
                <span className="font-body text-note text-charcoal-muted">
                  {acc.shop}
                </span>
              </span>
              <Pill tone={acc.outcome ? "risk" : "locked"}>{acc.tag}</Pill>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            value={a.email}
            readOnly
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            value="demo-pass"
            readOnly
            autoComplete="current-password"
          />
        </div>
        <ActionBar>
          <Button
            className={neutralButton}
            loading={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(
                () => router.push(`${routes.portal}?acct=${a.key}`),
                600,
              );
            }}
          >
            Log in as {a.name}
          </Button>
        </ActionBar>
      </SplitPage>
    </>
  );
}

/** The sales line draws itself once, the area fades in, the last point pulses. Neutral greys: the portal is not DripMoney. */
function SalesChart({ values, label }: { values: number[]; label: string }) {
  const W = 480;
  const H = 150;
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) =>
      [(i / (values.length - 1)) * W, H - 8 - (v / max) * (H - 24)] as const,
  );
  const line = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const [, ly] = pts[pts.length - 1]!;
  return (
    <div className="relative min-h-40 flex-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full overflow-visible"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={H * g}
            y2={H * g}
            vectorEffect="non-scaling-stroke"
            className="stroke-hairline"
            strokeDasharray="3 5"
          />
        ))}
        <path
          d={area}
          className="fill-lime/45 motion-safe:animate-[fade-in_900ms_600ms_both]"
        />
        <path
          d={line}
          pathLength={1}
          fill="none"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-hunter motion-safe:animate-[draw_1100ms_var(--ease-snappy)_both]"
          style={{ strokeDasharray: 1, "--len": 1 } as CSSProperties}
        />
      </svg>
      <span
        aria-hidden
        className="absolute right-0 size-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-hunter motion-safe:animate-[fade-in_300ms_1.1s_both]"
        style={{ top: `${(ly / H) * 100}%` }}
      >
        <span className="absolute inset-0 rounded-full bg-hunter/40 motion-safe:animate-[pulse-ring_1.8s_1.2s_infinite]" />
      </span>
    </div>
  );
}

function Fact({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 font-body text-note text-charcoal">
      {children}
    </li>
  );
}

export function PortalDashboard({ acct }: { acct?: string }) {
  const a = account(acct);
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <PortalHeader
        end={
          <Link
            href={routes.portalLogin}
            className="inline-flex min-h-11 items-center rounded-md px-3 font-body text-note font-semibold text-charcoal-soft hover:bg-well"
          >
            Log out
          </Link>
        }
      />
      <main
        id="main"
        className="mx-auto flex min-h-0 w-full max-w-280 flex-1 flex-col gap-4 px-4 py-4 md:px-8 lg:py-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <Label>Available · {a.name}</Label>
            <span className="font-display text-amount text-charcoal tabular-nums">
              {a.balance}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={a.outcome === "suspended" ? "risk" : "locked"}>
              {a.outcome === "suspended" ? "Suspended" : "Active"}
            </Pill>
            <Text size="note" tone="muted">
              Selling since {a.since}
            </Text>
          </div>
        </div>
        {a.outcome === "suspended" ? (
          <Banner tone="risk">
            This account is suspended. Payouts are on hold.
          </Banner>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[55fr_45fr]">
          <Card as="section" className="min-h-0 justify-between">
            <div className="flex items-center justify-between gap-3">
              <Label>Sales, last 12 weeks</Label>
              <Ledger>{a.month} / mo</Ledger>
            </div>
            <SalesChart
              values={a.weeks}
              label={`Weekly sales for ${a.name}, last 12 weeks`}
            />
          </Card>
          <div className="hidden min-h-0 flex-col gap-3 md:flex">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface p-4">
                <Label>This month</Label>
                <span className="font-display text-h1 text-charcoal tabular-nums">
                  {a.month}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface p-4">
                <Label>Account</Label>
                <span className="font-display text-h1 text-charcoal">
                  {a.outcome === "suspended" ? "Suspended" : "Active"}
                </span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-lg border border-hairline bg-surface">
              <div className="px-5 pt-4">
                <Label>Latest transactions</Label>
              </div>
              <ul className="m-0 flex list-none flex-col p-0">
                {a.tx.map((t) => (
                  <li
                    key={t.what + t.when}
                    className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-2.5 first:border-t-0"
                  >
                    <span className="flex flex-col">
                      <span className="font-body text-note font-semibold text-charcoal">
                        {t.what}
                      </span>
                      <span className="font-body text-[12px] text-charcoal-muted">
                        {t.when}
                      </span>
                    </span>
                    <Ledger className="text-charcoal">{t.amount}</Ledger>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* The privacy promise, up front: what leaves this page, and what never does. */}
        <section
          aria-label="Privacy"
          className="grid grid-cols-1 gap-4 rounded-lg border border-hairline bg-well p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
        >
          <div className="flex flex-col gap-2">
            <Label>Shared, as ranges</Label>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0">
              <Fact>✓ Country</Fact>
              <Fact>✓ Revenue band</Fact>
              <Fact>✓ Months selling</Fact>
              <Fact>✓ Standing</Fact>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Never leaves this portal</Label>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-charcoal-muted">
              <Fact>✕ Your name</Fact>
              <Fact>✕ Sales rows</Fact>
              <Fact>✕ Customers</Fact>
              <Fact>✕ Balance</Fact>
            </ul>
          </div>
          <Button
            href={verifyingHref(a.outcome)}
            className={cn(neutralButton, "sm:min-w-56")}
          >
            Share 4 facts privately
          </Button>
        </section>
        <Text size="note" tone="muted" className="text-center">
          {APP_NAME} checks the four facts with a zero-knowledge proof on your
          phone. It never gets this page.
        </Text>
      </main>
    </div>
  );
}
