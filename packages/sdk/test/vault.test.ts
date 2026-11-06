import { describe, expect, it } from "vitest";
import { MemoryVault, VaultError, createMRA, decryptRecords, encryptRecords, type BusinessPassSecret } from "../src/index.js";

const pass: BusinessPassSecret = {
  kind: "business_pass",
  secret: `0x${"0".repeat(63)}7`,
  h: "0x01",
  commitment: "0x02",
  country: 32,
  band: 2,
  ageOk: 1,
  leafIndex: 4,
  chainId: 11155111,
  issuedAt: 1_760_000_000,
};

describe("CredentialVault", () => {
  it("round-trips through an encrypted export into a fresh vault", async () => {
    const a = new MemoryVault();
    await a.put("business_pass", pass);
    await a.put("session", { shopId: "0xabc", manageToken: "tok" });
    const blob = await a.export("correct horse battery");
    expect(blob).not.toContain("tok");
    expect(atob(blob)).not.toContain(pass.secret);

    const b = new MemoryVault();
    await b.put("standing_pass", { kind: "standing_pass", secret: "0x9", h: "0x9", commitment: "0x9", count: 9, claimed: true });
    const keys = await b.import(blob, "correct horse battery");
    expect(keys.sort()).toEqual(["business_pass", "session"]);
    expect(await b.get("business_pass")).toEqual(pass);
    expect(await b.get("standing_pass")).toBeUndefined(); // import replaces
  });

  it("wrong passphrase → vault_locked; garbage → vault_corrupt", async () => {
    const blob = await encryptRecords({ business_pass: pass }, "passphrase-1");
    await expect(decryptRecords(blob, "passphrase-2")).rejects.toMatchObject({ code: "vault_locked" });
    await expect(decryptRecords(btoa("nope, not a backup at all"), "x")).rejects.toBeInstanceOf(VaultError);
    await expect(encryptRecords({}, "short")).rejects.toMatchObject({ code: "vault_locked" });
  });

  it("stores copies and never serialises its contents", async () => {
    const v = new MemoryVault();
    const s = { shopId: "0x1", manageToken: "secret" };
    await v.put("session", s);
    s.manageToken = "changed";
    expect((await v.get("session"))?.manageToken).toBe("secret");
    expect(JSON.stringify({ v })).toBe('{"v":"memoryVault"}');
  });

  it("mock recovery: backup, wipe, restore with World + passphrase (M20)", async () => {
    const mra = createMRA({ mode: "mock" });
    await mra.raw.vault.put("business_pass", pass);
    const steps: string[] = [];
    expect(await mra.recovery.backup("a long passphrase", { onStep: (s) => steps.push(s) })).toMatchObject({ backedUp: true });
    await mra.raw.vault.clear();
    const r = await mra.recovery.restore("a long passphrase", { onStep: (s) => steps.push(s) });
    expect(r).toEqual({ restored: true, hasBackup: true, keys: ["business_pass"] });
    expect(await mra.raw.vault.get("business_pass")).toEqual(pass);
    expect(steps).toEqual(["verifying_human", "backing_up", "backed_up", "verifying_human", "fetching_backup", "decrypting", "restored"]);
  });
});
