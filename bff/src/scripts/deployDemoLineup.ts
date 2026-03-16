import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Contract, JsonRpcProvider } from "ethers";

import { FACTORY_ABI } from "../abi.js";
process.env.BFF_RUNTIME_MODE ??= "deploy-only";

const [
  { config },
  {
    buildDemoMetadataUri,
    buildDemoTokenSymbol,
    parseBooleanEnv,
    parseFactoryAddressFromDeployOutput,
  },
  { initDatabase, pool, promoteStagedDemoCatalog, withTransaction },
  { logger },
  { getDemoCatalogEntries },
] = await Promise.all([
  import("../config.js"),
  import("../demoDeploy.js"),
  import("../db.js"),
  import("../logger.js"),
  import("../repository.js"),
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

function requiredEnv(name: string, fallback?: string): string {
  const raw = process.env[name]?.trim();
  if (raw) {
    return raw;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

async function getRegisteredEventIds(factoryAddress: string): Promise<Set<string>> {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const totalEvents = Number(await factory.totalEvents());
  const eventIds = await Promise.all(
    Array.from({ length: totalEvents }, async (_value, index) => {
      const deployment = await factory.getEventAt(index);
      const eventId = String(
        (deployment as { eventId?: unknown } & unknown[]).eventId ??
          (deployment as unknown[])[0] ??
          "",
      );
      return eventId;
    }),
  );
  return new Set(eventIds);
}

async function runRootDeploy(env: NodeJS.ProcessEnv): Promise<string> {
  const command =
    process.platform === "win32"
      ? process.env.ComSpec?.trim() || process.env.COMSPEC?.trim() || "cmd.exe"
      : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd run deploy:amoy"]
      : ["run", "deploy:amoy"];

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error(`deploy:amoy failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main(): Promise<void> {
  await initDatabase();

  const stagedLineup = await getDemoCatalogEntries("staged");
  if (stagedLineup.length !== 5) {
    throw new Error(
      `Expected 5 staged demo events before deployment, found ${stagedLineup.length}. Run the lineup preparation script first.`,
    );
  }

  const primaryPricePol = process.env.DEMO_PRIMARY_PRICE_POL?.trim() || "0.12";
  const maxSupply = process.env.DEMO_MAX_SUPPLY?.trim() || "150";
  const baseTokenUriRoot = requiredEnv(
    "DEMO_BASE_TOKEN_URI_ROOT",
    process.env.BASE_TOKEN_URI?.trim() || "ipfs://chainticket/base/",
  );
  const collectibleBaseUriRoot = requiredEnv(
    "DEMO_COLLECTIBLE_BASE_URI_ROOT",
    process.env.COLLECTIBLE_BASE_URI?.trim() || "ipfs://chainticket/collectible/",
  );

  let factoryAddress =
    process.env.CHAIN_TICKET_FACTORY_ADDRESS?.trim() ||
    process.env.FACTORY_ADDRESS?.trim() ||
    config.factoryAddress ||
    null;
  const deployFactoryOnFirstEvent =
    !factoryAddress && parseBooleanEnv(process.env.DEPLOY_CHAIN_TICKET_FACTORY ?? "true");

  let registeredEventIds = factoryAddress
    ? await getRegisteredEventIds(factoryAddress)
    : new Set<string>();

  for (const item of stagedLineup) {
    if (registeredEventIds.has(item.ticketEventId)) {
      logger.info(
        {
          ticketEventId: item.ticketEventId,
        },
        "Skipping demo event deployment because it is already registered in the factory.",
      );
      continue;
    }

    const deployEnv: NodeJS.ProcessEnv = {
      ...process.env,
      EVENT_ID: item.ticketEventId,
      TICKET_NAME: item.name,
      TICKET_SYMBOL: buildDemoTokenSymbol(item.name, item.ticketEventId),
      PRIMARY_PRICE_POL: primaryPricePol,
      MAX_SUPPLY: maxSupply,
      BASE_TOKEN_URI: buildDemoMetadataUri(baseTokenUriRoot, item.ticketEventId, "live"),
      COLLECTIBLE_BASE_URI: buildDemoMetadataUri(
        collectibleBaseUriRoot,
        item.ticketEventId,
        "collectible",
      ),
      DEPLOY_CHAIN_TICKET_FACTORY:
        !factoryAddress && deployFactoryOnFirstEvent ? "true" : "false",
      CHAIN_TICKET_FACTORY_ADDRESS: factoryAddress ?? "",
    };

    logger.info(
      {
        ticketEventId: item.ticketEventId,
        name: item.name,
        primaryPricePol,
        maxSupply,
      },
      "Deploying a staged demo event.",
    );

    const output = await runRootDeploy(deployEnv);

    if (!factoryAddress) {
      factoryAddress = parseFactoryAddressFromDeployOutput(output);
      if (!factoryAddress) {
        throw new Error(
          `The first deployment completed without exposing a ChainTicketFactory address for ${item.ticketEventId}.`,
        );
      }
    }

    registeredEventIds.add(item.ticketEventId);
  }

  await withTransaction(async (client) => {
    await promoteStagedDemoCatalog(client);
  });

  logger.info(
    {
      count: stagedLineup.length,
      factoryAddress,
      ticketEventIds: stagedLineup.map((item) => item.ticketEventId),
    },
    "Promoted the staged demo lineup after deployment.",
  );

  await pool.end();
}

main().catch(async (error) => {
  logger.error({ error }, "Failed to deploy the staged demo lineup.");
  await pool.end();
  process.exit(1);
});
