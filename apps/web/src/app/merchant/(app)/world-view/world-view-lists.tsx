"use client";

import type { WorldView } from "@repo/sdk";
import { BlockBand } from "@/blocks";
import { Banner, Card, Columns, KeyValue, LockIcon, Pill, Stack } from "@/final";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";
import { CardTitle, DarkBlock } from "../../_ui";

/**
 * P01: `world.publicView()`, the two lists side by side: public on white, private on Charcoal. The header's
 * World view toggle outlines each on this and every other screen.
 */
export function WorldViewLists({ initial }: { initial: WorldView | null }) {
  const { data, error } = useMRA(q.world, { initial });
  if (!data) return <MRAState error={error} />;
  return (
    <Stack gap="md">
      <BlockBand cols={24} seed={21} grain={false} className="pointer-events-none h-8 rounded-md opacity-90 lg:h-10" />
      <Columns className="items-stretch">
        <div className="h-full">
          <Card padding="md" className="h-full">
            <CardTitle end={<Pill tone="onchain">anyone</Pill>}>Public onchain</CardTitle>
            <div className="lg:max-h-[calc(100vh-27rem)] lg:overflow-auto">
              <KeyValue rows={data.public.map((r) => [r.k, r.v])} />
            </div>
          </Card>
        </div>
        <div className="h-full">
          <DarkBlock className="h-full gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 font-display text-h2">Private on this device</h2>
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-lime px-2.5 py-1 font-ledger text-tag font-semibold text-charcoal uppercase">
                <LockIcon size={12} />
                only you
              </span>
            </div>
            <dl className="m-0 flex flex-col font-body text-read lg:max-h-[calc(100vh-27rem)] lg:overflow-auto">
              {data.private.map((r) => (
                <div key={r.k} className="flex justify-between gap-4 border-t border-honeydew/20 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                  <dt className="text-honeydew">{r.k}</dt>
                  <dd className="m-0 text-right font-semibold text-canvas tabular-nums">{r.v}</dd>
                </div>
              ))}
            </dl>
          </DarkBlock>
        </div>
      </Columns>
      <Banner>Public transactions can be linked through addresses, timing and payment flows. The issuer sees seller account details during the demo attestation.</Banner>
    </Stack>
  );
}
