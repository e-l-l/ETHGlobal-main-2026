import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/text";
import { KeyValueList, type KeyValueItem } from "@/components/data/stat";

/* ----------------------------------------------------------- LossWaterfall */

export type LossTier = { title: ReactNode; description?: ReactNode; amount: ReactNode };

export type LossWaterfallProps = Omit<ComponentPropsWithoutRef<"ol">, "children"> & {
  /** Exactly three: junior, reserve, senior. */
  tiers: [LossTier, LossTier, LossTier];
};

const tierCls = [
  "border-transparent bg-accent text-ink",
  "border-accent-line bg-accent-tint text-accent-ink",
  "border-line-strong bg-card text-ink",
] as const;

export function LossWaterfall({ tiers, className, ...props }: LossWaterfallProps) {
  return (
    <ol className={cn("flex flex-col gap-2", className)} {...props}>
      {tiers.map((t, i) => (
        <li key={i} className={cn("flex items-center gap-4 rounded-lg border p-4", tierCls[i])}>
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill border border-current font-mono text-chip">
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-body font-semibold">{t.title}</span>
            {t.description ? <span className="text-small opacity-85">{t.description}</span> : null}
          </div>
          <span className="text-body font-semibold tabular-nums">{t.amount}</span>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------- WorldViewList */

export type WorldViewListProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  publicTitle: ReactNode;
  privateTitle: ReactNode;
  publicItems: KeyValueItem[];
  privateItems: KeyValueItem[];
};

export function WorldViewList({ publicTitle, privateTitle, publicItems, privateItems, className, ...props }: WorldViewListProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4", className)} {...props}>
      <Card>
        <Eyebrow tone="muted">{publicTitle}</Eyebrow>
        <KeyValueList size="sm" divider="solid" items={publicItems} />
      </Card>
      <Card>
        <Eyebrow>{privateTitle}</Eyebrow>
        <KeyValueList size="sm" divider="solid" items={privateItems} />
      </Card>
    </div>
  );
}
