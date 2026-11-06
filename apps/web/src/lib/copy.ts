/**
 * Merchant onboarding and customer pay copy.
 * Voice rules: anay-design.md section 10 and anay-docs/ux.md "Words to use and avoid".
 * Short sentences that translate cleanly. No loan, interest, APR, gas, wallet or proof words.
 * Brand panel titles come in two parts: `title` plus the lime `accent` phrase.
 */

const en = {
  welcome: {
    eyebrow: "For shops in Buenos Aires",
    title: "Dollars for stock,",
    accent: "today.",
    body: "A small dollar advance for your stock. While it's active, a slice of each sale repays it; the demo uses 8%. Repay on time and your limit grows.",
    heading: "How it works",
    promises: [
      { title: "Prove the shop, not you", body: "Four facts from your seller account. Never your name, phone or contacts." },
      { title: "You set the limits", body: "Your agent only draws stock inside them." },
      { title: "Slow week? No late fee", body: "Repayment is a slice of each sale, so it slows when sales do." },
    ],
    cta: "Prove your business",
    back: "Back",
    restore: "New phone? Restore your shop with World ID",
  },
  steps: (at: number) => `Step ${at} of 4`,
  stepNames: ["Prove your business", "Verifying", "Business Pass", "Your shop"],
  prove: {
    title: "Your sales already",
    accent: "vouch for you.",
    panel: "Months of selling on your seller app are your credit history. A demo attestor checks them and we keep only four facts.",
    heading: "Log in to your seller account",
    body: "Use the demo seller portal and mock attestor to check four facts. The issuer sees the account ID transiently.",
    whereSell: "Where you sell",
    sources: [
      { name: "Demo seller portal", sub: "Stands in for Mercado Pago in this demo" },
      { name: "Other seller apps", sub: "Coming soon" },
    ],
    weCheck: "We read",
    facts: [
      { k: "Country", v: "Where you sell" },
      { k: "Revenue band", v: "A range, not a number" },
      { k: "Selling for", v: "6+ months" },
      { k: "Standing", v: "Account active" },
    ],
    neverTitle: "We never see",
    never: ["Your name", "Your phone", "Single sales", "Your customers"],
    time: "About 30 seconds. The check runs on this phone.",
    cta: "Open seller login",
    demoShop: "Use the demo shop",
    showFail: "Show a failed check",
    failTitle: "Pick an outcome",
    failBody: "Each one is a seeded portal account.",
  },
  verifying: {
    title: "Checking your record",
    accent: "privately.",
    panel: "The demo uses a mock attestor; the issuer sees the account ID transiently.",
    heading: "Almost there",
    body: "Usually 5 to 30 seconds. You can keep this screen open.",
    steps: ["Reading the seller portal", "Checking the four facts on this phone", "Saving your Business Pass"],
    cancel: "Cancel",
  },
  pass: {
    title: "You're verified.",
    accent: "We learned nothing else.",
    panel: "Your Business Pass lives on this phone. It proves your shop is real without showing who you are.",
    heading: "Your Business Pass",
    body: "Kept on this phone. Nothing else leaves it.",
    onPhone: "On this phone",
    facts: [
      { k: "Country", v: "Argentina" },
      { k: "Revenue band", v: "Band 2" },
      { k: "Selling for", v: "6+ months" },
    ],
    learned: "The issuer sees the account ID transiently.",
    next: "Your first limit starts small. It grows each time you repay.",
    cta: "Create your shop",
  },
  failed: {
    eyebrow: "Verification",
    title: "Not yet.",
    accent: "Here's what to do.",
    panel: "Nothing from this check was kept. You can try again whenever you're ready.",
    notVerified: "Not verified",
    others: "Other reasons a check can fail",
    "too-new": {
      tag: "Too new",
      title: "Your shop is too new",
      body: "We need 6 months of sales in the portal.",
      next: "Keep selling and come back. Nothing about this check was saved.",
    },
    suspended: {
      tag: "Suspended",
      title: "This seller account is suspended",
      body: "The portal says the account is suspended.",
      next: "Clear it with the portal, then try again. We did not keep your login.",
    },
    "revenue-low": {
      tag: "Revenue too low",
      title: "Sales are under the first band",
      body: "Band 1 starts around $500 a month. We only learned the account is under it, not the number.",
      next: "Try again when monthly sales grow. Nothing was saved.",
    },
    generic: {
      tag: "Not verified",
      title: "We couldn't verify this account",
      body: "The portal didn't return the four facts.",
      next: "Try again, or use another account.",
    },
    retry: "Try another account",
    start: "Back to start",
  },
  shop: {
    panelTitle: "Get your",
    accent: "payment QR.",
    panel: "Customers scan it and pay in any token. You get dollars, and the contract splits each payment for you.",
    title: "Name your shop",
    body: "Customers see this name on the QR and checkout. Never your own name, and never anything about an advance.",
    label: "Shop name",
    hint: "Keep it ordinary. Not your own name.",
    ideas: "Ideas",
    qr: "Payment QR",
    cta: "Set up your agent",
    preview: "Preview the checkout",
    empty: "Add a name to continue",
  },
};

export const copy = en;

/* Customer pay. The payer never sees an advance, a fee or a balance. */
const payEn = {
  verified: "You are paying",
  secured: (app: string) => `Secured by ${app}`,
  panel: "Pay with any token. The shop gets dollars.",
  amount: "Amount",
  hint: "Arrives as dollars. Network fee covered.",
  pay: (amt: string) => `Pay ${amt}`,
  enter: "Enter an amount",
  exampleRate: "example rate",
  paying: "Paying",
  funding: "Getting your test dollars…",
  testUsdc: "Testnet: pays in test USDC. Network fee covered.",
  failed: (code: string) => `Payment didn't go through (${code}). Nothing was charged.`,
  etherscan: "See it on Etherscan",
  paidEyebrow: "Payment complete",
  paidTitle: (amt: string) => `Paid ${amt}`,
  paidTo: (shop: string) => `to ${shop}`,
  receipt: "Receipt",
  sent: "You sent",
  received: (shop: string) => `${shop} received`,
  fee: "Network fee",
  covered: "Covered",
  ref: "Reference",
  done: "Done",
  shopPhone: "See the shop's phone",
};
export const payCopy = payEn;

/** Brand panel eyebrow for an onboarding step, e.g. "Step 1 of 4 · Prove your business". */
export function stepEyebrow(at: number) {
  return `${copy.steps(at)} · ${copy.stepNames[at - 1] ?? ""}`;
}
