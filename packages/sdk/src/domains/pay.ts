import type { Hex } from "viem";
import type { Ctx } from "../context.js";
import { MRAError } from "../errors.js";
import * as S from "../mock/shop.js";
import type { PayReceipt, PayShopView, TxStep } from "../viewmodels.js";
import { initials, pseudonymOf, round2, toBase, usd } from "./util.js";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

export function payDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  return {
    /**
     * C01 Pay header. Real mode: `shopId` is the bytes32 id from the QR; the display name is not onchain
     * (pseudonymous), so the pay link carries it (`name`).
     */
    async shop(shopId: string = S.SHOP.id, opts: { name?: string } = {}): Promise<PayShopView> {
      if (isMock) return ctx.mocked({ name: S.SHOP.name, id: S.SHOP.id, initials: S.SHOP.initials, wallet: S.WALLET, source: "mock" as const });
      if (!BYTES32.test(shopId)) throw new MRAError("invalid_request", "shopId must be the bytes32 id from the QR");
      const chain = ctx.chain();
      const shop = await chain.shop(shopId as Hex);
      if (!shop.registered) throw new MRAError("not_found", "unknown shop");
      const name = opts.name ?? pseudonymOf(shopId);
      return { name, id: pseudonymOf(shopId), initials: initials(name), wallet: chain.walletAddress() ?? "", source: "chain" };
    },

    /** C01 → C02. The customer pays; the contract splits it (holdback to the advance). No mention of the advance. */
    async pay(shopId: string, amount: number, opts: { onStep?: (s: TxStep) => void } = {}): Promise<PayReceipt> {
      if (!(amount > 0)) throw new MRAError("invalid_request", "amount must be positive");
      if (isMock) {
        const repay = round2((amount * S.advance.holdback) / 100);
        return ctx.mocked({
          shopName: S.SHOP.name,
          shopId: S.SHOP.id,
          amount,
          toShop: round2(amount - repay),
          toRepayment: repay,
          txHash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2",
          wallet: S.WALLET,
          at: ctx.now(),
          source: "mock" as const,
        });
      }
      if (!BYTES32.test(shopId)) throw new MRAError("invalid_request", "shopId must be the bytes32 id from the QR");
      const chain = ctx.chain();
      const base = toBase(amount);
      const approve = await chain.approveUsdc(chain.addresses.book, base);
      opts.onStep?.({ label: "Approve USDC", status: approve ? "done" : "skipped", ...(approve ? { hash: approve.transactionHash } : {}) });
      const receipt = await chain.pay(shopId as Hex, base);
      opts.onStep?.({ label: "Pay", status: "done", hash: receipt.transactionHash });
      const sale = chain.parseLogs(receipt).find((l) => l.eventName === "Sale");
      const repay = sale ? usd(sale.args.repayment as bigint) : 0;
      return {
        shopName: pseudonymOf(shopId),
        shopId: pseudonymOf(shopId),
        amount,
        toShop: round2(amount - repay),
        toRepayment: round2(repay),
        txHash: receipt.transactionHash,
        wallet: chain.walletAddress() ?? "",
        at: ctx.now(),
        source: "chain",
      };
    },
  };
}

export type PayDomain = ReturnType<typeof payDomain>;
