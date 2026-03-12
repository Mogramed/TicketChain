// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ICheckInRegistry} from "./interfaces/ICheckInRegistry.sol";

contract TicketNFT is ERC721, AccessControl, Pausable, IERC4906 {
    using Strings for uint256;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable primaryPrice;
    uint256 public immutable maxSupply;
    uint256 public constant maxPerWallet = 2;

    address public immutable treasury;
    address public marketplace;
    ICheckInRegistry public checkInRegistry;

    bool public collectibleMode;

    string private _baseTokenURI;
    string private _collectibleBaseURI;
    uint256 private _nextTokenId;

    event PrimaryMinted(address indexed buyer, uint256 indexed tokenId, uint256 paidAmount);
    event MarketplaceUpdated(address indexed previousMarketplace, address indexed newMarketplace);
    event CheckInRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event CollectibleModeUpdated(bool enabled);
    event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 primaryPrice_,
        uint256 maxSupply_,
        address treasury_,
        string memory baseTokenURI_,
        string memory collectibleBaseURI_
    ) ERC721(name_, symbol_) {
        require(primaryPrice_ > 0, "Primary price must be > 0");
        require(maxSupply_ > 0, "Max supply must be > 0");
        require(treasury_ != address(0), "Treasury is zero address");

        primaryPrice = primaryPrice_;
        maxSupply = maxSupply_;
        treasury = treasury_;

        _baseTokenURI = baseTokenURI_;
        _collectibleBaseURI = collectibleBaseURI_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function mintPrimary() external payable whenNotPaused returns (uint256 tokenId) {
        require(msg.value == primaryPrice, "Incorrect payment amount");
        require(_nextTokenId < maxSupply, "Event sold out");
        require(balanceOf(msg.sender) < maxPerWallet, "Wallet ticket limit reached");

        tokenId = _nextTokenId;
        _nextTokenId += 1;

        _safeMint(msg.sender, tokenId);

        (bool paid, ) = payable(treasury).call{value: msg.value}("");
        require(paid, "Primary payout failed");

        emit PrimaryMinted(msg.sender, tokenId, msg.value);
    }

    function setMarketplace(address newMarketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMarketplace != address(0), "Marketplace is zero address");
        address previousMarketplace = marketplace;
        marketplace = newMarketplace;
        emit MarketplaceUpdated(previousMarketplace, newMarketplace);
    }

    function setCheckInRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "Registry is zero address");
        address previousRegistry = address(checkInRegistry);
        checkInRegistry = ICheckInRegistry(newRegistry);
        emit CheckInRegistryUpdated(previousRegistry, newRegistry);
    }

    function setCollectibleMode(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        collectibleMode = enabled;
        emit CollectibleModeUpdated(enabled);
        _emitBatchMetadataUpdate();
    }

    function setBaseUris(
        string calldata baseTokenURI_,
        string calldata collectibleBaseURI_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseTokenURI_;
        _collectibleBaseURI = collectibleBaseURI_;
        emit BaseUrisUpdated(baseTokenURI_, collectibleBaseURI_);
        _emitBatchMetadataUpdate();
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    function isUsed(uint256 tokenId) public view returns (bool) {
        _requireOwned(tokenId);
        return _isMarkedUsed(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory base = collectibleMode ? _collectibleBaseURI : _baseTokenURI;
        if (bytes(base).length == 0) {
            return "";
        }

        return string.concat(base, tokenId.toString(), ".json");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC4906).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address from) {
        from = _ownerOf(tokenId);

        if (from == address(0) && to != address(0)) {
            require(balanceOf(to) < maxPerWallet, "Wallet ticket limit reached");
        } else if (from != address(0) && to != address(0)) {
            require(msg.sender == marketplace, "Transfers only through marketplace");
            require(!_isMarkedUsed(tokenId), "Used tickets are non-transferable");
            require(balanceOf(to) < maxPerWallet, "Wallet ticket limit reached");
        }

        return super._update(to, tokenId, auth);
    }

    function _isMarkedUsed(uint256 tokenId) private view returns (bool) {
        if (address(checkInRegistry) == address(0)) {
            return false;
        }

        return checkInRegistry.isUsed(tokenId);
    }

    function _emitBatchMetadataUpdate() private {
        if (_nextTokenId == 0) {
            return;
        }

        emit BatchMetadataUpdate(0, _nextTokenId - 1);
    }
}
