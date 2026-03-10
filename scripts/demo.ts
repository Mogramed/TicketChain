import { network } from "hardhat";

const { ethers } = await network.connect();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function txLink(txHash: string): string {
  return `https://amoy.polygonscan.com/tx/${txHash}`;
}

function envOrDefault(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

async function createFundedWallet(funder: any, amountPol: string) {
  const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  const fundTx = await funder.sendTransaction({
    to: wallet.address,
    value: ethers.parseEther(amountPol),
  });
  await fundTx.wait();
  return wallet;
}

async function main(): Promise<void> {
  const [admin] = await ethers.getSigners();

  const ticketAddress = requiredEnv("TICKET_NFT_ADDRESS");
  const marketplaceAddress = requiredEnv("MARKETPLACE_ADDRESS");
  const checkInRegistryAddress = requiredEnv("CHECKIN_REGISTRY_ADDRESS");

  if (
    !ethers.isAddress(ticketAddress) ||
    !ethers.isAddress(marketplaceAddress) ||
    !ethers.isAddress(checkInRegistryAddress)
  ) {
    throw new Error("One or more contract addresses are invalid");
  }

  const ticket = await ethers.getContractAt("TicketNFT", ticketAddress, admin);
  const marketplace = await ethers.getContractAt(
    "Marketplace",
    marketplaceAddress,
    admin,
  );
  const checkInRegistry = await ethers.getContractAt(
    "CheckInRegistry",
    checkInRegistryAddress,
    admin,
  );

  const primaryPrice = await ticket.primaryPrice();

  const fundFanAPol = envOrDefault("DEMO_FUND_FAN_A_POL", "0.30");
  const fundFanBPol = envOrDefault("DEMO_FUND_FAN_B_POL", "0.20");
  const fundScannerPol = envOrDefault("DEMO_FUND_SCANNER_POL", "0.03");
  const adminGasReservePol = envOrDefault("DEMO_ADMIN_GAS_RESERVE_POL", "0.02");

  const fundFanAWei = ethers.parseEther(fundFanAPol);
  const fundFanBWei = ethers.parseEther(fundFanBPol);
  const fundScannerWei = ethers.parseEther(fundScannerPol);
  const adminGasReserveWei = ethers.parseEther(adminGasReservePol);

  // Demo flow requirements:
  // - Fan A mints twice + approval + list
  // - Fan B buys once
  // - Scanner marks ticket used
  const fanARequiredWei = primaryPrice * 2n + ethers.parseEther("0.01");
  const fanBRequiredWei = primaryPrice + ethers.parseEther("0.01");
  const scannerRequiredWei = ethers.parseEther("0.003");

  if (fundFanAWei < fanARequiredWei) {
    throw new Error(
      `DEMO_FUND_FAN_A_POL too low. Current ${fundFanAPol} POL, recommended at least ${ethers.formatEther(
        fanARequiredWei,
      )} POL for 2 mints + tx gas.`,
    );
  }
  if (fundFanBWei < fanBRequiredWei) {
    throw new Error(
      `DEMO_FUND_FAN_B_POL too low. Current ${fundFanBPol} POL, recommended at least ${ethers.formatEther(
        fanBRequiredWei,
      )} POL for purchase + tx gas.`,
    );
  }
  if (fundScannerWei < scannerRequiredWei) {
    throw new Error(
      `DEMO_FUND_SCANNER_POL too low. Current ${fundScannerPol} POL, recommended at least ${ethers.formatEther(
        scannerRequiredWei,
      )} POL for scanner transactions.`,
    );
  }

  const totalFundingWei =
    fundFanAWei + fundFanBWei + fundScannerWei;
  const adminBalanceWei = await ethers.provider.getBalance(admin.address);
  const minimumAdminBalanceWei = totalFundingWei + adminGasReserveWei;
  if (adminBalanceWei < minimumAdminBalanceWei) {
    throw new Error(
      `Insufficient POL for demo funding. Need at least ${ethers.formatEther(
        minimumAdminBalanceWei,
      )} POL (funding + admin gas reserve), wallet has ${ethers.formatEther(
        adminBalanceWei,
      )} POL. Top up faucet or lower DEMO_FUND_* amounts.`,
    );
  }

  const fanA = await createFundedWallet(admin, fundFanAPol);
  const fanB = await createFundedWallet(admin, fundFanBPol);
  const scanner = await createFundedWallet(admin, fundScannerPol);

  console.log("ChainTicket Amoy demo");
  console.log(`Admin: ${admin.address}`);
  console.log(`Fan A: ${fanA.address}`);
  console.log(`Fan B: ${fanB.address}`);
  console.log(`Scanner: ${scanner.address}`);
  console.log("");

  const scannerRole = await checkInRegistry.SCANNER_ROLE();
  const hasScannerRole = await checkInRegistry.hasRole(scannerRole, scanner.address);
  if (!hasScannerRole) {
    const grantTx = await checkInRegistry.grantScanner(scanner.address);
    await grantTx.wait();
    console.log(`SCANNER_ROLE granted: ${txLink(grantTx.hash)}`);
  }

  const firstTokenId = await ticket.totalMinted();

  const ticketFanA = ticket.connect(fanA);
  const marketplaceFanA = marketplace.connect(fanA);
  const marketplaceFanB = marketplace.connect(fanB);
  const checkInScanner = checkInRegistry.connect(scanner);

  const mint1Tx = await ticketFanA.mintPrimary({ value: primaryPrice });
  await mint1Tx.wait();
  console.log(`1) Primary mint success: ${txLink(mint1Tx.hash)} (tokenId=${firstTokenId})`);

  const mint2Tx = await ticketFanA.mintPrimary({ value: primaryPrice });
  await mint2Tx.wait();
  console.log(
    `2) Second primary mint success: ${txLink(mint2Tx.hash)} (tokenId=${firstTokenId + 1n})`,
  );

  try {
    const mint3Tx = await ticketFanA.mintPrimary({ value: primaryPrice });
    await mint3Tx.wait();
    throw new Error("Wallet limit was expected to fail on third mint");
  } catch {
    console.log("3) Wallet limit check: third mint blocked as expected");
  }

  const approveTx = await ticketFanA.approve(marketplaceAddress, firstTokenId);
  await approveTx.wait();
  console.log(`4) Approval sent: ${txLink(approveTx.hash)}`);

  const salePrice = primaryPrice;
  const listTx = await marketplaceFanA.list(firstTokenId, salePrice);
  await listTx.wait();
  console.log(`5) Resale listing created: ${txLink(listTx.hash)}`);

  const treasuryAddress = await marketplace.treasury();
  const treasuryBefore = await ethers.provider.getBalance(treasuryAddress);
  const sellerBefore = await ethers.provider.getBalance(fanA.address);

  const buyTx = await marketplaceFanB.buy(firstTokenId, { value: salePrice });
  await buyTx.wait();
  console.log(`6) Resale purchase success: ${txLink(buyTx.hash)}`);

  const treasuryAfter = await ethers.provider.getBalance(treasuryAddress);
  const sellerAfter = await ethers.provider.getBalance(fanA.address);

  const feeExpected = (salePrice * 500n) / 10_000n;
  const sellerExpected = salePrice - feeExpected;
  const treasuryDelta = treasuryAfter - treasuryBefore;
  const sellerDelta = sellerAfter - sellerBefore;

  console.log(
    `7) Commission check: treasury +${ethers.formatEther(
      treasuryDelta,
    )} POL (expected ${ethers.formatEther(feeExpected)} POL)`,
  );
  console.log(
    `8) Seller proceeds: seller +${ethers.formatEther(
      sellerDelta,
    )} POL (expected ${ethers.formatEther(sellerExpected)} POL)`,
  );

  if (treasuryDelta !== feeExpected || sellerDelta !== sellerExpected) {
    throw new Error("Commission split check failed");
  }

  const markUsedTx = await checkInScanner.markUsed(firstTokenId);
  await markUsedTx.wait();
  console.log(`9) Check-in success: ${txLink(markUsedTx.hash)}`);

  try {
    const secondScanTx = await checkInScanner.markUsed(firstTokenId);
    await secondScanTx.wait();
    throw new Error("Double scan was expected to fail");
  } catch {
    console.log("10) Double scan blocked as expected");
  }

  const collectibleTx = await ticket.setCollectibleMode(true);
  await collectibleTx.wait();
  const collectibleUri = await ticket.tokenURI(firstTokenId);
  console.log(`11) Collectible mode enabled: ${txLink(collectibleTx.hash)}`);
  console.log(`12) Collectible tokenURI: ${collectibleUri}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
