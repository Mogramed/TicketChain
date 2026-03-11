import { createServer } from "node:http";

import { createApp } from "./app.js";
import { config } from "./config.js";
import { initDatabase, pool } from "./db.js";
import { ChainIndexer } from "./indexer.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  await initDatabase();

  const indexer = new ChainIndexer();
  await indexer.start();

  const app = createApp(indexer);
  const server = createServer(app);

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        chainId: config.chainId,
        deploymentBlock: config.deploymentBlock,
      },
      "ChainTicket BFF started.",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down BFF...");
    server.close();
    await indexer.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  logger.error({ error }, "Fatal startup error.");
  process.exit(1);
});
