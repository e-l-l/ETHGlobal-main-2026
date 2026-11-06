import { routes } from "@/lib/routes";

export type ScreenEntry = {
  canvas: string;
  title: string;
  href: string;
  note: string;
};

export const personB: { group: string; screens: ScreenEntry[] }[] = [
  {
    group: "Customer",
    screens: [
      { canvas: "C01", title: "Pay", href: routes.pay, note: "No mention of the advance" },
      { canvas: "C02", title: "Paid", href: routes.paid, note: "Receipt" },
    ],
  },
  {
    group: "Lender and public",
    screens: [
      { canvas: "L01", title: "Earn", href: routes.earn, note: "Senior untouched after a write-off" },
      { canvas: "L02", title: "Deposit", href: routes.deposit, note: "Simulated wallet steps" },
      { canvas: "L03", title: "Position", href: routes.position, note: "Shares and earnings" },
      { canvas: "J01", title: "Junior", href: routes.junior, note: "First loss" },
      { canvas: "J02", title: "Mint", href: routes.mint, note: "Mint or redeem" },
      { canvas: "J03", title: "Trade", href: routes.trade, note: "Junior / USDC" },
      { canvas: "P02", title: "Protocol", href: routes.protocol, note: "Public totals" },
      { canvas: "P03", title: "Risk", href: routes.risk, note: "Limits only move down" },
      { canvas: "P04", title: "Explorer", href: routes.explorer, note: "No identity" },
    ],
  },
  {
    group: "Vendora portal",
    screens: [
      { canvas: "S01", title: "Portal login", href: routes.portalLogin, note: "Seeded seller accounts" },
      { canvas: "S02", title: "Portal dashboard", href: routes.portal, note: "The page a proof would read" },
    ],
  },
];
