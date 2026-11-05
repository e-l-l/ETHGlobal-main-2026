import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Eyebrow, Heading, Label, Mono, OptionCard, OptionGroup } from "@/components/ui";
import { cashOut } from "@/lib/mock/merchant";
import { AmountCard } from "./amount-card";

export default function CashOutPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Cash out</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Move your <Accent>dollars</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        ratio="2:3"
        main={<AmountCard />}
        side={
          <div className="flex flex-col gap-3">
            <Label id="send-to">Send to</Label>
            <OptionGroup aria-labelledby="send-to" defaultValue={cashOut.defaultDestination}>
              {cashOut.destinations.map((d) => (
                <OptionCard
                  key={d.value}
                  value={d.value}
                  title={d.title}
                  description={d.description}
                  selectedLabel="selected"
                />
              ))}
            </OptionGroup>
            <Mono>demo: transfers are simulated</Mono>
          </div>
        }
      />
    </>
  );
}
