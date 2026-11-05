# Frontend split: 2 people, 34 screens

Scope: build every screen from the design canvas as static, responsive pages (390px and 1440px) using the existing component library and mock data. Nothing is functional, and links between screens are the only interactivity.

## The rule

Split by **shell**, so each person owns whole layouts and never edits the same file as the other:

- **Person A, the merchant's app** (after sign-up): every screen inside `MerchantShell`, the one with the Home / Agent / My QR / Settings header.
- **Person B, everything outside it**: merchant onboarding (`OnboardingShell`), the customer pay page, the demo seller portal, and all lender and public pages (`LenderShell`).

Effort is roughly even. A has 15 screens, and B has 19, but B's are simpler or repeat one layout.

---

## Person A: Merchant app (15 screens)

| Canvas | Route | Notes |
|---|---|---|
| M07 Agent setup | `/agent/setup` | SegmentedControl with a locked option, NumberStepper, AgentPermissions |
| M08 Approve | `/agent/approve` | Dialog over a dimmed page |
| M09 Agent denied | `/agent/denied` | |
| M10 Home | `/home` | StatGrid, AdvanceCard, SalesFeed, Banner. **Mobile: advance card first** |
| M11 Advance arrived | `/advance/arrived` | |
| M12 Advance details | `/advance` | LineChart, EstimateTiles |
| M13 Bad week | `/week` | WeekSplitBars |
| M14 Agent log | `/agent` | ActivityLog |
| M15 Manage agent | `/agent/manage` | Switch, danger button |
| M16 Repaid | `/repaid` | PassCard (standing), LimitsLadder |
| M17 Fresh shop | `/settings/fresh-shop` | |
| M18 Cash out | `/cash-out` | AmountInput, OptionCard list |
| M19 Settings | `/settings` | |
| M20 Recover | `/settings/recover` | ProgressSteps, no app header |
| P01 World view | `/world-view` | WorldViewList |

## Person B: Onboarding, customer, portal, lenders (19 screens)

| Canvas | Route | Notes |
|---|---|---|
| M01 Welcome | `/` | |
| M02 Prove business | `/onboarding/prove` | OnboardingShell + StepRail |
| M03 Verifying | `/onboarding/verifying` | ProgressSteps, Spinner |
| M04 Business Pass | `/onboarding/pass` | PassCard (business) |
| M05 Failed | `/onboarding/failed` | |
| M06 Create shop | `/onboarding/shop` | QRCard, then links to `/agent/setup` (A's) |
| C01 Pay | `/pay/corner-kiosk` | PayHeader, AmountInput |
| C02 Paid | `/pay/corner-kiosk/paid` | |
| S01 Portal login | `/portal/login` | Separate fictional brand "Vendora (demo)", with its own blue palette, local to these two pages |
| S02 Portal dashboard | `/portal` | |
| L01 Earn | `/earn` | LossWaterfall |
| L02 Deposit | `/earn/deposit` | Tabs, TxSteps |
| L03 Position | `/earn/position` | LineChart, ResponsiveTable |
| J01 Junior | `/junior` | |
| J02 Mint | `/junior/mint` | |
| J03 Trade | `/junior/trade` | LineChart, Tabs |
| P02 Protocol | `/protocol` | |
| P03 Risk | `/risk` | ActivityLog (risk variant) |
| P04 Explorer | `/explorer` | ResponsiveTable, Address |

---

## First 30 minutes (together)

1. **Route groups.** Create these empty, so neither person touches the other's folders:
   ```
   app/(merchant)/...    ← A   (layout.tsx = MerchantShell)
   app/(onboarding)/...  ← B   (layout.tsx = OnboardingShell)
   app/(pay)/...         ← B
   app/(portal)/...      ← B
   app/(lend)/...        ← B   (layout.tsx = LenderShell; covers earn, junior, protocol, risk, explorer)
   ```
2. **The route table above goes into `lib/routes.ts`** as constants. Every link uses it, so cross-links (M06 → M07, M08 → M10, M09 → M08) work before the other screen exists.
3. **Shared mock data.** A writes `lib/mock/shop.ts` first: shop name *Corner Kiosk*, `shop_7f3a`, ARS rate, the current advance ($100 drawn, $115 total, $46 repaid), and the limits ladder. Both import from it so the numbers match across screens. All other mock files belong to whoever owns the screen.
4. **A `/screens` index page** (B) lists every route with its canvas ID, so you can click through everything in one place.

## Rules

- **Missing component?** Say so in chat before building it, add it to `components/` in a small separate PR, and let the other person review it. Never build a one-off copy inside a page.
- **No hex colors or new font sizes in pages.** Use tokens and library components only.
- **A screen is done when** it matches both canvas frames (desktop and mobile) at 1440 and 390, has no horizontal scroll at 390, and every button links to the next screen.
- Commit per screen or per pair of screens.

## Suggested order

- **A:** M10 Home first (it's the hardest and proves the shell), then M11–M13, M14–M15, M07–M09, M16–M20, P01.
- **B:** M01–M06 first (the demo opens with these), then C01–C02, L01–L03, J01–J03, P02–P04, then S01–S02 last (stretch for the demo).
