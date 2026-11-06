"use client";

import type { WorldView } from "@repo/sdk";
import { WorldViewList } from "@/components/domain";
import { PageHeader } from "@/components/layout";
import { Accent, Eyebrow, Heading, PrivacyNote } from "@/components/ui";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";

/** P01 World view: `world.publicView()`. */
export function WorldViewScreen({ initial }: { initial: WorldView | null }) {
  const { data, error } = useMRA(q.world, { initial });
  if (!data) return <MRAState error={error} />;
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>World view · on every screen</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            What the world <Accent>sees</Accent>.
          </Heading>
        }
      />
      <WorldViewList
        publicTitle="Public onchain"
        privateTitle="Private on this device"
        publicItems={data.public}
        privateItems={data.private}
      />
      <PrivacyNote>No one can link {data.shop.pseudonym} to you, your phone, or your seller account.</PrivacyNote>
    </>
  );
}
