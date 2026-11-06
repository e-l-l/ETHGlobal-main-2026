import { Button, WaveBand } from "@/final";
import { RING_ON_HUNTER, Section } from "./primitives";

export function FinalCta() {
  return (
    <Section id="start" aria-labelledby="start-title" className="pb-16">
      <WaveBand
        className="rounded-xl"
        bodyClassName="m-[clamp(24px,5vw,64px)] flex-row flex-wrap items-center justify-between gap-6 rounded-lg bg-hunter p-[clamp(24px,4vw,48px)]"
      >
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
          <h2
            id="start-title"
            className="m-0 font-display text-[clamp(32px,4vw,48px)] leading-[1.05] font-bold tracking-[-0.03em] text-canvas"
          >
            <span className="block">Stock up today.</span>
            <span className="block">Pay it back as you sell.</span>
          </h2>
          <p className="m-0 text-read text-honeydew">
            No name, no phone number, no contacts. Just your sales.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            href="/onboarding"
            variant="lime"
            width="auto"
            className={`px-7 ${RING_ON_HUNTER}`}
          >
            Get an advance
          </Button>
          <Button
            href="#lenders"
            variant="ghost"
            width="auto"
            className={`border-honeydew px-6 text-canvas hover:bg-forest ${RING_ON_HUNTER}`}
          >
            Lend to shops
          </Button>
        </div>
      </WaveBand>
    </Section>
  );
}
