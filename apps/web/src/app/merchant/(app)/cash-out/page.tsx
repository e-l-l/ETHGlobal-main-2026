import { Page, PageHead } from "@/final";
import { routes } from "@/lib/routes";
import { CashOutForm } from "./amount-card";

export default function CashOutPage() {
  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Cash out" title="Move your dollars." />
      <CashOutForm />
    </Page>
  );
}
