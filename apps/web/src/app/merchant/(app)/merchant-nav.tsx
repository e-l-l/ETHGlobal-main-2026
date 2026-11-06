"use client";

import { usePathname } from "next/navigation";
import { AppHeader, SideNav, TextLink, type IconProps, type NavItem } from "@/final";
import { shop } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";

/** Two-letter initials for the account chip. */
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "S";

const svg = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  focusable: "false",
  "aria-hidden": true,
} as const;

function HomeIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svg} width={size} height={size}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function AgentIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svg} width={size} height={size}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 4v4M9 13v2M15 13v2" />
    </svg>
  );
}

function QrIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svg} width={size} height={size}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v7h-4M14 21h.01" />
    </svg>
  );
}

function AdvanceIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svg} width={size} height={size}>
      <path d="M4 19h16M7 15V9M12 15V5M17 15v-3" />
    </svg>
  );
}

function CashOutIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svg} width={size} height={size}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

const nav: NavItem[] = [
  { key: "home", label: "Home", href: routes.merchant, icon: <HomeIcon /> },
  { key: "advance", label: "Advance", href: routes.advance.details, icon: <AdvanceIcon /> },
  { key: "agent", label: "Agent", href: routes.agent.log, icon: <AgentIcon /> },
  { key: "qr", label: "My QR", href: routes.myQr, icon: <QrIcon /> },
  { key: "cash", label: "Cash out", href: routes.cashOut, icon: <CashOutIcon /> },
];

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Agent and My QR own their prefixes; the world view and settings pages highlight nothing; the rest sits under Home. */
function activeKey(pathname: string): string {
  if (pathname === routes.worldView || within(pathname, routes.settings)) return "";
  return nav.find((n) => n.key !== "home" && within(pathname, n.href))?.key ?? "home";
}

/** Desktop sidebar (lg+). The top bar and phone tab bar come from MerchantNav. */
export function MerchantSideNav() {
  const pathname = usePathname();
  // The real shop (name + onchain pseudonym); the mock shop only fills the chip while it loads.
  const { data } = useMRA((m) => m.merchant.settings());
  const name = data?.shop.name ?? shop.name;
  const id = data?.shop.pseudonym ?? (data ? "" : "…");
  return (
    <SideNav
      nav={nav}
      active={activeKey(pathname)}
      home={routes.merchant}
      account={{ name, id, initials: initialsOf(name) }}
      footer={
        <>
          <TextLink href={routes.settings} className="min-h-11 px-3 text-note">
            Settings
          </TextLink>
          <TextLink href={routes.backup} className="min-h-11 px-3 text-note">
            Back up with World ID
          </TextLink>
          <TextLink href={routes.home} className="min-h-11 px-3 text-note">
            Switch role
          </TextLink>
        </>
      }
    />
  );
}

export function MerchantNav() {
  const pathname = usePathname();
  return (
    <AppHeader
      hideFrom="lg"
      nav={nav}
      active={activeKey(pathname)}
      home={routes.merchant}
      end={
        <>
          <TextLink href={routes.settings} className="min-h-11 px-3 text-note">
            Settings
          </TextLink>
          <span className="hidden md:inline-flex">
            <TextLink href={routes.home} className="min-h-11 px-3 text-note">
              Switch role
            </TextLink>
          </span>
        </>
      }
    />
  );
}
