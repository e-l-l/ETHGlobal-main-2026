import { Section } from "./primitives";

const PARTNERS = ["Uniswap v4", "World ID", "Anon-RPC"];

export function Partners() {
  return (
    <Section aria-label="Built with" className="pt-2 pb-16">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-y border-hairline p-5 font-ledger text-ledger leading-normal text-charcoal-muted">
        <span className="text-tag tracking-[0.1em] uppercase">
          Built at ETHGlobal Mumbai with
        </span>
        {PARTNERS.map((p) => (
          <span key={p} className="font-semibold text-charcoal">
            {p}
          </span>
        ))}
      </div>
    </Section>
  );
}
