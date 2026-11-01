import { describe, expect, it } from "vitest";
import { normalizePublicUrl, safeFetch, SafeFetchError, withScanSignal } from "../lib/ssrf";
import { isPublicAddress } from "../lib/ssrf";

describe("scanner network hardening", () => {
  it("allows only the URL scheme's standard port", () => {
    for (const url of ["https://example.com:80", "http://example.com:443", "https://example.com:8443"]) {
      expect(() => normalizePublicUrl(url)).toThrow("Only standard HTTP and HTTPS ports");
    }
    expect(normalizePublicUrl("https://example.com").port).toBe("");
    expect(normalizePublicUrl("http://example.com").port).toBe("");
  });

  it("accepts a bare domain as HTTPS while keeping local and unsupported targets blocked", () => {
    expect(normalizePublicUrl("www.getklare.com").toString()).toBe("https://www.getklare.com/");
    expect(normalizePublicUrl("getklare.com/pricing").toString()).toBe("https://getklare.com/pricing");
    expect(normalizePublicUrl("http://getklare.com").protocol).toBe("http:");
    for (const url of ["localhost", "127.0.0.1", "ftp://example.com"]) expect(() => normalizePublicUrl(url)).toThrow();
  });

  it("rejects IPv6 transition and special-use networks", () => {
    for (const address of ["2001::1", "2001:db8::1", "2002:c000:0201::1", "2001:2::1", "2001:10::1", "2001:20::1"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("stops safe fetch immediately when its scan deadline has fired", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(withScanSignal(controller.signal, () => safeFetch("https://example.com"))).rejects.toBeInstanceOf(SafeFetchError);
  });
});
