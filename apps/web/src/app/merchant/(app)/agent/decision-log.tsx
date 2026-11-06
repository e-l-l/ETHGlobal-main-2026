"use client";

import { Card, Label, Pill, Text } from "@/final";
import { cn } from "@/lib/cn";
import { decisionLabel, decisionTone, type Decision, type DecisionKind } from "./_data";

const DOT: Record<DecisionKind, string> = {
  drew: "bg-hunter",
  declined: "bg-caution",
  waited: "bg-unlit",
  paused: "bg-unlit",
  setup: "bg-unlit",
};

/** The agent's decisions, newest first, in one card. Each opens to the limits it stayed inside. */
export function DecisionLog({ decisions }: { decisions: Decision[] }) {
  return (
    <div>
      <Card padding="sm" gap="sm" className="p-0">
        <ul aria-label="Agent decisions" className="m-0 flex list-none flex-col p-0">
          {decisions.map((d) => (
            <li key={d.id} className="flex gap-3.5 border-t border-hairline px-5 py-4 first:border-t-0 md:px-6">
              <span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded-full", DOT[d.kind])} />
              <details className="group min-w-0 flex-1">
                <summary className="flex cursor-pointer list-none flex-col gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-body text-read font-semibold text-charcoal">{d.title}</span>
                    <Label>{d.when}</Label>
                  </span>
                  <Pill tone={decisionTone[d.kind]}>{decisionLabel[d.kind]}</Pill>
                  <span className="font-body text-note text-charcoal-soft">{d.why}</span>
                  {d.limits.length > 0 ? (
                    <>
                      <span className="inline-flex min-h-11 items-center font-body text-note font-semibold text-hunter group-open:hidden">
                        Show limits it stayed inside
                      </span>
                      <span className="hidden min-h-11 items-center font-body text-note font-semibold text-hunter group-open:inline-flex">
                        Hide limits
                      </span>
                    </>
                  ) : null}
                </summary>
                {d.limits.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-1 border-t border-hairline pt-3">
                    <Label>Stayed inside</Label>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {d.limits.map((l) => (
                        <li key={l}>
                          <Text size="note">{l}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
