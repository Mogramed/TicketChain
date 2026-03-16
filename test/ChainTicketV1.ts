import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const permitTypes = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

async function deploySystem(options?: { maxSupply?: bigint }) {
  const [admin, treasury, seller, buyer, pauser, scannerAdmin, scanner, other] =
    await ethers.getSigners();

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
    admin.address,
  );
  await ticket.waitForDeployment();

  const ticketAddress = await ticket.getAddress();

  const checkInRegistry = await (
    await ethers.getContractFactory("CheckInRegistry", admin)
  ).deploy(ticketAddress, admin.address);
  await checkInRegistry.waitForDeployment();

  const marketplace = await (
    await ethers.getContractFactory("Marketplace", admin)
  ).deploy(ticketAddress, treasury.address, admin.address);
  await marketplace.waitForDeployment();

  await (await ticket.setCheckInRegistry(await checkInRegistry.getAddress())).wait();
  await (await ticket.setMarketplace(await marketplace.getAddress())).wait();
  const pauserRole = await ticket.PAUSER_ROLE();
  const defaultAdminRole = await ticket.DEFAULT_ADMIN_ROLE();
  const scannerAdminRole = await checkInRegistry.SCANNER_ADMIN_ROLE();

  await (await ticket.grantRole(pauserRole, pauser.address)).wait();
  await (await checkInRegistry.grantRole(scannerAdminRole, scannerAdmin.address)).wait();
  await (await checkInRegistry.connect(scannerAdmin).grantScanner(scanner.address)).wait();

  return {
    admin,
    treasury,
    seller,
    buyer,
    pauser,
    scannerAdmin,
    scanner,
    other,
    primaryPrice,
    pauserRole,
    scannerAdminRole,
    defaultAdminRole,
    ticket,
    marketplace,
    checkInRegistry,
  };
}

async function deployTimelock(adminAddress: string) {
  const timelock = await (
    await ethers.getContractFactory("ChainTicketTimelock")
  ).deploy(86400n, [adminAddress], [adminAddress], adminAddress);
  await timelock.waitForDeployment();
  return timelock;
}

async function deployFactory(adminAddress: string) {
  const factory = await (
    await ethers.getContractFactory("ChainTicketFactory")
  ).deploy(adminAddress);
  await factory.waitForDeployment();
  return factory;
}

async function signListingPermit(
  ticket: {
    name: () => Promise<string>;
    nonces: (tokenId: bigint) => Promise<bigint>;
    getAddress: () => Promise<string>;
  },
  owner: {
    signTypedData: (
      domain: {
        name: string;
        version: string;
        chainId: bigint;
        verifyingContract: string;
      },
      types: typeof permitTypes,
      value: {
        spender: string;
        tokenId: bigint;
        nonce: bigint;
        deadline: bigint;
      }
    ) => Promise<string>;
  },
  spender: string,
  tokenId: bigint,
  deadline: bigint
) {
  const [name, nonce, verifyingContract, networkInfo] = await Promise.all([
    ticket.name(),
    ticket.nonces(tokenId),
    ticket.getAddress(),
    ethers.provider.getNetwork(),
  ]);

  return owner.signTypedData(
    {
      name,
      version: "1",
      chainId: networkInfo.chainId,
      verifyingContract,
    },
    permitTypes,
    {
      spender,
      tokenId,
      nonce,
      deadline,
    },
  );
}

async function handoffGovernance(system: {
  admin: { address: string };
  pauserRole: string;
  scannerAdminRole: string;
  defaultAdminRole: string;
  ticket: {
    grantRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
    revokeRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
  };
  marketplace: {
    grantRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
    revokeRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
  };
  checkInRegistry: {
    grantRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
    revokeRole: (role: string, account: string) => Promise<{ wait: () => Promise<unknown> }>;
  };
}) {
  const timelock = await deployTimelock(system.admin.address);
  const timelockAddress = await timelock.getAddress();

  for (const contractRef of [system.ticket, system.marketplace, system.checkInRegistry]) {
    await (await contractRef.grantRole(system.defaultAdminRole, timelockAddress)).wait();
  }

  await (await system.ticket.revokeRole(system.pauserRole, system.admin.address)).wait();
  await (await system.checkInRegistry.revokeRole(system.scannerAdminRole, system.admin.address)).wait();

  for (const contractRef of [system.ticket, system.marketplace, system.checkInRegistry]) {
    await (await contractRef.revokeRole(system.defaultAdminRole, system.admin.address)).wait();
  }

  return { timelock, timelockAddress };
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

    it("lists with permit in a single transaction and increments token nonce", async function () {
      const { seller, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const signature = await signListingPermit(
        ticket,
        seller,
        marketplaceAddress,
        0n,
        deadline,
      );

      await expect(
        marketplace.connect(seller).listWithPermit(0n, primaryPrice, deadline, signature),
      )
        .to.emit(marketplace, "Listed")
        .withArgs(0n, seller.address, primaryPrice);

      const listing = await marketplace.getListing(0n);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(primaryPrice);
      expect(await ticket.nonces(0n)).to.equal(1n);
      expect(await ticket.getApproved(0n)).to.equal(marketplaceAddress);
    });

    it("invalidates old permit signatures after ownership transfer", async function () {
      const { seller, buyer, ticket, marketplace, primaryPrice } = await deploySystem();
      const marketplaceAddress = await marketplace.getAddress();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const signature = await signListingPermit(
        ticket,
        seller,
        marketplaceAddress,
        0n,
        deadline,
      );

      await (await ticket.connect(seller).approve(marketplaceAddress, 0n)).wait();
      await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();
      await (await marketplace.connect(buyer).buy(0n, { value: primaryPrice })).wait();

      await expect(
        marketplace.connect(seller).listWithPermit(0n, primaryPrice, deadline, signature),
      ).to.be.revertedWithCustomError(ticket, "InvalidPermitSigner");
    });
  });

  describe("Check-in", function () {
    it("allows scanner admin role to grant and revoke scanner wallets", async function () {
      const { admin, scannerAdmin, other, checkInRegistry, ticket, primaryPrice, seller } =
        await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        checkInRegistry.connect(other).grantScanner(other.address),
      ).to.be.revertedWithCustomError(checkInRegistry, "AccessControlUnauthorizedAccount");

      await expect(checkInRegistry.connect(scannerAdmin).grantScanner(other.address))
        .to.emit(checkInRegistry, "ScannerGranted")
        .withArgs(other.address);

      await (await checkInRegistry.connect(other).markUsed(0n)).wait();
      expect(await checkInRegistry.isUsed(0n)).to.equal(true);

      await expect(checkInRegistry.connect(scannerAdmin).revokeScanner(other.address))
        .to.emit(checkInRegistry, "ScannerRevoked")
        .withArgs(other.address);

      await expect(
        checkInRegistry.connect(other).grantScanner(admin.address),
      ).to.be.revertedWithCustomError(checkInRegistry, "AccessControlUnauthorizedAccount");
    });

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
    it("keeps pauser operations available after admin handoff to timelock", async function () {
      const system = await deploySystem();
      const { admin, pauser, scannerAdmin, ticket, checkInRegistry, defaultAdminRole } = system;
      const { timelockAddress } = await handoffGovernance(system);

      expect(await ticket.hasRole(defaultAdminRole, admin.address)).to.equal(false);
      expect(await ticket.hasRole(defaultAdminRole, timelockAddress)).to.equal(true);

      await (await ticket.connect(pauser).pause()).wait();
      expect(await ticket.paused()).to.equal(true);
      await (await ticket.connect(pauser).unpause()).wait();
      expect(await ticket.paused()).to.equal(false);

      await expect(ticket.connect(admin).pause()).to.be.revertedWithCustomError(
        ticket,
        "AccessControlUnauthorizedAccount",
      );
      await expect(
        checkInRegistry.connect(admin).grantScanner(scannerAdmin.address),
      ).to.be.revertedWithCustomError(checkInRegistry, "AccessControlUnauthorizedAccount");
    });

    it("prevents ops wallets from executing governance-only actions after admin handoff", async function () {
      const system = await deploySystem();
      const { pauser, scannerAdmin, ticket, marketplace } = system;

      await handoffGovernance(system);

      await expect(ticket.connect(pauser).setCollectibleMode(true)).to.be.revertedWithCustomError(
        ticket,
        "AccessControlUnauthorizedAccount",
      );
      await expect(
        ticket.connect(scannerAdmin).setCollectibleMode(true),
      ).to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
      await expect(
        ticket.connect(pauser).setMarketplace(await marketplace.getAddress()),
      ).to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
    });

    it("removes bootstrap deployer power after timelock handoff", async function () {
      const system = await deploySystem();
      const {
        admin,
        pauser,
        scannerAdmin,
        scanner,
        ticket,
        checkInRegistry,
        pauserRole,
        scannerAdminRole,
        defaultAdminRole,
      } = system;

      await handoffGovernance(system);

      expect(await ticket.hasRole(defaultAdminRole, admin.address)).to.equal(false);
      expect(await ticket.hasRole(pauserRole, admin.address)).to.equal(false);
      expect(await checkInRegistry.hasRole(scannerAdminRole, admin.address)).to.equal(false);
      expect(await checkInRegistry.hasRole(scannerAdminRole, scannerAdmin.address)).to.equal(true);
      expect(await checkInRegistry.hasRole(await checkInRegistry.SCANNER_ROLE(), scanner.address)).to.equal(
        true,
      );

      await expect(ticket.connect(admin).setCollectibleMode(true)).to.be.revertedWithCustomError(
        ticket,
        "AccessControlUnauthorizedAccount",
      );
      await expect(checkInRegistry.connect(admin).grantScanner(pauser.address)).to.be.revertedWithCustomError(
        checkInRegistry,
        "AccessControlUnauthorizedAccount",
      );
    });

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

      expect(await ticket.baseUris()).to.deep.equal([
        "ipfs://ticket/base/",
        "ipfs://ticket/collectible/",
      ]);
      expect(await ticket.tokenURI(0n)).to.equal("ipfs://ticket/base/0.json");

      await expect(ticket.setCollectibleMode(true))
        .to.emit(ticket, "CollectibleModeUpdated")
        .withArgs(true)
        .and.to.emit(ticket, "BatchMetadataUpdate")
        .withArgs(0n, 0n);
      expect(await ticket.tokenURI(0n)).to.equal(
        "ipfs://ticket/collectible/0.json",
      );
    });

    it("emits metadata refresh signals when base URIs change", async function () {
      const { seller, ticket, primaryPrice } = await deploySystem();

      await (await ticket.connect(seller).mintPrimary({ value: primaryPrice })).wait();

      await expect(
        ticket.setBaseUris("ipfs://ticket/new-base/", "ipfs://ticket/new-collectible/"),
      )
        .to.emit(ticket, "BaseUrisUpdated")
        .withArgs("ipfs://ticket/new-base/", "ipfs://ticket/new-collectible/")
        .and.to.emit(ticket, "BatchMetadataUpdate")
        .withArgs(0n, 0n);

      expect(await ticket.baseUris()).to.deep.equal([
        "ipfs://ticket/new-base/",
        "ipfs://ticket/new-collectible/",
      ]);
      expect(await ticket.tokenURI(0n)).to.equal("ipfs://ticket/new-base/0.json");
    });
  });

  describe("Multi-event factory catalog", function () {
    it("registers multiple event deployments with independent addresses", async function () {
      const firstSystem = await deploySystem();
      const secondSystem = await deploySystem();
      const factory = await deployFactory(firstSystem.admin.address);
      const firstDeploymentBlock = await ethers.provider.getBlockNumber();

      await expect(
        factory.registerEvent({
          eventId: "paris-2026",
          name: "Paris Finals",
          symbol: "PARIS",
          primaryPrice: firstSystem.primaryPrice,
          maxSupply: 100n,
          treasury: firstSystem.treasury.address,
          admin: firstSystem.admin.address,
          ticketNFT: await firstSystem.ticket.getAddress(),
          marketplace: await firstSystem.marketplace.getAddress(),
          checkInRegistry: await firstSystem.checkInRegistry.getAddress(),
          deploymentBlock: BigInt(firstDeploymentBlock),
        }),
      )
        .to.emit(factory, "EventRegistered")
        .withArgs(
          ethers.keccak256(ethers.toUtf8Bytes("paris-2026")),
          "paris-2026",
          firstSystem.admin.address,
          await firstSystem.ticket.getAddress(),
          await firstSystem.marketplace.getAddress(),
          await firstSystem.checkInRegistry.getAddress(),
        );

      await (
        await factory.registerEvent({
          eventId: "london-2026",
          name: "London Finals",
          symbol: "LONDON",
          primaryPrice: secondSystem.primaryPrice,
          maxSupply: 100n,
          treasury: secondSystem.treasury.address,
          admin: secondSystem.admin.address,
          ticketNFT: await secondSystem.ticket.getAddress(),
          marketplace: await secondSystem.marketplace.getAddress(),
          checkInRegistry: await secondSystem.checkInRegistry.getAddress(),
          deploymentBlock: BigInt(firstDeploymentBlock + 1),
        })
      ).wait();

      expect(await factory.totalEvents()).to.equal(2n);

      const first = await factory.getEventById("paris-2026");
      const second = await factory.getEventById("london-2026");

      expect(first.ticketNFT).to.equal(await firstSystem.ticket.getAddress());
      expect(first.marketplace).to.equal(await firstSystem.marketplace.getAddress());
      expect(second.ticketNFT).to.equal(await secondSystem.ticket.getAddress());
      expect(second.checkInRegistry).to.equal(await secondSystem.checkInRegistry.getAddress());
    });

    it("keeps token ids isolated across separately registered events", async function () {
      const firstSystem = await deploySystem();
      const secondSystem = await deploySystem();
      const factory = await deployFactory(firstSystem.admin.address);
      const deploymentBlock = await ethers.provider.getBlockNumber();

      await (
        await factory.registerEvent({
          eventId: "alpha-2026",
          name: "Alpha",
          symbol: "ALPHA",
          primaryPrice: firstSystem.primaryPrice,
          maxSupply: 100n,
          treasury: firstSystem.treasury.address,
          admin: firstSystem.admin.address,
          ticketNFT: await firstSystem.ticket.getAddress(),
          marketplace: await firstSystem.marketplace.getAddress(),
          checkInRegistry: await firstSystem.checkInRegistry.getAddress(),
          deploymentBlock: BigInt(deploymentBlock),
        })
      ).wait();

      await (
        await factory.registerEvent({
          eventId: "beta-2026",
          name: "Beta",
          symbol: "BETA",
          primaryPrice: secondSystem.primaryPrice,
          maxSupply: 100n,
          treasury: secondSystem.treasury.address,
          admin: secondSystem.admin.address,
          ticketNFT: await secondSystem.ticket.getAddress(),
          marketplace: await secondSystem.marketplace.getAddress(),
          checkInRegistry: await secondSystem.checkInRegistry.getAddress(),
          deploymentBlock: BigInt(deploymentBlock + 1),
        })
      ).wait();

      await (await firstSystem.ticket.connect(firstSystem.seller).mintPrimary({ value: firstSystem.primaryPrice })).wait();
      await (await secondSystem.ticket.connect(secondSystem.buyer).mintPrimary({ value: secondSystem.primaryPrice })).wait();
      await (await firstSystem.checkInRegistry.connect(firstSystem.scanner).markUsed(0n)).wait();

      expect(await firstSystem.ticket.ownerOf(0n)).to.equal(firstSystem.seller.address);
      expect(await secondSystem.ticket.ownerOf(0n)).to.equal(secondSystem.buyer.address);
      expect(await firstSystem.checkInRegistry.isUsed(0n)).to.equal(true);
      expect(await secondSystem.checkInRegistry.isUsed(0n)).to.equal(false);
    });
  });
});
