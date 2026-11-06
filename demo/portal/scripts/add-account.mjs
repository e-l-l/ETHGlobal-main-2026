#!/usr/bin/env node
// Adds a demo account to config/demo-accounts.json (hashing the password).
// Usage:
//   npm run add-account -- --email shop@example.com --password 'pw' --name "Shop" \
//     --country AR --months 12 --revenue-cents 750000 [--status active|suspended|closed] [--print]
// --print outputs the JSON entry instead of writing it (paste it into DEMO_EXTRA_ACCOUNTS_JSON on Vercel).
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { hashPassword } from "./_hash.mjs";

const { values: v } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
    country: { type: "string" },
    months: { type: "string" },
    "revenue-cents": { type: "string" },
    status: { type: "string", default: "active" },
    print: { type: "boolean", default: false },
  },
});

for (const k of ["email", "password", "name", "country", "months", "revenue-cents"]) {
  if (!v[k]) {
    console.error(`missing --${k}`);
    process.exit(1);
  }
}

// 128 random bits, hex. Opaque and never sequential: it feeds the issuer nullifier HMAC(pepper, account_id).
const id = "acc_" + randomBytes(16).toString("hex");
const entry = {
  id,
  email: v.email.toLowerCase(),
  password_hash: hashPassword(v.password),
  business_name: v.name,
  country: v.country.toUpperCase(),
  status: v.status,
  opened_months_ago: Number(v.months),
  revenue_90d_cents: Number(v["revenue-cents"]),
};

if (v.print) {
  console.log(JSON.stringify(entry));
} else {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, "config", "demo-accounts.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.accounts.some((a) => a.email === entry.email)) {
    console.error(`account ${entry.email} already exists`);
    process.exit(1);
  }
  data.accounts.push(entry);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`added ${entry.email} (${id}). Note: its plaintext password is NOT stored anywhere.`);
}
