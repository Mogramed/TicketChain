import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

process.env.BFF_RUNTIME_MODE ??= "deploy-only";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

dotenv.config({
  path: path.resolve(workspaceRoot, ".env"),
  override: false,
});

const [
  { Contract, JsonRpcProvider, Wallet },
  { FACTORY_ABI, TICKET_NFT_ABI },
  { config },
  { buildDemoMetadataUri },
  { initDatabase, pool },
  { logger },
  { getDemoCatalogEntries },
] = await Promise.all([
  import("ethers"),
  import("../abi.js"),
  import("../config.js"),
  import("../demoDeploy.js"),
  import("../db.js"),
  import("../logger.js"),
  import("../repository.js"),
]);

function requiredEnv(name: string, fallback?: string | null): string {
  const value = process.env[name]?.trim() || fallback?.trim() || "";
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function parseFactoryDeployment(raw: unknown): { ticketNFT: string } {
  const value = raw as { ticketNFT?: unknown } & unknown[];
  return {
    ticketNFT: String(value.ticketNFT ?? value[7] ?? ""),
  };
}

async function main(): Promise<void> {
  await initDatabase();

  const privateKey = requiredEnv("PRIVATE_KEY");
  const factoryAddress = requiredEnv(
    "CHAIN_TICKET_FACTORY_ADDRESS",
    process.env.FACTORY_ADDRESS?.trim() || config.factoryAddress,
  );
  const assetBaseUrl = normalizeBaseUrl(
    process.env.DEMO_ASSET_BASE_URL?.trim() || `http://localhost:${config.port}/demo-assets`,
  );

  const activeLineup = await getDemoCatalogEntries("active");
  if (activeLineup.length === 0) {
    throw new Error("No active demo lineup found. Deploy the demo lineup before syncing asset URIs.");
  }

  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const signer = new Wallet(privateKey, provider);
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);

  for (const item of activeLineup) {
    const deployment = parseFactoryDeployment(await factory.getEventById(item.ticketEventId));
    if (!deployment.ticketNFT) {
      throw new Error(`Unable to resolve TicketNFT for demo event ${item.ticketEventId}.`);
    }

    const ticketContract = new Contract(deployment.ticketNFT, TICKET_NFT_ABI, signer);
    const liveBaseUri = buildDemoMetadataUri(assetBaseUrl, item.ticketEventId, "live");
    const collectibleBaseUri = buildDemoMetadataUri(
      assetBaseUrl,
      item.ticketEventId,
      "collectible",
    );
    const currentBaseUris = (await ticketContract.baseUris()) as [string, string];
    const currentLiveBaseUri = String(currentBaseUris[0] ?? "");
    const currentCollectibleBaseUri = String(currentBaseUris[1] ?? "");

    if (
      currentLiveBaseUri === liveBaseUri &&
      currentCollectibleBaseUri === collectibleBaseUri
    ) {
      logger.info(
        {
          ticketEventId: item.ticketEventId,
          ticketNftAddress: deployment.ticketNFT,
        },
        "Demo asset base URIs already match the local demo asset server.",
      );
      continue;
    }

    logger.info(
      {
        ticketEventId: item.ticketEventId,
        ticketNftAddress: deployment.ticketNFT,
        liveBaseUri,
        collectibleBaseUri,
      },
      "Updating demo asset base URIs on-chain.",
    );

    const tx = await ticketContract.setBaseUris(liveBaseUri, collectibleBaseUri);
    await tx.wait();

    logger.info(
      {
        ticketEventId: item.ticketEventId,
        txHash: tx.hash,
      },
      "Updated demo asset base URIs on-chain.",
    );
  }

  await pool.end();
}

main().catch(async (error) => {
  logger.error({ error }, "Failed to sync demo asset base URIs.");
  await pool.end();
  process.exit(1);
});
