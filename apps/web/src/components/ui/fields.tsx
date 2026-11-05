import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ArrowRightIcon } from "@/components/icons";
import { Label, Mono, Text } from "./text";
import { Pill } from "./status";
import { Button, type ButtonProps } from "./button";

/* Server-safe form parts (no client state). Interactive Radix controls live in controls.tsx. */

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
            className="hit-target inline-flex h-8 items-center rounded-sm bg-subtle px-2.5 font-mono text-chip text-ink hover:bg-line"
          >
            {maxLabel}
          </button>
        ) : null}
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});

/* ------------------------------------------------------------- SettingRow */

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
    <div className={cn("flex items-center justify-between gap-4 border-t border-rule py-4 first:border-t-0", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-body font-semibold text-fg">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-small text-fg-muted">
            {description}
          </span>
        ) : null}
      </div>
      {control({ labelId, descriptionId: description ? descriptionId : undefined })}
    </div>
  );
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
        <Text role="alert" size="small" tone="down">
          {errorMessage}
        </Text>
      ) : null}
    </div>
  );
}
