// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITicketSystemState {
    function ownerOf(uint256 tokenId) external view returns (address);

    function paused() external view returns (bool);
}
