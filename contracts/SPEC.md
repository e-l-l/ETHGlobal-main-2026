# Contracts spec (v2): shared contract for all builders

## Pass 2 economics

Offers replace `factorBps` with `feeRateBpsPerWeek` and `feeCapBps`, in that order. The exact EIP-712 type string is `Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 feeRateBpsPerWeek,uint16 feeCapBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)`. Fee accrues linearly per second on original principal from draw while principal remains, at 50 bps/week by default, capped at 300 bps; repayment pays accrued unpaid fee first, then principal. Full principal repayment stops accrual. For $100: fee is $0.50/$1/$2/$3 at 1/2/4/6 weeks and remains $3 at 10 weeks. Collected fee shares are senior 40%, junior 30%, reserve 20%, protocol 10% (4000/3000/2000/1000 bps); each share rounds down and dust goes to reserve. Protocol share is capped at 2000 bps. No checkout processing fee is charged.

The minimum repayment per 7-day window is 1% of remaining principal plus accrued fee at the repayment point; the default window remains 30 days. Junior cover is 20% of senior outstanding including new principal. Default tier caps are $50/$100/$200/$300; holdback defaults to 8% and remains bounded to 5–20%. RiskHook fees split 75% to reserve and 25% to protocol treasury.

> **Contract changes pending redeployment:** Collected fees use configurable senior / junior / reserve / protocol shares of 5333 / 2667 / 1000 / 1000 bps. The treasury defaults to the owner and may be changed by the owner; protocol share is capped at 2000 bps, and shares must sum to 10000. For each payment, senior, junior and protocol shares round down independently and the reserve receives the entire remainder. Thus a single $15 fee pays $7.9995 senior, $4.0005 junior, $1.50 reserve and $1.50 protocol; multiple payments may shift up to three base units per payment to reserve. Fees are paid only as collected. `setTreasury` rejects zero (`ZeroAddress`); `setFeeShares` rejects invalid sums or protocol shares (`InvalidFeeShares`). Both emit events.
>
> All draw routes require junior assets, excluding reserve, to cover `ceil((senior outstanding + new principal) * coverRatioBps / 10000)`; otherwise `InsufficientJuniorCover(assets, required)`. Junior withdrawals use the same ceiling and ratio. The vault owner may configure the ratio from 0 to 10000 bps (`InvalidCoverRatio` otherwise), and deployment defaults to 1500 bps. Losses can subsequently put the pool below the ratio; they do not revert. The junior token on a new deployment is DripCoin (DRIP): junior, takes losses first; existing deployed tokens remain Junior/JNR.
>
> At 14 days since the last qualifying repayment, each active advance contributes its remaining principal to a provision. Junior `totalAssets` is `max(0, idle + outstanding - sum(delinquent unpaid principal))`. A qualifying repayment removes the advance from this estimate; write-off removes it and realizes the loss through the existing waterfall. Junior deposits are disabled while any provision exists (`ProvisionedDepositsDisabled`) to avoid capturing a subsequent recovery at a discounted price. This conservative estimate assumes full principal loss and does not net reserve or predict recoveries. Calculating it scans all historical advances: gas grows without bound, so this prototype needs bounded bookkeeping before production use. A default window at or below 14 days permits write-off before provisioning.
>
> **v2** (Business Pass + managed-agent mandates): `BusinessPassRegistry` (issuer-attested Business Pass tree), `business_pass` circuit + `BusinessPassVerifier`, `drawFirst` takes a Business Pass proof (no World ID anywhere in credit), `registerMandate` / `drawByMandate` / `revokeMandate`, Offer field `worldNullifierHash` → `passNullifier` plus `minRevenueBand`, and the minimum-repayment rule. See "v2" below; it overrides anything older in this file.
> v1.1 changes: `BookConfig` struct constructor, cumulative principal split, `lastSaleAt` restarts only on repaying sales, and `TrancheVault.totalAssets` is `virtual`.
> Status: 152 tests, all passing (2 invariant suites, 2 real-proof E2E suites). `forge build --sizes`: AdvanceBook 23,005 B runtime (limit 24,576), BusinessPassRegistry 5,674 B.

Read this and `../docs/architecture.md` before writing code. **Only edit the files you own** (see "Ownership"). If you need a change in someone else's file or in this spec, stop and say so in your final report. Don't edit it yourself.

## Toolchain

- Foundry. Our files use `pragma solidity ^0.8.26;` (Uniswap PoolManager pins 0.8.26, and hook tests compile it). `evm_version = "cancun"`, optimizer on. The generated bb verifier needs >=0.8.27 and compiles as its own unit, so never import it. Use `IVerifier`.
- Libraries: `forge-std`; OpenZeppelin **5.5.0** via `@openzeppelin/contracts/` (the copy bundled in `lib/uniswap-hooks/lib`); v4-core via `@uniswap/v4-core/` (also bundled in uniswap-hooks); `BaseHook` via `@openzeppelin/uniswap-hooks/base/BaseHook.sol`. See `remappings.txt`. Never add or upgrade libraries.
- Rules from ethskills `security` and `testing`:
  - SafeERC20 everywhere. Checks-effects-interactions plus `nonReentrant` on value-moving entry points.
  - EIP-712 via OpenZeppelin, with a nonce and a deadline.
  - No DEX spot price for decisions.
  - Fuzz with `bound()`, never `vm.assume()`.
  - Stateful contracts get handler-based invariants.
  - Tests must be able to fail: don't assert a value back against what was just written.
- Write "onchain", not "on-chain".

## Units and constants

- USDC has **6 decimals**. All amounts are in USDC base units.
- `P = 21888242871839275222246405745257275088548364400416034343698204186575808495617` (BN254 scalar field). Every value that enters Poseidon2 or the verifier must be `< P`. Reduce keccak-derived values `% P`.
- Poseidon2 (BN254, t=4): `IPoseidon2` deployed on Sepolia at `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2`. In local tests, `vm.etch` that address with `test/fixtures/poseidon2_yul.runtime.hex`.
- Domain tags, each `uint256(keccak256(label)) % P`:
  - `TAG_COMMIT = 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1` ("standing-pass.commit")
  - `TAG_NULL = 0x0f08cced1499e13a50af6f29ab9ee272a40d4e4713313e8ff11d52bfe9fb2f42` ("standing-pass.nullifier")
  - `TAG_BIZ = 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8b` ("standing-pass.biz")
  - `TAG_BIZ_NULL = 0x075964a690d1888b50278bf8b2aed0ca04febb6b1f1c68514fe4450e85164226` ("standing-pass.biz.nullifier")
- Standing Pass formulas (must match the Noir circuit):
  - `h = hash_1(secret)`
  - `commitment = hash_3(TAG_COMMIT, h, count)`
  - `nullifier = hash_2(TAG_NULL, secret)` (computed only in-circuit)
  - Merkle node `= hash_2(left, right)`, empty leaf `= 0`
- Verifier public inputs, **in this order**: `[root, nullifier, tier, commitmentNext, context]`, each as `bytes32`.
- `context = uint256(keccak256(abi.encode(recipient, offerId))) % P`

### Known vectors (computed independently, verified against Noir)

| What | Value |
|---|---|
| `hash_1(123456789)` | `0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9b` |
| `hash_3(TAG_COMMIT, h, 1)` with h above | `0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f` |
| `hash_2(TAG_NULL, 123456789)` | `0x0cf89fcd279f976f879be030c4624455df2d39f63e99eb51b8f584cbe2493c84` |
| Empty depth-16 root | `0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3` |
| Root after leaves [1] | `0x0730cfe06254f1d70d09db1974d720fbb8e3b8e75f1c116466d3cb850ac6b8f4` |
| Root after leaves [1,2] | `0x0845b34d79339209303ed8f456c75d762ec77145d79d40a49941169ae85e34d3` |
| Root after leaves [1,2,3] | `0x2b09a6c5ef1a0755e9c595fec30b72a4bdb1053fc8a253db86ed2147010c5a9b` |
| `hash_2(1000, 2000)` (Noir official vector) | `0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8a` |

## Contracts (v2: 3 custom + 2 standard vaults + 2 generated verifiers)

v2 adds `src/BusinessPassRegistry.sol` (custom) and `src/verifier/BusinessPassVerifier.sol` (generated). The v1 table below still holds for the rest.

| File | Kind | Owner |
|---|---|---|
| `src/interfaces/*.sol` | Interfaces (frozen) | lead |
| `src/StandingPassTree.sol` | abstract: Poseidon2 incremental Merkle tree | **claude-tree** |
| `src/Policy.sol` | abstract: EIP-712 offers, caps, risk limits | **codex-policy** |
| `src/AdvanceBook.sol` | the core: router, advances, waterfall, write-off, Standing Pass | **claude-book** |
| `src/TrancheVault.sol` | ERC-4626 senior and junior vault | **codex-vault** |
| `src/RiskHook.sol` | Uniswap v4 hook: USDC fee to reserve, TWAP | **claude-hook** |
| `test/mocks/*`, `test/Base.t.sol`, `test/invariant/*`, `script/Deploy.s.sol` | fixtures, invariants, deploy | **codex-harness** |

Each owner also writes `test/<Contract>.t.sol` for their own contract (the harness owner writes `test/Base.t.sol` and `test/invariant/`).

---

### StandingPassTree (abstract)

```solidity
abstract contract StandingPassTree {
    uint256 public constant TREE_DEPTH = 16;
    IPoseidon2 public immutable poseidon2;
    uint256 public nextLeafIndex;
    uint256 public currentRoot;
    mapping(uint256 => bool) public isKnownRoot;   // every root ever produced (leaves are never removed)
    event LeafInserted(uint256 indexed commitment, uint256 leafIndex, uint256 newRoot);
    constructor(IPoseidon2 p);                     // precompute zeros[], set currentRoot = empty root, mark known
    function _insert(uint256 leaf) internal returns (uint256 index, uint256 newRoot); // reverts if leaf >= P or tree full
}
```
Tornado-style filled-subtrees insertion. Zero leaf is `0`, and `zeros[i+1] = hash_2(zeros[i], zeros[i])`. Test against the vectors above with the etched Poseidon2.

### Policy (abstract)

```solidity
struct Offer {
    bytes32 offerId;            // unique; acts as the nonce
    bytes32 shopId;
    address recipient;          // fresh payout address
    uint256 amount;             // one of 50e6, 100e6, 250e6, 500e6
    uint16  factorBps;          // total owed per 1 = factorBps / 1e4, within [11000, 15000]
    uint16  holdbackBps;        // share of each sale, within [500, 2000]
    uint8   tier;               // 0 = first advance (World ID), 1..3 = Standing Pass count, capped at 3
    uint256 worldNullifierHash; // nonzero iff tier == 0
    uint64  expiresAt;
}
// typehash: "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 worldNullifierHash,uint64 expiresAt)"
abstract contract Policy is EIP712("AdvanceBook", "1"), Ownable2Step {
    address public offerSigner;      // agent service key: signs offers only, holds no funds
    address public riskManager;      // Risk agent key: can only LOWER limits
    uint256[4] public tierCap;       // max amount per tier
    uint256[4] public tierCapFloor;  // riskManager can't go below these
    uint256 public maxExposure;      // cap on total outstanding senior principal
    uint256 public maxExposureFloor;
    mapping(bytes32 => bool) public offerUsed;
    mapping(uint256 => bool) public worldNullifierUsed;
    constructor(address owner_, address offerSigner_, address riskManager_, uint256[4] memory caps, uint256[4] memory capFloors, uint256 maxExposure_, uint256 maxExposureFloor_);
    function hashOffer(Offer calldata o) public view returns (bytes32);  // full EIP-712 digest
    function _checkAndConsumeOffer(Offer calldata o, bytes calldata sig, uint256 currentExposure) internal;
    function lowerLimits(uint256[4] calldata caps, uint256 maxExposure_) external;   // onlyRiskManager; each new <= current and >= floor
    function setLimits(uint256[4] calldata caps, uint256 maxExposure_) external;     // onlyOwner; may raise (named operator power)
    function setOfferSigner(address) external;  function setRiskManager(address) external; // onlyOwner
    event OfferConsumed(bytes32 indexed offerId, bytes32 indexed shopId, uint8 tier, uint256 amount);
    event LimitsChanged(address indexed by, uint256[4] caps, uint256 maxExposure);
}
```
`_checkAndConsumeOffer` reverts with custom errors unless every one of these holds:
- the signature recovers to `offerSigner` (use `SignatureChecker` or `ECDSA`)
- `!offerUsed[offerId]` and `block.timestamp <= expiresAt`
- `amount` is an allowed size, and `amount <= tierCap[tier]`
- `tier <= 3`
- `factorBps` and `holdbackBps` are in range
- `currentExposure + amount <= maxExposure`
- if `tier == 0`: `worldNullifierHash != 0` and unused, then marked used
- if `tier > 0`: `worldNullifierHash == 0`

It then marks `offerUsed[offerId] = true` and emits `OfferConsumed`.

### TrancheVault (OpenZeppelin ERC4626)

```solidity
contract TrancheVault is ERC4626, Ownable {
    constructor(IERC20 usdc, string memory name, string memory symbol, address owner_, TrancheVault coverRef, uint16 coverRatioBps);
    address public book;                          // set once by owner via setBook
    uint256 public outstanding;                   // principal lent out and not yet returned or written down
    function setBook(address) external;           // onlyOwner, only once
    function totalAssets() public view override returns (uint256); // idle balance + outstanding
    function idle() public view returns (uint256);                 // asset balance held
    function lend(address to, uint256 amount) external;            // onlyBook; requires idle >= amount; outstanding += amount
    function principalReturned(uint256 amount) external;           // onlyBook; book has ALREADY transferred `amount` in; outstanding -= amount
    function writeDown(uint256 amount) external;                   // onlyBook; outstanding -= amount (realised loss)
    function cover(address to, uint256 amount) external returns (uint256 paid); // onlyBook; pays min(amount, idle) to `to`
}
```
- Fees arrive as plain USDC transfers into the vault, which raise the share price.
- `maxWithdraw` and `maxRedeem` are limited by `idle()`.
- If `coverRef != address(0)` (the junior vault), withdrawals are further limited so that `totalAssets() >= ceil(coverRef.outstanding() * coverRatioBps / 1e4)` afterwards.
- Decimals offset stays 0 (shares have 6 decimals). Mitigate inflation with OpenZeppelin's virtual shares plus a seed deposit in the deploy script. Test the donation case.
- **The junior token is the junior vault's share token**, and it's what trades on Uniswap.

### AdvanceBook (core)

```solidity
contract AdvanceBook is Policy, StandingPassTree, ReentrancyGuard {
    // v1.1: one struct argument. 14 flat arguments hit "stack too deep" without via_ir.
    // BookConfig fields, in order: usdc, senior, junior, poseidon2, verifier, owner, offerSigner, riskManager,
    //   caps, capFloors, maxExposure, maxExposureFloor, defaultWindow, writeOffBounty
    constructor(BookConfig memory c);
    uint16 public constant SENIOR_FEE_BPS = 6000; uint16 public constant JUNIOR_FEE_BPS = 3000; // reserve gets the remainder
    enum Status { None, Active, Repaid, WrittenOff }
    struct Shop { address owner; address payout; uint256 activeAdvanceId; }
    struct Advance { bytes32 shopId; uint256 principal; uint256 totalOwed; uint256 repaid; uint256 principalRepaid;
                     uint16 holdbackBps; uint8 tier; uint64 lastSaleAt; Status status; bool credentialClaimed; uint256 pendingCommitment; }
    uint256 public reserve; uint256 public nextAdvanceId; // ids start at 1
    mapping(bytes32 => Shop) public shops; mapping(uint256 => Advance) public advances; mapping(uint256 => bool) public nullifierSpent;

    function registerShop(bytes32 shopId, address payout) external;           // first come; owner = msg.sender
    function setPayout(bytes32 shopId, address payout) external;              // shop owner only
    function pay(bytes32 shopId, uint256 amount) external;                    // customer pays; split happens here
    function drawFirst(Offer calldata o, bytes calldata sig, uint256 h) external returns (uint256 advanceId);
    function drawWithPass(Offer calldata o, bytes calldata sig, bytes calldata proof,
                          uint256 root, uint256 nullifier, uint256 commitmentNext) external returns (uint256 advanceId);
    function claimStandingPass(uint256 advanceId) external;                   // anyone (relayer); inserts pendingCommitment
    function writeOff(uint256 advanceId) external;                            // anyone, after defaultWindow with no sales; bounty from reserve
    function depositReserve(uint256 amount) external;                         // anyone (RiskHook.flush)
    function contextFor(address recipient, bytes32 offerId) public pure returns (uint256);
    function commitmentFor(uint256 h, uint256 count) public view returns (uint256);
    function exposure() public view returns (uint256);                       // senior.outstanding()
}
```
**Rule:** the draw functions **never use `msg.sender`**, so a relayer or a fresh paymaster account can submit them.

**`pay`:**
1. Pull `amount` from `msg.sender` (balance-delta check).
2. If the shop has an active advance: `rep = min(amount * holdbackBps / 1e4, totalOwed - repaid)`. Otherwise `rep = 0`.
3. Send `amount - rep` to the shop's payout address.
4. Split `rep` into principal and fee:
   - principal part, **computed cumulatively** (v1.1): `floor(repaidAfter * principal / totalOwed) - principalRepaid`. This is always `<= rep`, and exactly `principal - principalRepaid` on the final repayment. A per-sale `rep * principal / totalOwed` rounds down every sale and can leave an advance that can never be repaid.
   - fee part `= rep - principal part`
5. Send the principal and senior fee share to the senior vault and call `senior.principalReturned(principalPart)`.
6. Send the junior fee share to the junior vault and the protocol share to treasury; allocate the remainder to reserve as described above.
7. Update `lastSaleAt` **only when `rep > 0`** (v1.1), so sales too small to repay anything can't delay a write-off. If `repaid == totalOwed`: status Repaid, clear `shop.activeAdvanceId`, emit `AdvanceRepaid`.
8. Emit `Sale(shopId, payer = msg.sender, amount, rep)` (v1.2: `payer` indexed for the agents).

**`drawFirst`:** requires `o.tier == 0`. Steps:
1. Run `_checkAndConsumeOffer(o, sig, exposure())`.
2. The shop must exist and have no active advance.
3. `pending = commitmentFor(h, 1)`.
4. `senior.lend(o.recipient, o.amount)`.
5. Create the advance with `totalOwed = amount * factorBps / 1e4` and `lastSaleAt = now`. Emit `AdvanceOpened`.

**`drawWithPass`:** requires `o.tier >= 1`. Same as `drawFirst`, plus:
- `isKnownRoot[root]` and `!nullifierSpent[nullifier]`
- all inputs `< P`
- `verifier.verify(proof, [root, nullifier, o.tier, commitmentNext, contextFor(o.recipient, o.offerId)])` returns true
- then mark the nullifier spent and set `pending = commitmentNext`

**`claimStandingPass`:** status Repaid and not yet claimed → `_insert(pendingCommitment)`, mark claimed.

**`writeOff`:** status Active and `now >= lastSaleAt + defaultWindow`. Steps:
1. `loss = principal - principalRepaid`.
2. `paidJ = junior.cover(senior, loss)`, then `senior.principalReturned(paidJ)`.
3. `fromReserve = min(rest, reserve)`: transfer to senior, then `principalReturned`.
4. `senior.writeDown(remaining)`.
5. Pay the caller `bounty = min(writeOffBounty, reserve)`.
6. Status WrittenOff, clear the shop's active advance, emit `AdvanceWrittenOff(id, loss, paidJ, fromReserve, seniorLoss, bounty)`.

**Events:** `ShopRegistered`, `Sale`, `AdvanceOpened(id, shopId, amount, totalOwed, holdbackBps, tier)`, `AdvanceRepaid`, `StandingPassClaimed(id, commitment)`, `AdvanceWrittenOff`, `ReserveDeposited`.

### RiskHook (Uniswap v4)

```solidity
contract RiskHook is BaseHook {   // OpenZeppelin uniswap-hooks BaseHook
    constructor(IPoolManager pm, address usdc, address book, uint24 feePips); // feePips e.g. 3000 = 0.30%
    // permissions: afterInitialize, afterSwap, afterSwapReturnDelta
    function consult(PoolKey calldata key, uint32 secondsAgo) external view returns (int24 meanTick); // TWAP from ring buffer
    function flush() external;   // send accrued USDC to book.depositReserve (approve + call)
}
```
- Charge the fee only when the swap's **unspecified** currency is USDC. Otherwise charge nothing.
- Take the fee with `poolManager.take` against the returned delta.
- Record observations as a ring buffer of `(timestamp, tickCumulative)`, size 64, at most one write per block.
- Tests use v4-core's test `Deployers` and mine the hook address for the permission flags.

### Mocks and harness (codex-harness)

- `test/mocks/MockUSDC.sol`: 6 decimals, open `mint`.
- `test/mocks/MockVerifier.sol`: returns a settable bool and records the last public inputs. **Test only, never in `script/`.**
- `test/Base.t.sol`: `BaseTest` deploys the full system:
  - etch Poseidon2, MockUSDC, senior and junior vaults, AdvanceBook
  - `setBook` on both vaults; seed deposits
  - an EIP-712 offer signer helper `_signOffer(Offer, pk)`
- `test/invariant/`: handler-driven invariants. Each must hold after every call:
  - senior `totalAssets == idle + outstanding`; junior subtracts the delinquency provision as described above
  - `senior.outstanding == Σ(active principal − principalRepaid)`
  - book USDC balance `== reserve`
  - no advance has `repaid > totalOwed`
- `script/Deploy.s.sol`:
  - reads env: `USDC` (else deploys MockUSDC), `POSEIDON2`, `VERIFIER`, `OFFER_SIGNER`, `RISK_MANAGER`, `POOL_MANAGER`
  - deploys vaults, book and hook (mined salt), wires `setBook`, initialises the junior/USDC pool
  - refuses to run without a real `VERIFIER` address


---

## v2: Business Pass, mandates, minimum repayment (overrides the above where they differ)

### Formulas (Noir == Solidity == `agents/src/mra_agents/zk.py`)

```
h               = Poseidon2(secret)                                      (device only)
business leaf   = Poseidon2(TAG_BIZ, h, country, revenueBand, ageOk)     5 inputs; country ISO-3166 numeric (u16, != 0), band u8, ageOk 1
first-adv. null = Poseidon2(TAG_BIZ_NULL, secret)                        published once: drawFirst OR a tier-0 registerMandate
first Standing  = Poseidon2(TAG_COMMIT, Poseidon2(secret_next), 1)       commitmentNext, fresh secret (unlinkable to the issuance h)
businessNullifier (registry uniqueness) = HMAC-SHA256(issuerPepper, accountId)   offchain, account id discarded
offer context   = keccak256(abi.encode(recipient, offerId)) % P
mandate context = uint256(mandateHash) % P,  mandateHash = EIP-712 struct hash of Mandate (below)
```

### business_pass circuit (circuits/business_pass, 4,532 gates)

Public inputs, in order: `[root, nullifier, minBand, commitmentNext, context, c0, c1, c2, c3]`, where `c0..c3` = `BusinessPassRegistry.countrySet()` read at verify time. Proves: membership in the Business Pass tree, `revenueBand >= minBand`, `ageOk == 1`, `country in {c0..c3}` (0 slots never match), the nullifier, and `commitmentNext`. Country is a public **set**, not a code: a draw reveals "one of AR/NG/KE", which keeps the anonymity set as large as possible.

### BusinessPassRegistry

```solidity
struct BusinessVerified { uint256 businessNullifier; uint256 commitment; uint64 expiresAt; }
// EIP-712 domain ("BusinessPassRegistry", "1"); typehash "BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)"
contract BusinessPassRegistry is StandingPassTree, EIP712, Ownable2Step {
    constructor(IPoseidon2, address owner, address issuer, uint16[4] countries);
    function issue(BusinessVerified calldata a, bytes calldata issuerSig, uint256 commitment) external returns (uint256 leafIndex);
    function hashBusinessVerified(BusinessVerified calldata) external view returns (bytes32);
    function countrySet() external view returns (uint16[4] memory);
    function setIssuer(address) external;            // onlyOwner
    function setCountrySet(uint16[4] calldata) external;   // onlyOwner
    mapping(uint256 => bool) public businessNullifierUsed;
    event BusinessPassIssued(uint256 indexed leafIndex, uint256 root);   // + the tree's LeafInserted(leaf, index, root)
}
```
`issue` reverts unless: `a.commitment == commitment`, `0 < commitment < P`, `now <= a.expiresAt`, `businessNullifier != 0` and unused (**one pass per business**, not per human), signature by `issuer`. Never reads `msg.sender`.

**No onchain Reclaim verification (deliberate):** `ClaimInfo` (provider, request parameters, matched values, context) would be public calldata forever, leaking which revenue/country predicate passed next to this leaf, and the chain still could not link the proof to the uniqueness key without the account id (whose hash is brute-forceable). Uniqueness and attributes are issuer assumptions either way. Roadmap: OPRF/TEE issuer.

### Offer (v2)

```solidity
struct Offer { bytes32 offerId; bytes32 shopId; address recipient; uint256 amount; uint16 factorBps; uint16 holdbackBps;
               uint8 tier; uint256 passNullifier; uint8 minRevenueBand; uint64 expiresAt; }
// "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)"
```
Policy `_consumeOffer(o, sig, exposure, manual)`:
- manual (`drawFirst` / `drawWithPass`): tier 0 needs `passNullifier != 0` and unused (marked used); tier > 0 needs `passNullifier == 0 && minRevenueBand == 0`.
- mandate (`drawByMandate`): `passNullifier == 0` at every tier (the credential was spent at registration); tier > 0 also `minRevenueBand == 0`.

### AdvanceBook (v2)

`BookConfig` gains, at the end: `IBusinessPass businessPass, IVerifier bizVerifier, address agentPassAttester`.

```solidity
function drawFirst(Offer o, bytes sig, bytes proof, uint256 root, uint256 commitmentNext) returns (uint256);   // tier 0, business_pass proof
function drawWithPass(Offer o, bytes sig, bytes proof, uint256 root, uint256 nullifier, uint256 commitmentNext) returns (uint256); // unchanged

struct Limits { uint256 maxPerDraw; uint256 maxPerPeriod; uint64 period; uint64 expiry; }
struct MandateRequest { bytes32 shopId; address agentKey; address recipient; Limits limits; uint8 tier; uint8 band; }
struct CredentialProof { bytes proof; uint256 root; uint256 nullifier; uint256 commitmentNext; }
struct AgentPassAttestation { uint256 nonce; uint64 expiry; bytes signature; }
function registerMandate(MandateRequest r, CredentialProof p, AgentPassAttestation att, bytes ownerSig) returns (uint256 mandateId);
function drawByMandate(Offer o, bytes offerSig, uint256 mandateId, bytes agentSig) returns (uint256 advanceId);
function revokeMandate(uint256 mandateId, bytes sig);
function getMandate(uint256) view returns (Mandate);   // shopId, agentKey, expiry, tier, band, revoked, recipient, period, periodStart,
                                                       // maxPerDraw, maxPerPeriod, drawnInPeriod, limitsHash, pendingCommitment
function hashLimits(Limits) pure returns (bytes32); function mandateHash(MandateRequest) pure returns (bytes32);
function mandateContext(MandateRequest) pure returns (uint256); function setAgentPassAttester(address);  // onlyOwner
```
EIP-712 (domain "AdvanceBook", "1", chainId, AdvanceBook), all signatures 65-byte `r||s||v` or ERC-1271:
| Type | Signed by |
|---|---|
| `Limits(uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry)` (struct hash only) | — |
| `AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)` | `agentPassAttester`, after our backend validated World Agent Pass for exactly this key + limits. Nonce single-use. |
| `Mandate(bytes32 shopId,address agentKey,address recipient,uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry,uint8 tier,uint8 band)` | the **shop owner** (consent to put this agent's debt on their shop) |
| `MandateDraw(bytes32 offerId,uint256 mandateId)` | the mandate's `agentKey` |
| `RevokeMandate(uint256 mandateId)` | `agentKey` or the shop owner |

`registerMandate` checks: limits sane (`maxPerDraw > 0`, `maxPerPeriod >= maxPerDraw`, `period > 0`, `now < expiry <= now + 180 days`, tier <= 3, band 0 unless tier 0, agentKey/recipient nonzero), shop registered, owner signature, attestation (`now <= att.expiry`, nonce unused → used), then the credential: tier 0 = business_pass proof with `minBand = band`, nullifier spent in `passNullifierUsed`; tier >= 1 = standing_pass proof with `tier`, nullifier spent in `nullifierSpent`; context = mandateContext. Stores `pendingCommitment = commitmentNext`.

`drawByMandate` checks: mandate exists, not revoked, `now <= expiry`; offer `shopId`, `recipient` (pinned), `tier` match; tier 0: `minRevenueBand <= band`; agent signature; `amount <= maxPerDraw`; fixed period window (restarts at the first draw at/after `periodStart + period`), `drawnInPeriod + amount <= maxPerPeriod`; shop has no active advance; offer (mandate variant). Only the **first** draw carries `pendingCommitment` (later ones store 0 and `claimStandingPass` reverts `NoCredential`): one credential spend = one Standing Pass step. Never reads `msg.sender`.

### Minimum repayment rule

`MIN_REPAY_BPS = 100`, `REPAY_WINDOW = 7 days`, `minWindowRepayment(totalOwed) = ceil(totalOwed * 1%)`. Each advance tracks `windowStart` (opening time) and `windowRepaid`. On a repaying sale at `now`: if `now >= windowStart + 7 days` a new window starts at `now` (stale partial dropped); add `rep`; if the window total `>= minWindowRepayment`, `lastSaleAt = now` and a fresh window starts at `now`; otherwise only `windowRepaid` grows. So `writeOff` becomes possible `defaultWindow` after the last window that reached 1%.

### v2 vectors (Solidity-produced; contracts/test/Eip712Vectors.t.sol, chainId 31337, AdvanceBook at `0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f`, registry at `0x2e234DAe75C793f67A35089C9d99245E1C58470b`)

| What | Value |
|---|---|
| `Poseidon2(TAG_BIZ, hash_1(123456789), 32, 2, 1)` | `0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43` |
| `hash_2(TAG_BIZ_NULL, 123456789)` | `0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434ef` |
| Business Pass root after leaves [that leaf] | `0x1da5b44f817335e17c31ff665643e7c8252c28aa6a3f1f594310b3a4fd9f5851` |
| Offer(offerId 0xabc, shopId keccak("chai-stall"), 0xbEEF, 100e6, 11500, 1000, tier 1, 0, 0, 1800000000) | `0xd20c279d2f60369b3c4fa4a5758158ed05624c8a8886e43eb3ef1b28bb7a74f2` |
| same, tier 0, passNullifier 42, minRevenueBand 2 | `0x33cd4172f8d0782a912874cb845a5b27c2620197f623b671ec1dcaf9c5692dcd` |
| `hashLimits(100e6, 200e6, 2592000, 1800000000)` | `0xb5e113b3002cf248eea60deb8e6fd8e863ba80e92f38efaf17ae436ec93c2586` |
| AgentPassAttestation(0xbEEF, that limitsHash, nonce 42, expiry 1800000000) digest | `0xa9f31df169aab4fb684fb6a2a6662e0a7d726b61c59e851e32d5eb6383f7fa53` |
| MandateDraw(offerId 0xabc, mandateId 7) digest | `0x546eecd269e58b0970176d613a3d6913821e921c4716706f7a457ba199ccaaa8` |
| BusinessVerified(42, leaf above, 1800000000) digest (registry) | `0x33b9ef7df45f740ccc27cfaa49932f91a79990af90592fb2c9f8af46a78bd702` |

### Trust assumptions (CROPS)

- **Issuer key** (BusinessPassRegistry.issuer): vouches that a zkTLS proof showed these attributes and that the business is new. Can mint fake passes (bounded by tier-0 caps, exposure cap, junior first-loss). Holds the HMAC pepper. Owner can rotate it. Roadmap: OPRF/TEE.
- **AgentPass attester** (AdvanceBook.agentPassAttester): vouches that a human approved this agent key + limits in World. Cannot draw: a mandate also needs the shop owner's signature and a valid ZK credential.
- **Offer signer**: unchanged; mandate draws still need its signed, clamped offer.
