import { LossWaterfall } from "@/components/domain";
import {
  ActivityItem,
  ActivityLog,
  Address,
  KeyValueList,
  LineChart,
  ResponsiveTable,
  StatCard,
  StatGrid,
} from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import {
  Accent,
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
  Text,
  TextLink,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { SHOP } from "@/lib/mock/shop";
import {
  VAULT,
  explorerShops,
  juniorSeries,
  positionRows,
  riskLog,
  seniorSeries,
  tradeRows,
  waterfall,
} from "@/lib/mock/lend";
import { SeesLink, WorldSection } from "@/screens/world";
import { LenderFrame } from "@/screens/lend/frame";
import { VaultForm } from "@/screens/lend/vault-form";

export function EarnScreen() {
  return (
    <LenderFrame active="earn">
      <PageHeader
        eyebrow={<Eyebrow>Senior vault · ERC-4626</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Earn from <Accent>real</Accent> shops
          </Heading>
        }
        description={
          <Text>Senior is paid back before junior. You can withdraw whenever the vault has cash that is not out in an advance.</Text>
        }
        aside={<SeesLink href="#world" />}
      />
      <StatGrid>
        <StatCard label="Vault APY" value={VAULT.apy} sub="fees, not a promised rate" tone="up" />
        <StatCard label="Total lent" value={VAULT.tvl} sub={`${VAULT.advancesOut} advances out`} />
        <StatCard label="Default rate" value={VAULT.defaultRate} sub="junior absorbed the last one" />
      </StatGrid>
      <TwoColumn
        main={
          <Card>
            <CardHeader aside={<TextLink href={routes.junior} arrow>junior vault</TextLink>}>
              <Label>How a loss is covered</Label>
            </CardHeader>
            <LossWaterfall tiers={waterfall} />
            <Mono>Of each fee: {VAULT.feeSplit}.</Mono>
          </Card>
        }
        side={
          <>
            <Banner tone="tint">
              A shop stopped selling for 30 days. Junior took the $100 write-off. This vault was not touched.
            </Banner>
            <Card tone="subtle">
              <Label>Right now</Label>
              <KeyValueList
                size="sm"
                items={[
                  { k: "Share price", v: VAULT.sharePrice },
                  { k: "Junior cushion", v: VAULT.juniorCushion },
                  { k: "Outstanding", v: VAULT.outstanding },
                  { k: "Cash you can withdraw", v: VAULT.availableToWithdraw },
                ]}
              />
            </Card>
          </>
        }
      />
      <ButtonRow>
        <Button href={routes.deposit}>Deposit USDC</Button>
        <Button href={routes.position} variant="outline">
          My position
        </Button>
        <Button href={routes.risk} variant="ghost">
          See the risk note
        </Button>
      </ButtonRow>
      <WorldSection
        publicItems={[
          { k: "Vault", v: VAULT.tvl },
          { k: "Default rate", v: VAULT.defaultRate },
          { k: "Your identity", v: "not here" },
        ]}
        privateItems={[
          { k: "This wallet", v: "connected in the demo" },
          { k: "Which shop defaulted", v: "a pseudonym, on the explorer" },
          { k: "Merchant books", v: "never sent to lenders" },
        ]}
      />
    </LenderFrame>
  );
}

export function DepositScreen() {
  return (
    <LenderFrame active="deposit">
      <PageHeader
        eyebrow={<Eyebrow>Senior vault</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Add or take out <Accent>dollars</Accent>
          </Heading>
        }
        description={<Text>Senior is paid back before junior. Withdraw any time liquidity allows.</Text>}
      />
      <TwoColumn
        main={
          <Card>
            <VaultForm
              sides={[
                {
                  value: "deposit",
                  label: "Deposit",
                  unit: "USDC",
                  max: "2500",
                  hint: `Wallet balance: ${VAULT.walletUsdc}`,
                  quote: [
                    { k: "You receive", v: VAULT.receivedShares },
                    { k: "Share price", v: VAULT.sharePrice },
                    { k: "Current APY", v: VAULT.apy },
                  ],
                  steps: ["Approve USDC", "Deposit"],
                  doneHref: routes.position,
                  doneLabel: "See position",
                },
                {
                  value: "withdraw",
                  label: "Withdraw",
                  unit: "sUSD",
                  max: "1840",
                  hint: `Available now: ${VAULT.availableToWithdraw}. The rest is out in advances.`,
                  quote: [
                    { k: "You receive", v: "1,840 USDC" },
                    { k: "Share price", v: VAULT.sharePrice },
                    { k: "Still in advances", v: "locked until shops repay" },
                  ],
                  steps: ["Withdraw"],
                  doneHref: routes.position,
                  doneLabel: "Withdrew",
                },
              ]}
            />
          </Card>
        }
        side={
          <Card tone="subtle">
            <Label>Vault</Label>
            <KeyValueList
              size="sm"
              items={[
                { k: "TVL", v: VAULT.tvl },
                { k: "Junior cushion", v: VAULT.juniorCushion },
                { k: "Advances out", v: VAULT.advancesOut },
              ]}
            />
            <TextLink href={routes.earn} arrow>
              back to earn
            </TextLink>
          </Card>
        }
      />
    </LenderFrame>
  );
}

export function PositionScreen() {
  return (
    <LenderFrame active="position">
      <PageHeader
        eyebrow={<Eyebrow>Your senior shares</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            {VAULT.positionValue} <Accent>working</Accent>
          </Heading>
        }
        description={<Text>Shares, what they are worth, and what the fees have added. The last write-off did not move this line.</Text>}
        aside={<Pill tone="tint">senior untouched</Pill>}
      />
      <StatGrid>
        <StatCard label="Shares" value={VAULT.positionShares} />
        <StatCard label="Value" value={VAULT.positionValue} sub={`price ${VAULT.sharePrice}`} />
        <StatCard label="Earned" value={VAULT.positionEarned} tone="up" sub="since Nov 2" />
      </StatGrid>
      <Card>
        <CardHeader>
          <Label>Value of 1 share</Label>
        </CardHeader>
        <LineChart
          points={seniorSeries}
          ariaLabel="Share value climbing from 100 to about 102.5, flat across the latest write-off"
          markers={[{ x: 8, label: "write-off", tone: "muted" }]}
        />
      </Card>
      <Card>
        <CardHeader aside={<TextLink href={routes.deposit} arrow>deposit</TextLink>}>
          <Label>Activity</Label>
        </CardHeader>
        <ResponsiveTable
          caption="Senior position activity"
          columns={[
            { key: "when", header: "When" },
            { key: "action", header: "What" },
            { key: "amount", header: "Amount", align: "right" },
            { key: "shares", header: "Shares", align: "right" },
          ]}
          rows={positionRows}
        />
      </Card>
    </LenderFrame>
  );
}

export function JuniorScreen() {
  return (
    <LenderFrame active="junior">
      <PageHeader
        eyebrow={<Eyebrow>Junior token · first loss</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            You get paid to stand <Accent>first</Accent>
          </Heading>
        }
        description={
          <Text>
            Junior takes the first write-off and earns a larger share of fees for its size. The price on Uniswap is the market's read of this book. Merchants never have to trade it.
          </Text>
        }
      />
      <StatGrid>
        <StatCard label="Junior capital" value={VAULT.junior} sub="minted against USDC" />
        <StatCard label="Fee share" value="30%" sub="of each advance fee" />
        <StatCard label="Coverage" value={VAULT.coverage} tone="up" sub="junior + reserve, over advances out" />
      </StatGrid>
      <TwoColumn
        main={
          <Card>
            <CardHeader aside={<Mono>live {VAULT.juniorPrice}</Mono>}>
              <Label>Junior price</Label>
            </CardHeader>
            <LineChart
              points={juniorSeries}
              tone="accent-text"
              ariaLabel="Junior price easing, then dropping when a shop is written off, and recovering partway"
              markers={[{ x: 7, label: "write-off", tone: "down" }]}
            />
            <Text>TWAP the risk agent reads: {VAULT.juniorTwap}. It can only tighten limits, never loosen them.</Text>
          </Card>
        }
        side={
          <Card tone="subtle">
            <Label>Coverage</Label>
            <KeyValueList
              size="sm"
              items={[
                { k: "Junior", v: VAULT.junior },
                { k: "Reserve", v: VAULT.reserve },
                { k: "Advances outstanding", v: VAULT.outstanding },
                { k: "Your jUSD", v: VAULT.juniorBalance },
              ]}
            />
          </Card>
        }
      />
      <ButtonRow>
        <Button href={routes.mint}>Mint or redeem</Button>
        <Button href={routes.trade} variant="outline">
          Trade the pool
        </Button>
      </ButtonRow>
    </LenderFrame>
  );
}

export function MintScreen() {
  return (
    <LenderFrame active="junior">
      <PageHeader
        eyebrow={<Eyebrow>Junior</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Mint or <Accent>redeem</Accent>
          </Heading>
        }
        description={<Text>Junior tokens are minted and redeemed against USDC. You are first in line for losses, and for a larger slice of fees.</Text>}
      />
      <TwoColumn
        main={
          <Card>
            <VaultForm
              label="Junior action"
              sides={[
                {
                  value: "mint",
                  label: "Mint",
                  unit: "USDC",
                  max: "2500",
                  hint: `Wallet balance: ${VAULT.walletUsdc}`,
                  quote: [
                    { k: "You receive", v: "2,546 jUSD" },
                    { k: "Price", v: VAULT.juniorPrice },
                    { k: "You stand behind", v: "every open advance" },
                  ],
                  steps: ["Approve USDC", "Mint"],
                  doneHref: routes.junior,
                  doneLabel: "Minted",
                },
                {
                  value: "redeem",
                  label: "Redeem",
                  unit: "jUSD",
                  max: "420",
                  hint: `Your balance: ${VAULT.juniorBalance}. Redeem waits if junior is covering a loss.`,
                  quote: [
                    { k: "You receive", v: "412.44 USDC" },
                    { k: "Price", v: VAULT.juniorPrice },
                    { k: "Coverage after", v: "still above the last write-off" },
                  ],
                  steps: ["Redeem"],
                  doneHref: routes.junior,
                  doneLabel: "Redeemed",
                },
              ]}
            />
          </Card>
        }
        side={
          <Card tone="subtle">
            <Label>Why it trades</Label>
            <Text>The pool is seeded for the demo. Thin liquidity is expected. Advance fees carry the economics, not trading fees.</Text>
            <TextLink href={routes.trade} arrow>
              open the pool
            </TextLink>
          </Card>
        }
      />
    </LenderFrame>
  );
}

export function TradeScreen() {
  return (
    <LenderFrame active="trade">
      <PageHeader
        eyebrow={<Eyebrow>Uniswap v4 · junior / USDC</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            The price of <Accent>risk</Accent>
          </Heading>
        }
        description={
          <Text>
            Swap junior for USDC. A falling price is the signal the risk agent reads. Merchants do not see this screen.
          </Text>
        }
        aside={<Pill tone="down">last print {VAULT.juniorPrice}</Pill>}
      />
      <TwoColumn
        main={
          <Card>
            <VaultForm
              label="Trade side"
              sides={[
                {
                  value: "buy",
                  label: "Buy",
                  unit: "USDC",
                  max: "2500",
                  hint: "Buying jUSD. The demo pool is seeded.",
                  quote: [
                    { k: "You receive", v: "≈ 2,546 jUSD" },
                    { k: "Price", v: VAULT.juniorPrice },
                    { k: "TWAP", v: VAULT.juniorTwap },
                  ],
                  steps: ["Approve USDC", "Swap"],
                  doneHref: routes.risk,
                  doneLabel: "Swapped",
                },
                {
                  value: "sell",
                  label: "Sell",
                  unit: "jUSD",
                  max: "420",
                  hint: `Your balance: ${VAULT.juniorBalance}`,
                  quote: [
                    { k: "You receive", v: "≈ 412 USDC" },
                    { k: "Price", v: VAULT.juniorPrice },
                    { k: "Hook fee", v: "a skim into the reserve" },
                  ],
                  steps: ["Approve jUSD", "Swap"],
                  doneHref: routes.risk,
                  doneLabel: "Swapped",
                },
              ]}
            />
          </Card>
        }
        side={
          <Card>
            <Label>Price</Label>
            <LineChart
              points={juniorSeries}
              height={120}
              tone="accent-text"
              ariaLabel="Junior token price dipping on a write-off"
              markers={[{ x: 7, label: "write-off", tone: "down" }]}
            />
          </Card>
        }
      />
      <Card>
        <CardHeader>
          <Label>Recent swaps</Label>
        </CardHeader>
        <ResponsiveTable
          caption="Recent junior token swaps"
          columns={[
            { key: "time", header: "Time" },
            { key: "side", header: "Side" },
            { key: "amount", header: "Amount", align: "right" },
            { key: "price", header: "Price", align: "right" },
          ]}
          rows={tradeRows}
        />
      </Card>
    </LenderFrame>
  );
}

export function ProtocolScreen() {
  return (
    <LenderFrame active="protocol">
      <PageHeader
        eyebrow={<Eyebrow>Public</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            The book, <Accent>in the open</Accent>
          </Heading>
        }
        description={<Text>Totals anyone can read. No shop name is tied to a person. Reads go through Anon-RPC.</Text>}
      />
      <StatGrid>
        <StatCard label="Outstanding" value={VAULT.outstanding} />
        <StatCard label="Repaid" value="$86,400" tone="up" sub="this season" />
        <StatCard label="Write-offs" value="$100" sub="junior absorbed" />
      </StatGrid>
      <TwoColumn
        main={
          <Card>
            <Label>Capital</Label>
            <KeyValueList
              size="sm"
              items={[
                { k: "Senior vault", v: VAULT.senior },
                { k: "Junior", v: VAULT.junior },
                { k: "Reserve", v: VAULT.reserve },
                { k: "Junior TWAP", v: VAULT.juniorTwap },
                { k: "Fee split", v: VAULT.feeSplit },
              ]}
            />
          </Card>
        }
        side={
          <Card tone="subtle">
            <Label>Current limits · band 2</Label>
            <KeyValueList
              size="sm"
              items={SHOP.limits.map((tier) => ({ k: tier.label, v: tier.cap }))}
            />
            <Text>Risk just tightened the live cap. The ladder above is the ceiling, not a promise.</Text>
            <TextLink href={routes.risk} arrow>
              risk status
            </TextLink>
          </Card>
        }
      />
    </LenderFrame>
  );
}

export function RiskScreen() {
  return (
    <LenderFrame active="risk">
      <PageHeader
        eyebrow={<Eyebrow>Risk agent</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Limits only move <Accent tone="down">down</Accent>
          </Heading>
        }
        description={
          <Text>
            The agent watches the junior TWAP, the default rate, and how fast shops repay. It can tighten caps inside a preset band. Putting them back needs a person, or a timelock.
          </Text>
        }
      />
      <Banner tone="warn">
        14:41 UTC · cap per tier lowered after junior TWAP crossed under $0.97. Senior lenders were not written down.
      </Banner>
      <Card>
        <CardHeader aside={<TextLink href={routes.trade} arrow>the price</TextLink>}>
          <Label>Why it moved</Label>
        </CardHeader>
        <ActivityLog>
          {riskLog.map((item) => (
            <ActivityItem key={item.title} {...item} />
          ))}
        </ActivityLog>
      </Card>
      <ButtonRow>
        <Button href={routes.earn} variant="outline">
          Senior, still whole
        </Button>
        <Button href={routes.explorer} variant="ghost">
          Which shop, without a name
        </Button>
      </ButtonRow>
    </LenderFrame>
  );
}

export function ExplorerScreen() {
  return (
    <LenderFrame active="explorer">
      <PageHeader
        eyebrow={<Eyebrow>Explorer</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Shops, not <Accent>people</Accent>
          </Heading>
        }
        description={
          <Text>A pseudonym, a commitment, a nullifier. No name, phone, or line from an old shop to a fresh one.</Text>
        }
      />
      <div className="flex flex-col gap-4">
        {explorerShops.map((shop) => (
          <Card key={shop.id}>
            <CardHeader aside={<Pill tone="neutral">{shop.name}</Pill>}>
              <Address value={shop.id} full copyLabel="Copy shop id" />
            </CardHeader>
            <KeyValueList
              size="sm"
              items={[
                { k: "Commitment", v: <Address value={shop.commitment} copyLabel="Copy commitment" /> },
                { k: "Nullifier", v: shop.nullifier === "—" ? "—" : <Address value={shop.nullifier} copyLabel="Copy nullifier" /> },
                { k: "Note", v: shop.note },
              ]}
            />
          </Card>
        ))}
      </div>
      <Banner>shop_b19c repaid somewhere, then rotated. The chain cannot show you which stall it used to be.</Banner>
    </LenderFrame>
  );
}
