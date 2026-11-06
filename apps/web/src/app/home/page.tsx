import type { Metadata } from "next";
import { AppHeader, Button, Card, Heading, JarMark, Label, LedgerGrid, Page, Text, TextLink } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Choose how to start" };

export default function Page_() {
  return (
    <>
      <AppHeader home={routes.home} />
      <Page>
        <div className="flex flex-col gap-3 pt-2 md:pt-6">
          <Label>{APP_NAME}</Label>
          <Heading level={1} size="hero" className="max-w-[18ch]">
            Dollars for a shop&apos;s stock. A return for lenders.
          </Heading>
          <Text className="max-w-[56ch]">Shops get dollars today and repay a slice of each sale. Lenders earn on what shops repay.</Text>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <LedgerGrid className="flex">
            <div className="flex h-full flex-col gap-4 md:min-h-72">
              <JarMark size={44} on="dark" lit={2} />
              <div className="flex flex-col gap-2">
                <Heading level={2} size="h2" className="text-canvas">
                  Run a shop
                </Heading>
                <p className="m-0 max-w-[40ch] font-body text-read text-honeydew/90">Get dollars for stock now. You repay 10% of each sale, and a slow week slows repayment.</p>
              </div>
              <div className="mt-auto flex flex-col gap-2 md:flex-row md:flex-wrap">
                <Button href={routes.welcome} variant="lime">
                  Get started
                </Button>
                <Button href={routes.merchant} variant="secondary">
                  Open the demo shop
                </Button>
              </div>
            </div>
          </LedgerGrid>

          <Card padding="lg" gap="lg">
            <div className="flex h-full flex-col gap-4 md:min-h-72">
              <Label>Lenders</Label>
              <div className="flex flex-col gap-2">
                <Heading level={2} size="h2">
                  Lend
                </Heading>
                <Text className="max-w-[40ch]">Earn on a senior vault. Losses are absorbed first by each shop&apos;s drip, then by the junior vault.</Text>
              </div>
              <div className="mt-auto flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                <Button href={routes.earn}>Start earning</Button>
                <TextLink href={routes.junior}>Junior vault</TextLink>
              </div>
            </div>
          </Card>
        </div>

        <Card tone="well" className="md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <Heading level={2} size="h2">
              Public dashboard
            </Heading>
            <Text size="note">Anyone can check the protocol, no account needed.</Text>
          </div>
          <div className="flex flex-wrap gap-x-5">
            <TextLink href={routes.protocol} arrow>
              Protocol
            </TextLink>
            <TextLink href={routes.risk} arrow>
              Risk
            </TextLink>
            <TextLink href={routes.explorer} arrow>
              Explorer
            </TextLink>
          </div>
        </Card>
      </Page>
    </>
  );
}
