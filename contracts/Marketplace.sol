// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ITicketNFT} from "./interfaces/ITicketNFT.sol";

contract Marketplace is AccessControl, ReentrancyGuard {
    uint256 public constant ORGANIZER_FEE_BPS = 500;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    ITicketNFT public immutable ticketNFT;
    address public immutable treasury;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) private _listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed actor);
    event Sold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 feeAmount
    );
    event FeePaid(uint256 indexed tokenId, address indexed treasury, uint256 feeAmount);

    constructor(address ticketNFT_, address treasury_, address initialAdmin_) {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        require(treasury_ != address(0), "Treasury is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        ticketNFT = ITicketNFT(ticketNFT_);
        treasury = treasury_;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
    }

    function list(uint256 tokenId, uint256 price) external {
        _createListing(msg.sender, tokenId, price);
    }

    function listWithPermit(
        uint256 tokenId,
        uint256 price,
        uint256 deadline,
        bytes calldata signature
    ) external {
        ticketNFT.permit(address(this), tokenId, deadline, signature);
        _createListing(msg.sender, tokenId, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory listing = _listings[tokenId];
        require(listing.seller != address(0), "Listing not found");
        require(
            msg.sender == listing.seller || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not allowed to cancel"
        );

        delete _listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        require(!ticketNFT.paused(), "System is paused");

        Listing memory listing = _listings[tokenId];
        require(listing.seller != address(0), "Listing not found");
        require(!ticketNFT.isUsed(tokenId), "Used tickets cannot be sold");
        require(ticketNFT.ownerOf(tokenId) == listing.seller, "Seller no longer owner");
        require(msg.sender != listing.seller, "Seller cannot buy own ticket");
        require(msg.value == listing.price, "Incorrect payment amount");
        require(
            ticketNFT.balanceOf(msg.sender) < ticketNFT.maxPerWallet(),
            "Buyer wallet limit reached"
        );

        delete _listings[tokenId];
        ticketNFT.safeTransferFrom(listing.seller, msg.sender, tokenId);

        uint256 feeAmount = (msg.value * ORGANIZER_FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerAmount = msg.value - feeAmount;

        (bool feeSent, ) = payable(treasury).call{value: feeAmount}("");
        require(feeSent, "Fee transfer failed");

        (bool sellerPaid, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(sellerPaid, "Seller transfer failed");

        emit FeePaid(tokenId, treasury, feeAmount);
        emit Sold(tokenId, listing.seller, msg.sender, listing.price, feeAmount);
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    function _createListing(address seller, uint256 tokenId, uint256 price) private {
        require(!ticketNFT.paused(), "System is paused");
        require(price > 0, "Price must be > 0");
        require(price <= ticketNFT.primaryPrice(), "Price exceeds primary cap");
        require(!ticketNFT.isUsed(tokenId), "Used tickets cannot be listed");
        require(ticketNFT.ownerOf(tokenId) == seller, "Only owner can list");

        bool approvedForToken = ticketNFT.getApproved(tokenId) == address(this);
        bool approvedForAll = ticketNFT.isApprovedForAll(seller, address(this));
        require(approvedForToken || approvedForAll, "Marketplace not approved");

        _listings[tokenId] = Listing({seller: seller, price: price});
        emit Listed(tokenId, seller, price);
    }
}
