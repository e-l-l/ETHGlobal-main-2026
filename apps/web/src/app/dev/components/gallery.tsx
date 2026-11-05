"use client";

import { useState } from "react";
import {
  Accent,
  AmountInput,
  BackLink,
  Banner,
  Button,
  ButtonRow,
  Card,
  CardHeader,
  CheckItem,
  CheckList,
  Dialog,
  DialogClose,
  Eyebrow,
  Heading,
  Label,
  Mono,
  NumberStepper,
  OptionCard,
  OptionGroup,
  Pill,
  PrivacyNote,
  ProgressBar,
  ProgressSteps,
  SegmentedControl,
  SettingRow,
  Spinner,
  StatusIcon,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  TextField,
  TextLink,
  TxSteps,
  type TxState,
} from "@/components/ui";
import {
  ActivityItem,
  ActivityLog,
  Address,
  KeyValueList,
  LineChart,
  Money,
  ResponsiveTable,
  Stat,
  StatCard,
  StatGrid,
  WeekSplitBars,
} from "@/components/data";
import {
  Brand,
  DevNotice,
  LenderHeader,
  MerchantHeader,
  PageHeader,
  PayHeader,
  StepProgress,
  StepRail,
  TwoColumn,
  WalletButton,
  WorldViewToggle,
} from "@/components/layout";
import {
  AdvanceCard,
  AgentPermissions,
  EstimateTiles,
  LimitsLadder,
  LossWaterfall,
  PassCard,
  QRCard,
  SalesFeed,
  SplitRow,
  WorldViewList,
} from "@/components/domain";
import { ArrowRightIcon, BoltIcon, ShieldIcon } from "@/components/icons";
import { Group, Specimen } from "./kit";
import { DEMO } from "./demo-data";

const NAV = [
  ["typography", "Typography"],
  ["actions", "Actions"],
  ["surfaces", "Surfaces"],
  ["status", "Status"],
  ["data", "Data"],
  ["forms", "Forms"],
  ["layout", "Layout"],
  ["domain", "Domain"],
  ["compositions", "Compositions"],
] as const;

export function Gallery() {
  const [limit, setLimit] = useState(200);
  const [paused, setPaused] = useState(false);
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<{ current: number; state: TxState }>({ current: 0, state: "idle" });

  const advanceTx = () => {
    setTx((t) => ({ ...t, state: "wallet" }));
    setTimeout(() => setTx((t) => ({ ...t, state: "pending" })), 900);
    setTimeout(
      () => setTx((t) => (t.current === 0 ? { current: 1, state: "idle" } : { current: 1, state: "done" })),
      2200,
    );
  };

  return (
    <div className="mx-auto flex max-w-app flex-col gap-10 px-4 py-10 md:px-5 md:py-14">
      <header className="flex flex-col gap-4">
        <Brand />
        <Heading level={1} size="xl">
          Component <Accent>kit</Accent>
        </Heading>
        <Text size="lead">
          Every component in every variant. Tokens live in <Mono tone="ink">packages/tailwind-config/theme.css</Mono>.
          Hover states are live; tab through the page to see focus rings.
        </Text>
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-pill border border-line-strong bg-card px-3.5 font-mono text-chip text-ink hover:border-ink">
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* ------------------------------------------------------------ tokens */}
      <Group id="tokens" title="Tokens" usedIn="everything">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-3">
          {DEMO.swatches.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-14 rounded-md border border-line ${cls}`} />
              <span className="font-mono text-chip text-ink-soft">{name}</span>
            </div>
          ))}
        </div>
      </Group>

      {/* -------------------------------------------------------- typography */}
      <Group id="typography" title="4.1 Typography" usedIn="all screens">
        <Specimen name="Heading" note="size display · xl · lg · md · sm (mobile → md:)" className="flex-col">
          <Heading level={1} size="display">
            Today at your <Accent>shop</Accent>.
          </Heading>
          <Heading size="xl">
            Money <Accent>ahead</Accent> of sales.
          </Heading>
          <Heading size="lg">
            Your <Accent>advance</Accent>
          </Heading>
          <Heading size="md">
            Approve your agent <Accent>once</Accent>
          </Heading>
          <Heading size="sm" level={3}>
            Payment <Accent tone="down">failed</Accent>
          </Heading>
        </Specimen>
        <Specimen name="Eyebrow" note="tone accent · muted · ink · down · on-ink">
          <Eyebrow>Advance · stock</Eyebrow>
          <Eyebrow tone="muted">Public onchain</Eyebrow>
          <Eyebrow tone="ink">This week</Eyebrow>
          <Eyebrow tone="down">It can never</Eyebrow>
          <span className="rounded-md bg-ink px-3 py-1.5">
            <Eyebrow tone="on-ink">Business pass</Eyebrow>
          </span>
        </Specimen>
        <Specimen name="Label / Mono / Text">
          <div className="flex flex-col gap-3">
            <Label>Sales this week</Label>
            <Label htmlFor="demo-label-input">Label as &lt;label&gt;</Label>
            <input id="demo-label-input" className="sr-only" readOnly />
            <div className="flex flex-wrap gap-4">
              <Mono tone="ink">takes about 2 minutes</Mono>
              <Mono>≈ ARS 150,000</Mono>
              <Mono tone="accent">● live</Mono>
            </div>
            <Text size="lead" tone="ink">Lead: get cash for stock today, repay from sales.</Text>
            <Text>Body (soft): repayment happens automatically, a small slice of each sale.</Text>
            <Text size="small" tone="muted">Small muted: updated 2 minutes ago.</Text>
            <Text size="small" tone="down">Small down: that amount is above your limit.</Text>
          </div>
        </Specimen>
      </Group>

      {/* ----------------------------------------------------------- actions */}
      <Group id="actions" title="4.2 Actions" usedIn="all screens">
        <Specimen name="Button · variants (md, 50px)" note="full width under md, auto from md">
          <Button>Get advance</Button>
          <Button variant="ink">Continue</Button>
          <Button variant="outline">Not now</Button>
          <Button variant="danger">Write off</Button>
          <Button variant="ghost">Skip</Button>
        </Specimen>
        <Specimen name="Button · size sm (40px) + icons">
          <Button size="sm" iconEnd={<ArrowRightIcon size={16} />}>
            See week
          </Button>
          <Button size="sm" variant="outline" iconStart={<BoltIcon size={16} />}>
            Agent
          </Button>
        </Specimen>
        <Specimen name="Button · states" note="loading sets aria-busy; disabled; link via href">
          <Button loading>Verifying</Button>
          <Button variant="ink" loading>
            Sending
          </Button>
          <Button disabled>Get advance</Button>
          <Button href="#forms" variant="outline">
            As link
          </Button>
          <Button fullWidth>Always full width</Button>
        </Specimen>
        <Specimen name="ButtonRow" className="block">
          <ButtonRow hint={<Mono>takes about 2 minutes</Mono>}>
            <Button>Start</Button>
            <Button variant="outline">Learn more</Button>
          </ButtonRow>
        </Specimen>
        <Specimen name="BackLink · TextLink">
          <BackLink href="#actions" />
          <TextLink href="#actions" arrow>
            details
          </TextLink>
          <TextLink href="#actions">activity log</TextLink>
          <span className="rounded-md bg-ink px-3">
            <TextLink href="#actions" arrow onInk>
              see week
            </TextLink>
          </span>
        </Specimen>
      </Group>

      {/* ---------------------------------------------------------- surfaces */}
      <Group id="surfaces" title="4.3 Surfaces" usedIn="all screens; Dialog in M08">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
          <Card>
            <CardHeader aside={<TextLink href="#surfaces" arrow>details</TextLink>}>
              <Label>Card · default</Label>
            </CardHeader>
            <Text>Card bg, line border, never a shadow.</Text>
          </Card>
          <Card tone="ink">
            <CardHeader aside={<Pill tone="accent" dot>active</Pill>}>
              <Eyebrow tone="on-ink">Card · ink</Eyebrow>
            </CardHeader>
            <Text tone="on-ink">One hero per screen.</Text>
          </Card>
          <Card tone="tint">
            <Label className="text-accent-ink">Card · tint</Label>
            <Text tone="ink">Info tint.</Text>
          </Card>
          <Card tone="subtle" padding="sm">
            <Label>Card · subtle · padding sm</Label>
            <Text>Quiet fill.</Text>
          </Card>
        </div>
        <Specimen name="Banner" note="tone tint · warn · down · ink" className="flex-col items-stretch">
          <Banner>Last sale announced: 14:32 · $12.40</Banner>
          <Banner tone="warn">Quiet week. No penalty: repayment slows down with your sales.</Banner>
          <Banner tone="down">Payment failed. Nothing was charged.</Banner>
          <Banner tone="ink">Your agent paused itself after 3 failed attempts.</Banner>
        </Specimen>
        <Specimen name="Dialog" note="Radix: focus trap, Esc to close, the only shadow">
          <Dialog
            trigger={<Button variant="outline">Open dialog</Button>}
            icon={<StatusIcon kind="lock" />}
            title={
              <>
                Approve your agent <Accent>once</Accent>
              </>
            }
            description="It can move repayments from your sales. It can never spend anything else."
            closeLabel="Close"
            actions={
              <ButtonRow>
                <DialogClose asChild>
                  <Button>Approve</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="ghost">Not now</Button>
                </DialogClose>
              </ButtonRow>
            }
          >
            <AgentPermissions {...DEMO.permissions} />
          </Dialog>
        </Specimen>
      </Group>

      {/* ------------------------------------------------------------ status */}
      <Group id="status" title="4.4 Status and feedback" usedIn="M03, M04, M07, M08, M10, M14, M20, P03">
        <Specimen name="Pill" note="tone neutral · accent · tint · down · warn · ink; dot">
          <Pill>neutral</Pill>
          <Pill tone="accent" dot>
            agent active
          </Pill>
          <Pill tone="tint">quiet week · no penalty</Pill>
          <Pill tone="down">written off</Pill>
          <Pill tone="warn">watch</Pill>
          <Pill tone="ink">↓ 6.0% 7d</Pill>
        </Specimen>
        <Specimen name="CheckList / CheckItem">
          <CheckList>
            <CheckItem srLabel="Yes">We never ask for your name</CheckItem>
            <CheckItem srLabel="Yes">Repayment comes from sales only</CheckItem>
            <CheckItem ok={false} srLabel="No">
              Go past these limits
            </CheckItem>
          </CheckList>
        </Specimen>
        <Specimen name="StatusIcon · Spinner" note="kind ok · bad · lock; spinner 18 / 64, static under reduced motion">
          <StatusIcon kind="ok" label="Success" />
          <StatusIcon kind="bad" label="Error" />
          <StatusIcon kind="lock" label="Private" />
          <Spinner size={64} label="Verifying" />
          <Spinner />
          <span className="rounded-md bg-ink p-2">
            <Spinner onInk />
          </span>
        </Specimen>
        <Specimen name="ProgressBar" note="tone ink · accent; track line · ink-soft; height 4 · 6" className="flex-col items-stretch">
          <ProgressBar value={40} label="Repaid" />
          <ProgressBar value={72} tone="accent" height={4} label="Repaid" />
          <div className="bg-ink p-4">
            <ProgressBar value={60} tone="accent" track="ink-soft" label="Repaid" />
          </div>
        </Specimen>
        <Specimen name="PrivacyNote · ProgressSteps" className="flex-col items-stretch">
          <PrivacyNote>Not shared: your name, phone, contacts or individual sales.</PrivacyNote>
          <ProgressSteps steps={DEMO.progressSteps} />
        </Specimen>
      </Group>

      {/* -------------------------------------------------------------- data */}
      <Group id="data" title="4.5 Data display" usedIn="M10–M14, L01–L03, J01–J03, P01–P04">
        <Specimen name="Stat · sizes lg · xl · hero; tone up · down">
          <Stat label="Sales this week" value="$1,240" sub={<TextLink href="#data" arrow>see week</TextLink>} />
          <Stat label="Repaid" value="$46" size="xl" tone="up" sub="of $115" />
          <Stat label="NAV" value="$1.024" size="hero" />
          <Stat label="7d" value="−6.0%" tone="down" />
        </Specimen>
        <Specimen name="StatGrid + StatCard" note="auto-fit, minmax(160px)" className="block">
          <StatGrid>
            <StatCard label="Today" value="$184" sub="23 sales" />
            <StatCard label="This week" value="$1,240" />
            <StatCard label="To repayment" value="$62" tone="up" />
            <StatCard cardTone="ink" label="Limit" value="$250" />
          </StatGrid>
        </Specimen>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
          <Card>
            <Label>KeyValueList · md · solid</Label>
            <KeyValueList items={DEMO.fees} />
          </Card>
          <Card>
            <Label>KeyValueList · sm · links (settings rows)</Label>
            <KeyValueList size="sm" items={DEMO.settings} />
          </Card>
          <Card>
            <Label>KeyValueList · divider none</Label>
            <KeyValueList divider="none" size="sm" items={DEMO.fees.slice(0, 2)} />
          </Card>
        </div>
        <Specimen name="Money" note="figure + local approximation">
          <Money amount={150} local={{ amount: 150000, currency: "ARS" }} size="xl" />
          <Money amount={2500.5} currency="USDC" />
          <span className="rounded-lg bg-ink p-4">
            <Money amount={69} onInk accent local={{ amount: 69000, currency: "ARS" }} />
          </span>
        </Specimen>
        <Specimen name="Address" note="truncated mono with copy">
          <Address value="0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2" />
          <Address value="shop_7f3a" copyLabel="Copy pseudonym" />
        </Specimen>
        <Specimen name="ResponsiveTable" note="table from md, stacked blocks below" className="block">
          <ResponsiveTable caption="Recent trades" columns={DEMO.table.columns} rows={DEMO.table.rows} />
        </Specimen>
        <Specimen name="ActivityLog" note="kind neutral · accent · warn · down; meta" className="block">
          <ActivityLog>
            {DEMO.activity.map((a) => (
              <ActivityItem key={a.title} {...a} />
            ))}
          </ActivityLog>
        </Specimen>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
          <Card>
            <Label>LineChart · ink · write-off marker</Label>
            <LineChart points={DEMO.series} ariaLabel="NAV over 30 days, dipping at write-off" markers={[{ x: 18, label: "write-off" }]} />
          </Card>
          <Card>
            <Label>LineChart · accent-text</Label>
            <LineChart points={DEMO.series.map((p, i) => p + i * 0.6)} tone="accent-text" height={120} ariaLabel="Sales trend, rising" />
          </Card>
          <Card>
            <Label>WeekSplitBars</Label>
            <WeekSplitBars {...DEMO.week} />
          </Card>
        </div>
      </Group>

      {/* ------------------------------------------------------------- forms */}
      <Group id="forms" title="4.6 Forms" usedIn="M02–M06, M18, M19, C01, L02, J02, J03">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-6">
          <div className="flex flex-col gap-5">
            <TextField label="Shop name" placeholder="Tienda Lucía" hint="Shown on your QR" />
            <TextField label="Email" defaultValue="not-an-email" error="That doesn't look like an email." />
            <TextField label="Disabled" defaultValue="shop_7f3a" disabled />
          </div>
          <div className="flex flex-col gap-5">
            <AmountInput
              label="Amount"
              placeholder="0"
              unit="USDC"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onMax={() => setAmount("2500")}
              hint="≈ ARS 150,000 at today's rate"
            />
            <AmountInput label="Amount · error" defaultValue="900" unit="$" error="Above your $250 limit." />
          </div>
        </div>
        <Specimen name="SegmentedControl" note="disabled shows dashed + reason; subtle track for language" className="flex-col items-stretch">
          <SegmentedControl aria-label="Advance amount" defaultValue="100" options={DEMO.amounts} />
          <SegmentedControl aria-label="Language" track="subtle" defaultValue="en" options={DEMO.languages} />
        </Specimen>
        <Specimen name="NumberStepper · Switch / SettingRow" className="flex-col items-stretch">
          <NumberStepper label="Max per month" value={limit} onValueChange={setLimit} step={50} min={50} max={500} format={(v) => `$${v}`} />
          <Card padding="md" gap="none">
            <SettingRow
              title="Pause agent"
              description="It stops collecting until you turn it back on."
              control={({ labelId, descriptionId }) => (
                <Switch checked={paused} onCheckedChange={setPaused} aria-labelledby={labelId} aria-describedby={descriptionId} />
              )}
            />
            <SettingRow
              title="Disabled switch"
              control={({ labelId }) => <Switch disabled aria-labelledby={labelId} />}
            />
          </Card>
        </Specimen>
        <Specimen name="OptionCard" note="RadioGroup: arrow keys move selection" className="block">
          <OptionGroup aria-label="Cash out to" defaultValue="bank">
            {DEMO.destinations.map((d) => (
              <OptionCard key={d.value} selectedLabel="selected" {...d} />
            ))}
          </OptionGroup>
        </Specimen>
        <Specimen name="Tabs" className="block">
          <Tabs defaultValue="deposit">
            <TabsList aria-label="Action">
              <TabsTrigger value="deposit">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="deposit">
              <Text>Deposit panel.</Text>
            </TabsContent>
            <TabsContent value="withdraw">
              <Text>Withdraw panel.</Text>
            </TabsContent>
          </Tabs>
        </Specimen>
        <Specimen name="TxSteps" note="idle → wallet → pending → done → error (click to simulate)" className="flex-col items-stretch">
          <TxSteps
            steps={["Approve USDC", "Deposit"]}
            current={tx.current}
            state={tx.state}
            onAction={advanceTx}
            actionLabels={{ wallet: "Confirm in wallet", pending: "Confirming", done: "Deposited" }}
            hint="2 confirmations in your wallet"
          />
          <Button size="sm" variant="ghost" fullWidth={false} className="self-start" onClick={() => setTx({ current: 0, state: "idle" })}>
            Reset
          </Button>
          <TxSteps
            steps={["Approve USDC", "Deposit"]}
            current={1}
            state="error"
            actionLabels={{ error: "Try again" }}
            errorMessage="The wallet rejected the request. Nothing moved."
          />
        </Specimen>
      </Group>

      {/* ------------------------------------------------------------ layout */}
      <Group id="layout" title="4.7 Layout and navigation" usedIn="all screens; OnboardingShell M02–M06; PayHeader C01–C02">
        <Specimen name="Brand · WorldViewToggle · WalletButton">
          <Brand />
          <WorldViewToggle href="#layout" label="world view" />
          <WorldViewToggle href="#layout" label="world view" pressed />
          <WalletButton address="0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2" />
          <WalletButton connectLabel="Connect" />
        </Specimen>
        <Specimen name="MerchantHeader" className="block overflow-hidden p-0 md:p-0">
          <MerchantHeader links={DEMO.merchantLinks} active="home" worldView={{ label: "world view", href: "#layout" }} />
        </Specimen>
        <Specimen name="LenderHeader" note="mobile: links scroll horizontally with fade edges" className="block overflow-hidden p-0 md:p-0">
          <LenderHeader links={DEMO.lenderLinks} active="deposit" wallet={<WalletButton address="0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2" />} />
        </Specimen>
        <Specimen name="PageHeader" className="block">
          <PageHeader
            eyebrow={<Eyebrow>Agent</Eyebrow>}
            title={
              <Heading level={3} size="lg">
                Your <Accent>agent</Accent> log
              </Heading>
            }
            description={<Text>Everything it did, and why.</Text>}
            aside={<Pill tone="accent" dot>agent active</Pill>}
          />
        </Specimen>
        <Specimen name="TwoColumn" note="ratio 3:2; mobileOrder side-first" className="block">
          <TwoColumn
            mobileOrder="side-first"
            main={<Card tone="subtle">main (second on mobile)</Card>}
            side={<Card tone="tint">side (first on mobile)</Card>}
          />
        </Specimen>
        <Specimen name="StepRail · StepProgress" className="items-stretch">
          <StepRail steps={DEMO.onboardingSteps} current={1} footer="We never ask for your name, phone or contacts." className="w-full max-w-[380px] rounded-lg" />
          <StepProgress steps={DEMO.onboardingSteps} current={1} className="w-full max-w-[360px]" />
        </Specimen>
        <Specimen name="PayHeader · DevNotice" className="flex-col items-stretch">
          <PayHeader shopName="Tienda Lucía" initials="TL" sub="shop_7f3a" />
          <DevNotice>demo: transfers are simulated</DevNotice>
        </Specimen>
      </Group>

      {/* ------------------------------------------------------------ domain */}
      <Group id="domain" title="4.8 Domain" usedIn="M04, M06–M08, M10, M12, M13, M16, L01, J01, P01">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
          <AdvanceCard {...DEMO.advance} />
          <PassCard {...DEMO.businessPass} />
          <PassCard {...DEMO.standingPass} />
          <Card>
            <Label>LimitsLadder</Label>
            <LimitsLadder tiers={DEMO.tiers} currentIndex={1} />
          </Card>
          <Card>
            <Label>SalesFeed / SplitRow</Label>
            <SalesFeed>
              {DEMO.sales.map((s) => (
                <SplitRow key={s.time} youLabel="to you" repayLabel="to repayment" {...s} />
              ))}
            </SalesFeed>
          </Card>
          <Card>
            <Label>EstimateTiles</Label>
            <EstimateTiles tiles={DEMO.estimates} />
          </Card>
        </div>
        <Card>
          <AgentPermissions {...DEMO.permissions} />
        </Card>
        <LossWaterfall tiers={DEMO.waterfall} />
        <WorldViewList {...DEMO.worldView} />
        <div className="max-w-[400px]">
          <QRCard value="https://example.com/pay/shop_7f3a" shopName="Tienda Lucía" pseudonym="shop_7f3a" shareLabel="Share" printLabel="Print" qrLabel="QR code to pay Tienda Lucía" />
        </div>
        <div className="flex flex-wrap gap-3">
          <ShieldIcon className="text-accent-text" />
          <Mono>icons: inline SVG, currentColor, stroke 2</Mono>
        </div>
      </Group>
    </div>
  );
}
