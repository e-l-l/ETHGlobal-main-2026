"use client";

import { Banner, Card, Columns, KeyValue, Label, LockIcon, Pill, Stack, WorldMark } from "@/final";
import { worldView } from "@/lib/mock/merchant";
import { shop } from "@/lib/mock/shop";
import { useWorldView } from "@/lib/world-view";

/** The two lists side by side. The header's World view toggle outlines each on this and every other screen. */
export function WorldViewLists() {
  const wv = useWorldView();
  return (
    <Stack>
      <Columns>
        <WorldMark kind="pub" show={wv}>
          <Card className="h-full">
            <div className="flex items-center justify-between gap-3">
              <Label>Public onchain</Label>
              <Pill tone="onchain">onchain</Pill>
            </div>
            <KeyValue rows={worldView.public.map((r) => [r.k, r.v])} />
          </Card>
        </WorldMark>
        <WorldMark kind="priv" show={wv}>
          <Card tone="well" className="h-full">
            <div className="flex items-center justify-between gap-3">
              <Label>Private on this device</Label>
              <Pill tone="locked">
                <LockIcon size={12} />
                private
              </Pill>
            </div>
            <KeyValue rows={worldView.private.map((r) => [r.k, r.v])} />
          </Card>
        </WorldMark>
      </Columns>
      <Banner>No one can link {shop.id} to you, your phone, or your seller account.</Banner>
    </Stack>
  );
}
