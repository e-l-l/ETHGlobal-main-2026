#!/usr/bin/env node
// Re-hashes the seeded accounts' passwords from config/demo-credentials.env (DEMO ONLY) into
// config/demo-accounts.json. The app itself only ever reads the hashes.
// Usage: npm run seed
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { hashPassword, parseEnvFile } from "./_hash.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const accountsPath = join(root, "config", "demo-accounts.json");
const creds = parseEnvFile(readFileSync(join(root, "config", "demo-credentials.env"), "utf8"));
const data = JSON.parse(readFileSync(accountsPath, "utf8"));

for (const a of data.accounts) {
  const key = `DEMO_PW_${a.email.split("@")[0].replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  if (!creds[key]) {
    console.warn(`skip ${a.email}: no ${key} in demo-credentials.env (keeping existing hash)`);
    continue;
  }
  a.password_hash = hashPassword(creds[key]);
  console.log(`hashed ${a.email}`);
}
writeFileSync(accountsPath, JSON.stringify(data, null, 2) + "\n");
