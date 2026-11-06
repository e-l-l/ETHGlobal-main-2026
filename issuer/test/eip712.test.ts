import { encodeAbiParameters, keccak256, recoverTypedDataAddress, toBytes, concat, recoverAddress } from "viem";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_VERIFIED_TYPE } from "../src/config.js";
import { Attester, parseStructType } from "../src/eip712.js";
import { TEST_ADDR, TEST_PK, TEST_REGISTRY } from "./helpers.js";

// The exact string in contracts/src/BusinessPassRegistry.sol BUSINESS_VERIFIED_TYPEHASH.
const CONTRACT_TYPE = "BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)";

const attester = new Attester(TEST_PK, {
  name: "BusinessPassRegistry",
  version: "1",
  chainId: 31337,
  verifyingContract: TEST_REGISTRY,
  type: DEFAULT_BUSINESS_VERIFIED_TYPE,
});

export const VECTOR = {
  businessNullifier: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn,
  commitment: 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81fn,
  expiresAt: 1790000600n,
  revenueBand: 2n,
};

describe("EIP-712 BusinessVerified", () => {
  it("typehash matches the contract's type string", () => {
    expect(attester.parsed.typeString).toBe(CONTRACT_TYPE);
    expect(attester.typehash).toBe(keccak256(toBytes(CONTRACT_TYPE)));
    expect(attester.typehash).toMatchInlineSnapshot(`"0x034695f359f7d3ba8ccfa73a8e48a520f2762994891b7f53930fe7e42b15ad98"`);
  });

  it("digest equals a manual OpenZeppelin _hashTypedDataV4 recomputation (test vector)", () => {
    const domainTypehash = keccak256(toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
    const ds = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
        [domainTypehash, keccak256(toBytes("BusinessPassRegistry")), keccak256(toBytes("1")), 31337n, TEST_REGISTRY],
      ),
    );
    const sh = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
        [attester.typehash, VECTOR.businessNullifier, VECTOR.commitment, VECTOR.expiresAt],
      ),
    );
    const manual = keccak256(concat(["0x1901", ds, sh]));
    expect(attester.digest(VECTOR)).toBe(manual);
    expect({ domainSeparator: ds, structHash: sh, digest: manual }).toMatchInlineSnapshot(`
      {
        "digest": "0x356e1512d84e25060648e149afdc027867acf2b81471eba5bb77edda13f11c5e",
        "domainSeparator": "0x82c63940bcca96e4f0a90f5b1cf771cfc0ea94581ca85f1b78aeb562e88aa845",
        "structHash": "0xffe66f67394cfb2b347c60db121e1539f9cd847cb8efdbba9f1e3b9185f82fee",
      }
    `);
  });

  it("signature recovers to the issuer address", async () => {
    const sig = await attester.sign(VECTOR);
    expect(attester.address).toBe(TEST_ADDR);
    const rec = await recoverTypedDataAddress({
      domain: attester.domain,
      types: attester.types,
      primaryType: "BusinessVerified",
      message: attester.message(VECTOR),
      signature: sig,
    });
    expect(rec).toBe(TEST_ADDR);
    expect(await recoverAddress({ hash: attester.digest(VECTOR), signature: sig })).toBe(TEST_ADDR);
    expect(sig).toMatchInlineSnapshot(`"0xde56ce4b8b77b3cbfb4b55210311fee07914399607ce13fd189fc0a2975c1d36544a08099fd2d022ba4301ec3350349ca62c91d361b9998f63a574e9be0aea2d1c"`); // RFC 6979: deterministic
  });

  it("type string is configurable but only with fields the issuer can fill", () => {
    const p = parseStructType("BusinessVerified(uint256 businessNullifier,uint256 commitment,uint8 revenueBand,uint64 expiresAt)");
    expect(p.fields.map((f) => f.name)).toEqual(["businessNullifier", "commitment", "revenueBand", "expiresAt"]);
    expect(() => parseStructType("BusinessVerified(uint256 businessNullifier,address owner)")).toThrow(/unknown field/);
    expect(() => parseStructType("BusinessVerified(uint8 businessNullifier)")).toThrow(/must be/);
  });
});
