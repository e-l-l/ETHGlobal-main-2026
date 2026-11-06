/**
 * The 34 design-canvas screens (work-split.md) → route → SDK call → view-model. README renders this table.
 * `call` is the method on the object returned by createMRA(). "—" = static screen, no data.
 */
export type ScreenMap = { canvas: string; title: string; route: string; call: string; viewModel: string; owner: "A" | "B" };

export const SCREENS: ScreenMap[] = [
  // Person B: onboarding
  { canvas: "M01", title: "Welcome", route: "/", call: "— (static copy)", viewModel: "—", owner: "B" },
  { canvas: "M02", title: "Prove business", route: "/onboarding/prove", call: "onboarding.startProof({ band, country, account? })", viewModel: "ProveSession", owner: "B" },
  { canvas: "M03", title: "Verifying", route: "/onboarding/verifying", call: "onboarding.finishProof(sessionId, { onStep })", viewModel: "ProveResult (+ ProveStep events)", owner: "B" },
  { canvas: "M04", title: "Business Pass", route: "/onboarding/pass", call: "onboarding.pass()", viewModel: "BusinessPassView", owner: "B" },
  { canvas: "M05", title: "Failed", route: "/onboarding/failed?reason=", call: "ProveResult.reason from finishProof", viewModel: "ProveResult { ok: false, reason }", owner: "B" },
  { canvas: "M06", title: "Create shop", route: "/onboarding/shop", call: "onboarding.createShop(name), onboarding.nameIdeas()", viewModel: "ShopView", owner: "B" },
  // Person A: merchant app
  { canvas: "M07", title: "Agent setup", route: "/agent/setup", call: "agent.setupOptions()", viewModel: "AgentSetupView", owner: "A" },
  { canvas: "M08", title: "Approve", route: "/agent/approve", call: "agent.approveView(limits), then agent.setup(limits, { onStep })", viewModel: "AgentApproveView, AgentSetupResult", owner: "A" },
  { canvas: "M09", title: "Agent denied", route: "/agent/denied", call: "AgentSetupResult.status === 'denied' | 'expired'", viewModel: "AgentSetupResult", owner: "A" },
  { canvas: "M10", title: "Home", route: "/home", call: "merchant.home()", viewModel: "HomeView", owner: "A" },
  { canvas: "M11", title: "Advance arrived", route: "/advance/arrived", call: "merchant.arrived()", viewModel: "AdvanceArrivedView", owner: "A" },
  { canvas: "M12", title: "Advance details", route: "/advance", call: "merchant.advance()", viewModel: "AdvanceDetailsView", owner: "A" },
  { canvas: "M13", title: "Bad week", route: "/week", call: "merchant.week()", viewModel: "WeekView", owner: "A" },
  { canvas: "M14", title: "Agent log", route: "/agent", call: "agent.log()", viewModel: "AgentLogView", owner: "A" },
  { canvas: "M15", title: "Manage agent", route: "/agent/manage", call: "agent.status(), agent.revoke(), agent.trigger()", viewModel: "AgentStatusView", owner: "A" },
  { canvas: "M16", title: "Repaid", route: "/repaid", call: "merchant.repaid(), merchant.claimStandingPass()", viewModel: "RepaidView", owner: "A" },
  { canvas: "M17", title: "Fresh shop", route: "/settings/fresh-shop", call: "merchant.freshShop(name?)", viewModel: "FreshShopResult", owner: "A" },
  { canvas: "M18", title: "Cash out", route: "/cash-out", call: "merchant.cashOutView(), merchant.cashOut(amount, dest)", viewModel: "CashOutView, CashOutResult", owner: "A" },
  { canvas: "M19", title: "Settings", route: "/settings", call: "merchant.settings(), mra.network()", viewModel: "SettingsView", owner: "A" },
  { canvas: "M20", title: "Recover", route: "/settings/recover", call: "recovery.verify(), recovery.restore(passphrase), recovery.backup(passphrase)", viewModel: "RecoveryResult, BackupResult", owner: "A" },
  { canvas: "P01", title: "World view", route: "/world-view", call: "world.publicView(step)", viewModel: "WorldView", owner: "A" },
  // Person B: customer
  { canvas: "C01", title: "Pay", route: "/pay/corner-kiosk", call: "pay.shop(shopId, { name }), pay.pay(shopId, amount)", viewModel: "PayShopView", owner: "B" },
  { canvas: "C02", title: "Paid", route: "/pay/corner-kiosk/paid", call: "result of pay.pay(...)", viewModel: "PayReceipt", owner: "B" },
  // Person B: Vendora demo portal (the zkTLS source; not an SDK screen)
  { canvas: "S01", title: "Portal login", route: "/portal/login", call: "— (demo-portal app; seeded accounts)", viewModel: "—", owner: "B" },
  { canvas: "S02", title: "Portal dashboard", route: "/portal", call: "— (the page the Reclaim proof reads)", viewModel: "—", owner: "B" },
  // Person B: lenders and public
  { canvas: "L01", title: "Earn", route: "/earn", call: "lender.overview()", viewModel: "EarnView", owner: "B" },
  { canvas: "L02", title: "Deposit", route: "/earn/deposit", call: "lender.depositView(), lender.deposit(amount), lender.withdraw(amount)", viewModel: "DepositView, TxResult", owner: "B" },
  { canvas: "L03", title: "Position", route: "/earn/position", call: "lender.position()", viewModel: "PositionView", owner: "B" },
  { canvas: "J01", title: "Junior", route: "/junior", call: "lender.junior.overview()", viewModel: "JuniorView", owner: "B" },
  { canvas: "J02", title: "Mint", route: "/junior/mint", call: "lender.junior.mintView(), lender.junior.deposit / withdraw", viewModel: "DepositView, TxResult", owner: "B" },
  { canvas: "J03", title: "Trade", route: "/junior/trade", call: "lender.junior.trade()", viewModel: "TradeView", owner: "B" },
  { canvas: "P02", title: "Protocol", route: "/protocol", call: "protocol.stats()", viewModel: "ProtocolView", owner: "B" },
  { canvas: "P03", title: "Risk", route: "/risk", call: "protocol.risk()", viewModel: "RiskView", owner: "B" },
  { canvas: "P04", title: "Explorer", route: "/explorer", call: "protocol.explorer()", viewModel: "ExplorerView", owner: "B" },
];
