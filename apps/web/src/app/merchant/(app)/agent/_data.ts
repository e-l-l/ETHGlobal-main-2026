import { formatMoney } from "@/lib/format";
import { agentLimits, currentTier, limitsLadder } from "@/lib/mock/shop";

export type DecisionKind = "drew" | "declined" | "waited" | "paused";

export type Decision = {
  id: string;
  kind: DecisionKind;
  when: string;
  title: string;
  why: string;
  /** Which limits the agent stayed inside. */
  limits: string[];
};

const cap = formatMoney(limitsLadder[currentTier].cap);
const month = formatMoney(agentLimits.perMonth);

export const decisions: Decision[] = [
  {
    id: "d5",
    kind: "drew",
    when: "Today",
    title: "Drew for stock",
    why: "Sales are up 12% this week and you usually restock on Mondays, so repayment should be quick.",
    limits: [`Inside your ${cap} per-advance limit`, `Inside your ${month} monthly limit`, "Only for stock"],
  },
  {
    id: "d4",
    kind: "waited",
    when: "2 Nov",
    title: "Waited before drawing",
    why: "Sales were 40% below normal. The agent held off so repayment stays easy.",
    limits: [`Nothing drawn, ${month} monthly limit untouched`],
  },
  {
    id: "d3",
    kind: "declined",
    when: "28 Oct",
    title: "Declined a larger draw",
    why: `A bigger advance would pass your ${cap} per-advance limit. Higher limits unlock as you repay.`,
    limits: [`Held at your ${cap} per-advance limit`],
  },
  {
    id: "d2",
    kind: "paused",
    when: "22 Oct",
    title: "Paused after full repayment",
    why: "Your advance was fully repaid. The agent waits for the next good moment.",
    limits: ["No open advance", "Standing updated privately"],
  },
];

export const decisionTone = {
  drew: "saving",
  declined: "slow",
  waited: "locked",
  paused: "repaying",
} as const;

export const decisionLabel = {
  drew: "Drew",
  declined: "Declined",
  waited: "Waited",
  paused: "Paused",
} as const;

export const purposes = ["stock", "rent", "repairs"] as const;
export const perMonthOptions = [100, 200, 300, 500] as const;
