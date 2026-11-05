import { Accent } from "@/components/ui";
import type { ActivityItemProps } from "@/components/data";
import type { LossTier, EstimateTile } from "@/components/domain";
import { BoltIcon, ShieldIcon } from "@/components/icons";

/** Sample content for the gallery only. Real screens pass their own (i18n) strings. */
export const DEMO = {
  swatches: [
    ["paper", "bg-paper"],
    ["card", "bg-card"],
    ["subtle", "bg-subtle"],
    ["line", "bg-line"],
    ["line-strong", "bg-line-strong"],
    ["faint", "bg-faint"],
    ["ink", "bg-ink"],
    ["ink-soft", "bg-ink-soft"],
    ["muted", "bg-muted"],
    ["accent", "bg-accent"],
    ["accent-text", "bg-accent-text"],
    ["accent-tint", "bg-accent-tint"],
    ["accent-line", "bg-accent-line"],
    ["down", "bg-down"],
    ["down-tint", "bg-down-tint"],
    ["warn", "bg-warn"],
    ["warn-tint", "bg-warn-tint"],
  ] as const,

  progressSteps: [
    { label: "Reading your sales", status: "done" as const },
    { label: "Checking it privately", status: "active" as const, detail: "nobody can see the numbers" },
    { label: "Setting your limit", status: "todo" as const },
  ],

  fees: [
    { k: "Advance", v: "$100" },
    { k: "Flat fee · fixed", v: "$15" },
    { k: "You repay", v: "$115" },
    { k: "Slice of each sale", v: "10%" },
  ],

  settings: [
    { k: "Language", v: "English", href: "#data" },
    { k: "Agent", v: "Active", href: "#data" },
    { k: "Recovery", v: "Set", href: "#data" },
  ],

  table: {
    columns: [
      { key: "time", header: "Time" },
      { key: "side", header: "Side" },
      { key: "amount", header: "Amount", align: "right" as const },
      { key: "price", header: "Price", align: "right" as const },
    ] as const,
    rows: [
      { id: 1, time: "14:02", side: "Buy", amount: "1,200 jUSD", price: "$0.982" },
      { id: 2, time: "13:47", side: "Sell", amount: "300 jUSD", price: "$0.986" },
      { id: 3, time: "12:10", side: "Buy", amount: "5,000 jUSD", price: "$0.979" },
    ],
  },

  activity: [
    { time: "14:32", title: "Took $1.50 from a sale", reason: "10% of a $15 sale, as agreed.", kind: "accent" },
    { time: "11:05", title: "Slowed repayment", reason: "Sales were 40% below normal this week.", kind: "neutral" },
    { time: "Mon", title: "Flagged a quiet week", reason: "No penalty. We'll check again Friday.", kind: "warn", meta: "2026-11-02 09:14 UTC" },
    { time: "Sep 3", title: "Wrote off advance", reason: "No sales for 30 days.", kind: "down", meta: "tx 0x91c2…7a3e" },
  ] satisfies ActivityItemProps[],

  series: [10, 11, 10.6, 12, 12.4, 12.1, 13, 13.8, 13.2, 14, 14.6, 14.1, 15, 15.4, 15.1, 15.9, 16.2, 16, 13.4, 13.9, 14.3, 14.8, 15.1, 15.6, 15.4, 16, 16.4, 16.2, 16.9, 17.3],

  week: {
    days: [
      { you: 120, repay: 13 },
      { you: 160, repay: 18 },
      { you: 90, repay: 10 },
      { you: 0, repay: 0 },
      { you: 210, repay: 23 },
      { you: 260, repay: 29 },
      { you: 140, repay: 16 },
    ],
    dayLabels: ["M", "T", "W", "T", "F", "S", "S"],
    youLabel: "to you",
    repayLabel: "to repayment",
    ariaLabel: "Sales this week split between you and repayment; Saturday was the busiest day.",
  },

  amounts: [
    { value: "50", label: "$50" },
    { value: "100", label: "$100" },
    { value: "250", label: "$250", disabled: true, disabledReason: "$250 unlocks after 2 repaid advances" },
  ],

  languages: [
    { value: "en", label: "EN" },
    { value: "es", label: "ES" },
  ],

  destinations: [
    { value: "bank", title: "Bank account", description: "Arrives in about 1 hour.", icon: <ShieldIcon /> },
    { value: "cash", title: "Cash pickup", description: "Any partner shop nearby.", icon: <BoltIcon /> },
    { value: "off", title: "Unavailable option", description: "Disabled state.", disabled: true },
  ],

  merchantLinks: [
    { key: "home", label: "Home", href: "#layout" },
    { key: "agent", label: "Agent", href: "#layout" },
    { key: "qr", label: "My QR", href: "#layout" },
    { key: "settings", label: "Settings", href: "#layout" },
  ],

  lenderLinks: [
    { key: "earn", label: "Earn", href: "#layout" },
    { key: "deposit", label: "Deposit", href: "#layout" },
    { key: "position", label: "My position", href: "#layout" },
    { key: "junior", label: "Junior", href: "#layout" },
    { key: "trade", label: "Trade", href: "#layout" },
    { key: "protocol", label: "Protocol", href: "#layout" },
    { key: "risk", label: "Risk", href: "#layout" },
    { key: "explorer", label: "Explorer", href: "#layout" },
  ],

  onboardingSteps: ["Connect your sales", "Get your pass", "Set up payouts"],

  advance: {
    purpose: "Advance · stock",
    left: 69,
    total: 115,
    percentRepaid: 40,
    leftOfText: (t: string) => `left of ${t}`,
    etaText: "~23 days to go at this pace",
    href: "#domain",
    linkLabel: "details",
    progressLabel: "Repaid",
  },

  businessPass: {
    kind: "business" as const,
    title: "Business pass",
    privateTag: "private",
    facts: [
      { label: "Selling since", value: "2023" },
      { label: "Avg. week", value: "$1,100–1,400" },
      { label: "Sales days", value: "6 / 7" },
    ],
    footer: "Proven from your sales, privately. Nobody can see the numbers.",
  },

  standingPass: {
    kind: "standing" as const,
    title: "Standing pass",
    privateTag: "private",
    headline: "2 advances repaid on time",
    limit: "$250",
    footer: "Your limit grows each time you repay.",
  },

  tiers: [
    { label: "First advance", cap: "$50" },
    { label: "1 repaid · now", cap: "$100" },
    { label: "2 repaid", cap: "$250" },
    { label: "3 or more", cap: "$500" },
  ],

  sales: [
    { total: "ARS 15,000", time: "14:32", you: "13,500", repay: "1,500" },
    { total: "ARS 8,200", time: "13:10", you: "7,380", repay: "820" },
    { total: "ARS 22,000", time: "11:48", you: "19,800", repay: "2,200" },
  ],

  estimates: [
    { label: "Slow", value: "41d" },
    { label: "Normal", value: "23d" },
    { label: "Busy", value: "15d" },
  ] as [EstimateTile, EstimateTile, EstimateTile],

  permissions: {
    canTitle: "Your agent can",
    neverTitle: "It can never",
    can: ["Take the agreed slice of each sale", "Slow down in quiet weeks"],
    never: ["Touch the rest of your money", "Go past these limits", "Share who you are"],
  },

  waterfall: [
    { title: "Junior absorbs first", description: "Higher yield, first loss", amount: "$42,000" },
    { title: "Reserve", description: "Fees set aside", amount: "$8,400" },
    { title: "Senior", description: "Hit only after both are gone", amount: "$310,000" },
  ] as [LossTier, LossTier, LossTier],

  worldView: {
    publicTitle: "Public onchain",
    privateTitle: "Private on this device",
    publicItems: [
      { k: "Pseudonym", v: "shop_7f3a" },
      { k: "Advance", v: "$100" },
      { k: "Repaid", v: "40%" },
    ],
    privateItems: [
      { k: "Your name", v: "never collected" },
      { k: "Individual sales", v: "this phone only" },
      { k: "Weekly total", v: "$1,240" },
    ],
  },

  heroTitle: (
    <>
      Today at your <Accent>shop</Accent>.
    </>
  ),
};
