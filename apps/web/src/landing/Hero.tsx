import { Button, Label, Lockup } from "@/final";
import { cn } from "@/lib/cn";
import { CheckGlyph, LockGlyph } from "./glyphs";
import { FROST } from "./primitives";
import { WatercolorBackground } from "./WatercolorBackground";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#lenders", label: "For lenders" },
];

const PROMISES = [
  "0.5% a week, never more than 3%",
  "A slow week just pays back less",
  "Your agent, your limits",
];

/* Soft canvas glow behind the headline: no box, no edge, just enough contrast over the wash. */
const GLOW = {
  background:
    "radial-gradient(closest-side, color-mix(in srgb, var(--color-canvas) 94%, transparent) 0%, color-mix(in srgb, var(--color-canvas) 86%, transparent) 58%, color-mix(in srgb, var(--color-canvas) 0%, transparent) 100%)",
};

function Nav() {
  return (
    <header className="relative z-10 mx-auto box-border w-full max-w-300 px-[clamp(16px,4vw,40px)] pt-4">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto box-content flex max-w-210 items-center justify-between gap-x-3 gap-y-3 rounded-lg py-2 pr-2 pl-4 md:flex-wrap md:gap-x-4 md:pl-5",
          FROST,
        )}
      >
        <a
          href="#top"
          className="inline-flex min-h-11 items-center rounded-md no-underline"
        >
          <Lockup size={32} />
        </a>
        {/* Phones: logo + app button on one row; section links return from md up. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-note font-semibold">
          {NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hidden min-h-11 items-center rounded-chip text-charcoal-soft no-underline hover:text-charcoal md:inline-flex"
            >
              {l.label}
            </a>
          ))}
          <Button
            href="/home"
            size="sm"
            width="auto"
            className="px-5"
          >
            Open the app
          </Button>
        </div>
      </nav>
    </header>
  );
}

function SaleCard() {
  return (
    <div
      className={cn(
        "relative box-content flex max-w-95 flex-col gap-3.5 rounded-3xl p-5.5",
        FROST,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-charcoal-soft">Sale · 4:20 pm</Label>
        <span className="font-display text-[28px] font-bold tracking-[-0.02em]">
          $10.00
        </span>
      </div>
      <div className="flex h-3.5 gap-0.75" aria-hidden>
        <div className="flex-9 rounded-chip border border-surface/90 bg-surface/70" />
        <div className="flex-1 rounded-chip bg-hunter" />
      </div>
      <div className="flex justify-between text-note leading-[normal] text-charcoal">
        <span>$9.00 yours</span>
        <span className="font-semibold text-hunter">$1.00 drips back</span>
      </div>
    </div>
  );
}

function AdvanceCard() {
  return (
    <div
      className={cn(
        "relative box-content flex max-w-95 flex-col gap-2 rounded-3xl p-5.5",
        FROST,
      )}
    >
      <Label className="text-hunter">Advance arrived</Label>
      <span className="font-display text-[20px] leading-[1.25] font-bold tracking-[-0.01em]">
        Your agent drew $100 for stock
      </span>
      <span className="text-note text-charcoal">
        Why it drew this: weekend sales usually run high and your supplier
        delivers Friday.
      </span>
    </div>
  );
}

export function Hero() {
  return (
    <div
      id="top"
      className="relative flex min-h-[min(100svh,960px)] flex-col overflow-hidden bg-[#e3f1e2]"
    >
      <WatercolorBackground />
      <Nav />

      <section
        id="main"
        tabIndex={-1}
        aria-labelledby="hero-title"
        className={cn(
          "relative mx-auto box-border flex w-full max-w-300 flex-[1_0_auto] flex-wrap content-center items-center gap-10 outline-none",
          "px-[clamp(16px,4vw,40px)] pt-[clamp(40px,7vw,96px)] pb-[clamp(96px,10vw,160px)]",
        )}
      >
        <div className="relative isolate flex min-w-0 flex-[1_1_368px] flex-col gap-5 py-[clamp(8px,2vw,24px)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[-22%_-18%_-22%_-30%] -z-10 blur-[18px]"
            style={GLOW}
          />
          <Label as="p" className="m-0">
            Dollar advances for small shops
          </Label>
          <h1
            id="hero-title"
            className="m-0 font-display text-[clamp(32px,4.8vw,58px)] leading-none font-bold tracking-[-0.03em] text-charcoal"
          >
            Dollars for stock today.{" "}
            <span className="text-hunter">Paid back one sale at a time.</span>
          </h1>
          <p className="m-0 max-w-120 text-[18px] leading-[1.55] text-charcoal-soft">
            No fixed instalments. 8% of each sale goes toward your advance. Fee
            0.5% per week while you owe, never more than 3%.
          </p>
          <p className="m-0 inline-flex items-center gap-2.5 self-start rounded-full border border-honeydew-line bg-honeydew py-2 pr-3 pl-2.5 text-[12px] leading-[1.35] font-semibold text-hunter">
            <LockGlyph size={16} className="flex-none" />
            We never ask for your name, phone or contacts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/onboarding" width="auto" className="px-6 py-0">
              Get an advance
            </Button>
            <Button
              href="#lenders"
              variant="secondary"
              width="auto"
              className="px-6 py-0"
            >
              Lend to shops
            </Button>
          </div>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 text-note leading-[normal] text-charcoal-soft">
            {PROMISES.map((p) => (
              <li key={p} className="inline-flex items-center gap-2">
                <CheckGlyph size={18} className="text-sage" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col items-end gap-4">
          <SaleCard />
          <AdvanceCard />
        </div>
      </section>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b/srgb from-canvas/0 to-canvas"
      />
    </div>
  );
}
