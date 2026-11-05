import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { truncateAddress } from "@/lib/format";
import { EyeIcon } from "@/components/icons";

export type NavLink<K extends string = string> = { key: K; label: ReactNode; href: string };

/* ------------------------------------------------------------------ Brand */

export type BrandProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  href?: string;
  /** Defaults to APP_NAME. */
  name?: ReactNode;
};

export function Brand({ href, name = APP_NAME, className, ...props }: BrandProps) {
  const inner = (
    <>
      <span aria-hidden className="size-2.5 shrink-0 bg-accent" />
      <span className="font-mono text-eyebrow tracking-[0.02em] text-fg">{name}</span>
    </>
  );
  const cls = cn("inline-flex items-center gap-2", className);
  if (href) {
    return (
      <Link href={href} className={cn(cls, "min-h-11")}>
        {inner}
      </Link>
    );
  }
  return (
    <span className={cls} {...props}>
      {inner}
    </span>
  );
}

/* ------------------------------------------------------- WorldViewToggle */

export type WorldViewToggleProps = Omit<ComponentPropsWithoutRef<typeof Link>, "children"> & {
  label: ReactNode;
  pressed?: boolean;
};

/** Pill link to the P01 "world view". `pressed` = currently viewing it. */
export function WorldViewToggle({ label, pressed, className, ...props }: WorldViewToggleProps) {
  return (
    <Link
      aria-current={pressed ? "page" : undefined}
      className={cn(
        "hit-target inline-flex h-9 items-center gap-1.5 rounded-pill border px-3 font-mono text-chip",
        pressed ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-card text-ink hover:border-ink",
        className,
      )}
      {...props}
    >
      <EyeIcon size={15} />
      {label}
    </Link>
  );
}

/* -------------------------------------------------------------- HeaderNav */

type HeaderNavProps<K extends string> = {
  links: NavLink<K>[];
  active?: K;
  label: string;
  className?: string;
  listClassName?: string;
  linkClassName?: string;
};

/** Tab-style nav row shared by MerchantHeader and LenderHeader. */
function HeaderNav<K extends string>({ links, active, label, className, listClassName, linkClassName }: HeaderNavProps<K>) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={cn("flex gap-5", listClassName)}>
        {links.map((l) => {
          const isActive = l.key === active;
          return (
            <li key={l.key}>
              <Link
                href={l.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 text-small",
                  isActive ? "border-accent font-semibold text-fg" : "border-transparent text-fg-soft hover:text-fg",
                  linkClassName,
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------------------------------- MerchantHeader */

export type MerchantHeaderProps<K extends string = string> = {
  links: NavLink<K>[];
  active?: K;
  worldView: { label: ReactNode; href: string; pressed?: boolean };
  brandHref?: string;
  navLabel?: string;
  className?: string;
};

export function MerchantHeader<K extends string>({
  links,
  active,
  worldView,
  brandHref,
  navLabel = "Main",
  className,
}: MerchantHeaderProps<K>) {
  return (
    <header className={cn("border-b border-line bg-card", className)}>
      <div className="mx-auto flex max-w-app flex-col px-4 md:flex-row md:items-center md:gap-8 md:px-5">
        <div className="flex h-14 items-center justify-between gap-4 md:contents">
          <Brand href={brandHref} />
          <WorldViewToggle className="md:order-last md:ml-auto" {...worldView} />
        </div>
        <HeaderNav
          links={links}
          active={active}
          label={navLabel}
          linkClassName="-mb-px md:h-14"
          className="-mx-4 border-t border-line px-4 md:mx-0 md:border-t-0 md:px-0"
        />
      </div>
    </header>
  );
}

/* ----------------------------------------------------------- WalletButton */

export type WalletButtonProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  /** Connected address; when absent, `connectLabel` is shown. */
  address?: string;
  connectLabel?: ReactNode;
};

export function WalletButton({ address, connectLabel, className, ...props }: WalletButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3.5 font-mono text-mono",
        address ? "border-line-strong bg-card text-ink hover:border-ink" : "border-transparent bg-ink text-on-ink",
        className,
      )}
      {...props}
    >
      {address ? (
        <>
          <span aria-hidden className="size-2 rounded-pill bg-accent-text" />
          {truncateAddress(address)}
        </>
      ) : (
        connectLabel
      )}
    </button>
  );
}

/* ----------------------------------------------------------- LenderHeader */

export type LenderHeaderProps<K extends string = string> = {
  links: NavLink<K>[];
  active?: K;
  /** Right slot, usually a <WalletButton>. */
  wallet?: ReactNode;
  brandHref?: string;
  navLabel?: string;
  className?: string;
};

export function LenderHeader<K extends string>({
  links,
  active,
  wallet,
  brandHref,
  navLabel = "Main",
  className,
}: LenderHeaderProps<K>) {
  return (
    <header className={cn("border-b border-line bg-paper", className)}>
      <div className="mx-auto flex max-w-app flex-col px-4 md:flex-row md:items-center md:gap-8 md:px-5">
        <div className="flex h-16 items-center justify-between gap-4 md:contents">
          <Brand href={brandHref} />
          <div className="md:order-last md:ml-auto">{wallet}</div>
        </div>
        {/* Mobile: one horizontally scrollable row with fade edges. */}
        <HeaderNav
          links={links}
          active={active}
          label={navLabel}
          linkClassName="md:h-16"
          listClassName="whitespace-nowrap"
          className={cn(
            "-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0",
            "[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)] md:[mask-image:none]",
          )}
        />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------- PayHeader */

export type PayHeaderProps = Omit<ComponentPropsWithoutRef<"header">, "children"> & {
  shopName: ReactNode;
  initials: string;
  sub?: ReactNode;
};

export function PayHeader({ shopName, initials, sub, className, ...props }: PayHeaderProps) {
  return (
    <header className={cn("flex items-center gap-3", className)} {...props}>
      <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-ink text-small font-semibold text-on-ink">
        {initials}
      </span>
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{shopName}</span>
        {sub ? <span className="font-mono text-chip text-muted">{sub}</span> : null}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------- DevNotice */

export function DevNotice({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div role="note" className={cn("bg-warn-tint px-4 py-1.5 text-center font-mono text-chip text-warn", className)} {...props}>
      {children}
    </div>
  );
}
