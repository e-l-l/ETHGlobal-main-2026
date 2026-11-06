import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Accent, AppHeader, ArrowRightIcon, BoltIcon, EyeIcon, Heading, JarMark, Label, Text, TextLink } from "@/final";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Choose your side" };

/* The /home role picker: what DripMoney is in one line, then one card per role and how the money moves. */

function RoleCard({ href, icon, title, body, cta }: { href: string; icon: ReactNode; title: string; body: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-64 flex-col gap-4 rounded-lg border border-hairline bg-surface p-5 text-charcoal transition-colors duration-150 hover:border-hunter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal md:p-6"
    >
      <span aria-hidden className="grid size-12 place-items-center rounded-md bg-hunter text-lime">
        {icon}
      </span>
      <span className="flex flex-col gap-2">
        <span className="font-display text-h2 text-charcoal">{title}</span>
        <span className="font-body text-read text-charcoal-soft">{body}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1.5 font-body text-read font-semibold text-hunter">
        {cta}
        <ArrowRightIcon size={18} className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

function FlowStep({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <li
      className={
        strong
          ? "flex min-h-11 items-center rounded-md bg-hunter px-3.5 py-2 font-body text-note font-semibold text-canvas"
          : "flex min-h-11 items-center rounded-md bg-surface px-3.5 py-2 font-body text-note font-semibold text-charcoal ring-1 ring-hairline ring-inset"
      }
    >
      {children}
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden className="flex items-center text-charcoal-muted">
      <ArrowRightIcon size={18} className="rotate-90 md:rotate-0" />
    </li>
  );
}

export default function Page_() {
  return (
    <>
      <AppHeader home={routes.home} />
      <main id="main" className="flex flex-1 flex-col animate-[page-in_240ms_var(--ease-snappy)_both] motion-reduce:animate-none">
        <section className="relative overflow-hidden bg-hunter text-canvas">
          <div className="mx-auto flex w-full max-w-280 flex-col gap-4 px-4 pt-10 md:px-8 md:pt-16">
            <h1 className="m-0 max-w-[20ch] font-display text-hero-sm text-canvas md:text-[clamp(44px,5vw,72px)] md:leading-[1.02]">
              QR payments for small shops. <Accent>Advances paid back by every sale.</Accent>
            </h1>
            <p className="m-0 max-w-[56ch] font-body text-read text-honeydew md:text-[18px]">
              Customers pay a shop&apos;s QR. A contract splits the payment. Lenders fund the advances and earn the fee.
            </p>
          </div>
          <svg viewBox="0 0 720 110" preserveAspectRatio="none" aria-hidden className="mt-6 block h-16 w-full md:mt-10 md:h-24">
            <path d="M0 50 C90 0 180 100 270 50 S450 0 540 50 S690 100 760 50" fill="none" stroke="var(--color-lime)" strokeWidth="3" />
            <path d="M0 76 C90 26 180 126 270 76 S450 26 540 76 S690 126 760 76" fill="none" stroke="var(--color-lime)" strokeWidth="3" opacity="0.5" />
            <path d="M0 102 C90 52 180 152 270 102 S450 52 540 102 S690 152 760 102" fill="none" stroke="var(--color-lime)" strokeWidth="3" opacity="0.25" />
          </svg>
        </section>

        <div className="mx-auto flex w-full max-w-280 flex-col gap-10 px-4 pt-8 pb-12 md:px-8 md:pt-12 md:pb-16">
          <section aria-labelledby="roles" className="flex flex-col gap-4">
            <Heading level={2} size="h1" id="roles">
              Choose your side
            </Heading>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
              <RoleCard
                href={routes.welcome}
                icon={<JarMark size={28} on="dark" lit={2} />}
                title="I run a shop"
                body="Take payments by QR in dollars (USDC). Get small dollar advances for stock, paid back from your sales."
                cta="Start as a merchant"
              />
              <RoleCard
                href={routes.earn}
                icon={<BoltIcon size={24} />}
                title="I want to lend"
                body="Deposit USDC in the vault and earn from advance fees. Or hold DripCoin for more yield and more risk."
                cta="Open the vault"
              />
              <RoleCard
                href={routes.protocol}
                icon={<EyeIcon size={24} />}
                title="Show me the numbers"
                body="Public dashboard, live risk status and an explorer. Real numbers, no names."
                cta="See the protocol"
              />
            </div>
          </section>

          <section aria-labelledby="flow" className="flex flex-col gap-4 rounded-lg bg-well p-5 md:p-6">
            <Label as="h2" id="flow">
              How the money moves
            </Label>
            <ol className="m-0 flex list-none flex-col items-start gap-2 p-0 md:flex-row md:flex-wrap md:items-center">
              <FlowStep>Customer scans the QR</FlowStep>
              <Arrow />
              <FlowStep>Customer pays in USDC</FlowStep>
              <Arrow />
              <FlowStep>Contract splits it</FlowStep>
              <Arrow />
              <FlowStep strong>92% to the shop</FlowStep>
              <FlowStep strong>8% repays the advance, to the vault and lenders</FlowStep>
            </ol>
          </section>

          <Text className="text-center">
            Paying a shop? Scan its QR, or{" "}
            <TextLink href={routes.pay} arrow>
              preview the checkout
            </TextLink>
          </Text>
        </div>
      </main>
    </>
  );
}
