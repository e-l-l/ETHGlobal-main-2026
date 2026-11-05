"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";
import { ArrowRightIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Label, Mono } from "./text";
import { Pill } from "./status";
import { Button, type ButtonProps } from "./button";

/* ----------------------------------------------------- shared field parts */

function FieldMessage({ id, error, hint }: { id: string; error?: ReactNode; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} className="text-small text-down">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="font-mono text-mono text-muted">
        {hint}
      </p>
    );
  }
  return null;
}

/* -------------------------------------------------------------- TextField */

export type TextFieldProps = Omit<ComponentPropsWithoutRef<"input">, "size"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Classes for the outer wrapper. */
  className?: string;
  inputClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, className, inputClassName, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={cn(
          "h-12 w-full rounded-md border border-line-strong bg-card px-3.5 text-body text-ink placeholder:text-muted",
          "focus-visible:border-ink disabled:bg-subtle disabled:text-muted",
          error && "border-down",
          inputClassName,
        )}
        {...props}
      />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});

/* ------------------------------------------------------------ AmountInput */

export type AmountInputProps = Omit<ComponentPropsWithoutRef<"input">, "size" | "type"> & {
  label: ReactNode;
  /** Mono suffix, e.g. "USDC" or "$". */
  unit?: ReactNode;
  /** Shows the MAX chip when provided. */
  onMax?: () => void;
  maxLabel?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { label, unit, onMax, maxLabel = "MAX", hint, error, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div
        className={cn(
          "flex h-14 items-center gap-2 rounded-md border border-line-strong bg-card pr-2 pl-4 focus-within:border-ink",
          error && "border-down",
          disabled && "bg-subtle",
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[22px] font-semibold tracking-[-0.02em] text-ink outline-none placeholder:text-faint disabled:text-muted"
          {...props}
        />
        {unit ? <span className="font-mono text-mono text-muted">{unit}</span> : null}
        {onMax ? (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="relative inline-flex h-8 items-center rounded-sm bg-subtle px-2.5 font-mono text-chip text-ink hover:bg-line after:absolute after:-inset-y-1.5 after:inset-x-0"
          >
            {maxLabel}
          </button>
        ) : null}
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});

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
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill bg-line-strong transition-colors",
        "after:absolute after:-inset-y-2 after:inset-x-0",
        "data-[state=checked]:bg-ink disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-[22px] translate-x-[3px] rounded-pill bg-card transition-transform data-[state=checked]:translate-x-[23px]" />
    </RadixSwitch.Root>
  );
});

export type SettingRowProps = {
  title: ReactNode;
  description?: ReactNode;
  /** The control on the right; receives the ids for labelling. */
  control: (ids: { labelId: string; descriptionId?: string }) => ReactNode;
  className?: string;
};

/** Title + description on the left, control on the right. */
export function SettingRow({ title, description, control, className }: SettingRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className={cn("flex items-center justify-between gap-4 border-t border-line py-4 first:border-t-0", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-body font-semibold text-ink">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-small text-muted">
            {description}
          </span>
        ) : null}
      </div>
      {control({ labelId, descriptionId: description ? descriptionId : undefined })}
    </div>
  );
}

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

/* ---------------------------------------------------------------- TxSteps */

export type TxState = "idle" | "wallet" | "pending" | "done" | "error";

export type TxStepsProps = {
  /** e.g. ["Approve USDC", "Deposit"] */
  steps: string[];
  /** Index of the step in progress (0-based). */
  current: number;
  state: TxState;
  /** Button label per state. `idle` defaults to the current step's name. */
  actionLabels?: Partial<Record<TxState, ReactNode>>;
  onAction?: () => void;
  /** Shown under the button when state is "error". */
  errorMessage?: ReactNode;
  /** Hint after the button (e.g. "2 confirmations in your wallet"). */
  hint?: ReactNode;
  disabled?: boolean;
  buttonProps?: Omit<ButtonProps, "onClick" | "loading" | "children">;
  className?: string;
};

/**
 * Two-step on-chain action. Holds no wallet logic: the parent passes state.
 * Renders step pills ("1 approve → 2 deposit") and the main button.
 */
export function TxSteps({
  steps,
  current,
  state,
  actionLabels,
  onAction,
  errorMessage,
  hint,
  disabled,
  buttonProps,
  className,
}: TxStepsProps) {
  const allDone = state === "done" && current >= steps.length - 1;
  const busy = state === "wallet" || state === "pending";
  const label = actionLabels?.[state] ?? steps[current];
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current || (i === current && state === "done");
          const active = i === current && !done;
          return (
            <li key={s} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              {i > 0 ? <ArrowRightIcon size={14} className="text-faint" /> : null}
              <Pill tone={done ? "accent" : active ? (state === "error" ? "down" : "ink") : "neutral"}>
                {i + 1} {s.toLowerCase()}
              </Pill>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Button
          variant="primary"
          loading={busy}
          disabled={disabled || allDone}
          onClick={onAction}
          {...buttonProps}
        >
          {label}
        </Button>
        {hint ? <Mono>{hint}</Mono> : null}
      </div>
      {state === "error" && errorMessage ? (
        <p role="alert" className="text-small text-down">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
