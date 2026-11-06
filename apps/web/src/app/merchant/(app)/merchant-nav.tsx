"use client";

import { usePathname } from "next/navigation";
import { AppHeader, TextLink, type IconProps, type NavItem } from "@/final";
import { routes } from "@/lib/routes";

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

const nav: NavItem[] = [
  { key: "home", label: "Home", href: routes.merchant, icon: <HomeIcon /> },
  { key: "agent", label: "Agent", href: routes.agent.log, icon: <AgentIcon /> },
  { key: "qr", label: "My QR", href: routes.myQr, icon: <QrIcon /> },
];

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Agent and My QR own their prefixes; the world view page highlights nothing; the rest sits under Home. */
function activeKey(pathname: string): string {
  if (pathname === routes.worldView) return "";
  return nav.find((n) => n.key !== "home" && within(pathname, n.href))?.key ?? "home";
}

export function MerchantNav() {
  const pathname = usePathname();
  return (
    <AppHeader
      nav={nav}
      active={activeKey(pathname)}
      home={routes.merchant}
      end={
        <span className="hidden md:inline-flex">
          <TextLink href={routes.home} className="min-h-11 px-3 text-note">
            Switch role
          </TextLink>
        </span>
      }
    />
  );
}
