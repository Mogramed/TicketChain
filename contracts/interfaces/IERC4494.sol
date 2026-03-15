// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";

interface IERC4494 is IERC165 {
    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        bytes memory signature
    ) external;

    function nonces(uint256 tokenId) external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
