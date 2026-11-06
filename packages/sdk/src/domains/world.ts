import type { Ctx } from "../context.js";
import * as M from "../mock/merchant.js";
import * as S from "../mock/shop.js";
import type { KV, ShopVM, WorldStep, WorldView } from "../viewmodels.js";
import { merchantDomain } from "./merchant.js";
import { truncate } from "./util.js";

/** What the chain can see at each step of the journey, and what never leaves the device. */
const PUBLIC_BY_STEP: Record<WorldStep, (keyof typeof ROW)[]> = {
  onboarding: [],
  pass: ["pass"],
  shop: ["shop"],
  agent: ["shop", "mandate"],
  advance: ["shop", "sales", "drawn", "repayments", "nullifier"],
  sale: ["shop", "sales", "repayments"],
  repaid: ["shop", "repayments", "standing"],
  "fresh-shop": ["newShop", "nullifier"],
};
const ROW = {
  pass: { k: "Business Pass", v: "a commitment, no attributes" },
  shop: { k: "Shop", v: S.shop.pseudonym },
  mandate: { k: "Agent mandate", v: "limits + an agent key" },
  sales: M.worldView.public[1]!,
  drawn: M.worldView.public[2]!,
  repayments: M.worldView.public[3]!,
  nullifier: M.worldView.public[4]!,
  standing: { k: "Standing Pass", v: "a new commitment" },
  newShop: { k: "Shop", v: "a new pseudonym, unlinked" },
} satisfies Record<string, KV>;

export function worldDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  return {
    /**
     * P01 World view. Default step "advance" returns exactly apps/web's worldView. In real modes the public side
     * is filled from this shop's actual onchain values.
     */
    async publicView(step: WorldStep = "advance"): Promise<WorldView> {
      const priv = M.worldView.private.map((x) => ({ ...x }));
      if (isMock) {
        const pub = step === "advance" ? M.worldView.public.map((x) => ({ ...x })) : PUBLIC_BY_STEP[step].map((k) => ({ ...ROW[k] }));
        return ctx.mocked({ step, shop: { ...S.shop }, public: pub, private: priv, source: "mock" as const });
      }
      const s = await ctx.session();
      const [bp, sp] = await Promise.all([ctx.vault.get("business_pass"), ctx.vault.get("standing_pass")]);
      const rows: Record<string, KV> = { ...ROW, shop: { k: "Shop", v: s.pseudonym ?? "—" } };
      let shop: ShopVM = { ...S.shop, localCurrency: ctx.cfg.fx.currency, usdToLocal: ctx.cfg.fx.usdToLocal, pseudonym: s.pseudonym ?? "—", name: s.shopName ?? S.shop.name };
      if (s.shopId && (step === "advance" || step === "sale")) {
        try {
          const home = await merchantDomain(ctx).home();
          shop = home.shop;
          rows.sales = { k: "Sale amounts", v: home.sales.slice(0, 2).map((x) => x.total.toLocaleString("en-US")).join(" · ") + (home.sales.length > 2 ? " …" : "") || "none yet" };
          if (home.advance) {
            rows.drawn = { k: "Advance drawn", v: `$${home.advance.drawn} · ${home.advance.drawnAt.split(" ").pop() ?? ""}` };
            rows.repayments = { k: "Repayments", v: `${home.advance.holdback}% per sale` };
          }
        } catch {
          /* fall back to the generic rows: this screen explains, it doesn't need to be live */
        }
      }
      if (bp) rows.pass = { k: "Business Pass", v: truncate(bp.commitment) };
      const privRows: KV[] = [
        priv[0]!,
        bp ? { k: "Business facts", v: `${bp.country === 32 ? "AR" : bp.country === 566 ? "NG" : "KE"} · band ${bp.band} · 6m+` } : priv[1]!,
        { k: "Standing Pass", v: sp ? `${sp.count} repaid` : "none yet" },
        priv[3]!,
        priv[4]!,
      ];
      return { step, shop, public: PUBLIC_BY_STEP[step].map((k) => rows[k]!), private: privRows, source: "device" };
    },
  };
}

export type WorldDomain = ReturnType<typeof worldDomain>;
