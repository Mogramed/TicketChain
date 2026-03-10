import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ChainTicketV1Module", (m) => {
  const treasury = m.getParameter("treasury", m.getAccount(0));
  const name = m.getParameter("name", "ChainTicket Event");
  const symbol = m.getParameter("symbol", "CTK");
  const primaryPrice = m.getParameter("primaryPrice", 100000000000000000n);
  const maxSupply = m.getParameter("maxSupply", 100n);
  const baseTokenURI = m.getParameter("baseTokenURI", "ipfs://chainticket/base/");
  const collectibleBaseURI = m.getParameter(
    "collectibleBaseURI",
    "ipfs://chainticket/collectible/",
  );

  const ticketNFT = m.contract("TicketNFT", [
    name,
    symbol,
    primaryPrice,
    maxSupply,
    treasury,
    baseTokenURI,
    collectibleBaseURI,
  ]);

  const checkInRegistry = m.contract("CheckInRegistry", [ticketNFT]);
  const marketplace = m.contract("Marketplace", [ticketNFT, treasury]);

  m.call(ticketNFT, "setCheckInRegistry", [checkInRegistry]);
  m.call(ticketNFT, "setMarketplace", [marketplace]);

  return { ticketNFT, checkInRegistry, marketplace };
});
