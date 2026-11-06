"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";
import { Label } from "./text";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal";
const press = "transition-[transform,background-color,border-color,color] duration-150 ease-snappy active:scale-[0.97] motion-reduce:active:scale-100";

type Option<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/* -------------------------------------------------------------- Segmented */

/** Well in `well`, selected segment is a white tile with a lift. The thumb slides (200ms, swap curve). */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      className="relative grid w-full auto-cols-fr grid-flow-col rounded-[10px] bg-well p-0.75"
    >
      <span
        aria-hidden
        className="absolute top-0.75 bottom-0.75 left-0.75 rounded-md border border-hairline bg-surface shadow-lift transition-transform duration-200 ease-swap motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "relative z-1 grid min-h-11 cursor-pointer place-items-center rounded-md px-3 font-body text-[15px] font-semibold select-none",
            "text-charcoal-muted aria-checked:text-charcoal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal",
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/* ------------------------------------------------------------------ Chips */

export function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex min-h-11 min-w-16 cursor-pointer items-center justify-center rounded-md border border-control bg-surface px-4 font-body text-[15px] font-semibold text-charcoal select-none",
            "hover:bg-well aria-checked:border-hunter aria-checked:bg-hunter aria-checked:text-canvas",
            press,
            focusRing,
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/* ------------------------------------------------------------------- Pace */

/** Slow / Usual / Busy, always all three. Selected tile fills Hunter. */
export function PacePicker<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "group flex min-h-18 cursor-pointer flex-col items-start gap-0.5 rounded-xl border border-hairline bg-surface p-3 text-left text-charcoal select-none",
            "hover:border-control aria-checked:border-hunter aria-checked:bg-hunter aria-checked:text-canvas",
            press,
            focusRing,
          )}
        >
          <Label className="group-aria-checked:text-honeydew">{o.label}</Label>
          <strong className="font-display text-h2">{o.hint}</strong>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/* ----------------------------------------------------------------- Switch */

export function Switch({ className, ...props }: ComponentPropsWithoutRef<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative h-5.5 w-9.5 shrink-0 cursor-pointer rounded-full bg-track transition-colors duration-150",
        "after:absolute after:-inset-x-0.75 after:-inset-y-2.75 after:content-['']",
        "data-[state=checked]:bg-hunter",
        focusRing,
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.75 rounded-full bg-surface shadow-lift transition-transform duration-150 ease-snappy data-[state=checked]:translate-x-4.75 motion-reduce:transition-none" />
    </RadixSwitch.Root>
  );
}

export function SettingRow({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 font-body">
      <div className="flex min-w-0 flex-col">
        <span className="text-read font-semibold text-charcoal">{title}</span>
        {hint ? <span className="text-note text-charcoal-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- TextField */

export type TextFieldProps = ComponentPropsWithoutRef<"input"> & { label: string; hint?: ReactNode; error?: ReactNode; prefix?: ReactNode };

/** 16px input so phones don't zoom on focus. Border is `control` (3.8:1). */
export function TextField({ label, hint, error, prefix, className, id, ...props }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const describe = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="font-ledger text-tag font-medium uppercase text-charcoal-muted">{label}</label>
      <div
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-md border bg-surface px-3.5 transition-colors duration-150",
          "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-hunter",
          error ? "border-risk" : "border-control",
        )}
      >
        {prefix ? <span className="font-display text-h2 text-charcoal-muted">{prefix}</span> : null}
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          className={cn("min-w-0 flex-1 bg-transparent py-3 font-body text-read font-semibold text-charcoal outline-none placeholder:font-normal placeholder:text-charcoal-muted", className)}
          {...props}
        />
      </div>
      {error ? (
        <span id={`${fid}-err`} className="font-body text-note text-risk">{error}</span>
      ) : hint ? (
        <span id={`${fid}-hint`} className="font-body text-note text-charcoal-muted">{hint}</span>
      ) : null}
    </div>
  );
}
