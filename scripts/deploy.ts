import { Contract } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.connect();

function parseCsvAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function uniqueValidAddresses(raw: string, label: string): string[] {
  return [
    ...new Set(
      parseCsvAddresses(raw).filter((address) => {
        const isValid = ethers.isAddress(address);
        if (!isValid) {
          console.warn(`Skipping invalid ${label} address: ${address}`);
        }
        return isValid;
      }),
    ),
  ];
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

  const uniqueScannerAddresses = uniqueValidAddresses(
    process.env.SCANNER_ADDRESSES ?? "",
    "scanner",
  );
  const pauserAddresses = uniqueValidAddresses(
    process.env.PAUSER_ADDRESSES ?? "",
    "pauser",
  );
  const governanceAdminAddress = process.env.GOVERNANCE_ADMIN_ADDRESS?.trim() || "";
  const timelockEnabled = parseBoolean(process.env.TIMELOCK_ENABLED);
  const timelockDelaySeconds = Number(process.env.TIMELOCK_MIN_DELAY_SECONDS ?? "86400");
  const timelockProposers = uniqueValidAddresses(
    process.env.TIMELOCK_PROPOSERS ?? deployer.address,
    "timelock proposer",
  );
  const timelockExecutors = uniqueValidAddresses(
    process.env.TIMELOCK_EXECUTORS ?? deployer.address,
    "timelock executor",
  );

  if (governanceAdminAddress && !ethers.isAddress(governanceAdminAddress)) {
    throw new Error(`Invalid GOVERNANCE_ADMIN_ADDRESS in .env: ${governanceAdminAddress}`);
  }
  if (!Number.isFinite(timelockDelaySeconds) || timelockDelaySeconds < 0) {
    throw new Error(`Invalid TIMELOCK_MIN_DELAY_SECONDS in .env: ${process.env.TIMELOCK_MIN_DELAY_SECONDS}`);
  }

  console.log("Deploying ChainTicket V1 contracts to Amoy...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);

  let timelockAddress: string | null = null;
  let timelockContract: Contract | null = null;
  if (timelockEnabled) {
    console.log(`Timelock mode enabled with ${timelockDelaySeconds}s minimum delay.`);
    const timelockFactory = await ethers.getContractFactory("ChainTicketTimelock", deployer);
    const timelock = await timelockFactory.deploy(
      BigInt(Math.trunc(timelockDelaySeconds)),
      timelockProposers,
      timelockExecutors,
      deployer.address,
    );
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
    timelockContract = timelock as unknown as Contract;
    console.log(`ChainTicketTimelock deployed: ${timelockAddress}`);
  }

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

  const governanceTarget = timelockAddress ?? (governanceAdminAddress || null);
  const defaultAdminRole = await ticket.DEFAULT_ADMIN_ROLE();
  const pauserRole = await ticket.PAUSER_ROLE();

  if (pauserAddresses.length > 0) {
    for (const pauserAddress of pauserAddresses) {
      const grantPauserTx = await ticket.grantRole(pauserRole, pauserAddress);
      await grantPauserTx.wait();
      console.log(
        `Granted PAUSER_ROLE to ${pauserAddress}: ${explorerTxLink(grantPauserTx.hash)}`,
      );
    }

    if (!pauserAddresses.includes(deployer.address)) {
      const revokePauserTx = await ticket.revokeRole(pauserRole, deployer.address);
      await revokePauserTx.wait();
      console.log(`Revoked PAUSER_ROLE from deployer: ${explorerTxLink(revokePauserTx.hash)}`);
    }
  }

  if (governanceTarget) {
    console.log(`Handing DEFAULT_ADMIN_ROLE over to governance target: ${governanceTarget}`);

    for (const contractRef of [
      { label: "TicketNFT", instance: ticket },
      { label: "Marketplace", instance: marketplace },
      { label: "CheckInRegistry", instance: checkInRegistry },
    ]) {
      const grantAdminTx = await contractRef.instance.grantRole(
        defaultAdminRole,
        governanceTarget,
      );
      await grantAdminTx.wait();
      console.log(
        `Granted DEFAULT_ADMIN_ROLE on ${contractRef.label}: ${explorerTxLink(grantAdminTx.hash)}`,
      );

      const revokeAdminTx = await contractRef.instance.revokeRole(
        defaultAdminRole,
        deployer.address,
      );
      await revokeAdminTx.wait();
      console.log(
        `Revoked deployer DEFAULT_ADMIN_ROLE on ${contractRef.label}: ${explorerTxLink(
          revokeAdminTx.hash,
        )}`,
      );
    }
  }

  if (timelockContract) {
    const timelockAdminRole = await timelockContract.DEFAULT_ADMIN_ROLE();
    const renounceTimelockAdminTx = await timelockContract.renounceRole(
      timelockAdminRole,
      deployer.address,
    );
    await renounceTimelockAdminTx.wait();
    console.log(
      `Renounced bootstrap timelock admin: ${explorerTxLink(renounceTimelockAdminTx.hash)}`,
    );
  }

  console.log("");
  console.log("Deployment summary");
  console.log(`TicketNFT: ${ticketAddress}`);
  console.log(`Marketplace: ${marketplaceAddress}`);
  console.log(`CheckInRegistry: ${checkInRegistryAddress}`);
  if (timelockAddress) {
    console.log(`ChainTicketTimelock: ${timelockAddress}`);
  }
  if (!timelockAddress && governanceAdminAddress) {
    console.log(`Governance admin handoff: ${governanceAdminAddress}`);
  }
  console.log("");
  console.log("Polygonscan links");
  console.log(`TicketNFT: ${explorerAddressLink(ticketAddress)}`);
  console.log(`Marketplace: ${explorerAddressLink(marketplaceAddress)}`);
  console.log(`CheckInRegistry: ${explorerAddressLink(checkInRegistryAddress)}`);
  if (timelockAddress) {
    console.log(`ChainTicketTimelock: ${explorerAddressLink(timelockAddress)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
