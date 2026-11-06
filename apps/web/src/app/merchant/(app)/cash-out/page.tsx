import { Page, PageHead, Text } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { CashOutForm } from "./amount-card";

/** M18 Cash out: `merchant.cashOutView()`, then `merchant.cashOut(amount, destination)`. */
export default async function CashOutPage() {
  const initial = await serverView(q.cashOut);
  return (
    <Page tabs dense>
      <PageHead back={routes.merchant} backLabel="Home" title="Cash out" actions={<Text size="note">No local money is sent.</Text>} />
      <CashOutForm initial={initial} />
    </Page>
  );
}
