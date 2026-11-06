// EIP-712 BusinessVerified, matching contracts/src/BusinessPassRegistry.sol:
//   EIP712("BusinessPassRegistry", "1")
//   BUSINESS_VERIFIED_TYPEHASH = keccak256("BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)")
// The struct signature is configurable (BUSINESS_VERIFIED_TYPE) in case the contract adds a field; every field
// must be one the issuer knows how to fill.
import { hashTypedData, keccak256, toBytes, type Address, type Hex, type TypedDataDomain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const KNOWN_FIELDS = {
  businessNullifier: ["uint256"],
  commitment: ["uint256"],
  expiresAt: ["uint64", "uint256"],
  revenueBand: ["uint8", "uint256"],
} as const;
export type FieldName = keyof typeof KNOWN_FIELDS;
export type AttestationValues = Record<FieldName, bigint>;

export interface ParsedType {
  primaryType: string;
  fields: { name: FieldName; type: string }[];
  typeString: string;
}

export function parseStructType(sig: string): ParsedType {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)$/.exec(sig.trim());
  if (!m) throw new Error(`bad struct type: ${sig}`);
  const fields = m[2].split(",").map((f) => {
    const [type, name, ...rest] = f.trim().split(/\s+/);
    if (!type || !name || rest.length) throw new Error(`bad field "${f}" in ${sig}`);
    const allowed = (KNOWN_FIELDS as Record<string, readonly string[]>)[name];
    if (!allowed) throw new Error(`unknown field ${name}; the issuer can fill: ${Object.keys(KNOWN_FIELDS).join(", ")}`);
    if (!allowed.includes(type)) throw new Error(`field ${name} must be one of ${allowed.join("/")}`);
    return { name: name as FieldName, type };
  });
  return { primaryType: m[1], fields, typeString: `${m[1]}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})` };
}

export class Attester {
  readonly address: Address;
  readonly domain: TypedDataDomain;
  readonly parsed: ParsedType;
  readonly typehash: Hex;
  readonly #sign: (args: Parameters<ReturnType<typeof privateKeyToAccount>["signTypedData"]>[0]) => Promise<Hex>;

  constructor(privateKey: Hex, opts: { name: string; version: string; chainId: number; verifyingContract: Address; type: string }) {
    const account = privateKeyToAccount(privateKey);
    this.address = account.address;
    this.#sign = (a) => account.signTypedData(a);
    this.domain = { name: opts.name, version: opts.version, chainId: opts.chainId, verifyingContract: opts.verifyingContract };
    this.parsed = parseStructType(opts.type);
    this.typehash = keccak256(toBytes(this.parsed.typeString));
  }

  get types() {
    return { [this.parsed.primaryType]: this.parsed.fields.map((f) => ({ name: f.name, type: f.type })) };
  }

  message(v: AttestationValues) {
    return Object.fromEntries(this.parsed.fields.map((f) => [f.name, v[f.name]]));
  }

  digest(v: AttestationValues): Hex {
    return hashTypedData({ domain: this.domain, types: this.types, primaryType: this.parsed.primaryType, message: this.message(v) });
  }

  sign(v: AttestationValues): Promise<Hex> {
    return this.#sign({ domain: this.domain, types: this.types, primaryType: this.parsed.primaryType, message: this.message(v) });
  }
}
