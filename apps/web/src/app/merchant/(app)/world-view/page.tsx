import { Page, PageHead } from "@/final";
import { routes } from "@/lib/routes";
import { WorldViewLists } from "./world-view-lists";

export default function WorldViewPage() {
  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="World view · on every screen" title="What the world sees." />
      <WorldViewLists />
    </Page>
  );
}
