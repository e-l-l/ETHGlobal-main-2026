import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { AlertIcon, InfoIcon } from "./icons";

/* ------------------------------------------------------------------- Card */

/* White on canvas separates by its hairline; no shadow needed (that was the Lime Mist problem). */
const cardVariants = cva("relative flex min-w-0 flex-col rounded-lg border", {
  variants: {
    tone: {
      surface: "border-hairline bg-surface text-charcoal",
      well: "border-transparent bg-well text-charcoal",
      tint: "border-honeydew-line bg-honeydew text-charcoal",
      hunter: "border-hunter bg-hunter text-canvas",
    },
    padding: { sm: "p-4", md: "p-5", lg: "p-5 md:p-6" },
    gap: { sm: "gap-3", md: "gap-4", lg: "gap-5" },
  },
  defaultVariants: { tone: "surface", padding: "md", gap: "md" },
});

export type CardProps = ComponentPropsWithoutRef<"div"> & VariantProps<typeof cardVariants> & { as?: "div" | "section" | "article" };

export function Card({ as: Tag = "div", tone, padding, gap, className, ...props }: CardProps) {
  return <Tag className={cn(cardVariants({ tone, padding, gap }), className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("m-0 h-px border-0 bg-hairline", className)} />;
}

/* ----------------------------------------------------------------- Banner */

const bannerTones = {
  tint: { cls: "border-honeydew-line bg-honeydew text-hunter", icon: <InfoIcon size={18} /> },
  caution: { cls: "border-transparent bg-caution-tint text-caution", icon: <AlertIcon size={18} /> },
  risk: { cls: "border-transparent bg-risk-tint text-risk", icon: <AlertIcon size={18} /> },
} as const;

export function Banner({ tone = "tint", className, children }: { tone?: keyof typeof bannerTones; className?: string; children: ReactNode }) {
  const t = bannerTones[tone];
  return (
    <div role={tone === "risk" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md border px-4 py-3 font-body text-note", t.cls, className)}>
      <span className="mt-px shrink-0" aria-hidden>{t.icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- KeyValue */

export function KeyValue({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col font-body text-read", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4 border-t border-hairline py-2.5 first:border-t-0 first:pt-0 last:pb-0">
          <dt className="text-charcoal-soft">{k}</dt>
          <dd className="m-0 text-right font-semibold text-charcoal tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
