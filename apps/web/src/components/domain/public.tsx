"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Eyebrow, Mono } from "@/components/ui/text";
import { Button, ButtonRow } from "@/components/ui/button";
import { KeyValueList, type KeyValueItem } from "@/components/data/stat";
import { PrintIcon, ShareIcon } from "@/components/icons";

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

/* ----------------------------------------------------------------- QRCard */

export type QRCardProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  value: string;
  shopName: ReactNode;
  pseudonym?: ReactNode;
  shareLabel?: ReactNode;
  printLabel?: ReactNode;
  onShare?: () => void;
  onPrint?: () => void;
  qrLabel?: string;
};

export function QRCard({
  value,
  shopName,
  pseudonym,
  shareLabel,
  printLabel,
  onShare,
  onPrint,
  qrLabel,
  className,
  ...props
}: QRCardProps) {
  return (
    <Card className={cn("items-center text-center", className)} {...props}>
      {/* Colors come from tokens via currentColor + bg-white wrapper; no hex. */}
      <div className="rounded-md border border-line bg-white p-4 text-ink">
        <QRCodeSVG
          value={value}
          size={200}
          level="M"
          fgColor="currentColor"
          bgColor="transparent"
          role="img"
          aria-label={qrLabel}
          title={qrLabel}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-title text-ink">{shopName}</span>
        {pseudonym ? <Mono>{pseudonym}</Mono> : null}
      </div>
      {shareLabel || printLabel ? (
        <ButtonRow className="w-full md:justify-center">
          {shareLabel ? (
            <Button variant="outline" iconStart={<ShareIcon size={18} />} onClick={onShare}>
              {shareLabel}
            </Button>
          ) : null}
          {printLabel ? (
            <Button variant="outline" iconStart={<PrintIcon size={18} />} onClick={onPrint}>
              {printLabel}
            </Button>
          ) : null}
        </ButtonRow>
      ) : null}
    </Card>
  );
}
