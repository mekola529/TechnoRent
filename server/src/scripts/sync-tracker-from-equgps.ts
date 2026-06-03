import "../env.js";

import { initSchema } from "../lib/schema.js";
import { runEquGpsSync } from "../lib/equgps-sync.js";

async function main() {
  await initSchema();
  const result = await runEquGpsSync();

  if (result.storedPositions === 0 && result.storedStops === 0 && result.storedDailyStats === 0) {
    console.log("No new EquGPS data to store.");
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: "completed",
        source: "equgps",
        storedPositions: result.storedPositions,
        storedStops: result.storedStops,
        storedDailyStats: result.storedDailyStats,
        syncedDates: result.syncedDates,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Failed to sync EquGPS tracker positions:", error);
  process.exit(1);
});
