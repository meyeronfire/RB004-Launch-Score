import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { requestHasScanAdminKey } from "../lib/scan-admin";

const SECRET = "scan-admin-test-key";

function requestWith(header?: string) {
  return new Request("https://rb004.vercel.app/api/scans", { headers: header === undefined ? {} : { "x-admin-key": header } });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

afterEach(() => { delete process.env.SCAN_ADMIN_KEY; });

describe("scan admin key", () => {
  it("compares the header to SCAN_ADMIN_KEY in constant time and ignores blank configuration", () => {
    const source = readFileSync("lib/scan-admin.ts", "utf8");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_/);

    process.env.SCAN_ADMIN_KEY = `  ${SECRET}  `;
    expect(requestHasScanAdminKey(requestWith(SECRET))).toBe(true);
    expect(requestHasScanAdminKey(requestWith(`${SECRET}x`))).toBe(false);
    expect(requestHasScanAdminKey(requestWith(SECRET.slice(0, -1)))).toBe(false);
    expect(requestHasScanAdminKey(requestWith(SECRET.toUpperCase()))).toBe(false);
    expect(requestHasScanAdminKey(requestWith("x".repeat(SECRET.length)))).toBe(false);
    expect(requestHasScanAdminKey(requestWith())).toBe(false);
    expect(requestHasScanAdminKey(requestWith(""))).toBe(false);
    expect(requestHasScanAdminKey(requestWith(`${SECRET}${"y".repeat(600)}`))).toBe(false);
  });

  it("reads SCAN_ADMIN_KEY only from the server helper", () => {
    const files = ["app", "components", "lib"].flatMap((dir) => sourceFiles(dir));
    const readers = files.filter((file) => readFileSync(file, "utf8").includes("process.env.SCAN_ADMIN_KEY"));
    expect(readers).toEqual([path.join("lib", "scan-admin.ts")]);
  });

  it("disables the bypass when SCAN_ADMIN_KEY is unset, empty, or whitespace", () => {
    delete process.env.SCAN_ADMIN_KEY;
    expect(requestHasScanAdminKey(requestWith(SECRET))).toBe(false);
    process.env.SCAN_ADMIN_KEY = "";
    expect(requestHasScanAdminKey(requestWith(""))).toBe(false);
    expect(requestHasScanAdminKey(requestWith(SECRET))).toBe(false);
    process.env.SCAN_ADMIN_KEY = "   ";
    expect(requestHasScanAdminKey(requestWith("   "))).toBe(false);
    expect(requestHasScanAdminKey(requestWith(SECRET))).toBe(false);
  });
});
