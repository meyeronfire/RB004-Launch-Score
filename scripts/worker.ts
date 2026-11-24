import { writeFile } from "node:fs/promises";
import { claimNextScan, workerHeartbeat } from "../lib/store";
import { processScan } from "../lib/scanner";
import { verifyWorkerNetworkIsolation } from "../lib/browser-isolation";
import { deliverClaimEmail } from "../lib/payments";
import { processPaidPromptJob } from "../lib/paid-prompt";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before starting the production scan worker.");
verifyWorkerNetworkIsolation();
process.env.PLAYWRIGHT_EXECUTABLE_PATH = `${process.cwd()}/scripts/chromium-netns`;
const workerId = process.env.SCAN_WORKER_ID || `worker-${process.pid}`;
const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function heartbeat() {
  await workerHeartbeat(workerId);
  const file = process.env.SCAN_WORKER_HEALTH_FILE;
  if (file) await writeFile(file, String(process.pid), { mode: 0o600 });
}

async function main() {
  while (!shutdown.signal.aborted) {
    try {
      await heartbeat();
      await deliverClaimEmail();
      await processPaidPromptJob();
      if (shutdown.signal.aborted) break;
      const job = await claimNextScan();
      if (job) {
        const heartbeatInterval = setInterval(() => { void heartbeat().catch(() => undefined); }, 10_000);
        try { await processScan(job.id, job.leaseToken, shutdown.signal); } finally { clearInterval(heartbeatInterval); }
      } else await wait(1000);
    } catch (error) {
      console.error("Scan worker iteration failed:", error instanceof Error ? error.message : "Unknown error");
      await wait(2500);
    }
  }
  process.exitCode = 0;
}
void main();
