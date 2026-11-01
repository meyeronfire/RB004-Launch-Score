import { claimNextScan, workerHeartbeat } from "../lib/store";
import { processScan } from "../lib/scanner";
import { verifyWorkerNetworkIsolation } from "../lib/browser-isolation";
import { deliverClaimEmail } from "../lib/payments";
import { processPaidPromptJob } from "../lib/paid-prompt";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before starting the production scan worker.");
verifyWorkerNetworkIsolation();
process.env.PLAYWRIGHT_EXECUTABLE_PATH = `${process.cwd()}/scripts/chromium-netns`;
const workerId = process.env.SCAN_WORKER_ID || `worker-${process.pid}`;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  while (!stopping) {
    try {
      await workerHeartbeat(workerId);
      await deliverClaimEmail();
      await processPaidPromptJob();
      const job = await claimNextScan();
      if (job) {
        const heartbeat = setInterval(() => { void workerHeartbeat(workerId).catch(() => undefined); }, 10_000);
        try { await processScan(job.id, job.leaseToken); } finally { clearInterval(heartbeat); }
      } else await wait(1000);
    } catch (error) {
      console.error("Scan worker iteration failed:", error instanceof Error ? error.message : "Unknown error");
      await wait(2500);
    }
  }
}
void main();
