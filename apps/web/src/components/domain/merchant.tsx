import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Eyebrow, Label, Mono, Text } from "@/components/ui/text";
import { TextLink } from "@/components/ui/button";
import { CheckItem, CheckList, ProgressBar } from "@/components/ui/status";
import { KeyValueList } from "@/components/data/stat";
import { LockIcon } from "@/components/icons";

/* ------------------------------------------------------------ AdvanceCard */

export type AdvanceCardProps = Omit<ComponentPropsWithoutRef<"section">, "children"> & {
  /** Eyebrow, e.g. "Advance · stock". */
  purpose: ReactNode;
  left: number;
  total: number;
  percentRepaid: number;
  /** "left of $115" — receives the formatted total. */
  leftOfText: (formattedTotal: string) => ReactNode;
  etaText?: ReactNode;
  href?: string;
  linkLabel?: ReactNode;
  currency?: string;
  progressLabel?: string;
};

export function AdvanceCard({
  purpose,
  left,
  total,
  percentRepaid,
  leftOfText,
  etaText,
  href,
  linkLabel,
  currency = "USD",
  progressLabel,
  className,
  ...props
}: AdvanceCardProps) {
  return (
    <Card as="section" tone="ink" gap="md" className={className} {...props}>
      <CardHeader aside={href && linkLabel ? <TextLink href={href} arrow onInk>{linkLabel}</TextLink> : null}>
        <Eyebrow tone="on-ink">{purpose}</Eyebrow>
      </CardHeader>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[44px] leading-none font-semibold tracking-[-0.045em] text-accent tabular-nums md:text-[56px]">
          {formatMoney(left, currency)}
        </span>
        <span className="text-small text-on-ink/70">{leftOfText(formatMoney(total, currency))}</span>
      </div>
      <ProgressBar value={percentRepaid} tone="accent" track="ink-soft" label={progressLabel} />
      {etaText ? <Mono tone="on-ink">{etaText}</Mono> : null}
    </Card>
  );
}

/* --------------------------------------------------------------- PassCard */

export type PassCardProps = Omit<ComponentPropsWithoutRef<"section">, "children"> & {
  kind: "business" | "standing";
  /** Eyebrow, e.g. "Business Pass". */
  title: ReactNode;
  /** Mono tag on the right, e.g. "private". */
  privateTag?: ReactNode;
  facts?: { label: ReactNode; value: ReactNode }[];
  headline?: ReactNode;
  limit?: ReactNode;
  footer?: ReactNode;
};

export function PassCard({ kind, title, privateTag, facts, headline, limit, footer, className, ...props }: PassCardProps) {
  return (
    <Card as="section" tone="ink" gap="md" data-kind={kind} className={cn("relative overflow-hidden", className)} {...props}>
      <CardHeader
        aside={
          privateTag ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 font-mono text-chip text-on-ink/70">
              <LockIcon size={13} />
              {privateTag}
            </span>
          ) : null
        }
      >
        <Eyebrow tone="on-ink" className={kind === "standing" ? "text-accent" : undefined}>
          {title}
        </Eyebrow>
      </CardHeader>
      {headline ? (
        <div className="flex flex-col gap-1">
          <span className="text-title text-on-ink">{headline}</span>
          {limit ? <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-accent">{limit}</span> : null}
        </div>
      ) : null}
      {facts?.length ? (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-x-6 gap-y-4">
          {facts.map((f, i) => (
            <div key={i} className="flex flex-col gap-1">
              <dt>
                <Label onInk>{f.label}</Label>
              </dt>
              <dd className="text-body font-semibold text-on-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {footer ? <p className="border-t border-on-ink/15 pt-4 text-small text-on-ink/70">{footer}</p> : null}
    </Card>
  );
}

/* ----------------------------------------------------------- LimitsLadder */

export type LimitsLadderProps = Omit<ComponentPropsWithoutRef<"dl">, "children"> & {
  tiers: { label: ReactNode; cap: ReactNode }[];
  currentIndex: number;
  /** Marker after reached tiers, e.g. "✓". Default check mark. */
  reachedMark?: ReactNode;
};

export function LimitsLadder({ tiers, currentIndex, reachedMark = "✓", ...props }: LimitsLadderProps) {
  return (
    <KeyValueList
      highlightIndex={currentIndex}
      items={tiers.map((t, i) => ({
        k: t.label,
        v: (
          <span className={cn(i < currentIndex && "text-accent-text")}>
            {t.cap}
            {i < currentIndex ? <span aria-hidden> {reachedMark}</span> : null}
          </span>
        ),
      }))}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- SplitRow */

export type SplitRowProps = Omit<ComponentPropsWithoutRef<"li">, "children"> & {
  total: ReactNode;
  time: ReactNode;
  you: ReactNode;
  repay: ReactNode;
  /** "to you" */
  youLabel: ReactNode;
  /** "to repayment" */
  repayLabel: ReactNode;
};

export function SplitRow({ total, time, you, repay, youLabel, repayLabel, className, ...props }: SplitRowProps) {
  return (
    <li className={cn("flex flex-col gap-1.5 border-t border-dashed border-line-strong py-3.5 first:border-t-0", className)} {...props}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-semibold text-ink tabular-nums">{total}</span>
        <Mono>{time}</Mono>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-chip text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-ink" />
          {you} {youLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-accent" />
          {repay} {repayLabel}
        </span>
      </div>
    </li>
  );
}

export function SalesFeed({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul className={cn("flex flex-col", className)} {...props} />;
}

/* ------------------------------------------------------- AgentPermissions */

export type AgentPermissionsProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  canTitle: ReactNode;
  neverTitle: ReactNode;
  can: ReactNode[];
  never: ReactNode[];
};

export function AgentPermissions({ canTitle, neverTitle, can, never, className, ...props }: AgentPermissionsProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-6", className)} {...props}>
      <div className="flex flex-col gap-3">
        <Eyebrow>{canTitle}</Eyebrow>
        <CheckList>
          {can.map((c, i) => (
            <CheckItem key={i}>{c}</CheckItem>
          ))}
        </CheckList>
      </div>
      <div className="flex flex-col gap-3">
        <Eyebrow tone="down">{neverTitle}</Eyebrow>
        <CheckList>
          {never.map((c, i) => (
            <CheckItem key={i} ok={false}>
              {c}
            </CheckItem>
          ))}
        </CheckList>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- EstimateTiles */

export type EstimateTilesProps = Omit<ComponentPropsWithoutRef<"ul">, "children"> & {
  /** Exactly three: slow / normal / busy. The middle one is ink. */
  tiles: [EstimateTile, EstimateTile, EstimateTile];
};

export type EstimateTile = { label: ReactNode; value: ReactNode; sub?: ReactNode };

export function EstimateTiles({ tiles, className, ...props }: EstimateTilesProps) {
  return (
    <ul className={cn("grid grid-cols-3 gap-2 md:gap-3", className)} {...props}>
      {tiles.map((t, i) => {
        const ink = i === 1;
        return (
          <li
            key={i}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 md:p-4",
              ink ? "border-ink bg-ink text-on-ink" : "border-line bg-card text-ink",
            )}
          >
            <Label onInk={ink}>{t.label}</Label>
            <span className="text-title tabular-nums">{t.value}</span>
            {t.sub ? <Text size="small" tone={ink ? "on-ink" : "muted"}>{t.sub}</Text> : null}
          </li>
        );
      })}
    </ul>
  );
}
