import { Page, PageHead } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { WorldViewLists } from "./world-view-lists";

/** P01 What the world sees: `world.publicView()`. */
export default async function WorldViewPage() {
  const initial = await serverView(q.world);
  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="World view" title="What the world sees.">
        Left: what anyone can read onchain. Right: what stays on this device and never leaves it.
      </PageHead>
      <WorldViewLists initial={initial} />
    </Page>
  );
}
