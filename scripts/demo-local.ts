import { network } from "hardhat";

const { ethers } = await network.connect();

async function main(): Promise<void> {
  const [admin, treasury, fanA, fanB, scanner] = await ethers.getSigners();

  const primaryPrice = ethers.parseEther("0.1");

  const ticket = await (
    await ethers.getContractFactory("TicketNFT", admin)
  ).deploy(
    "ChainTicket Event",
    "CTK",
    primaryPrice,
    100n,
    treasury.address,
    "ipfs://ticket/base/",
    "ipfs://ticket/collectible/",
  );
  await ticket.waitForDeployment();

  const checkInRegistry = await (
    await ethers.getContractFactory("CheckInRegistry", admin)
  ).deploy(await ticket.getAddress());
  await checkInRegistry.waitForDeployment();

  const marketplace = await (
    await ethers.getContractFactory("Marketplace", admin)
  ).deploy(await ticket.getAddress(), treasury.address);
  await marketplace.waitForDeployment();

  await (await ticket.setCheckInRegistry(await checkInRegistry.getAddress())).wait();
  await (await ticket.setMarketplace(await marketplace.getAddress())).wait();
  await (await checkInRegistry.grantScanner(scanner.address)).wait();

  console.log("ChainTicket Local Demo");
  console.log(`TicketNFT: ${await ticket.getAddress()}`);
  console.log(`Marketplace: ${await marketplace.getAddress()}`);
  console.log(`CheckInRegistry: ${await checkInRegistry.getAddress()}`);
  console.log("");

  const mint1 = await ticket.connect(fanA).mintPrimary({ value: primaryPrice });
  await mint1.wait();
  console.log("1) Fan A minted token 0");

  const mint2 = await ticket.connect(fanA).mintPrimary({ value: primaryPrice });
  await mint2.wait();
  console.log("2) Fan A minted token 1");

  try {
    await (await ticket.connect(fanA).mintPrimary({ value: primaryPrice })).wait();
    throw new Error("Expected third mint to fail");
  } catch {
    console.log("3) Third mint blocked by maxPerWallet");
  }

  await (await ticket.connect(fanA).approve(await marketplace.getAddress(), 0n)).wait();
  await (await marketplace.connect(fanA).list(0n, primaryPrice)).wait();
  console.log("4) Fan A listed token 0");

  const treasuryBefore = await ethers.provider.getBalance(treasury.address);
  await (await marketplace.connect(fanB).buy(0n, { value: primaryPrice })).wait();
  const treasuryAfter = await ethers.provider.getBalance(treasury.address);
  const fee = treasuryAfter - treasuryBefore;
  console.log(`5) Fan B bought token 0, organizer fee received: ${ethers.formatEther(fee)} ETH`);

  await (await checkInRegistry.connect(scanner).markUsed(0n)).wait();
  console.log("6) Check-in success");

  try {
    await (await checkInRegistry.connect(scanner).markUsed(0n)).wait();
    throw new Error("Expected second scan to fail");
  } catch {
    console.log("7) Double scan blocked");
  }

  await (await ticket.setCollectibleMode(true)).wait();
  console.log(`8) Collectible URI: ${await ticket.tokenURI(0n)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
