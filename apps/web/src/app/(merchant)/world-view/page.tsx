import { WorldViewList } from "@/components/domain";
import { PageHeader } from "@/components/layout";
import { Accent, Eyebrow, Heading, PrivacyNote } from "@/components/ui";
import { shop } from "@/lib/mock/shop";
import { worldView } from "@/lib/mock/merchant";

export default function WorldViewPage() {
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
        publicItems={worldView.public}
        privateItems={worldView.private}
      />
      <PrivacyNote>No one can link {shop.pseudonym} to you, your phone, or your seller account.</PrivacyNote>
    </>
  );
}
