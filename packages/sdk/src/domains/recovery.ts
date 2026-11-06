import type { Ctx } from "../context.js";
import { ApiError, MRAError } from "../errors.js";
import type { BackupResult, RecoveryResult, RecoveryStep } from "../viewmodels.js";

/**
 * M20 Recover. Only the same human (World IDKit, Proof of Human) can fetch the encrypted backup; only the
 * passphrase opens it. The server stores ciphertext it cannot read.
 */
export function recoveryDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  // The recovery token is short-lived and held in memory only.
  let token: { value: string; expiresAt: number; hasBackup: boolean } | undefined;

  async function verify(onStep?: (s: RecoveryStep) => void) {
    onStep?.("verifying_human");
    if (isMock) {
      const res = await ctx.idkit.verify();
      if (res.mock !== "approve") throw new MRAError("verification_failed", "World verification failed");
      ctx.mock.recoveryVerified = true;
      return { hasBackup: !!ctx.mock.backup };
    }
    const r = await ctx.api().recoveryVerify(await ctx.idkit.verify());
    token = { value: r.recovery_token, expiresAt: r.expires_at, hasBackup: r.has_backup };
    return { hasBackup: r.has_backup };
  }

  function needToken() {
    if (!token || token.expiresAt <= ctx.now()) throw new MRAError("token_expired", "verify with World first");
    return token.value;
  }

  return {
    /** Step 1: Proof of Human (IDKit) → short-lived recovery token. */
    verify: (opts: { onStep?: (s: RecoveryStep) => void } = {}) => verify(opts.onStep),

    /** Encrypt this device's passes with `passphrase` and store the ciphertext (verify first). */
    async backup(passphrase: string, opts: { onStep?: (s: RecoveryStep) => void } = {}): Promise<BackupResult> {
      if (isMock ? !ctx.mock.recoveryVerified : !token) await verify(opts.onStep);
      opts.onStep?.("backing_up");
      const blob = await ctx.vault.export(passphrase);
      if (isMock) ctx.mock.backup = blob;
      else await ctx.api().putBackup(needToken(), blob);
      opts.onStep?.("backed_up");
      return { backedUp: true, bytes: Math.floor((blob.length * 3) / 4) };
    },

    /** On a new phone: verify → fetch → decrypt → restore into the vault. */
    async restore(passphrase: string, opts: { onStep?: (s: RecoveryStep) => void } = {}): Promise<RecoveryResult> {
      const v = await verify(opts.onStep);
      if (!v.hasBackup) return { restored: false, hasBackup: false, keys: [] };
      opts.onStep?.("fetching_backup");
      let blob: string;
      if (isMock) blob = ctx.mock.backup!;
      else {
        try {
          blob = (await ctx.api().getBackup(needToken())).ciphertext;
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return { restored: false, hasBackup: false, keys: [] };
          throw e;
        }
      }
      opts.onStep?.("decrypting");
      const keys = await ctx.vault.import(blob, passphrase);
      opts.onStep?.("restored");
      return { restored: true, hasBackup: true, keys };
    },
  };
}

export type RecoveryDomain = ReturnType<typeof recoveryDomain>;
