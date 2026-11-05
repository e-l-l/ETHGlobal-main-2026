"use client";

import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { CrossIcon } from "@/components/icons";
import { Heading, Text } from "./text";
import { iconButtonClass } from "./button";

export type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (wrapped in Radix Trigger asChild). */
  trigger?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Usually a <ButtonRow>. */
  actions?: ReactNode;
  /** aria-label for the close button. Omit to hide it. */
  closeLabel?: string;
  className?: string;
};

export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  icon,
  title,
  description,
  children,
  actions,
  closeLabel,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-dialog -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto",
            "rounded-xl border border-line bg-card p-6 text-fg shadow-dialog focus:outline-none",
            className,
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          {closeLabel ? (
            <RadixDialog.Close
              aria-label={closeLabel}
              className={cn(iconButtonClass, "absolute top-2 right-2")}
            >
              <CrossIcon size={20} />
            </RadixDialog.Close>
          ) : null}
          {icon ? <div>{icon}</div> : null}
          <div className="flex flex-col gap-2">
            <RadixDialog.Title asChild>
              <Heading level={2} size="md">
                {title}
              </Heading>
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description asChild>
                <Text>{description}</Text>
              </RadixDialog.Description>
            ) : null}
          </div>
          {children}
          {actions}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Wrap a button inside `actions` to close the dialog on click. */
export const DialogClose = RadixDialog.Close;
