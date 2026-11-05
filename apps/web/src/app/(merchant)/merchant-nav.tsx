"use client";

import { usePathname } from "next/navigation";
import { MerchantHeader, type NavLink } from "@/components/layout";
import { routes } from "@/lib/routes";

type NavKey = "home" | "agent" | "qr";

const links: NavLink<NavKey>[] = [
  { key: "home", label: "Home", href: routes.home },
  { key: "agent", label: "Agent", href: routes.agent.log },
  { key: "qr", label: "My QR", href: routes.myQr },
];

/** Which nav tab owns each route prefix. Anything else (e.g. /world-view) highlights nothing. */
const sections: [prefix: string, key: NavKey][] = [
  [routes.agent.log, "agent"],
  [routes.home, "home"],
  [routes.advance.details, "home"],
  [routes.week, "home"],
  [routes.cashOut, "home"],
  [routes.repaid, "home"],
];

function activeKey(pathname: string): NavKey | undefined {
  return sections.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
}

/** MerchantHeader with the active tab and world-view state taken from the URL. */
export function MerchantNav() {
  const pathname = usePathname();
  const onWorldView = pathname === routes.worldView;
  return (
    <MerchantHeader
      links={links}
      active={activeKey(pathname)}
      brandHref={routes.home}
      worldView={{
        label: "world view",
        href: onWorldView ? routes.home : routes.worldView,
        pressed: onWorldView,
      }}
    />
  );
}
