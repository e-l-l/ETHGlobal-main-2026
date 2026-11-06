"use client";

import { Card, Label, Pill, Text } from "@/final";
import { PrivateMark } from "./_parts";
import { decisionLabel, decisionTone, type Decision } from "./_data";

export function DecisionLog({ decisions }: { decisions: Decision[] }) {
  return (
    <ul aria-label="Agent decisions" className="m-0 flex list-none flex-col gap-3 p-0">
      {decisions.map((d) => (
        <li key={d.id}>
          <PrivateMark>
            <Card padding="sm" gap="sm">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-col gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <Pill tone={decisionTone[d.kind]}>{decisionLabel[d.kind]}</Pill>
                    <Label>{d.when}</Label>
                  </span>
                  <span className="font-body text-read font-semibold text-charcoal">{d.title}</span>
                  <span className="font-body text-note text-charcoal-soft">{d.why}</span>
                  {d.limits.length > 0 ? (
                    <>
                      <span className="font-body text-note font-semibold text-hunter group-open:hidden">Show limits it stayed inside</span>
                      <span className="hidden font-body text-note font-semibold text-hunter group-open:inline">Hide limits</span>
                    </>
                  ) : null}
                </summary>
                {d.limits.length > 0 ? (
                <div className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3">
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
            </Card>
          </PrivateMark>
        </li>
      ))}
    </ul>
  );
}
