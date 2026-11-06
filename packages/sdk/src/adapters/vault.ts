/**
 * CredentialVault: Business Pass / Standing Pass secrets and the session (shop id, agent manage token) live
 * on the device ONLY. `export()` encrypts everything with a passphrase (PBKDF2-SHA256 → AES-256-GCM, WebCrypto)
 * into the base64 blob that PUT /recovery/backup stores; `import()` reverses it on a new phone.
 *
 * Nothing here logs. Values are plain JSON; never put them in analytics, URLs or error messages.
 */
import { VaultError } from "../errors.js";

export type BusinessPassSecret = {
  kind: "business_pass";
  /** Field elements as 0x-hex. `secret` is the only true secret; h/commitment are derived from it. */
  secret: string;
  h: string;
  commitment: string;
  country: number;
  band: number;
  ageOk: 0 | 1;
  leafIndex?: number;
  /** Spent by the first draw or a tier-0 mandate (its nullifier is single use). */
  spent?: boolean;
  chainId: number;
  issuedAt: number;
};

export type StandingPassSecret = {
  kind: "standing_pass";
  secret: string;
  h: string;
  commitment: string;
  /** Repaid advances this credential attests to. */
  count: number;
  /** Inserted onchain by claimStandingPass. */
  claimed: boolean;
  leafIndex?: number;
  advanceId?: string;
  /** The next credential (bound as commitment_next by the last draw), waiting for its claim. */
  next?: { secret: string; h: string; commitment: string; count: number };
};

export type Session = {
  shopId?: string;
  pseudonym?: string;
  shopName?: string;
  payout?: string;
  purpose?: string;
  agentId?: string;
  /** Bearer token for /agents/{id}/*. Secret. */
  manageToken?: string;
  mandateId?: string;
  previousShops?: string[];
};

export type VaultRecords = {
  business_pass: BusinessPassSecret;
  standing_pass: StandingPassSecret;
  session: Session;
};
export type VaultKey = keyof VaultRecords;

export interface CredentialVault {
  readonly kind: "memory" | "indexeddb" | (string & {});
  get<K extends VaultKey>(key: K): Promise<VaultRecords[K] | undefined>;
  put<K extends VaultKey>(key: K, value: VaultRecords[K]): Promise<void>;
  delete(key: VaultKey): Promise<void>;
  keys(): Promise<VaultKey[]>;
  clear(): Promise<void>;
  /** Encrypt everything → base64 (the recovery backup ciphertext). */
  export(passphrase: string): Promise<string>;
  /** Decrypt a backup and restore it (replaces existing records). Returns the restored keys. */
  import(blob: string, passphrase: string): Promise<VaultKey[]>;
}

/* ------------------------------------------------------------- encryption */

const MAGIC = new Uint8Array([0x4d, 0x52, 0x41, 0x01]); // "MRA" v1
const ITERATIONS = 210_000;

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptRecords(records: Partial<VaultRecords>, passphrase: string): Promise<string> {
  if (!passphrase || passphrase.length < 8) throw new VaultError("vault_locked", "backup passphrase must be at least 8 characters");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: MAGIC as BufferSource }, key, new TextEncoder().encode(JSON.stringify(records))),
  );
  const out = new Uint8Array(MAGIC.length + salt.length + iv.length + ct.length);
  out.set(MAGIC, 0);
  out.set(salt, 4);
  out.set(iv, 20);
  out.set(ct, 32);
  return b64encode(out);
}

export async function decryptRecords(blob: string, passphrase: string): Promise<Partial<VaultRecords>> {
  let bytes: Uint8Array;
  try {
    bytes = b64decode(blob);
  } catch {
    throw new VaultError("vault_corrupt", "backup is not valid base64");
  }
  if (bytes.length < 33 || !MAGIC.every((b, i) => bytes[i] === b)) throw new VaultError("vault_corrupt", "not an MRA backup");
  const key = await deriveKey(passphrase, bytes.slice(4, 20));
  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(20, 32) as BufferSource, additionalData: MAGIC as BufferSource }, key, bytes.slice(32) as BufferSource);
  } catch {
    throw new VaultError("vault_locked", "wrong passphrase or damaged backup");
  }
  return JSON.parse(new TextDecoder().decode(plain)) as Partial<VaultRecords>;
}

const KEYS: VaultKey[] = ["business_pass", "standing_pass", "session"];

abstract class BaseVault implements CredentialVault {
  abstract readonly kind: string;
  abstract get<K extends VaultKey>(key: K): Promise<VaultRecords[K] | undefined>;
  abstract put<K extends VaultKey>(key: K, value: VaultRecords[K]): Promise<void>;
  abstract delete(key: VaultKey): Promise<void>;
  abstract keys(): Promise<VaultKey[]>;

  async clear() {
    for (const k of await this.keys()) await this.delete(k);
  }
  async export(passphrase: string) {
    const records: Partial<Record<VaultKey, unknown>> = {};
    for (const k of await this.keys()) records[k] = await this.get(k);
    return encryptRecords(records as Partial<VaultRecords>, passphrase);
  }
  async import(blob: string, passphrase: string) {
    const records = await decryptRecords(blob, passphrase);
    await this.clear();
    const restored: VaultKey[] = [];
    for (const k of KEYS) {
      const v = records[k];
      if (v !== undefined) {
        await this.put(k, v as never);
        restored.push(k);
      }
    }
    return restored;
  }
  /** Never print vault contents. */
  toString() {
    return `${this.kind}Vault`;
  }
  toJSON() {
    return this.toString();
  }
}

/** In-memory vault (tests, SSR, mock mode). Lost on reload. */
export class MemoryVault extends BaseVault {
  readonly kind = "memory";
  #m = new Map<VaultKey, unknown>();
  async get<K extends VaultKey>(key: K) {
    const v = this.#m.get(key);
    return v === undefined ? undefined : (structuredClone(v) as VaultRecords[K]);
  }
  async put<K extends VaultKey>(key: K, value: VaultRecords[K]) {
    this.#m.set(key, structuredClone(value));
  }
  async delete(key: VaultKey) {
    this.#m.delete(key);
  }
  async keys() {
    return [...this.#m.keys()];
  }
}

/** IndexedDB vault (browser). One object store, keyed by VaultKey. */
export class IndexedDbVault extends BaseVault {
  readonly kind = "indexeddb";
  #db: Promise<IDBDatabase> | undefined;
  constructor(
    private readonly dbName = "mra-vault",
    private readonly idb: IDBFactory | undefined = globalThis.indexedDB,
  ) {
    super();
  }
  private db(): Promise<IDBDatabase> {
    if (!this.idb) return Promise.reject(new VaultError("vault_locked", "IndexedDB is not available here"));
    this.#db ??= new Promise((resolve, reject) => {
      const req = this.idb!.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("records");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new VaultError("vault_locked", "could not open IndexedDB"));
    });
    return this.#db;
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction("records", mode).objectStore("records"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new VaultError("vault_corrupt", "IndexedDB request failed"));
    });
  }
  async get<K extends VaultKey>(key: K) {
    return (await this.tx("readonly", (s) => s.get(key))) as VaultRecords[K] | undefined;
  }
  async put<K extends VaultKey>(key: K, value: VaultRecords[K]) {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async delete(key: VaultKey) {
    await this.tx("readwrite", (s) => s.delete(key));
  }
  async keys() {
    return (await this.tx("readonly", (s) => s.getAllKeys())) as VaultKey[];
  }
}

/** IndexedDB in a browser, memory elsewhere. */
export function defaultVault(): CredentialVault {
  return typeof globalThis.indexedDB !== "undefined" ? new IndexedDbVault() : new MemoryVault();
}
