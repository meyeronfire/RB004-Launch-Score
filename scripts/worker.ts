import { writeFile } from "node:fs/promises";
import { claimNextScan, database, workerHeartbeat } from "../lib/store";
import { processScan } from "../lib/scanner";
import { verifyWorkerBrowser } from "../lib/browser-isolation";
import { deliverClaimEmail } from "../lib/payments";
import { processPaidPromptJob } from "../lib/paid-prompt";

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
  const preflightOnly = process.argv.includes("--preflight");
  if (!preflightOnly && !process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before starting the production scan worker.");
  process.env.PLAYWRIGHT_EXECUTABLE_PATH = `${process.cwd()}/scripts/chromium-netns`;
  await verifyWorkerBrowser();
  console.info("Scanner worker browser preflight passed", {
    uid: process.getuid?.(), chromiumSandbox: process.env.SCAN_CHROMIUM_SANDBOX === "1",
  });
  if (preflightOnly) return;
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
  await database()?.end({ timeout: 5 });
}
void main().catch((error: unknown) => {
  console.error("Scanner worker startup failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
