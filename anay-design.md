# Design

**Status: v0.6, Nov 6, 2026.** Source of truth for the hackathon build. The brand page artifact renders everything here; tokens below match its CSS one to one.

> Every sale puts 10% in your dollar jar. Your jar and your record unlock stock on credit, and nobody can tell who owes.

**Product name:** DripMoney (renamed Nov 6, 2026; was Dollar Jar, wordmark `dollarjar`). The "dollar jar" stays as the name of the 10% savings mechanic. Every surface reads the name from `apps/web/src/lib/brand.ts`.

---

## 1. Principles

1. **Greens only.** Five greens carry the whole app. No blue, cyan or pink anywhere in the product.
2. **No white in the app.** Light mode stands on lime. (The brand page itself can be white or black; that's presentation, not product.)
3. **Every shape means something.** The bands are the jar, the lime band is the 10%, lit bands are the tier.
4. **Say the number once.** Dollar amount, local amount under it, what happens next. No APRs, no protocol words in merchant copy.
5. **Separate layers by edge, not just lightness.** On a mid-light lime ground, a paler card can only get ~1.15:1 lighter, so surfaces need an edge and a shadow.
6. **Show what's public.** Every screen supports the World view overlay (section 9).

---

## 2. Palette

### Core

| Name | Hex | Role |
|---|---|---|
| Charcoal | `#262E24` | Dark-mode ground, light-mode text |
| Hunter | `#2C5A3A` | Brand panels; light-mode buttons and links |
| Lime | `#C6F28C` | Dark-mode action; lit bands; jar figure on Hunter |
| Lime Mist | `#D6F0A8` | Light-mode ground (replaces Porcelain) |
| Honeydew | `#DDF7E6` | Dark-mode text; dark-mode jar card |

### Support

| Name | Hex | Use |
|---|---|---|
| Lime Pale | `#F1FADF` | Light-mode cards, nav bar, QR card |
| Edge | `#9DC46E` | Light-mode surface borders |
| Control | `#5E7F4E` | Light-mode borders on anything tappable (3.65:1) |
| Track | `#A6CB78` | Light-mode empty states: ring track, pixel bar, toggle off |
| Unlit | `#9FBF7A` | Light-mode unlit bands in the meter |
| Deep | `#151A13` | Dark-mode nav bar, phone chrome |
| Leaf | `#6FA65A` | Gradient midpoint only, never UI |
| Sage | `#5C7C62` | Borders and inactive icons on dark |

### Changes from the harmony test

- Porcelain → Lime Mist. Removes the Honeydew/Porcelain near-twin (perceptual distance 4.7).
- Deep darkened `#1D241B` → `#151A13`. Distance from Charcoal 4.0 → 8.0.
- Sage darkened `#7A9A80` → `#5C7C62`. Distance from Leaf 7.2 → 13.4.
- Gradient stops re-paced by perceived change (below).

### Gradient

Charcoal → Hunter → Leaf → Lime → Lime Pale, stops at **0 / 20 / 54 / 87 / 100%**. Mirrored for bands; one-way for screen tops. One per screen.

```css
--grad-band: linear-gradient(180deg,#262E24 0%,#2C5A3A 10%,#6FA65A 27%,#C6F28C 43%,#E8F7CC 50%,#C6F28C 57%,#6FA65A 73%,#2C5A3A 90%,#262E24 100%);
```

Welcome screen, dark: Deep → Hunter → Leaf → Lime (50%) → Leaf → Hunter → Charcoal.
Welcome screen, light: Hunter → Leaf (40%) → Lime (78%) → Lime Mist.
The gradient sits in its own block at the top; text always sits below it on a solid ground.

### Harmony

All chromatic hues fall between 128° and 157° (OKLCH), a 29° analogous band with a warm/cool split: warm greens (Lime, Leaf, Charcoal) do action jobs, cool greens (Hunter, Sage, Honeydew) do surfaces. Lime is the single saturation peak.

---

## 3. App modes

The merchant app is dark-first. Both modes use the same token names.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#262E24` Charcoal | `#D6F0A8` Lime Mist |
| `--card` | `#2F392C` | `#F1FADF` Lime Pale |
| `--card-2` | `#384435` | `#BCDD8E` |
| `--text` | `#DDF7E6` | `#262E24` |
| `--text-2` | `#B9D1BE` | `#3B4A38` |
| `--text-3` | `#8FAE94` | `#4A6448` |
| `--accent` | `#C6F28C` | `#2C5A3A` |
| `--btn` / `--btn-fg` | Lime / Charcoal | Hunter / `#F1FADF` |
| `--edge` | `rgba(221,247,230,.12)` | `#9DC46E` |
| `--divider` | `rgba(221,247,230,.10)` | `#CFE6AE` |
| `--strong` | `#7A9A80` | `#5E7F4E` |
| `--track` | `#384435` | `#A6CB78` |
| `--unlit` | `#4A5947` | `#9FBF7A` |
| `--shadow` | none | `0 1px 0 rgba(38,46,36,.10), 0 4px 14px rgba(38,46,36,.08)` |
| `--jar-bg` / `--jar-num` | Honeydew / Hunter | Hunter / Lime |
| `--nav-bg` / `--nav-off` | `#151A13` / `#7A9A80` | `#F1FADF` / `#4A6448` |
| `--warn` | `#F2C46B` | `#7A4F00` |
| `--risk` | `#F0907C` | `#A3341D` |

**The one rule for both modes:** bright lime is a fill on Charcoal or Hunter, never text or a fill on a lime ground. In light mode Hunter is the action colour and the jar card flips to Hunter with a lime figure.

### Measured contrast

| Pair | Ratio | Use |
|---|---|---|
| Honeydew on Charcoal | 12.4 | Dark body text |
| Charcoal on Lime | 11.0 | Dark-mode buttons |
| Charcoal on Lime Mist | 11.3 | Light body text |
| Lime Pale on Hunter | 7.4 | Light-mode buttons |
| Hunter on Lime Mist | 6.4 | Light-mode links, accents |
| Lime on Hunter | 6.3 | Light jar figure, app icon |
| Control `#5E7F4E` on Lime Mist | 3.65 | Ghost buttons, inputs, slider |
| Sage on Charcoal | 3.0 | Borders and icons only |
| Lime on Lime Mist | 1.2 | **Never** |
| Hunter on Charcoal | 1.8 | Surfaces only, never text |

### Light-mode layering (before → after the visibility fix)

| Element | Before | After | How |
|---|---|---|---|
| Card vs ground | 1.10 | 1.60 edge + shadow | Lime Pale fill, `#9DC46E` edge |
| Ghost button / input border | 1.83 | 3.65 | Control border |
| Nav bar vs ground | 1.06 | 1.60 edge | Pale bar, edge on top |
| Unlit bands, ring track, empty pixels | 1.12 | 1.65 | Darker track instead of lighter |
| Dividers in cards | 1.00 | 1.25 | `#CFE6AE` |
| Selected pace tile | outline only | 7.4 | Filled Hunter |
| Muted label on a track | 4.32 | 7.6 | Labels on tracks use Charcoal |

---

## 4. Typography

| Role | Family | Weights | Use |
|---|---|---|---|
| Display | Urbanist | 600–800 | Headlines, balances, wordmark |
| Body | Figtree | 400–700 | Everything readable |
| Ledger | JetBrains Mono | 400–600 | Labels, IDs, timestamps, amounts in lists |

| Token | Size / line |
|---|---|
| Display XL | 56 / 1.0, −0.03em |
| Display L / Balance | 40 / 1.05, tabular figures |
| H1 | 28 / 1.15 (24 on phones) |
| H2 | 20 / 1.25 |
| Body | 16 / 1.55 (13–14 on phones) |
| Small | 13 / 1.45 |
| Label | 11 mono, uppercase, +0.1em |

**Money:** always `tabular-nums`. Dollars first in Urbanist; local currency underneath in mono, prefixed `≈`, Argentine separators: `≈ ARS 87.264`. Mark the rate as an example in the demo.

---

## 5. Logo: ribbon drop

Four slanted ribbon bands wrapped into a drop. Sources: the 3D ribbon spiral (slanted bands), crypto token icons (it must sit inside a coin badge), the pixel field (data versions).

### Construction (40-unit grid)

- Drop: `M20 1.5C20 1.5 7 16.5 7 26a13 13 0 0 0 26 0C33 16.5 20 1.5 20 1.5Z` (26u wide)
- Bands: 5.8u thick, 1.8u gaps, slanted at 16° (slope 0.28), clipped to the drop
- Band edges (upper, lower) from the bottom: (31.8, 50), (24.2, 30.0), (16.6, 22.4), (−10, 14.8)
- Bottom band takes the accent; the rest take the text colour

### It's a meter

Lit bands = tier + 1.

| Lit | State | Cap |
|---|---|---|
| 0 | New shop, not verified | – |
| 1 | Tier 0 | $50 |
| 2 | Tier 1 | $100 |
| 3 | Tier 2 | $250 |
| 4 | Tier 3 | $500 |

The primary mark is the 1-band state. The Standing Pass screen shows the real tier.

### In use now

| # | Version | Where |
|---|---|---|
| 01 | Ribbon drop | The mark everywhere |
| 02 | Token badge (drop in a Hunter coin) | DRIP-J, wallet lists, onchain contexts |
| 14 | Horizontal lockup | Default logo, app top bar |
| 17 | App icons | Hunter for the store; Charcoal and Lime alternates; 22% corner radius |

The other 16 explorations (twist, ribbon coin, ribbon jar, ribbon $, pixel drop, pixel ring, faceted, hex, orbit, split coin, dj monogram, stacked lockup, ticker pill, wallet context, filling animation, sizes) live on the Logo tab.

### Rules

- **Colour:** bands in text colour; lit bands in accent. Lime on Charcoal or Hunter; Hunter on Lime Mist or white.
- **Small sizes:** gaps close below 24px. At 20px and 16px use the solid drop with a lime base (`mark-solid`).
- **Clear space:** two band heights on every side.
- **Don't:** light bands that don't match a real tier, change the slant, add a fifth band, recolour bands in other hues.
- **Motion:** bands light bottom to top on an 8s loop (loading, saving). Static under `prefers-reduced-motion`.

---

## 6. Shape and space

- **Unit:** 4px. Steps 4, 8, 12, 16, 24, 40, 72.
- **Radii:** chip 4 · button 8 · card 16 · sheet 28 · phone screen 36.
- **Split bar:** 9:1 flex, 3px gap. Every sale, the Get Paid screen, the sales list.
- **Chevron:** "goes to" (supplier, lender, jar).
- **Pixel:** 4px squares on a 6px pitch. Data: sales dune, proofs.
- **QR codes:** plain, no centre dot. Charcoal on Lime Pale.

### Patterns

| Pattern | Spec | Use |
|---|---|---|
| Wave band | S-curve `M0 18C8 18 8 6 16 6S24 18 32 18`, 32×24 tile, 7px stroke, −18° | Lime or Honeydew on Hunter; checkout and Get Paid headers |
| Jar gradient | See section 2 | Welcome, hero, share images |
| Pixel dune | Columns = days of sales | Home sales strip. Real data only |
| Ledger grid | Hairline grid on Hunter with icons and mosaics | Hero, lender page |

---

## 7. Components

| Component | Spec |
|---|---|
| Primary button | `--btn` fill, `--btn-fg` text, radius 8, full width on phones, 14px vertical padding |
| Ghost button | Transparent, `--strong` border |
| Danger button | Transparent, `--risk` text and border (Revoke agent) |
| Card | `--card`, 1px `--edge`, `--shadow`, radius 16 |
| Jar / balance card | `--jar-bg`, figure in `--jar-num`, Balance type style |
| Pills | Mono 11 uppercase on a 14–16% tint of their colour. Saving (accent), Jar locked (text-2 with inner ring), Repaying (text), Slow (warn), Written off (risk) |
| Segmented control | `--track` well, selected segment `--card` with edge and shadow |
| Chips | Outline `--strong`; selected fills `--btn` |
| Toggle | 38×22, off `--track`, on `--btn` |
| Progress bar | 8px, `--track`, fill `--accent` |
| Repayment ring | r 54, stroke 12, track `--track`, progress `--accent`, round cap |
| Pace picker | Slow / Usual / Busy, always all three; selected tile filled `--btn` |
| Slide to approve | 52px track `--card` with `--strong` border, 42px knob in `--btn` |
| Steps list | Check icon for done, accent dot for current, track dot for next |
| Loss waterfall | Jar → Junior → Reserve → Senior; the viewer's layer filled `--btn` |
| Bottom nav | Merchant: Home, Agent, Pass, Settings. Lender/public: Earn, Junior, Protocol, Risk |

---

## 8. Screens

34 screens, 6 roles. All figures and names are examples. ARS at an example rate of 1,010.

### Merchant (borrower), 20

| # | Screen | Key content |
|---|---|---|
| M01 | Welcome | What the app does; "We never ask for your name, phone or contacts." |
| M02 | Prove your business | zkTLS by QR or deep link to the seller portal; what we check vs never see |
| M03 | Verifying… | Spinner, progress, steps; 2–30s; data never leaves the phone |
| M04 | Business Pass | "Verified · Argentina · revenue band 2 · 6+ months. That's all we learned." |
| M05 | Verification failed | Reason (too new / suspended / revenue too low) and what to do next |
| M06 | Create your shop | Pseudonymous shop name, payment QR, shop ID |
| M07 | Set up your agent | Max per advance, max per month, purpose; suppliers only, never cash |
| M08 | Approve with World | One-time Agent Pass; limits summary; slide to approve |
| M09 | Agent not set up | Denied or expired; "nothing will be drawn"; retry |
| M10 | Home / live sales | Balance, today's sales, split per sale, voice announcements |
| M11 | Advance arrived | "Your agent drew $100 for stock" + why it drew this |
| M12 | Advance details | Advance $100, fee $15, total $115, repaid $46, ~12 days left, pace |
| M13 | Bad week | Repayment slowed; no penalty; 60-day check status |
| M14 | Agent activity | Drew / Declined / Waited / Paused, each with a reason |
| M15 | Manage agent | Active, pause, edit limits, revoke |
| M16 | Repaid / Standing Pass | Meter at tier 1; "your limit is now $100; nobody can see your history" |
| M17 | Start fresh shop | New pseudonym; reputation carries over as a proof; no onchain link |
| M18 | Cash out | To local money or a supplier (demo transfer) |
| M19 | Settings | Language ES/EN, currency, voice, World view, backup export |
| M20 | Recover on a new phone | World ID → unlock backup → restore passes; cancel path |

### Customer (payer), 2

| # | Screen | Key content |
|---|---|---|
| C01 | Scan & pay | Shop, amount, token, "swaps through Uniswap", gas covered. No mention of the advance |
| C02 | Payment success | Thanks + receipt |

### Lender (senior vault), 3

| # | Screen | Key content |
|---|---|---|
| L01 | Earn overview | APY, total lent, default rate, loss waterfall |
| L02 | Deposit / withdraw | Amount, shares, available to withdraw now vs lent out |
| L03 | My position | Value, earnings chart, shares |

### Risk taker (junior token), 3

| # | Screen | Key content |
|---|---|---|
| R01 | Junior vault | First-loss warning, waterfall, fee share 30%, coverage ratio |
| R02 | Mint / redeem | USDC in, DRIP-J out, book value |
| R03 | Trade junior | Swap UI on the DRIP-J/USDC Uniswap v4 pool; price, TWAP, book, discount |

### Public / judges, 4

| # | Screen | Key content |
|---|---|---|
| P01 | What the world sees | Public onchain list vs private on device list |
| P02 | Protocol dashboard | Outstanding, repaid 30d, written off, reserve, junior TWAP, tier caps |
| P03 | Risk status | Signals; Risk agent lowered tier 3 cap $500 → $250, with reasoning |
| P04 | Explorer | Pseudonymous shop, sale, commitment, nullifier, vault → supplier |

### Demo seller portal, 2

Separate site, stand-in for a real marketplace. **Deliberately unbranded** (neutral greys, "Demo Seller Portal") so it never imitates any real marketplace.

| # | Screen | Key content |
|---|---|---|
| X01 | Portal login | Seeded demo accounts: Luna (band 2), New shop (3 months), Suspended |
| X02 | Portal dashboard | Balance in ARS, sales chart, transactions; the page the zkTLS proof reads |

---

## 9. World view

A toggle on every screen (and one for all screens) that marks up what's public and what's private.

| Mark | Style | Examples |
|---|---|---|
| **ONCHAIN** | Dashed accent outline + tag | Shop pseudonym and QR address, each sale and its 10% split, vault → supplier payments, nullifiers and commitments, vault positions, protocol stats |
| **ON DEVICE · PRIVATE** | Striped cover over the element | Business Pass details, Standing Pass count, agent limits and log, cash-out destination, backups, World ID link |

In code: add `class="pub"` or `class="priv"` to the element; the overlay is CSS-only under `.wv`.

**Open question to settle before the demo:** jar balances and supplier payments are marked public because the architecture has them onchain per shop. Whether "nobody can tell who owes" holds depends on the shielded-jar decision (architecture.md, open questions).

---

## 10. Voice

| Say | Avoid |
|---|---|
| $15 flat fee. You repay $115 in total. | 15% interest, APR |
| About 12 days at your usual pace. | Loan, debt, credit score |
| Your agent drew $100 for stock. | "You borrowed" |
| No penalty, no extra fee. | Late, overdue, missed |
| We learned nothing else. | Nullifier, commitment, Merkle (merchant screens) |
| Nobody can see your history. | "Earn yield on your jar" |

Copy ships in English and Spanish (ES/EN toggle in Settings). Write short sentences that translate cleanly.

---

## 11. Implementation notes

- Next.js + CSS variables. App tokens live on `.app`; light mode via `[data-app="light"] .app`.
- Logo symbols: `#mark`, `#mark-l0`…`#mark-l4`, `#mark-solid`, `#token`. Bands use `fill:var(--logo-acc,currentColor)` for the lit state.
- Sales dune, pixel mark and QR are small canvas helpers; the dune takes an array of daily sales totals.
- Respect `prefers-reduced-motion`: spinner, band fill and coin animations stop.
- Fonts from Google Fonts with system fallbacks: `"Avenir Next","Segoe UI",system-ui` and `ui-monospace,Menlo`.
