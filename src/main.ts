import { consoleSink } from "./agent/events.js";
import { runM1 } from "./agent/m1.js";
import { startMerchant } from "./server/merchant.js";
import { disconnect } from "./xrpl/client.js";

async function main(): Promise<void> {
  console.log("=".repeat(64));
  console.log("LEASH · M1 thin slice — one real payment on XRPL testnet");
  console.log("=".repeat(64));

  const { payTo, port } = await startMerchant();

  let exitCode = 0;
  try {
    await runM1({
      merchantPort: port,
      merchantPayTo: payTo,
      onEvent: consoleSink,
    });
  } catch (err) {
    console.error("\n✗ M1 failed:", err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    await disconnect();
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
