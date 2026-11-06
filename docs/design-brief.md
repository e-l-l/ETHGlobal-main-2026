# Design brief

## The project (150 words)

Small shop owners in places like Buenos Aires, Lagos and Nairobi often need cash before their sales come in, for stock, rent or repairs. Today their choices are informal lenders, or loan apps that copy their phone contacts and shame them when they're late.

Our app gives a merchant a cash advance in digital dollars. They repay it automatically with a small slice of QR sales while an advance is active. There are no fixed instalments: a slow day just repays less. The only rule is a small minimum (1% of what's owed per week); falling behind it adds a late fee until they catch up.

Borrowing is private by design. The demo uses a mock business attestor and World test mode; neither establishes a real unique business. Each advance they repay builds a private record that unlocks bigger amounts, and the proof hides the selected credential leaf.

AI agents review each request and suggest an offer. Hard limits in the system mean no one can be given more than is safe.

## Palette

| Name | Hex | Use |
|---|---|---|
| Navy | `#14213D` | Primary text, headers, dark surfaces |
| Cream | `#F4EDE0` | Main background |
| Coral | `#FF6858` | Primary actions, highlights, the "sale received" moment |

**Contrast (WCAG):**

| Pairing | Ratio | OK for |
|---|---|---|
| Navy on cream | 13.7:1 | All text |
| Coral on navy | 5.6:1 | Text and buttons |
| Navy on coral | 5.6:1 | Button labels: use navy, not white |
| Coral on cream | 2.5:1 | **Not for text.** Fills, icons and large shapes only |
| White on coral | 2.9:1 | **Avoid** |

Coral reads as an alert in many interfaces. Add a separate green and red for success and error states, so "sale received" and "advance denied" never look alike.

## Screens

1. Onboarding: "Prove you're one person". No phone, contacts or ID.
2. Offer: one fixed fee, slow, normal and busy repayment estimates, the reasons, the next limit
3. Approve and receive
4. Live sales: big amounts, sale-by-sale split, voice announcement
5. Bad week: repayment slows, no penalty
6. Denied, with the next step
7. Standing Pass: "You've repaid 1 advance. Limit now $100. No one can see your history."
8. Customer checkout: just pay, no mention of the advance

## Constraints

- Mobile web on low-end Android, slow and expensive data
- Local currency next to dollars (ARS, NGN, KES)
- Spanish first, then English, Pidgin and Swahili
- No crypto words in the merchant view. See [ux.md](ux.md).
