import { KeyValueList } from "@/components/data";
import { TwoColumn } from "@/components/layout";
import {
  Accent,
  Button,
  ButtonRow,
  Card,
  CheckItem,
  CheckList,
  Eyebrow,
  Heading,
  Mono,
  StatusIcon,
  TextLink,
} from "@/components/ui";
import { formatLocal, formatMoney, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance, shop, toLocal } from "@/lib/mock/shop";
import { drawReasons } from "@/lib/mock/merchant";

export default function AdvanceArrivedPage() {
  return (
    <TwoColumn
      main={
        <>
          <StatusIcon kind="ok" />
          <div className="flex flex-col gap-3">
            <Heading level={1} size="md">
              Your agent drew <Accent>{formatMoney(advance.drawn)}</Accent> for {advance.purpose}.
            </Heading>
            <Mono>
              {formatLocal(toLocal(advance.drawn), shop.localCurrency)} · {advance.drawnAt}
            </Mono>
          </div>
          <Card>
            <KeyValueList
              items={[
                { k: "You pay back", v: formatMoney(advance.total) },
                { k: `${advance.feeLabel} · fixed`, v: formatMoney(advance.fee) },
                { k: "From each sale", v: formatPercent(advance.holdback) },
              ]}
            />
          </Card>
          <ButtonRow>
            <Button href={routes.cashOut}>Send to my supplier</Button>
            <Button href={routes.advance.details} variant="outline">
              See advance details
            </Button>
          </ButtonRow>
        </>
      }
      side={
        <Card>
          <Eyebrow>Why it drew this</Eyebrow>
          <CheckList>
            {drawReasons.map((r) => (
              <CheckItem key={r}>{r}</CheckItem>
            ))}
          </CheckList>
          <div>
            <TextLink href={routes.agent.log} arrow>
              full activity log
            </TextLink>
          </div>
        </Card>
      }
    />
  );
}
