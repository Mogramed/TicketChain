// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {ITicketSystemState} from "./interfaces/ITicketSystemState.sol";

contract CheckInRegistry is AccessControl {
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");

    ITicketSystemState public immutable ticketNFT;

    mapping(uint256 => bool) private _usedTickets;

    event ScannerGranted(address indexed account);
    event ScannerRevoked(address indexed account);
    event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner);

    constructor(address ticketNFT_) {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        ticketNFT = ITicketSystemState(ticketNFT_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function grantScanner(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "Scanner is zero address");
        _grantRole(SCANNER_ROLE, account);
        emit ScannerGranted(account);
    }

    function revokeScanner(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(SCANNER_ROLE, account);
        emit ScannerRevoked(account);
    }

    function markUsed(uint256 tokenId) external onlyRole(SCANNER_ROLE) {
        require(!ticketNFT.paused(), "System is paused");
        ticketNFT.ownerOf(tokenId);
        require(!_usedTickets[tokenId], "Ticket already used");

        _usedTickets[tokenId] = true;
        emit TicketMarkedUsed(tokenId, msg.sender);
    }

    function isUsed(uint256 tokenId) external view returns (bool) {
        return _usedTickets[tokenId];
    }
}
