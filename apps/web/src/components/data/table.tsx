import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Pill, type PillTone } from "@/components/ui/status";

/* -------------------------------------------------------- ResponsiveTable */

export type TableColumn<K extends string = string> = {
  key: K;
  header: ReactNode;
  align?: "left" | "right" | "center";
};

export type ResponsiveTableProps<K extends string = string> = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  columns: readonly TableColumn<K>[];
  rows: (Record<K, ReactNode> & { id?: string | number })[];
  /** Table caption (visually hidden unless showCaption). */
  caption?: ReactNode;
  showCaption?: boolean;
};

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** A real <table> from md up; stacked blocks with mono labels below md. Never scrolls horizontally. */
export function ResponsiveTable<K extends string>({
  columns,
  rows,
  caption,
  showCaption,
  className,
  ...props
}: ResponsiveTableProps<K>) {
  return (
    <div className={cn("w-full", className)} {...props}>
      <table className="hidden w-full border-collapse text-small md:table">
        {caption ? <caption className={cn("pb-3 text-left text-small text-muted", !showCaption && "sr-only")}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("pb-2.5 font-mono text-label font-normal text-muted uppercase", alignCls[c.align ?? "left"])}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-line">
              {columns.map((c) => (
                <td key={c.key} className={cn("py-3 text-ink tabular-nums", alignCls[c.align ?? "left"])}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col md:hidden" aria-label={typeof caption === "string" ? caption : undefined}>
        {rows.map((r, i) => (
          <li key={r.id ?? i} className="border-t border-line py-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {columns.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="pt-0.5 font-mono text-label text-muted uppercase">{c.header}</dt>
                  <dd className="text-right text-small text-ink tabular-nums">{r[c.key]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------- ActivityLog */

const kindTone: Record<ActivityKind, PillTone> = {
  neutral: "neutral",
  accent: "tint",
  warn: "warn",
  down: "down",
};

export type ActivityKind = "neutral" | "accent" | "warn" | "down";

export type ActivityItemProps = Omit<ComponentPropsWithoutRef<"li">, "title"> & {
  time: ReactNode;
  title: ReactNode;
  reason?: ReactNode;
  kind?: ActivityKind;
  /** Extra mono line (e.g. full timestamp / tx). */
  meta?: ReactNode;
};

export function ActivityItem({ time, title, reason, kind = "neutral", meta, className, ...props }: ActivityItemProps) {
  const pill = <Pill tone={kindTone[kind]}>{time}</Pill>;
  return (
    <li className={cn("flex gap-4 border-t border-line py-4 first:border-t-0 md:grid md:grid-cols-[120px_1fr]", className)} {...props}>
      <div className="hidden md:block">{pill}</div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-ink">{title}</span>
          <span className="md:hidden">{pill}</span>
        </div>
        {reason ? <p className="text-small text-ink-soft">{reason}</p> : null}
        {meta ? <p className="font-mono text-chip text-muted">{meta}</p> : null}
      </div>
    </li>
  );
}

export function ActivityLog({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul className={cn("flex flex-col", className)} {...props} />;
}
