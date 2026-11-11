import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { ScanRecord } from "../lib/types";

const mocks = vi.hoisted(() => ({ sql: undefined as unknown }));
vi.mock("postgres", () => ({ default: () => mocks.sql }));
import { claimNextScan, failScanAndReleasePaidRescan, readScan, saveScan, updateScan } from "../lib/store";

const id = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
type Queryable = { query: (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
function tag(client: Queryable) {
  const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return (await client.query(query, values)).rows;
  };
  return Object.assign(sql, { json: (value: unknown) => JSON.stringify(value) });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/001_initial.sql", "utf8"));
  await db.exec(await readFile("db/migrations/002_free_tier_costs.sql", "utf8"));
  await db.exec(await readFile("db/migrations/003_paid_rescan_limits.sql", "utf8"));
  const sql = Object.assign(tag(db), { begin: (callback: (tx: ReturnType<typeof tag>) => Promise<unknown>) => db.transaction((tx) => callback(tag(tx))) });
  mocks.sql = sql;
  vi.stubEnv("DATABASE_URL", "postgres://local-test-only");
});
beforeEach(async () => {
  await db.exec("TRUNCATE scans CASCADE");
  const timestamp = new Date().toISOString();
  await saveScan({ id, url: "https://example.test/", status: "queued", phase: "Queued", createdAt: timestamp, updatedAt: timestamp });
});
afterAll(async () => { vi.unstubAllEnvs(); await db.close(); });

describe("actual scan-store lease SQL on PostgreSQL", () => {
  it("claims a queued job once while its lease remains valid", async () => {
    // PGlite serializes one connection: this proves the SQL state transitions, not hosted lock scheduling.
    const claims = await Promise.all([claimNextScan(), claimNextScan()]);
    const claimed = claims.filter((claim) => claim !== undefined);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id, leaseToken: expect.any(String) });
    expect(await claimNextScan()).toBeUndefined();
    expect(await readScan(id)).toMatchObject({ status: "scanning", leaseToken: claimed[0]?.leaseToken });
    const lease = (await db.query<{ valid: boolean }>("SELECT lease_expires_at>now() AS valid FROM scans WHERE id=$1", [id])).rows[0];
    expect(lease.valid).toBe(true);
    const ampleLease = (await db.query<{ valid: boolean }>("SELECT lease_expires_at>now()+interval '150 seconds' AS valid FROM scans WHERE id=$1", [id])).rows[0];
    expect(ampleLease.valid).toBe(true);
  });

  it("reclaims an expired lease and rejects the old worker's phase and completion saves", async () => {
    const first = (await claimNextScan())!;
    const staleSnapshot = (await readScan(id)) as ScanRecord;
    await db.query("UPDATE scans SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [id]);
    const replacement = (await claimNextScan())!;
    expect(replacement.id).toBe(id);
    expect(replacement.leaseToken).not.toBe(first.leaseToken);
    expect(await claimNextScan()).toBeUndefined();

    await expect(saveScan({ ...staleSnapshot, phase: "Old worker phase" }, first.leaseToken)).rejects.toThrow("Scan lease changed");
    await expect(saveScan({ ...staleSnapshot, status: "complete", phase: "Old worker completed", score: 1 }, first.leaseToken)).rejects.toThrow("Scan lease changed");
    expect(await updateScan(id, (scan) => ({ ...scan, status: "failed", error: "stale failure" }), first.leaseToken)).toBeUndefined();
    expect(await readScan(id)).toMatchObject({ status: "scanning", phase: "Starting scan…", leaseToken: replacement.leaseToken });
    expect(await readScan(id)).not.toHaveProperty("score");

    await updateScan(id, (scan) => ({ ...scan, phase: "New worker phase" }), replacement.leaseToken);
    const owned = (await readScan(id)) as ScanRecord;
    expect(owned.phase).toBe("New worker phase");
    await saveScan({ ...owned, status: "complete", phase: "Report ready", score: 92 }, replacement.leaseToken);
    expect(await readScan(id)).toMatchObject({ status: "complete", phase: "Report ready", score: 92, leaseToken: replacement.leaseToken });
    expect(await claimNextScan()).toBeUndefined();
  });

  it("releases a failed paid re-scan once, only for the worker that owns the lease", async () => {
    const tokenHash = "paid-token-hash";
    await db.query("INSERT INTO purchases(id,scan_id,stripe_session_id,amount,currency) VALUES('purchase-test',$1,'cs-test',1200,'usd')", [id]);
    await db.query("INSERT INTO paid_url_access(token_hash,token_ciphertext,scan_id,stripe_session_id,normalized_url,recipient,expires_at,rescans_limit,rescans_used) VALUES($1,'cipher',$2,'cs-test','https://example.test/','buyer@example.test',now()+interval '7 days',2,1)", [tokenHash, id]);
    await saveScan({ id, url: "https://example.test/", status: "queued", phase: "Queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), paid: true, paidRescanTokenHash: tokenHash, paidRescanSessionId: "cs-test" });
    const lease = (await claimNextScan())!;
    expect(await failScanAndReleasePaidRescan(id, (scan) => ({ ...scan, status: "failed", phase: "Failed" }), "stale-lease")).toBeUndefined();
    expect((await db.query<{ rescans_used: number }>("SELECT rescans_used FROM paid_url_access WHERE token_hash=$1", [tokenHash])).rows[0].rescans_used).toBe(1);
    expect(await failScanAndReleasePaidRescan(id, (scan) => ({ ...scan, status: "failed", phase: "Failed", updatedAt: new Date().toISOString() }), lease.leaseToken)).toMatchObject({ status: "failed", paidRescanUseReleased: true });
    expect((await db.query<{ rescans_used: number }>("SELECT rescans_used FROM paid_url_access WHERE token_hash=$1", [tokenHash])).rows[0].rescans_used).toBe(0);
    await failScanAndReleasePaidRescan(id, (scan) => ({ ...scan, status: "failed", phase: "Failed" }), lease.leaseToken);
    expect((await db.query<{ rescans_used: number }>("SELECT rescans_used FROM paid_url_access WHERE token_hash=$1", [tokenHash])).rows[0].rescans_used).toBe(0);
  });

  it("registers paid re-scan report access in the same transaction as completion", async () => {
    await db.query("INSERT INTO purchases(id,scan_id,stripe_session_id,amount,currency) VALUES('purchase-map',$1,'cs-map',1200,'usd')", [id]);
    await db.query("INSERT INTO paid_url_access(token_hash,token_ciphertext,scan_id,stripe_session_id,normalized_url,recipient,expires_at,rescans_limit,rescans_used) VALUES('map-hash','cipher',$1,'cs-map','https://example.test/','buyer@example.test',now()+interval '7 days',2,1)", [id]);
    await saveScan({ id, url: "https://example.test/", status: "complete", phase: "Ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), paid: true, paidRescanTokenHash: "map-hash", paidRescanSessionId: "cs-map" });
    expect((await db.query("SELECT scan_id,stripe_session_id FROM paid_rescan_reports WHERE scan_id=$1", [id])).rows).toEqual([{ scan_id: id, stripe_session_id: "cs-map" }]);
  });
});
