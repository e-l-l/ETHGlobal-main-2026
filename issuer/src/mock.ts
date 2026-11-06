// Canned proofs for ISSUER_MOCK=1. Same shape as a real Reclaim proof (so the app can use one code path),
// built from the demo portal's fictional accounts (demo-portal/config/demo-accounts.json). Using the same
// fictional account ids means a mock-issued pass and a real-proof pass for the same demo business share a
// nullifier, so the registry blocks the second one either way.
import { createHash, randomBytes } from "node:crypto";
import type { Band } from "./config.js";
import { PRED } from "./predicates.js";
import type { ReclaimProof } from "./reclaim.js";

export interface MockAccount {
  accountId: string;
  country: string;
  active: boolean;
  ageOk: boolean;
  maxBand: 0 | Band;
}

/** DEMO ONLY: fictional accounts; ids are public test data, not secrets. */
export const MOCK_ACCOUNTS: Record<string, MockAccount> = {
  donpepe: { accountId: "acc_18bf65eab2bc1711af938e15a335f20c", country: "AR", active: true, ageOk: true, maxBand: 2 },
  nkechi: { accountId: "acc_cd2d56357e003e6dd777d43f04a601f9", country: "NG", active: true, ageOk: true, maxBand: 1 },
  wanjiru: { accountId: "acc_97fc9d1ead7afdea0b1cab76897e42bb", country: "KE", active: true, ageOk: true, maxBand: 3 },
  newshop: { accountId: "acc_d331d02ebecd679c8452d948c64dda50", country: "AR", active: true, ageOk: false, maxBand: 1 },
  suspended: { accountId: "acc_76b46d1df788a7174a2c3589e4752a62", country: "NG", active: false, ageOk: true, maxBand: 2 },
};

export const MOCK_URL = "https://demo-portal.mock/api/me/summary";

/**
 * Build a proof the way Reclaim would: only predicates that HOLD for the account appear as matches (a real
 * attestor refuses to sign otherwise), so a failing account yields a proof the issuer rejects.
 */
export function buildMockProof(opts: {
  account: MockAccount;
  commitmentHex: string;
  band: Band;
  allowedCountries?: string[];
  timestampS?: number;
  contextAddress?: string;
}): ReclaimProof {
  const { account, band } = opts;
  const countries = opts.allowedCountries ?? ["AR", "NG", "KE"];
  const matches: { type: "regex"; value: string }[] = [];
  if (account.active) matches.push({ type: "regex", value: PRED.active });
  if (account.ageOk) matches.push({ type: "regex", value: PRED.age_ok });
  if (countries.includes(account.country)) matches.push({ type: "regex", value: `"country":"(?:${countries.join("|")})",` });
  if (account.maxBand >= band) matches.push({ type: "regex", value: PRED.band(band) });
  matches.push({ type: "regex", value: `"account_id":"(?<account_id>acc_[0-9a-f]{32})",` });

  const parameters = JSON.stringify({ method: "GET", url: MOCK_URL, responseMatches: matches, responseRedactions: [] });
  const context = JSON.stringify({
    contextAddress: opts.contextAddress ?? "0x0",
    contextMessage: opts.commitmentHex,
    reclaimSessionId: randomBytes(8).toString("hex"),
    extractedParameters: { account_id: account.accountId },
  });
  const timestampS = opts.timestampS ?? Math.floor(Date.now() / 1000);
  const identifier = "0x" + createHash("sha256").update(parameters + "\n" + context + "\n" + timestampS + randomBytes(16).toString("hex")).digest("hex");
  return {
    identifier,
    claimData: { provider: "http", parameters, owner: "0x0000000000000000000000000000000000000000", timestampS, context, identifier, epoch: 1 },
    signatures: [],
    witnesses: [{ id: "mock-attestor", url: "mock://attestor" }],
    extractedParameterValues: { account_id: account.accountId },
    publicData: { mock: true },
  };
}
