import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Gallery-only helpers. Not part of the library. */

export function Group({ id, title, usedIn, children }: { id: string; title: string; usedIn: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-6 border-t border-line pt-10">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="text-title text-ink">
          {title}
        </h2>
        <p className="font-mono text-mono text-muted">Used in: {usedIn}</p>
      </div>
      {children}
    </section>
  );
}

export function Specimen({ name, note, children, className }: { name: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-mono text-chip text-ink">{name}</h3>
        {note ? <p className="text-small text-muted">{note}</p> : null}
      </div>
      <div className={cn("flex flex-wrap items-start gap-4 rounded-lg border border-dashed border-line-strong p-4 md:p-5", className)}>
        {children}
      </div>
    </div>
  );
}
