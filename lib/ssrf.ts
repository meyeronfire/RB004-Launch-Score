import { lookup } from "node:dns/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";

export class UnsafeTargetError extends Error {}
export class SafeFetchError extends Error {}
const scanSignals = new AsyncLocalStorage<AbortSignal>();
export const currentScanSignal = () => scanSignals.getStore();
export function withScanSignal<T>(signal: AbortSignal, operation: () => Promise<T>) { return scanSignals.run(signal, operation); }
function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new SafeFetchError("The scan exceeded its time limit."));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new SafeFetchError("The scan exceeded its time limit.")); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

function ipv4ToNumber(ip: string) { return ip.split(".").reduce((n, octet) => (n * 256 + Number(octet)) >>> 0, 0); }
function inV4(ip: string, network: string, bits: number) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(network) & mask);
}
function ipv6ToBigInt(address: string) {
  const lower = address.toLowerCase().split("%", 1)[0];
  const lastColon = lower.lastIndexOf(":"); const tail = lower.slice(lastColon + 1);
  let source = lower;
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number); if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return undefined;
    const hex1 = ((octets[0] << 8) | octets[1]).toString(16); const hex2 = ((octets[2] << 8) | octets[3]).toString(16);
    source = `${lower.slice(0, lastColon)}:${hex1}:${hex2}`;
  }
  const halves = source.split("::"); if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : []; const right = halves[1] ? halves[1].split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
  return groups.reduce((n, part) => (n << BigInt(16)) | BigInt(`0x${part}`), BigInt(0));
}
function v6Prefix(ip: bigint, network: string, bits: number) {
  const base = ipv6ToBigInt(network); if (base === undefined) return false;
  const mask = ((BigInt(1) << BigInt(bits)) - BigInt(1)) << BigInt(128 - bits);
  return (ip & mask) === (base & mask);
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([network, bits]) => inV4(address, network as string, bits as number));
  }
  if (family === 6) {
    const ip = ipv6ToBigInt(address); if (ip === undefined) return false;
    const mapped = ip >> BigInt(32) === BigInt(0xffff);
    if (mapped) return isPublicAddress(`${Number((ip >> BigInt(24)) & BigInt(255))}.${Number((ip >> BigInt(16)) & BigInt(255))}.${Number((ip >> BigInt(8)) & BigInt(255))}.${Number(ip & BigInt(255))}`);
    if (!v6Prefix(ip, "2000::", 3)) return false;
    if (v6Prefix(ip, "2001::", 23) || v6Prefix(ip, "2001:db8::", 32) || v6Prefix(ip, "2001:10::", 28) || v6Prefix(ip, "2001:20::", 28) || v6Prefix(ip, "2001:2::", 48) || v6Prefix(ip, "2002::", 16)) return false;
    return true;
  }
  return false;
}

export function normalizePublicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new UnsafeTargetError("Enter a complete page URL, including https://."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeTargetError("Only public HTTP and HTTPS pages can be scanned.");
  if (url.username || url.password) throw new UnsafeTargetError("URLs containing usernames or passwords cannot be scanned.");
  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) throw new UnsafeTargetError("Only standard HTTP and HTTPS ports can be scanned.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new UnsafeTargetError("Private and local pages cannot be scanned.");
  if (isIP(host) && !isPublicAddress(host)) throw new UnsafeTargetError("Private and local pages cannot be scanned.");
  url.hash = "";
  return url;
}

async function publicDns(hostname: string) {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) throw new UnsafeTargetError("This page resolves to a private or reserved network address.");
  return records;
}

export type SafeResponse = { status: number; headers: IncomingHttpHeaders; body: Buffer; finalUrl: string; redirects: string[] };

/** Fetches a public resource with DNS validation and IP pinning on every connection. */
export async function safeFetch(input: string, options: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; headers?: Record<string, string>; beforeRedirect?: (target: URL) => void | Promise<void>; statusOnly?: boolean } = {}): Promise<SafeResponse> {
  const scanSignal = currentScanSignal();
  if (scanSignal?.aborted) throw new SafeFetchError("The scan exceeded its time limit.");
  const timeoutMs = options.timeoutMs ?? 9_000;
  const maxBytes = options.maxBytes ?? 5_000_000;
  const maxRedirects = options.maxRedirects ?? 4;
  const deadline = Date.now() + timeoutMs;
  let current = normalizePublicUrl(input);
  const redirects: string[] = [];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SafeFetchError("The page took too long to respond.");
    const host = current.hostname.replace(/^\[|\]$/g, "");
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const records = await raceWithSignal(Promise.race([
      publicDns(host),
      new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new SafeFetchError("The page took too long to respond.")), remaining); }),
    ]), scanSignal).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
    let response: { status: number; headers: IncomingHttpHeaders; body: Buffer } | undefined;
    let lastError: unknown;
    for (const record of records) {
      try {
        response = await new Promise((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            clearTimeout(timer);
            scanSignal?.removeEventListener("abort", abort);
            req.setTimeout(0);
          };
          const fail = (error: Error) => {
            if (settled) return;
            settled = true; cleanup(); reject(error); req.destroy();
          };
          const succeed = (value: { status: number; headers: IncomingHttpHeaders; body: Buffer }) => {
            if (settled) return;
            settled = true; cleanup(); resolve(value);
          };
          const abort = () => fail(new SafeFetchError("The scan exceeded its time limit."));
          const transport = current.protocol === "https:" ? httpsRequest : httpRequest;
          const lookupPinned = (_hostname: string, _opts: unknown, cb: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => cb(null, record.address, record.family);
          const req = transport(current, { method: "GET", autoSelectFamily: false, headers: { "user-agent": "RB004-Launch-Score/1.0 (+https://regularbasis.studio)", accept: "text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.7", ...options.headers }, lookup: lookupPinned as never, servername: host } as never, (res) => {
            res.on("aborted", () => fail(new SafeFetchError("The page response ended before it was complete.")));
            res.on("error", fail);
            res.on("close", () => { if (!res.complete) fail(new SafeFetchError("The page response ended before it was complete.")); });
            if (options.statusOnly) { succeed({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.alloc(0) }); res.destroy(); return; }
            const chunks: Buffer[] = [];
            let length = 0;
            res.on("data", (part: Buffer) => { length += part.length; if (length > maxBytes) fail(new SafeFetchError("This page is larger than the scan limit.")); else chunks.push(part); });
            res.on("end", () => succeed({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
          });
          const timer = setTimeout(() => fail(new SafeFetchError("The page took too long to respond.")), Math.max(1, deadline - Date.now()));
          req.on("error", fail);
          req.setTimeout(Math.max(1, deadline - Date.now()), () => fail(new SafeFetchError("The page took too long to respond.")));
          scanSignal?.addEventListener("abort", abort, { once: true });
          if (scanSignal?.aborted) abort();
          else req.end();
        });
        break;
      } catch (error) {
        if (scanSignal?.aborted || Date.now() >= deadline) throw error;
        lastError = error;
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new SafeFetchError("The page could not be fetched.");
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (hop === maxRedirects) throw new SafeFetchError("The page redirected too many times.");
      current = normalizePublicUrl(new URL(response.headers.location, current).toString());
      await options.beforeRedirect?.(current);
      redirects.push(current.toString());
      continue;
    }
    return { ...response, finalUrl: current.toString(), redirects };
  }
  throw new SafeFetchError("The page could not be fetched.");
}
