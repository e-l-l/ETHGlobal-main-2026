/** Shared shop. Both people import this so the numbers match across screens. */

export const SHOP = {
  name: "Corner Kiosk",
  id: "shop_7f3a",
  initials: "CK",
  country: "Argentina",
  band: "2",
  bandRange: "$2,000–5,000 a month",
  months: "6+ months",
  /** Example rate, anay-design.md section 8. Same value as ARS_PER_USD in jar/format.ts. */
  arsPerUsd: 1010,
  advance: {
    drawn: 100,
    fee: 15,
    total: 115,
    repaid: 46,
    percentRepaid: 40,
    holdback: "10%",
  },
  limits: [
    { label: "First advance · now", cap: "$100" },
    { label: "1 repaid", cap: "$250" },
    { label: "2 repaid", cap: "$500" },
    { label: "3 or more", cap: "$500" },
  ],
} as const;

export const WALLET = "0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2";

/** Ordinary names offered on Create shop. Neutral on purpose: nothing about the owner. */
export const SHOP_NAME_IDEAS = ["Corner Kiosk", "Kiosco Sol", "La Esquina", "Stall 14"] as const;
