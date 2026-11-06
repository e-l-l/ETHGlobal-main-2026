// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {StandingPassTree} from "./StandingPassTree.sol";
import {IPoseidon2} from "./interfaces/IPoseidon2.sol";
import {SNARK_FIELD} from "./Constants.sol";

/// @notice What the issuer signs after it has verified a zkTLS (Reclaim) proof offchain.
/// @param businessNullifier HMAC(issuerPepper, accountId). The account id is discarded; without the pepper the
///        value cannot be brute-forced back to a tax id or merchant id. One Business Pass per BUSINESS.
/// @param commitment the Business Pass leaf, Poseidon2(TAG_BIZ, h, country, revenueBand, ageOk); the issuer
///        recomputed it from (h, attributes proven by zkTLS) before signing.
/// @param expiresAt last second the attestation can be used.
struct BusinessVerified {
    uint256 businessNullifier;
    uint256 commitment;
    uint64 expiresAt;
}

/// @title BusinessPassRegistry
/// @notice Business Pass credentials: "I control a real, active business account in an allowed country with
///         revenue >= band". Its own depth-16 Poseidon2 tree (same code as the Standing Pass tree).
///
///         Trust: the owner-set `issuer` verifies the zkTLS proof offchain, derives the business nullifier,
///         recomputes the leaf from the merchant's h and the proven attributes, and signs BusinessVerified.
///         The registry checks that signature, rejects a reused business nullifier and inserts the leaf.
///
///         Privacy: the leaf hides its attributes behind h = Poseidon2(secret) (secret never leaves the phone).
///         The only issuance event is BusinessPassIssued(leafIndex, root) plus the tree's LeafInserted (the leaf
///         itself, which every prover must download to build Merkle paths). No attributes, no account id.
///
///         Why the Reclaim proof is NOT verified onchain (deliberate): its ClaimInfo (provider, request
///         parameters, matched values, context) would be public calldata forever, i.e. which revenue band and
///         country predicate passed, linked to this leaf; and the chain still could not link the proof to the
///         uniqueness key without the account id (a hash of which is brute-forceable). It would add cost and
///         leak data while uniqueness stays an issuer assumption anyway. Roadmap: OPRF/TEE issuer.
/// @dev Structurally implements IBusinessPass (isKnownRoot is the inherited public mapping) for AdvanceBook. Never reads msg.sender in `issue` (relayer-submitted).
contract BusinessPassRegistry is StandingPassTree, EIP712, Ownable2Step {
    bytes32 public constant BUSINESS_VERIFIED_TYPEHASH =
        keccak256("BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)");

    address public issuer;
    uint16[4] internal _countries; // ISO 3166-1 numeric; 0 = unused slot (the circuit rejects country 0)
    mapping(uint256 => bool) public businessNullifierUsed;

    /// @notice Deliberately attribute-free.
    event BusinessPassIssued(uint256 indexed leafIndex, uint256 root);
    event IssuerSet(address issuer);
    event CountrySetChanged(uint16[4] countries);

    error ZeroAddress();
    error InvalidAttestation();
    error AttestationExpired(uint64 expiresAt);
    error CommitmentMismatch();
    error InvalidCommitment();
    error BusinessAlreadyHasPass();

    constructor(IPoseidon2 p, address owner_, address issuer_, uint16[4] memory countries_)
        StandingPassTree(p)
        EIP712("BusinessPassRegistry", "1")
        Ownable(owner_)
    {
        if (issuer_ == address(0)) revert ZeroAddress();
        issuer = issuer_;
        _countries = countries_;
        emit IssuerSet(issuer_);
        emit CountrySetChanged(countries_);
    }

    /// @notice Insert a Business Pass leaf vouched for by the issuer. Anyone may submit (a relayer).
    /// @param a the issuer's attestation; `a.commitment` must equal `commitment`.
    /// @param issuerSig EIP-712 signature by `issuer` over `a` (65-byte ECDSA or ERC-1271).
    /// @return leafIndex position of the new leaf.
    function issue(BusinessVerified calldata a, bytes calldata issuerSig, uint256 commitment)
        external
        returns (uint256 leafIndex)
    {
        if (a.commitment != commitment) revert CommitmentMismatch();
        if (commitment == 0 || commitment >= SNARK_FIELD) revert InvalidCommitment();
        if (block.timestamp > a.expiresAt) revert AttestationExpired(a.expiresAt);
        if (a.businessNullifier == 0) revert InvalidAttestation();
        if (businessNullifierUsed[a.businessNullifier]) revert BusinessAlreadyHasPass();
        if (!SignatureChecker.isValidSignatureNow(issuer, hashBusinessVerified(a), issuerSig)) {
            revert InvalidAttestation();
        }
        businessNullifierUsed[a.businessNullifier] = true;
        uint256 root;
        (leafIndex, root) = _insert(commitment);
        emit BusinessPassIssued(leafIndex, root);
    }

    // ---------------------------------------------------------------- views

    /// @notice Full EIP-712 digest the issuer signs (domain "BusinessPassRegistry", "1").
    function hashBusinessVerified(BusinessVerified calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(BUSINESS_VERIFIED_TYPEHASH, a.businessNullifier, a.commitment, a.expiresAt))
        );
    }

    /// @notice Allowed countries; the business_pass circuit proves membership in this set (public inputs 5..8).
    function countrySet() external view returns (uint16[4] memory) {
        return _countries;
    }

    // ---------------------------------------------------------------- owner (named operator powers)

    /// @notice Rotate the issuer key. Cannot touch issued passes or funds.
    function setIssuer(address issuer_) external onlyOwner {
        if (issuer_ == address(0)) revert ZeroAddress();
        issuer = issuer_;
        emit IssuerSet(issuer_);
    }

    /// @notice Change the allowed country set used for new draws (proofs bind to the set at draw time).
    function setCountrySet(uint16[4] calldata countries_) external onlyOwner {
        _countries = countries_;
        emit CountrySetChanged(countries_);
    }
}
