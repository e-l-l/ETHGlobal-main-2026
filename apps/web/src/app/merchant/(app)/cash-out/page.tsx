import { DemoBadge, Page, PageHead, Text } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { CashOutForm } from "./amount-card";

/** M18 Cash out: `merchant.cashOutView()`, then `merchant.cashOut(amount, destination)`. */
export default async function CashOutPage() {
  const initial = await serverView(q.cashOut);
  return (
    <Page tabs dense>
      <PageHead
        back={routes.merchant}
        backLabel="Home"
        title="Cash out"
        actions={
          <span className="flex flex-wrap items-center gap-3">
            <DemoBadge>Simulated cash-out</DemoBadge>
            <Text size="note">No local money is sent.</Text>
          </span>
        }
      />
      <CashOutForm initial={initial} />
    </Page>
  );
}
