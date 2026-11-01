import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const browserArgs = ["--disable-webrtc", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-quic"];

export async function browserLaunchOptions() {
  if (process.env.NODE_ENV !== "production") {
    const options = { headless: true, args: browserArgs };
    if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return { ...options, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH };
    if (process.env.PLAYWRIGHT_CHANNEL) return { ...options, channel: process.env.PLAYWRIGHT_CHANNEL as "chrome" };
    return options;
  }
  if (process.platform !== "linux") throw new Error("Production scanning requires Linux network namespace isolation.");
  if (process.env.PLAYWRIGHT_CHANNEL) throw new Error("Production scanning cannot launch a host browser channel.");
  const wrapper = path.resolve(process.cwd(), "scripts/chromium-netns");
  const configured = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? path.resolve(process.env.PLAYWRIGHT_EXECUTABLE_PATH) : "";
  if (configured !== wrapper) throw new Error("Production scanning requires the bundled network-isolation browser wrapper.");
  const realBrowser = chromium.executablePath();
  await access(realBrowser); await access(wrapper);
  process.env.RB004_CHROMIUM_REAL_EXECUTABLE = realBrowser;
  return { headless: true, executablePath: wrapper, args: browserArgs };
}

export function verifyWorkerNetworkIsolation() {
  if (process.platform !== "linux") throw new Error("The production scan worker must run on Linux with user and network namespaces enabled.");
  try { execFileSync("unshare", ["--user", "--map-root-user", "--net", "--", "true"], { stdio: "ignore", timeout: 5000 }); }
  catch { throw new Error("This worker cannot create a private network namespace; refusing to accept production scan jobs."); }
}
