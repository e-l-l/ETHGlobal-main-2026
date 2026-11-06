import type { Metadata } from "next";
import { ActionBar, AlertIcon, Button, Card, Heading, KeyValue, Label, LockIcon, Page, Text } from "@/final";
import { routes } from "@/lib/routes";
import { CardTitle, CheckList, DarkBlock, HeroLabel, PlainWords } from "../../_ui";

export const metadata: Metadata = { title: "Advances off" };

/**
 * World ID red lines. Default: `human_banned` (an earlier advance was not repaid, so this human can't take new advances
 * on any shop). `?reason=open_advance`: `human_has_open_advance` (one open advance per human, across shops).
 * Payments keep working in both. No retry on the banned screen.
 */
export default async function BlockedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const openAdvance = (await searchParams).reason === "open_advance";
  return (
    <Page width="narrow" tabs className="md:justify-center">
      {openAdvance ? <OpenAdvance /> : <Banned />}
    </Page>
  );
}

function Banned() {
  return (
    <>
      <DarkBlock className="gap-4 md:p-8">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-lime text-charcoal">
          <LockIcon size={22} />
        </span>
        <HeroLabel>Advances off for this World ID</HeroLabel>
        <h1 className="m-0 font-display text-h1-sm text-canvas md:text-h1">
          This World ID can&rsquo;t borrow on DripMoni after a default.
        </h1>
        <Text className="text-honeydew">
          This World ID can&rsquo;t take new advances, on any shop, because an earlier advance was not repaid.
        </Text>
      </DarkBlock>
      <Card padding="lg">
        <CardTitle>What still works</CardTitle>
        <CheckList
          items={[
            {
              text: "Your shop can still take payments. Customers scan your QR as usual.",
            },
            {
              text: "You keep 100% of every payment and can cash out any time.",
            },
            {
              text: "New advances, on this shop or any other, are off.",
              caution: true,
            },
          ]}
        />
      </Card>
      <ActionBar>
        <Button href={routes.myQr}>Open my QR</Button>
        <Button href={routes.cashOut} variant="secondary">
          Cash out
        </Button>
      </ActionBar>
    </>
  );
}

function OpenAdvance() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-caution-tint text-caution">
          <AlertIcon size={22} />
        </span>
        <Label className="text-caution">One advance at a time</Label>
        <Heading level={1}>Repay your open advance first.</Heading>
        <Text>
          Your World ID already has an open advance on another shop. It keeps paying back from that shop&rsquo;s sales. Once it&rsquo;s paid
          off, new advances unlock here.
        </Text>
      </div>
      <Card padding="lg">
        <CardTitle>Your open advance</CardTitle>
        <KeyValue
          rows={[
            ["Where", "Another of your shops"],
            ["Paid back from", "A share of that shop's payments"],
            ["Here, meanwhile", "Payments work as usual"],
          ]}
        />
      </Card>
      <PlainWords label="Why">
        One World ID holds one advance at a time, across every shop. It keeps borrowing small and lenders safe.
      </PlainWords>
      <ActionBar>
        <Button href={routes.merchant} variant="secondary">
          Back to home
        </Button>
      </ActionBar>
    </>
  );
}
