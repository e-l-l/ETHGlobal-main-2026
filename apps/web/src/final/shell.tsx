"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { routes } from "@/lib/routes";
import { setWorldView, useWorldView } from "@/lib/world-view";
import { Lockup } from "./brand";
import { ChevronLeftIcon, CrossIcon, EyeIcon } from "./icons";
import { Heading, Label, Text } from "./text";

/*
 * App chrome for every screen. One header, one page container, one action bar.
 *
 *   <AppHeader nav={…} active="home" />        sticky top bar; nav becomes a bottom tab bar on phones
 *   <Page width="narrow">                       task screens (forms, onboarding, pay): 560px column
 *   <Page>                                      dashboards: 1120px, use <Columns> inside
 *     <PageHead back=… label=… title=… />
 *     …
 *     <ActionBar>…</ActionBar>                  pinned to the bottom on phones, inline on desktop
 *   </Page>
 */

/* -------------------------------------------------------------- AppHeader */

export type NavItem = { key: string; label: string; href: string; icon?: ReactNode };

export function AppHeader({
  nav,
  active,
  home = routes.home,
  end,
  world = true,
  center,
  hideFrom,
}: {
  /** Hide the top bar from this width up, where a SideNav takes over. The phone tab bar still shows below md. */
  hideFrom?: "lg";
  nav?: NavItem[];
  /** Key of the active nav item. Omit to derive it from the URL (longest matching href). */
  active?: string;
  /** Where the logo goes. */
  home?: string;
  end?: ReactNode;
  /** Shows the "what the world sees" switch. */
  world?: boolean;
  /** Replaces the nav in the middle, e.g. onboarding step dots. */
  center?: ReactNode;
}) {
  const pathname = usePathname();
  const current =
    active ??
    nav
      ?.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key;
  const wv = useWorldView();

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 border-b border-hairline bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 motion-reduce:backdrop-blur-none",
          hideFrom === "lg" && "lg:hidden",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-4 px-4 md:px-8">
          <Link href={home} aria-label={`${APP_NAME} home`} className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal">
            <Lockup size={28} />
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            {center ??
              (nav ? (
                <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
                  {nav.map((n) => (
                    <Link
                      key={n.key}
                      href={n.href}
                      aria-current={n.key === current ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-md px-3.5 font-body text-note font-semibold transition-colors duration-150",
                        n.key === current ? "bg-well text-charcoal" : "text-charcoal-muted hover:bg-well hover:text-charcoal",
                      )}
                    >
                      {n.label}
                    </Link>
                  ))}
                </nav>
              ) : null)}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {end}
            {world ? <WorldToggle /> : null}
          </div>
        </div>
        {world && wv ? <WorldLegend /> : null}
      </header>
      {nav ? <TabBar nav={nav} current={current} /> : null}
    </>
  );
}

/** Phone tab bar. Fixed to the bottom; Page leaves room for it. */
function TabBar({ nav, current }: { nav: NavItem[]; current?: string }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-hairline bg-surface/90 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
    >
      {nav.map((n) => {
        const on = n.key === current;
        return (
          <Link
            key={n.key}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-[10px] font-body text-[12px] font-semibold select-none",
              on ? "text-charcoal [&_svg]:text-hunter" : "text-charcoal-muted",
            )}
          >
            {n.icon}
            {n.label}
            {on ? <span aria-hidden className="mt-0.5 h-0.75 w-4 rounded-full bg-lime ring-1 ring-hunter/30" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function WorldLegend() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-x-5 gap-y-1 px-4 pb-3 font-ledger text-ledger text-charcoal-soft md:px-8">
      <span className="inline-flex items-center gap-2">
        <i aria-hidden className="size-3 rounded-[3px] border-[1.5px] border-dashed border-hunter" />
        Onchain, anyone can see
      </span>
      <span className="inline-flex items-center gap-2">
        <i aria-hidden className="size-3 rounded-[3px] bg-[repeating-linear-gradient(-45deg,var(--color-well)_0_3px,var(--color-charcoal-muted)_3px_4px)]" />
        Private, only on this device
      </span>
    </div>
  );
}

/** Toggles the world view overlay on every screen (wrap public/private content in <WorldMark>). */
export function WorldToggle() {
  const wv = useWorldView();
  return (
    <button
      type="button"
      aria-pressed={wv}
      title="What the world sees: public onchain vs private on this device"
      onClick={() => setWorldView(!wv)}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 font-body text-note font-semibold transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal",
        wv ? "bg-hunter text-canvas" : "text-charcoal-soft hover:bg-well hover:text-charcoal",
      )}
    >
      <EyeIcon size={18} />
      <span className="sr-only sm:not-sr-only">World view</span>
    </button>
  );
}

/** ES / EN. Writes the cookie and re-renders on the server (see lib/lang.ts). */
export function LangToggle({ lang }: { lang: "en" | "es" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = lang === "es" ? "en" : "es";
  return (
    <button
      type="button"
      aria-label={lang === "es" ? "ES, switch to English" : "EN, cambiar a español"}
      aria-busy={pending || undefined}
      onClick={() => {
        document.cookie = `dj-lang=${next}; path=/; max-age=31536000; samesite=lax`;
        start(() => router.refresh());
      }}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 font-ledger text-ledger font-semibold text-charcoal-soft hover:bg-well hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
    >
      {lang.toUpperCase()}
    </button>
  );
}

/** Onboarding progress, shown in the header's centre slot. */
export function StepDots({ at, of, label }: { at: number; of: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex items-center gap-1.5">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={cn("h-1.5 w-7 rounded-full", i < at ? "bg-hunter" : "bg-track")} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Page */

export function Page({
  width = "wide",
  tabs,
  className,
  children,
}: {
  width?: "wide" | "narrow";
  /** Set when the header has nav, so content clears the phone tab bar. */
  tabs?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-10 md:px-8 md:pt-10 md:pb-16",
        width === "narrow" ? "max-w-[560px] md:px-0" : "max-w-[1120px]",
        tabs && "pb-28 md:pb-16",
        "animate-[page-in_240ms_var(--ease-snappy)_both] motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHead({
  back,
  backLabel = "Back",
  label,
  title,
  children,
  actions,
  size = "h1",
}: {
  back?: string;
  backLabel?: string;
  label?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons to the right of the title on desktop, under it on phones. */
  actions?: ReactNode;
  size?: "hero" | "h1";
}) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Link
          href={back}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-3 pl-1 font-body text-note font-semibold text-charcoal-soft hover:bg-well hover:text-charcoal"
        >
          <ChevronLeftIcon size={18} />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {label ? <Label>{label}</Label> : null}
          <Heading level={1} size={size}>
            {title}
          </Heading>
          {children ? <Text className="max-w-[60ch]">{children}</Text> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Two columns on desktop, one on phones (left column first). */
export function Columns({ ratio = "1:1", className, children }: { ratio?: "1:1" | "2:3" | "3:2" | "1:2"; className?: string; children: ReactNode }) {
  const cols = { "1:1": "md:grid-cols-2", "2:3": "md:grid-cols-[2fr_3fr]", "3:2": "md:grid-cols-[3fr_2fr]", "1:2": "md:grid-cols-[1fr_2fr]" }[ratio];
  return <div className={cn("grid grid-cols-1 items-start gap-6", cols, className)}>{children}</div>;
}

export function Stack({ gap = "md", className, children }: { gap?: "sm" | "md" | "lg"; className?: string; children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-col", { sm: "gap-3", md: "gap-4", lg: "gap-6" }[gap], className)}>{children}</div>;
}

/** The screen's next step. Pinned above the home indicator on phones; a plain row on desktop. */
export function ActionBar({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-auto flex flex-col gap-2 border-t border-hairline bg-canvas/90 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-xl",
        "md:static md:mx-0 md:mt-2 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
      )}
    >
      {hint ? <p className="font-body text-note text-charcoal-muted">{hint}</p> : null}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sheet */

/** Bottom sheet on phones, centred dialog on desktop. Radix handles focus, Escape and the scrim. */
export function Sheet({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-charcoal/40 data-[state=open]:animate-[fade-in_200ms_ease_both]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col gap-4 overflow-y-auto rounded-t-sheet border border-hairline bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] font-body text-charcoal shadow-lift",
            "data-[state=open]:animate-[sheet-up_320ms_var(--ease-drawer)_both]",
            "md:inset-auto md:top-1/2 md:left-1/2 md:w-[min(480px,calc(100vw-32px))] md:-translate-1/2 md:rounded-lg md:p-6 md:data-[state=open]:animate-[fade-in_200ms_ease_both]",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-h2 text-charcoal">{title}</Dialog.Title>
            <Dialog.Close className="-mt-2 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-charcoal-soft hover:bg-well" aria-label="Close">
              <CrossIcon size={18} />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="font-body text-read text-charcoal-soft">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------------------------------------------------------- SideNav */

/**
 * Desktop sidebar for apps with a home base (the merchant app). Shown from lg up; below that the
 * AppHeader (with hideFrom="lg") and its phone tab bar take over. Wrap the page in <SideNavLayout>.
 */
export function SideNav({
  nav,
  active,
  home,
  account,
  footer,
}: {
  nav: NavItem[];
  active?: string;
  home: string;
  /** Who is signed in: shop name and its public pseudonym. */
  account?: { name: string; id: string; initials: string };
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const current =
    active ??
    nav
      .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key;
  return (
    <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col gap-7 overflow-y-auto border-r border-hairline bg-surface px-4 py-7 lg:flex">
      <Link href={home} aria-label={`${APP_NAME} home`} className="w-fit rounded-md px-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal">
        <Lockup size={30} />
      </Link>
      {account ? (
        <div className="flex items-center gap-3 rounded-md bg-well p-3">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md bg-hunter font-display text-[15px] font-bold text-lime">
            {account.initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-body text-note font-semibold text-charcoal">{account.name}</span>
            <span className="truncate font-ledger text-[12px] text-charcoal-muted">{account.id}</span>
          </span>
        </div>
      ) : null}
      <nav aria-label="Sections" className="flex flex-col gap-1">
        {nav.map((n) => {
          const on = n.key === current;
          return (
            <Link
              key={n.key}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 font-body text-note font-semibold transition-colors duration-150 [&_svg]:size-5",
                on ? "bg-honeydew text-hunter" : "text-charcoal-soft hover:bg-well hover:text-charcoal",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-hairline pt-4">
        <WorldToggle />
        {footer}
      </div>
    </aside>
  );
}

/** Sidebar + content row. Content keeps using <Page>, which centres itself in the remaining width. */
export function SideNavLayout({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {side}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- SplitPage */

/**
 * Task screens (onboarding, checkout): a Hunter brand panel beside a focused form column.
 * Desktop: panel left (sticky, full height), form right. Phone: the panel becomes a short top block.
 *
 *   <SplitPage panel={<BrandPanel eyebrow="Step 1 of 4" title={<>Your sales <Accent>vouch for you.</Accent></>} />}>
 *     …form, ActionBar…
 *   </SplitPage>
 */
export function SplitPage({ panel, children, className }: { panel: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {panel}
      <main
        id="main"
        className={cn(
          "flex min-w-0 flex-1 justify-center px-4 pt-6 pb-10 md:px-10 md:py-14 lg:px-16",
          "animate-[page-in_240ms_var(--ease-snappy)_both] motion-reduce:animate-none",
          className,
        )}
      >
        <div className="flex w-full max-w-[480px] flex-col gap-6 md:my-auto">{children}</div>
      </main>
    </div>
  );
}

/** Lime emphasis inside a BrandPanel title. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-lime">{children}</span>;
}

/** The Hunter panel of a SplitPage: eyebrow, big headline, one line of body, the lime wave at the foot. */
export function BrandPanel({ eyebrow, title, body, top, children }: { eyebrow?: ReactNode; title: ReactNode; body?: ReactNode; top?: ReactNode; children?: ReactNode }) {
  return (
    <aside className="relative flex flex-col gap-5 overflow-hidden bg-hunter px-4 pt-5 text-canvas md:sticky md:top-16 md:h-[calc(100dvh-4rem)] md:w-[44%] md:max-w-[620px] md:shrink-0 md:gap-8 md:px-12 md:pt-12 lg:px-14">
      {top}
      <div className="flex flex-col gap-3 md:my-auto md:gap-5">
        {eyebrow ? <span className="font-ledger text-tag tracking-[0.1em] text-lime uppercase">{eyebrow}</span> : null}
        <h1 className="m-0 font-display text-hero-sm text-canvas md:text-[clamp(40px,4.4vw,64px)] md:leading-[1.02]">{title}</h1>
        {body ? <p className="m-0 hidden max-w-[46ch] font-body text-read text-honeydew md:block md:text-[17px]">{body}</p> : null}
        {children}
      </div>
      <svg viewBox="0 0 720 110" preserveAspectRatio="none" aria-hidden className="-mx-4 mt-auto block h-14 w-[calc(100%+2rem)] md:-mx-12 md:h-28 md:w-[calc(100%+6rem)] lg:-mx-14 lg:w-[calc(100%+7rem)]">
        <path d="M0 50 C90 0 180 100 270 50 S450 0 540 50 S690 100 760 50" fill="none" stroke="var(--color-lime)" strokeWidth="3" />
        <path d="M0 76 C90 26 180 126 270 76 S450 26 540 76 S690 126 760 76" fill="none" stroke="var(--color-lime)" strokeWidth="3" opacity="0.5" />
        <path d="M0 102 C90 52 180 152 270 102 S450 52 540 102 S690 152 760 102" fill="none" stroke="var(--color-lime)" strokeWidth="3" opacity="0.25" />
      </svg>
    </aside>
  );
}
