import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, BoltIcon, BrandPanel, EyeIcon, Heading, JarMark, SplitPage, TextLink } from "@/final";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Choose your side" };

/** Mint and lime washes over the canvas, with a faint dot grid. Fixed to the page so it holds still while the content moves. */
const BACKDROP =
  "radial-gradient(60% 46% at 12% 0%, rgb(198 242 140 / 0.42), transparent 62%), " +
  "radial-gradient(52% 44% at 92% 8%, rgb(140 205 180 / 0.42), transparent 62%), " +
  "radial-gradient(70% 50% at 50% 104%, rgb(198 242 140 / 0.30), transparent 65%), " +
  "radial-gradient(rgb(45 90 61 / 0.10) 1px, transparent 1.4px), " +
  "linear-gradient(180deg, #eef8ec 0%, #dff0dc 100%)";

/*
 * The /home role picker: one centred column on every screen size. A short hero (what DripMoney is, the 92 / 8 split),
 * then three large role buttons. On hover (or keyboard focus) each button's icon plays its own short animation:
 * the drop bounces, the bolt zaps, the eye blinks. The keyframes live in globals.css and are off for reduced motion.
 */

type Tone = "primary" | "plain";

function RoleButton({
  href,
  icon,
  anim,
  title,
  body,
  cta,
  tone,
}: {
  href: string;
  icon: ReactNode;
  /** The `group-hover` animation class for this icon. */
  anim: string;
  title: string;
  body: string;
  cta: string;
  tone: Tone;
}) {
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-2xl border-2 p-4 transition-[transform,box-shadow,background-color,border-color] duration-200 ease-snappy md:p-5",
        "shadow-[0_8px_22px_-14px_rgb(0_0_0/0.45)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-14px_rgb(0_0_0/0.5)] active:translate-y-0 active:scale-[0.985] motion-reduce:transform-none",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-charcoal",
        primary ? "border-hunter bg-hunter text-canvas" : "border-hunter/25 bg-surface text-charcoal hover:border-hunter hover:bg-honeydew/40",
      )}
    >
      <span aria-hidden className={cn("grid size-14 shrink-0 place-items-center rounded-xl md:size-16", primary ? "bg-lime text-hunter" : "bg-hunter text-lime")}>
        <span className={cn("grid place-items-center motion-reduce:animate-none", anim)}>{icon}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("font-display text-h2 md:text-[24px] md:leading-tight", primary ? "text-canvas" : "text-charcoal")}>{title}</span>
        <span className={cn("font-body text-note", primary ? "text-honeydew" : "text-charcoal-soft")}>{body}</span>
        <span className={cn("mt-1 inline-flex items-center gap-1.5 font-body text-note font-semibold", primary ? "text-lime" : "text-hunter")}>
          {cta}
          <ArrowRightIcon size={16} className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
        </span>
      </span>
    </Link>
  );
}

export default function Page_() {
  return (
    <div className="flex min-h-dvh flex-col" style={{ background: BACKDROP, backgroundSize: "auto, auto, auto, 22px 22px, auto", backgroundAttachment: "fixed" }}>
      <SplitPage
        panel={
          <BrandPanel
            blocks={{ seed: 21 }}
            title={
              <>
                <span className="block text-[clamp(34px,9vw,48px)] leading-[1.05] md:text-[clamp(44px,4.8vw,76px)]">
                  Sales that
                  <span className="block text-lime">repay themselves.</span>
                </span>
              </>
            }
          >
          </BrandPanel>
        }
      >
        <Heading level={2} size="h1">
          Choose your side
        </Heading>
        <div className="flex flex-col gap-3">
          <RoleButton
            tone="primary"
            href={routes.welcome}
            icon={<JarMark size={36} on="light" lit={3} />}
            anim="group-hover:animate-[icon-drip_650ms_var(--ease-snappy)] group-focus-visible:animate-[icon-drip_650ms_var(--ease-snappy)]"
            title="I run a shop"
            body="Take payments by QR in dollars (USDC). Get small dollar advances for stock, paid back from your sales."
            cta="Start as a merchant"
          />
          <RoleButton
            tone="plain"
            href={routes.earn}
            icon={<BoltIcon size={30} />}
            anim="group-hover:animate-[icon-zap_550ms_ease-out] group-focus-visible:animate-[icon-zap_550ms_ease-out]"
            title="I want to lend"
            body="Deposit USDC in the vault and earn from advance fees. Or hold DripCoin for more yield and more risk."
            cta="Open the vault"
          />
          <RoleButton
            tone="plain"
            href={routes.protocol}
            icon={<EyeIcon size={30} />}
            anim="group-hover:animate-[icon-blink_700ms_ease-in-out] group-focus-visible:animate-[icon-blink_700ms_ease-in-out]"
            title="Show me the numbers"
            body="Public dashboard, live risk status and an explorer. Real numbers, no names."
            cta="See the protocol"
          />
        </div>
        <p className="m-0 font-body text-note text-charcoal-soft">
          Paying a shop?{" "}
          <TextLink href={routes.pay} arrow>
            Preview the checkout
          </TextLink>
        </p>
      </SplitPage>
    </div>
  );
}
