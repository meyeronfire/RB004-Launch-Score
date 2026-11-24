import { execFileSync } from "node:child_process";
import { access, readlink } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const browserArgs = ["--disable-webrtc", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-quic"];
const wrapper = path.resolve(process.cwd(), "scripts/chromium-netns");

export async function browserLaunchOptions() {
  if (process.env.NODE_ENV !== "production") {
    const options = { headless: true, args: browserArgs };
    if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return { ...options, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH };
    if (process.env.PLAYWRIGHT_CHANNEL) return { ...options, channel: process.env.PLAYWRIGHT_CHANNEL as "chrome" };
    return options;
  }
  if (process.platform !== "linux") throw new Error("Production scanning requires Linux network namespace isolation.");
  if (process.env.PLAYWRIGHT_CHANNEL) throw new Error("Production scanning cannot launch a host browser channel.");
  const configured = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? path.resolve(process.env.PLAYWRIGHT_EXECUTABLE_PATH) : "";
  if (configured !== wrapper) throw new Error("Production scanning requires the bundled network-isolation browser wrapper.");
  const realBrowser = chromium.executablePath();
  await access(realBrowser); await access(wrapper);
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: process.env.HOME || "/tmp",
    LANG: "C.UTF-8",
    TMPDIR: "/tmp",
    XDG_CACHE_HOME: "/tmp",
    XDG_CONFIG_HOME: "/tmp",
    RB004_CHROMIUM_REAL_EXECUTABLE: realBrowser,
  };
  return { headless: true, executablePath: wrapper, args: browserArgs, env, chromiumSandbox: process.env.SCAN_CHROMIUM_SANDBOX === "1" };
}

export async function verifyWorkerNetworkIsolation() {
  if (process.platform !== "linux") throw new Error("The production scan worker must run on Linux with user and network namespaces enabled.");
  if (process.env.SCAN_CHROMIUM_SANDBOX === "1" && process.getuid?.() === 0) throw new Error("Sandboxed Chromium requires a non-root worker.");
  try {
    const workerNamespace = await readlink("/proc/self/ns/net");
    const isolatedNamespace = execFileSync(wrapper, ["--check-namespace"], { encoding: "utf8", timeout: 5000 }).trim();
    if (!isolatedNamespace || isolatedNamespace === workerNamespace) throw new Error("Network namespace did not change.");
  } catch {
    throw new Error("This worker cannot create a private network namespace; refusing to accept production scan jobs.");
  }
}

export async function verifyWorkerBrowser() {
  await verifyWorkerNetworkIsolation();
  const browser = await chromium.launch({ ...await browserLaunchOptions(), timeout: 15_000 });
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.end("worker loopback"); });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    const page = await browser.newPage();
    await page.setContent("<main>Worker browser preflight</main>", { timeout: 2000 });
    if (await page.locator("main").textContent({ timeout: 2000 }) !== "Worker browser preflight") {
      throw new Error("Chromium could not render the preflight document.");
    }
    const probe = await browser.newPage();
    try {
      await probe.goto(`http://127.0.0.1:${port}/`, { timeout: 2000 });
    } catch {
      // A failed navigation can replace the document with a Chromium error page.
    } finally {
      await probe.close();
    }
    if (requests) throw new Error("Chromium reached worker loopback.");
  } finally {
    server.closeAllConnections();
    await Promise.all([browser.close(), new Promise<void>((resolve) => server.close(() => resolve()))]);
  }
}
