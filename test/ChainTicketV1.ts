import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

async function deploySystem(options?: { maxSupply?: bigint }) {
  const [admin, treasury, seller, buyer, , scanner, other] = await ethers.getSigners();

  const primaryPrice = ethers.parseEther("0.1");
  const maxSupply = options?.maxSupply ?? 100n;

  const ticket = await (
    await ethers.getContractFactory("TicketNFT", admin)
  ).deploy(
    "ChainTicket Event",
    "CTK",
    primaryPrice,
    maxSupply,
    treasury.address,
    "ipfs://ticket/base/",
    "ipfs://ticket/collectible/",
  );
  await ticket.waitForDeployment();

  const ticketAddress = await ticket.getAddress();

  const checkInRegistry = await (
    await ethers.getContractFactory("CheckInRegistry", admin)
  ).deploy(ticketAddress);
  await checkInRegistry.waitForDeployment();

  const marketplace = await (
    await ethers.getContractFactory("Marketplace", admin)
  ).deploy(ticketAddress, treasury.address);
  await marketplace.waitForDeployment();

  await (await ticket.setCheckInRegistry(await checkInRegistry.getAddress())).wait();
  await (await ticket.setMarketplace(await marketplace.getAddress())).wait();
  await (await checkInRegistry.grantScanner(scanner.address)).wait();

  return {
    admin,
    treasury,
    seller,
    buyer,
    scanner,
    other,
    primaryPrice,
    ticket,
    marketplace,
    checkInRegistry,
  };
}

describe("ChainTicket V1", function () {
  describe("Primary mint", function () {
    it("mints successfully with exact payment", async function () {
      const { seller, ticket, primaryPrice } = await deploySystem();

      await expect(ticket.connect(seller).mintPrimary({ value: primaryPrice }))
        .to.emit(ticket, "PrimaryMinted")
        .withArgs(seller.address, 0n, primaryPrice);

      expect(await ticket.ownerOf(0n)).to.equal(seller.address);
    });

    it("rejects insufficient payment", async function () {
      const { seller, ticket, primaryPrice } = await deploySystem();

      await expect(
        ticket.connect(seller).mintPrimary({ value: primaryPrice - 1n }),
      ).to.be.revertedWith("Incorrect payment amount");
    });

    it("rejects mint when max supply is reached", async function () {
      const { seller, buyer, ticket, primaryPrice } = await deploySystem({
        maxSupply: 1n,
      });

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        ticket.connect(buyer).mintPrimary({ value: primaryPrice }),
      ).to.be.revertedWith("Event sold out");
    });

    it("enforces max 2 tickets held simultaneously per wallet", async function () {
      const { seller, ticket, primaryPrice } = await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        ticket.connect(seller).mintPrimary({ value: primaryPrice }),
      ).to.be.revertedWith("Wallet ticket limit reached");
    });
  });

  describe("Marketplace and transfer controls", function () {
    it("rejects direct wallet-to-wallet transfer outside marketplace", async function () {
      const { seller, buyer, ticket, primaryPrice } = await deploySystem();
      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        ticket
          .connect(seller)
          ["transferFrom(address,address,uint256)"](
            seller.address,
            buyer.address,
            0n,
          ),
      ).to.be.revertedWith("Transfers only through marketplace");
    });

    it("allows listing only for token owner", async function () {
      const { seller, buyer, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();

      await expect(
        marketplace.connect(buyer).list(0n, primaryPrice),
      ).to.be.revertedWith("Only owner can list");
    });

    it("rejects listing used tickets", async function () {
      const { seller, scanner, ticket, marketplace, checkInRegistry, primaryPrice } =
        await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await checkInRegistry.connect(scanner).markUsed(0n)).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();

      await expect(
        marketplace.connect(seller).list(0n, primaryPrice),
      ).to.be.revertedWith("Used tickets cannot be listed");
    });

    it("rejects resale listing above primary price", async function () {
      const { seller, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();

      await expect(
        marketplace.connect(seller).list(0n, primaryPrice + 1n),
      ).to.be.revertedWith("Price exceeds primary cap");
    });

    it("splits resale payment 95/5 and transfers NFT to buyer", async function () {
      const { seller, buyer, treasury, ticket, marketplace, primaryPrice } =
        await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();
      await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await (await marketplace.connect(buyer).buy(0n, { value: primaryPrice })).wait();

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      const fee = (primaryPrice * 500n) / 10_000n;
      const sellerProceeds = primaryPrice - fee;

      expect(sellerAfter - sellerBefore).to.equal(sellerProceeds);
      expect(treasuryAfter - treasuryBefore).to.equal(fee);
      expect(await ticket.ownerOf(0n)).to.equal(buyer.address);
    });

    it("requires exact payment on secondary purchase", async function () {
      const { seller, buyer, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();
      await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();

      await expect(
        marketplace.connect(buyer).buy(0n, { value: primaryPrice - 1n }),
      ).to.be.revertedWith("Incorrect payment amount");
    });

    it("rejects secondary purchase if buyer already holds 2 tickets", async function () {
      const { seller, buyer, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(buyer).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(buyer).mintPrimary({ value: primaryPrice })).wait();

      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();
      await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();

      await expect(
        marketplace.connect(buyer).buy(0n, { value: primaryPrice }),
      ).to.be.revertedWith("Buyer wallet limit reached");
    });
  });

  describe("Check-in", function () {
    it("allows scanner role to mark ticket used once", async function () {
      const { seller, scanner, ticket, checkInRegistry, primaryPrice } =
        await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await checkInRegistry.connect(scanner).markUsed(0n)).wait();

      expect(await checkInRegistry.isUsed(0n)).to.equal(true);
      await expect(checkInRegistry.connect(scanner).markUsed(0n)).to.be.revertedWith(
        "Ticket already used",
      );
    });

    it("rejects non-scanner check-in calls", async function () {
      const { seller, other, ticket, checkInRegistry, primaryPrice } =
        await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        checkInRegistry.connect(other).markUsed(0n),
      ).to.be.revertedWithCustomError(checkInRegistry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pause and collectible mode", function () {
    it("pauses and unpauses mint/list/buy/check-in flows", async function () {
      const { seller, buyer, scanner, ticket, marketplace, checkInRegistry, primaryPrice } =
        await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();
      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();

      await (await ticket.pause()).wait();

      await expect(
        ticket.connect(buyer).mintPrimary({ value: primaryPrice }),
      ).to.be.revertedWithCustomError(ticket, "EnforcedPause");
      await expect(marketplace.connect(seller).list(0n, primaryPrice)).to.be.revertedWith(
        "System is paused",
      );
      await expect(checkInRegistry.connect(scanner).markUsed(0n)).to.be.revertedWith(
        "System is paused",
      );

      await (await ticket.unpause()).wait();
      await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();

      await (await ticket.pause()).wait();
      await expect(
        marketplace.connect(buyer).buy(0n, { value: primaryPrice }),
      ).to.be.revertedWith("System is paused");

      await (await ticket.unpause()).wait();
      await (await marketplace.connect(buyer).buy(0n, { value: primaryPrice })).wait();
    });

    it("switches tokenURI to collectible metadata", async function () {
      const { seller, ticket, primaryPrice } = await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      expect(await ticket.tokenURI(0n)).to.equal("ipfs://ticket/base/0.json");

      await (await ticket.setCollectibleMode(true)).wait();
      expect(await ticket.tokenURI(0n)).to.equal(
        "ipfs://ticket/collectible/0.json",
      );
    });
  });
});
