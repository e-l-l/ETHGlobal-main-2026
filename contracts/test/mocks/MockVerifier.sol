pragma solidity ^0.8.26;

import {IVerifier} from "../../src/interfaces/IVerifier.sol";

contract MockVerifier is IVerifier {
    bool public result = true;
    function setResult(bool value) external { result = value; }
    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) { return result; }
}
