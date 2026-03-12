export const TICKET_NFT_ABI = [
  "function primaryPrice() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function maxPerWallet() view returns (uint256)",
  "function paused() view returns (bool)",
  "function collectibleMode() view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event CollectibleModeUpdated(bool enabled)",
  "event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI)",
] as const;

export const MARKETPLACE_ABI = [
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Cancelled(uint256 indexed tokenId, address indexed actor)",
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 feeAmount)",
] as const;

export const CHECKIN_ABI = [
  "event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner)",
] as const;
