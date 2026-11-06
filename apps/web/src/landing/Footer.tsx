import { JarMark } from "@/final";
import { APP_NAME } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto box-border flex max-w-300 flex-wrap items-center justify-between gap-4 px-[clamp(16px,4vw,40px)] pt-8 pb-12">
        <span className="inline-flex items-center gap-2">
          <JarMark size={28} />
          <span className="font-display text-[18px] leading-normal font-extrabold tracking-[-0.02em]">
            {APP_NAME}
          </span>
        </span>
        <span className="font-ledger text-ledger leading-normal text-charcoal-muted">
          Built at ETHGlobal Mumbai · November 2026 · Open source
        </span>
      </div>
    </footer>
  );
}
