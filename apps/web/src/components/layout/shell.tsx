import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/icons";
import { Eyebrow } from "@/components/ui/text";
import { Brand } from "./header";

/* ---------------------------------------------------------- MerchantShell */

export type ShellProps = {
  header: ReactNode;
  /** Thin strip above the header (e.g. <DevNotice>). */
  notice?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MerchantShell({ header, notice, children, className }: ShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {notice}
      {header}
      <main className={cn("mx-auto flex w-full max-w-app flex-col gap-6 px-4 py-8 md:px-5 md:py-12", className)}>{children}</main>
    </div>
  );
}

/* ------------------------------------------------------------ LenderShell */

export function LenderShell({ header, notice, children, className }: ShellProps) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-paper"
      style={{
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--color-ink) 6%, transparent) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {notice}
      {header}
      <main className={cn("mx-auto flex w-full max-w-app flex-col gap-7 px-4 pt-12 pb-16 md:px-5", className)}>{children}</main>
    </div>
  );
}

/* --------------------------------------------------------------- StepRail */

export type StepRailProps = Omit<ComponentPropsWithoutRef<"aside">, "children"> & {
  steps: ReactNode[];
  /** 0-based index of the current step. */
  current: number;
  footer?: ReactNode;
  /** Accessible label for the list. */
  listLabel?: string;
};

export function StepRail({ steps, current, footer, listLabel = "Steps", className, ...props }: StepRailProps) {
  return (
    <aside className={cn("flex flex-col gap-12 bg-ink p-8 text-on-ink", className)} {...props}>
      <Brand onInk />
      <ol aria-label={listLabel} className="flex flex-col gap-5">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={i}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("flex items-center gap-3", state === "todo" && "opacity-70")}
            >
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-pill font-mono text-chip",
                  state === "done" && "bg-accent text-ink",
                  state === "current" && "bg-on-ink text-ink",
                  state === "todo" && "border border-on-ink/50 text-on-ink",
                )}
              >
                {state === "done" ? <CheckIcon size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("text-body", state === "current" ? "font-semibold" : "text-on-ink/85")}>{s}</span>
            </li>
          );
        })}
      </ol>
      {footer ? <div className="mt-auto text-small text-on-ink/70">{footer}</div> : null}
    </aside>
  );
}

/* ----------------------------------------------------------- StepProgress */

export type StepProgressProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  steps: ReactNode[];
  current: number;
  /** Formats the counter. Default: "Step 1 / 3". */
  formatCount?: (n: number, total: number) => ReactNode;
};

/** Compact mobile progress: thin segments + "Step 1 / 3 · name". */
export function StepProgress({
  steps,
  current,
  formatCount = (n, t) => `Step ${n} / ${t}`,
  className,
  ...props
}: StepProgressProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} {...props}>
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={cn("h-1 flex-1", i <= current ? "bg-ink" : "bg-line")} />
        ))}
      </div>
      <Eyebrow tone="muted">
        {formatCount(current + 1, steps.length)} · <span className="text-ink">{steps[current]}</span>
      </Eyebrow>
    </div>
  );
}

/* --------------------------------------------------------- OnboardingShell */

export type OnboardingShellProps = {
  steps: ReactNode[];
  current: number;
  railFooter?: ReactNode;
  formatCount?: StepProgressProps["formatCount"];
  /** Optional top-left slot on mobile (e.g. <BackLink>). */
  mobileTop?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function OnboardingShell({
  steps,
  current,
  railFooter,
  formatCount,
  mobileTop,
  children,
  className,
}: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper md:flex-row">
      <StepRail steps={steps} current={current} footer={railFooter} className="hidden w-[380px] shrink-0 md:flex" />
      <div className="flex flex-col gap-4 px-4 pt-4 md:hidden">
        <div className="flex min-h-11 items-center justify-between">
          {mobileTop ?? <Brand />}
        </div>
        <StepProgress steps={steps} current={current} formatCount={formatCount} />
      </div>
      <main className={cn("mx-auto flex w-full max-w-column flex-col gap-6 px-4 py-8 md:justify-center md:px-5 md:py-16", className)}>
        {children}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------- PageHeader */

export type PageHeaderProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  eyebrow?: ReactNode;
  /** Usually a <Heading> with an <Accent> word. */
  title: ReactNode;
  description?: ReactNode;
  /** Right slot: a Pill or ButtonRow. */
  aside?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, aside, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8", className)} {...props}>
      <div className="flex max-w-[720px] flex-col gap-3">
        {eyebrow}
        {title}
        {description}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- TwoColumn */

export type TwoColumnProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  main: ReactNode;
  side: ReactNode;
  ratio?: "3:2" | "1:1";
  mobileOrder?: "main-first" | "side-first";
};

export function TwoColumn({ main, side, ratio = "3:2", mobileOrder = "main-first", className, ...props }: TwoColumnProps) {
  return (
    <div className={cn("flex flex-wrap gap-6", className)} {...props}>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-6",
          ratio === "3:2" ? "grow-[3] basis-[380px]" : "grow basis-[380px]",
          mobileOrder === "side-first" && "order-2 md:order-none",
        )}
      >
        {main}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-6",
          ratio === "3:2" ? "grow-[2] basis-[280px]" : "grow basis-[380px]",
          mobileOrder === "side-first" && "order-1 md:order-none",
        )}
      >
        {side}
      </div>
    </div>
  );
}
