import { KeyValueList } from "@/components/data";
import { Accent, Button, ButtonRow, Dialog, StatusIcon } from "@/components/ui";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance, agentLimits } from "@/lib/mock/shop";

/** M08: outside MerchantShell. A full-page backdrop with the dialog always open. */
export default function ApprovePage() {
  return (
    <div className="min-h-dvh bg-line-strong">
      <Dialog
        open
        icon={<StatusIcon kind="lock" />}
        title={
          <>
            Approve your agent <Accent>once</Accent>.
          </>
        }
        description="This is a one-time World Agent Pass approval. Only you can turn the agent on."
        actions={
          <ButtonRow>
            <Button href={routes.home}>Approve in World App</Button>
            <Button href={routes.agent.denied} variant="outline">
              Not now
            </Button>
          </ButtonRow>
        }
      >
        <KeyValueList
          items={[
            { k: "Max per advance", v: formatMoney(agentLimits.perAdvance) },
            { k: "Max per month", v: formatMoney(agentLimits.perMonth) },
            { k: "Draws for", v: capitalize(agentLimits.purpose) },
            { k: "Repaid from", v: `${formatPercent(advance.holdback)} of each sale` },
          ]}
        />
      </Dialog>
    </div>
  );
}
