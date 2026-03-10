// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICheckInRegistry {
    function isUsed(uint256 tokenId) external view returns (bool);
}
