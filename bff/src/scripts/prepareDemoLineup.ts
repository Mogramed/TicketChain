process.env.BFF_RUNTIME_MODE ??= "catalog-only";

const [
  { config },
  { selectDemoLineup },
  { initDatabase, pool, replaceDemoCatalogEntries, withTransaction },
  { logger },
  { fetchTicketmasterCandidates },
] = await Promise.all([
  import("../config.js"),
  import("../demoCatalog.js"),
  import("../db.js"),
  import("../logger.js"),
  import("../ticketmaster.js"),
]);

async function main(): Promise<void> {
  await initDatabase();

  if (!config.ticketmasterDiscoveryApiKey) {
    throw new Error(
      "TICKETMASTER_DISCOVERY_API_KEY is required to prepare the demo lineup.",
    );
  }

  const fetchedAt = Date.now();
  const expiresAt =
    fetchedAt + config.demoLineupCacheTtlHours * 60 * 60 * 1000;

  const candidates = await fetchTicketmasterCandidates({
    apiKey: config.ticketmasterDiscoveryApiKey,
    baseUrl: config.ticketmasterDiscoveryBaseUrl,
    now: fetchedAt,
    windowDays: config.demoLineupWindowDays,
    pageSize: config.demoLineupPageSize,
    maxPages: config.demoLineupMaxPages,
  });

  const lineup = selectDemoLineup(candidates, {
    fetchedAt,
    expiresAt,
  });

  await withTransaction(async (client) => {
    await replaceDemoCatalogEntries(client, "staged", lineup);
  });

  logger.info(
    {
      lineupStatus: "staged",
      count: lineup.length,
      eventIds: lineup.map((item) => item.ticketEventId),
      sourceEventIds: lineup.map((item) => item.sourceEventId),
      expiresAt,
    },
    "Prepared the staged demo lineup from Ticketmaster.",
  );

  for (const item of lineup) {
    console.log(
      `${item.slotIndex + 1}. ${item.name} | ${item.city ?? "-"}, ${item.countryCode ?? "-"} | ${item.category ?? "-"} | ${item.ticketEventId}`,
    );
  }

  await pool.end();
}

main().catch(async (error) => {
  logger.error({ error }, "Failed to prepare the demo lineup.");
  await pool.end();
  process.exit(1);
});
