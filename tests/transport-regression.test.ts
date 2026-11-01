import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const local = vi.hoisted(() => ({ port: 0 }));
vi.mock("node:http", async (importOriginal) => {
  const http = await importOriginal<typeof import("node:http")>();
  return { ...http, request: (_url: URL, options: Parameters<typeof http.request>[1], callback: Parameters<typeof http.request>[2]) => http.request(new URL(`http://127.0.0.1:${local.port}/`), options, callback) };
});
import { safeFetch, SafeFetchError, withScanSignal } from "../lib/ssrf";

let server: Server;
let reply: (response: ServerResponse) => void;
beforeEach(async () => {
  server = createServer((_request, response) => reply(response));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  local.port = (server.address() as AddressInfo).port;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });

// Only the test transport redirects to loopback. safeFetch still validates a public URL and runs real Node response events.
describe("safe fetch response lifecycle", () => {
  it("rejects an actual truncated HTTP response instead of leaving the scan unsettled", async () => {
    reply = (response) => { response.writeHead(200, { "content-length": "100" }); response.write("partial"); setTimeout(() => response.destroy(), 10); };
    await expect(safeFetch("http://8.8.8.8/", { timeoutMs: 80 })).rejects.toThrow(/before it was complete|aborted|reset/i);
  });
  it("keeps the absolute deadline active after headers and a partial body arrive", async () => {
    reply = (response) => { response.writeHead(200, { "content-length": "100" }); response.write("partial"); };
    await expect(safeFetch("http://8.8.8.8/", { timeoutMs: 50 })).rejects.toThrow("too long");
  });
  it("explicitly rejects scan cancellation during an unfinished response", async () => {
    const controller = new AbortController();
    reply = (response) => { response.writeHead(200, { "content-length": "100" }); response.write("partial"); controller.abort(); };
    await expect(withScanSignal(controller.signal, () => safeFetch("http://8.8.8.8/", { timeoutMs: 1000 }))).rejects.toBeInstanceOf(SafeFetchError);
  });
  it("still returns a complete body and allows a status-only probe", async () => {
    reply = (response) => { response.writeHead(200, { "content-length": "4" }); response.end("done"); };
    const full = await safeFetch("http://8.8.8.8/", { timeoutMs: 1000 });
    expect(full.body.toString()).toBe("done");
    const probe = await safeFetch("http://8.8.8.8/", { timeoutMs: 1000, statusOnly: true });
    expect(probe.status).toBe(200); expect(probe.body).toHaveLength(0);
  });
  it("rejects a streamed body that exceeds the byte limit", async () => {
    reply = (response) => { response.writeHead(200); response.end("oversized"); };
    await expect(safeFetch("http://8.8.8.8/", { timeoutMs: 1000, maxBytes: 4 })).rejects.toThrow("larger than the scan limit");
  });
});
