#!/usr/bin/env node
// Usage: npm run hash-password -- 'some password'
import { hashPassword } from "./_hash.mjs";

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: npm run hash-password -- '<password>'");
  process.exit(1);
}
console.log(hashPassword(pw));
