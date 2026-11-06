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

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Agent and My QR own their prefixes; world view highlights nothing; every other merchant route is under Home. */
function activeKey(pathname: string): NavKey | undefined {
  if (pathname === routes.worldView) return undefined;
  return links.find((l) => l.key !== "home" && within(pathname, l.href))?.key ?? "home";
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
