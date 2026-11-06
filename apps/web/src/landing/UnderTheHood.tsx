import { Card, Label, Text } from "@/final";
import { Eyebrow, Section, SectionTitle } from "./primitives";

const PARTS = [
  {
    tag: "Uniswap v4",
    title: "Pay in any token",
    body: "Customers pay in USDT, repayment settles in USDC. The Junior token trades on its own pool, guarded by a risk hook.",
  },
  {
    tag: "World ID",
    title: "One approval, then your agent works",
    body: "An Agent Pass turns your cash-flow agent on. If your phone is lost, a World ID check gets your shop back.",
  },
  {
    tag: "Anon-RPC",
    title: "No one watching the wire",
    body: "Every read goes through Anon-RPC, so nobody can tie your shop to your phone from the network.",
  },
];

export function UnderTheHood() {
  return (
    <Section className="flex flex-col gap-8">
      <div className="flex max-w-160 flex-col gap-3">
        <Eyebrow>Under the hood</Eyebrow>
        <SectionTitle>Open source, private by design.</SectionTitle>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
        {PARTS.map((p) => (
          <Card key={p.tag} tone="well" className="gap-2.5 p-6">
            <Label>{p.tag}</Label>
            <h3 className="m-0 font-display text-h2 font-bold tracking-normal">
              {p.title}
            </h3>
            <Text size="note" className="m-0">
              {p.body}
            </Text>
          </Card>
        ))}
      </div>
    </Section>
  );
}
