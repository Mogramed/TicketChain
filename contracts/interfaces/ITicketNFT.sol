// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITicketNFT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function getApproved(uint256 tokenId) external view returns (address);

    function isApprovedForAll(
        address owner,
        address operator
    ) external view returns (bool);

    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    function balanceOf(address owner) external view returns (uint256);

    function paused() external view returns (bool);

    function primaryPrice() external view returns (uint256);

    function maxPerWallet() external view returns (uint256);

    function isUsed(uint256 tokenId) external view returns (bool);
}
