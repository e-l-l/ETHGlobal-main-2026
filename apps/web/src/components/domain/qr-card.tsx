"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Mono } from "@/components/ui/text";

/* Client file on its own so qrcode.react doesn't pull LossWaterfall/WorldViewList into the client bundle. */

/* ----------------------------------------------------------------- QRCard */

export type QRCardProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  value: string;
  shopName: ReactNode;
  pseudonym?: ReactNode;
  qrLabel?: string;
  /** Button row under the shop name (e.g. Share / Print). */
  actions?: ReactNode;
};

export function QRCard({
  value,
  shopName,
  pseudonym,
  qrLabel,
  actions,
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
        <span className="text-title text-fg">{shopName}</span>
        {pseudonym ? <Mono>{pseudonym}</Mono> : null}
      </div>
      {actions}
    </Card>
  );
}
