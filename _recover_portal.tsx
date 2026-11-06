import { Brand } from "@/components/layout";
import { LineChart, ResponsiveTable, StatCard, StatGrid } from "@/components/data";
import {
  Accent,
  Button,
  ButtonRow,
  Card,
  CardHeader,
  Eyebrow,
  Heading,
  Label,
  Mono,
  Pill,
  Text,
  TextField,
  TextLink,
} from "@/components/ui";
import { failedHref, routes } from "@/lib/routes";
import { SHOP } from "@/lib/mock/shop";

const sales = [80, 120, 90, 140, 210, 160, 240, 180, 260, 220, 300, 280];

export function PortalLogin() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-column flex-col justify-center gap-6 px-4 py-10">
      <Brand name="Vendora" />
      <Pill tone="tint">demo · stand-in for Mercado Pago</Pill>
      <div className="flex flex-col gap-3">
        <Heading level={1} size="md">
          Seller <Accent>dashboard</Accent>
        </Heading>
        <Text>Log in with a seeded account. A proof would read this page and leave the rest behind.</Text>
      </div>
      <Card>
        <TextField label="Email" defaultValue="lucia@cornerkiosk.demo" autoComplete="off" />
        <TextField label="Password" type="password" defaultValue="vendora" autoComplete="off" />
        <ButtonRow>
          <Button href={routes.portal}>Log in as Lucía</Button>
        </ButtonRow>
        <Mono>Passing account · Argentina · band 2 · 6+ months</Mono>
      </Card>
      <Card tone="subtle">
        <Eyebrow tone="muted">Other seeded accounts</Eyebrow>
        <div className="flex flex-col gap-2">
          <TextLink href={failedHref("too-new")}>Mateo · opened last month · too new</TextLink>
          <TextLink href={failedHref("suspended")}>Río Sur · account suspended</TextLink>
          <TextLink href={failedHref("revenue-low")}>Kiosco Norte · revenue too low</TextLink>
        </div>
      </Card>
    </main>
  );
}

export function PortalDashboard() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col gap-6 px-4 py-8 md:px-5 md:py-12">
      <header className="flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-center md:justify-between">
        <Brand name="Vendora" />
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone="accent" dot>
            Lucía · active
          </Pill>
          <TextLink href={routes.portalLogin}>Switch account</TextLink>
        </div>
      </header>
      <div className="flex flex-col gap-2">
        <Eyebrow>Corner Kiosk</Eyebrow>
        <Heading level={1} size="md">
          This week in the <Accent>shop</Accent>
        </Heading>
        <Text>Argentina · selling since 2023 · account in good standing. This is the page a private check reads.</Text>
      </div>
      <StatGrid>
        <StatCard label="Available" value="$1,240" sub="≈ ARS 1,860,000" />
        <StatCard label="This month" value="$3,400" sub="band 2" />
        <StatCard label="Sales days" value="6 / 7" sub="last 4 weeks" />
      </StatGrid>
      <Card>
        <CardHeader>
          <Label>Sales</Label>
        </CardHeader>
        <LineChart points={sales} ariaLabel="Sales rising across the last twelve periods" tone="accent-text" />
      </Card>
      <Card>
        <CardHeader>
          <Label>Latest transactions</Label>
        </CardHeader>
        <ResponsiveTable
          caption="Latest Vendora transactions"
          columns={[
            { key: "time", header: "Time" },
            { key: "what", header: "What" },
            { key: "amount", header: "Amount", align: "right" },
          ]}
          rows={[
            { id: 1, time: "14:32", what: "Card sale", amount: "ARS 15,000" },
            { id: 2, time: "13:10", what: "Card sale", amount: "ARS 8,200" },
            { id: 3, time: "11:48", what: "Transfer in", amount: "ARS 22,000" },
            { id: 4, time: "09:02", what: "Supplier payout", amount: "ARS 40,000" },
          ]}
        />
      </Card>
      <Bannerless />
      <ButtonRow hint={<Mono>the check learns band 2, not these rows</Mono>}>
        <Button href={routes.verifying}>Use this account to prove the shop</Button>
      </ButtonRow>
    </main>
  );
}

function Bannerless() {
  return (
    <Text size="small">
      Shop id on the advance app, once linked: {SHOP.id}. Vendora never shows that id to customers.
    </Text>
  );
}
