"use client";

import { useState } from "react";
import { KeyValueList } from "@/components/data";
import {
  AmountInput,
  Button,
  Mono,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextLink,
  TxSteps,
  type TxState,
} from "@/components/ui";

export type VaultSide = {
  value: string;
  label: string;
  unit: string;
  max: string;
  hint: string;
  quote: { k: string; v: string }[];
  steps: string[];
  doneHref: string;
  doneLabel: string;
};

export function VaultForm({ sides, label = "Vault action" }: { sides: [VaultSide, VaultSide]; label?: string }) {
  const [tab, setTab] = useState(sides[0].value);
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<{ current: number; state: TxState }>({ current: 0, state: "idle" });
  const side = sides.find((s) => s.value === tab) ?? sides[0];
  const done = tx.state === "done" && tx.current >= side.steps.length - 1;

  const run = () => {
    setTx((t) => ({ ...t, state: "wallet" }));
    window.setTimeout(() => setTx((t) => ({ ...t, state: "pending" })), 700);
    window.setTimeout(() => {
      setTx((t) => (t.current >= side.steps.length - 1 ? { current: t.current, state: "done" } : { current: t.current + 1, state: "idle" }));
    }, 1600);
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        setTab(next);
        setAmount("");
        setTx({ current: 0, state: "idle" });
      }}
    >
      <TabsList aria-label={label}>
        {sides.map((s) => (
          <TabsTrigger key={s.value} value={s.value}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {sides.map((s) => (
        <TabsContent key={s.value} value={s.value} className="flex flex-col gap-5">
          <AmountInput
            label="Amount"
            placeholder="0"
            unit={s.unit}
            value={tab === s.value ? amount : ""}
            onChange={(e) => setAmount(e.target.value)}
            onMax={() => setAmount(s.max)}
            hint={s.hint}
          />
          <KeyValueList size="sm" items={s.quote} />
          <TxSteps
            steps={s.steps}
            current={tab === s.value ? tx.current : 0}
            state={tab === s.value ? tx.state : "idle"}
            onAction={run}
            actionLabels={{ wallet: "Confirm in wallet", pending: "Confirming", done: s.doneLabel }}
          />
          {tab === s.value && done ? (
            <div className="flex flex-col gap-2">
              <Mono>Simulated. Nothing left this phone.</Mono>
              <Button href={s.doneHref}>{s.doneLabel}</Button>
              <TextLink href={s.doneHref}>Continue</TextLink>
            </div>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
