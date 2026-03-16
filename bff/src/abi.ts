export const TICKET_NFT_ABI = [
  "function primaryPrice() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function maxPerWallet() view returns (uint256)",
  "function paused() view returns (bool)",
  "function collectibleMode() view returns (bool)",
  "function baseUris() view returns (string baseTokenURI, string collectibleBaseURI)",
  "function setBaseUris(string baseTokenURI, string collectibleBaseURI)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event CollectibleModeUpdated(bool enabled)",
  "event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI)",
] as const;

export const MARKETPLACE_ABI = [
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Cancelled(uint256 indexed tokenId, address indexed actor)",
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 feeAmount)",
] as const;

export const CHECKIN_ABI = [
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner)",
] as const;

export const FACTORY_ABI = [
  "function totalEvents() view returns (uint256)",
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
] as const;
