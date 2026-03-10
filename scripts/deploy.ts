import { network } from "hardhat";

const { ethers } = await network.connect();

function parseCsvAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function explorerAddressLink(address: string): string {
  return `https://amoy.polygonscan.com/address/${address}`;
}

function explorerTxLink(txHash: string): string {
  return `https://amoy.polygonscan.com/tx/${txHash}`;
}

async function main(): Promise<void> {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account configured for this network. Set PRIVATE_KEY in .env (0x...) so Hardhat can sign Amoy transactions.",
    );
  }
  const deployer = signers[0];

  const treasuryFromEnv = process.env.TREASURY_ADDRESS;
  let treasury = deployer.address;
  if (treasuryFromEnv) {
    if (!ethers.isAddress(treasuryFromEnv)) {
      throw new Error(
        `Invalid TREASURY_ADDRESS in .env: ${treasuryFromEnv}`,
      );
    }
    treasury = treasuryFromEnv;
  }

  const name = process.env.TICKET_NAME ?? "ChainTicket Event";
  const symbol = process.env.TICKET_SYMBOL ?? "CTK";
  const baseTokenURI =
    process.env.BASE_TOKEN_URI ?? "ipfs://chainticket/base/";
  const collectibleBaseURI =
    process.env.COLLECTIBLE_BASE_URI ?? "ipfs://chainticket/collectible/";
  const primaryPricePol = process.env.PRIMARY_PRICE_POL ?? "0.1";
  const maxSupplyRaw = process.env.MAX_SUPPLY ?? "100";

  const primaryPrice = ethers.parseEther(primaryPricePol);
  const maxSupply = BigInt(maxSupplyRaw);

  const scannerAddresses = parseCsvAddresses(
    process.env.SCANNER_ADDRESSES ?? "",
  );
  const uniqueScannerAddresses = [
    ...new Set(
      scannerAddresses.filter((address) => {
        const isValid = ethers.isAddress(address);
        if (!isValid) {
          console.warn(`Skipping invalid scanner address: ${address}`);
        }
        return isValid;
      }),
    ),
  ];

  console.log("Deploying ChainTicket V1 contracts to Amoy...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);

  const ticketFactory = await ethers.getContractFactory("TicketNFT", deployer);
  const ticket = await ticketFactory.deploy(
    name,
    symbol,
    primaryPrice,
    maxSupply,
    treasury,
    baseTokenURI,
    collectibleBaseURI,
  );
  await ticket.waitForDeployment();
  const ticketAddress = await ticket.getAddress();
  console.log(`TicketNFT deployed: ${ticketAddress}`);

  const checkInFactory = await ethers.getContractFactory(
    "CheckInRegistry",
    deployer,
  );
  const checkInRegistry = await checkInFactory.deploy(ticketAddress);
  await checkInRegistry.waitForDeployment();
  const checkInRegistryAddress = await checkInRegistry.getAddress();
  console.log(`CheckInRegistry deployed: ${checkInRegistryAddress}`);

  const marketplaceFactory = await ethers.getContractFactory(
    "Marketplace",
    deployer,
  );
  const marketplace = await marketplaceFactory.deploy(ticketAddress, treasury);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`Marketplace deployed: ${marketplaceAddress}`);

  const setRegistryTx = await ticket.setCheckInRegistry(checkInRegistryAddress);
  await setRegistryTx.wait();
  console.log(`setCheckInRegistry tx: ${explorerTxLink(setRegistryTx.hash)}`);

  const setMarketplaceTx = await ticket.setMarketplace(marketplaceAddress);
  await setMarketplaceTx.wait();
  console.log(`setMarketplace tx: ${explorerTxLink(setMarketplaceTx.hash)}`);

  for (const scannerAddress of uniqueScannerAddresses) {
    const grantTx = await checkInRegistry.grantScanner(scannerAddress);
    await grantTx.wait();
    console.log(
      `Granted SCANNER_ROLE to ${scannerAddress}: ${explorerTxLink(
        grantTx.hash,
      )}`,
    );
  }

  console.log("");
  console.log("Deployment summary");
  console.log(`TicketNFT: ${ticketAddress}`);
  console.log(`Marketplace: ${marketplaceAddress}`);
  console.log(`CheckInRegistry: ${checkInRegistryAddress}`);
  console.log("");
  console.log("Polygonscan links");
  console.log(`TicketNFT: ${explorerAddressLink(ticketAddress)}`);
  console.log(`Marketplace: ${explorerAddressLink(marketplaceAddress)}`);
  console.log(`CheckInRegistry: ${explorerAddressLink(checkInRegistryAddress)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
