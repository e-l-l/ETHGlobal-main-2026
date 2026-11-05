"use client";

import { forwardRef, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Label, Mono } from "./text";
import { Pill } from "./status";

/* ------------------------------------------------------- SegmentedControl */

export type SegmentOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  disabledReason?: ReactNode;
};

export type SegmentedControlProps = {
  options: SegmentOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `subtle`: grey track, card-colored selection (e.g. language switch). */
  track?: "default" | "subtle";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  name?: string;
  className?: string;
};

export function SegmentedControl({
  options,
  track = "default",
  className,
  ...props
}: SegmentedControlProps) {
  const reasons = options.filter((o) => o.disabled && o.disabledReason);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <RadioGroup.Root
        orientation="horizontal"
        className={cn(
          "grid auto-cols-fr grid-flow-col gap-1.5",
          track === "subtle" && "w-fit gap-0.5 rounded-md bg-subtle p-0.5",
        )}
        {...props}
      >
        {options.map((o) => (
          <RadioGroup.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-small font-semibold",
              track === "default" && [
                "border-line-strong bg-card text-ink hover:border-ink",
                "data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-on-ink",
                "data-disabled:border-dashed data-disabled:bg-transparent data-disabled:font-normal data-disabled:text-muted data-disabled:hover:border-line-strong",
              ],
              track === "subtle" && [
                "border-transparent px-3.5 font-mono text-chip font-normal text-ink-soft uppercase",
                "data-[state=checked]:border-line data-[state=checked]:bg-card data-[state=checked]:text-ink",
                "data-disabled:opacity-50",
              ],
            )}
          >
            {o.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {reasons.map((o) => (
        <Mono key={o.value} className="block">
          {o.disabledReason}
        </Mono>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- NumberStepper */

export type NumberStepperProps = {
  value: number;
  onValueChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (value: number) => ReactNode;
  label?: ReactNode;
  decrementLabel?: string;
  incrementLabel?: string;
  className?: string;
};

export function NumberStepper({
  value,
  onValueChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  format = (v) => v,
  label,
  decrementLabel = "Less",
  incrementLabel = "More",
  className,
}: NumberStepperProps) {
  const labelId = useId();
  const btn =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-line-strong bg-card text-ink hover:border-ink disabled:border-line disabled:bg-subtle disabled:text-faint";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? <Label id={labelId}>{label}</Label> : null}
      <div role="group" aria-labelledby={label ? labelId : undefined} className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          aria-label={decrementLabel}
          disabled={value - step < min}
          onClick={() => onValueChange(Math.max(min, value - step))}
        >
          <MinusIcon size={18} />
        </button>
        <output aria-live="polite" className="min-w-20 text-center text-title text-ink">
          {format(value)}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={incrementLabel}
          disabled={value + step > max}
          onClick={() => onValueChange(Math.min(max, value + step))}
        >
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Switch */

export type SwitchProps = ComponentPropsWithoutRef<typeof RadixSwitch.Root>;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ className, ...props }, ref) {
  return (
    <RadixSwitch.Root
      ref={ref}
      className={cn(
        "hit-target inline-flex h-7 w-12 shrink-0 items-center rounded-pill bg-line-strong transition-colors",
        "data-[state=checked]:bg-ink disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-[22px] translate-x-[3px] rounded-pill bg-card transition-transform data-[state=checked]:translate-x-[23px]" />
    </RadixSwitch.Root>
  );
});

/* ------------------------------------------------------------- OptionCard */

export type OptionGroupProps = ComponentPropsWithoutRef<typeof RadioGroup.Root>;

/** Radix RadioGroup root for OptionCards. Arrow keys move between options. */
export function OptionGroup({ className, ...props }: OptionGroupProps) {
  return <RadioGroup.Root className={cn("flex flex-col gap-3", className)} {...props} />;
}

export type OptionCardProps = Omit<ComponentPropsWithoutRef<typeof RadioGroup.Item>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** Text of the pill shown when selected. */
  selectedLabel?: ReactNode;
  /** Optional leading visual (icon/logo). */
  icon?: ReactNode;
};

export function OptionCard({ title, description, selectedLabel, icon, className, ...props }: OptionCardProps) {
  return (
    <RadioGroup.Item
      className={cn(
        "group flex min-h-11 w-full items-start gap-3 rounded-lg border border-line bg-card p-4 text-left hover:border-line-strong md:p-5",
        "data-[state=checked]:border-2 data-[state=checked]:border-ink data-[state=checked]:p-[15px] md:data-[state=checked]:p-[19px]",
        "data-disabled:bg-subtle data-disabled:text-muted",
        className,
      )}
      {...props}
    >
      {icon ? <span className="mt-0.5 shrink-0 text-ink">{icon}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold text-ink">{title}</span>
        {description ? <span className="text-small text-ink-soft">{description}</span> : null}
      </span>
      {selectedLabel ? (
        <Pill tone="accent" className="hidden group-data-[state=checked]:inline-flex">
          {selectedLabel}
        </Pill>
      ) : null}
    </RadioGroup.Item>
  );
}

/* ------------------------------------------------------------------- Tabs */

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex gap-6 border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent font-mono text-eyebrow text-muted uppercase hover:text-ink",
        "data-[state=active]:border-accent data-[state=active]:text-ink",
        "data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("pt-5", className)} {...props} />;
}


/* ------------------------------------------------------------ ChoiceChips */

export type ChoiceChip = { value: string; label: ReactNode; disabled?: boolean };

export type ChoiceChipsProps = {
  options: ChoiceChip[];
  /** Selected values (controlled). */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Accessible name for the group. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
};

/** Multi-select toggle pills (aria-pressed buttons). Selected = accent fill with a check. */
export function ChoiceChips({
  options,
  value,
  defaultValue = [],
  onValueChange,
  className,
  ...aria
}: ChoiceChipsProps) {
  const [inner, setInner] = useState<string[]>(defaultValue);
  const selected = value ?? inner;
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  return (
    <div role="group" className={cn("flex flex-wrap gap-2", className)} {...aria}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              "hit-target inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 font-mono text-chip",
              on ? "border-transparent bg-accent text-ink" : "border-line-strong bg-card text-ink hover:border-ink",
              "disabled:border-line disabled:bg-subtle disabled:text-muted",
            )}
          >
            {on ? <CheckIcon size={12} strokeWidth={3} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
