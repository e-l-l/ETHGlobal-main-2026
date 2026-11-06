import type { ReactNode } from "react";
import { WorldViewList } from "@/components/domain";
import type { KeyValueItem } from "@/components/data";
import { Eyebrow, TextLink } from "@/components/ui";

export function SeesLink({ href = "#world" }: { href?: string }) {
  return <TextLink href={href}>What the world sees</TextLink>;
}

export function WorldSection({
  publicItems,
  privateItems,
  publicTitle = "Public onchain",
  privateTitle = "Private on this device",
}: {
  publicItems: KeyValueItem[];
  privateItems: KeyValueItem[];
  publicTitle?: ReactNode;
  privateTitle?: ReactNode;
}) {
  return (
    <section id="world" className="flex scroll-mt-8 flex-col gap-3">
      <Eyebrow tone="muted">What the world sees</Eyebrow>
      <WorldViewList
        publicTitle={publicTitle}
        privateTitle={privateTitle}
        publicItems={publicItems}
        privateItems={privateItems}
      />
    </section>
  );
}
