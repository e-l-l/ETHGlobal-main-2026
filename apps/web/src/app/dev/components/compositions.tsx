"use client";

import { useState, type ReactNode } from "react";
import {
  Accent,
  AmountInput,
  Banner,
  Button,
  ButtonRow,
  Card,
  CardHeader,
  Eyebrow,
  Heading,
  Label,
  Mono,
  Pill,
  PrivacyNote,
  StatusIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  TextLink,
  TxSteps,
  type TxState,
} from "@/components/ui";
import { KeyValueList, StatCard, StatGrid } from "@/components/data";
import {
  DevNotice,
  LenderHeader,
  LenderShell,
  MerchantHeader,
  MerchantShell,
  OnboardingShell,
  PageHeader,
  TwoColumn,
  WalletButton,
} from "@/components/layout";
import { AdvanceCard, PassCard, SalesFeed, SplitRow } from "@/components/domain";
import { DEMO } from "./demo-data";

function Frame({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 id={id} className="font-mono text-chip text-ink">
        {title}
      </h3>
      <div className="overflow-hidden rounded-lg border border-line-strong">{children}</div>
    </div>
  );
}

export function Compositions() {
  const [tx, setTx] = useState<{ current: number; state: TxState }>({ current: 0, state: "idle" });
  const [amount, setAmount] = useState("");
  const run = () => {
    setTx((t) => ({ ...t, state: "wallet" }));
    setTimeout(() => setTx((t) => ({ ...t, state: "pending" })), 800);
    setTimeout(() => setTx((t) => (t.current === 0 ? { current: 1, state: "idle" } : { current: 1, state: "done" })), 2000);
  };

  return (
    <section
      id="compositions"
      aria-labelledby="compositions-h"
      className="mx-auto flex max-w-app scroll-mt-6 flex-col gap-10 border-t border-line px-4 pt-10 pb-20 md:px-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="compositions-h" className="text-title text-ink">
          Compositions
        </h2>
        <p className="font-mono text-mono text-muted">Three real layouts built from the library only.</p>
      </div>

      {/* ------------------------------------------------------- M10 Home */}
      <Frame id="m10" title="M10 Home · MerchantShell, PageHeader, StatGrid, TwoColumn, Banner">
        <MerchantShell
          header={<MerchantHeader links={DEMO.merchantLinks} active="home" worldView={{ label: "world view", href: "#m10" }} />}
        >
          <PageHeader
            eyebrow={<Eyebrow>Tuesday · Nov 5</Eyebrow>}
            title={
              <Heading level={3} size="lg">
                {DEMO.heroTitle}
              </Heading>
            }
            aside={<Pill tone="accent" dot>agent active</Pill>}
          />
          <StatGrid>
            <StatCard label="Today" value="$184" sub="23 sales" />
            <StatCard label="This week" value="$1,240" sub={<TextLink href="#m10" arrow>see week</TextLink>} />
            <StatCard label="To repayment" value="$62" tone="up" />
          </StatGrid>
          {/* Advance card must come first on mobile: it sits in `side`, with side-first. */}
          <TwoColumn
            mobileOrder="side-first"
            main={
              <Card>
                <CardHeader aside={<TextLink href="#m10" arrow>activity log</TextLink>}>
                  <Label>Latest sales</Label>
                </CardHeader>
                <SalesFeed>
                  {DEMO.sales.map((s) => (
                    <SplitRow key={s.time} youLabel="to you" repayLabel="to repayment" {...s} />
                  ))}
                </SalesFeed>
              </Card>
            }
            side={
              <>
                <AdvanceCard {...DEMO.advance} />
                <Banner>Last sale announced: 14:32 · ARS 15,000</Banner>
              </>
            }
          />
        </MerchantShell>
      </Frame>

      {/* ------------------------------------------------ M04 Business Pass */}
      <Frame id="m04" title="M04 Business Pass · OnboardingShell, StatusIcon, PassCard, PrivacyNote, ButtonRow">
        <OnboardingShell
          steps={DEMO.onboardingSteps}
          current={1}
          railFooter="We never ask for your name, phone or contacts."
        >
          <StatusIcon kind="ok" />
          <div className="flex flex-col gap-3">
            <Heading level={3} size="md">
              Your business <Accent>pass</Accent> is ready
            </Heading>
            <Text>It proves your shop is real without showing anyone your sales.</Text>
          </div>
          <PassCard {...DEMO.businessPass} />
          <PrivacyNote>Not shared: your name, phone, contacts or individual sales.</PrivacyNote>
          <ButtonRow hint={<Mono>next: set up payouts</Mono>}>
            <Button>Continue</Button>
          </ButtonRow>
        </OnboardingShell>
      </Frame>

      {/* ------------------------------------------------------ L02 Deposit */}
      <Frame id="l02" title="L02 Deposit · LenderShell, Tabs, AmountInput, KeyValueList, TxSteps">
        <LenderShell
          notice={<DevNotice>demo: transfers are simulated</DevNotice>}
          header={
            <LenderHeader
              links={DEMO.lenderLinks}
              active="deposit"
              wallet={<WalletButton address="0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2" />}
            />
          }
        >
          <PageHeader
            eyebrow={<Eyebrow>Senior vault</Eyebrow>}
            title={
              <Heading level={3} size="lg">
                Earn from <Accent>real</Accent> shops
              </Heading>
            }
            description={<Text>Senior is paid back before junior. Withdraw any time liquidity allows.</Text>}
          />
          <TwoColumn
            main={
              <Card>
                <Tabs defaultValue="deposit">
                  <TabsList aria-label="Vault action">
                    <TabsTrigger value="deposit">Deposit</TabsTrigger>
                    <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                  </TabsList>
                  <TabsContent value="deposit" className="flex flex-col gap-5">
                    <AmountInput
                      label="Amount"
                      placeholder="0"
                      unit="USDC"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onMax={() => setAmount("2500")}
                      hint="Wallet balance: 2,500 USDC"
                    />
                    <KeyValueList
                      size="sm"
                      items={[
                        { k: "You receive", v: "2,441.4 sUSD" },
                        { k: "Share price", v: "$1.024" },
                        { k: "Current APY", v: "8.2%" },
                      ]}
                    />
                    <TxSteps
                      steps={["Approve USDC", "Deposit"]}
                      current={tx.current}
                      state={tx.state}
                      onAction={run}
                      actionLabels={{ wallet: "Confirm in wallet", pending: "Confirming", done: "Deposited" }}
                    />
                  </TabsContent>
                  <TabsContent value="withdraw">
                    <Text>Withdraw form goes here.</Text>
                  </TabsContent>
                </Tabs>
              </Card>
            }
            side={
              <Card tone="subtle">
                <Label>Vault</Label>
                <KeyValueList
                  size="sm"
                  items={[
                    { k: "TVL", v: "$310,000" },
                    { k: "Junior cushion", v: "13.5%" },
                    { k: "Advances out", v: "1,284" },
                  ]}
                />
              </Card>
            }
          />
        </LenderShell>
      </Frame>
    </section>
  );
}
