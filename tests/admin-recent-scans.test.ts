import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type postgres from "postgres";

const mocks = vi.hoisted(() => ({ sql: undefined as unknown }));
vi.mock("../lib/store", () => ({ database: () => mocks.sql }));
import { adminRecentScans } from "../lib/free-tier";

type Queryable = { query: (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
function tag(client: Queryable) {
  return async (parts: TemplateStringsArray, ...values: unknown[]) => client.query(parts.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, ""), values).then((result) => result.rows);
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/001_initial.sql", "utf8"));
  await db.exec(await readFile("db/migrations/002_free_tier_costs.sql", "utf8"));
  await db.exec(await readFile("db/migrations/003_paid_rescan_limits.sql", "utf8"));
  mocks.sql = Object.assign(tag(db), { begin: (callback: (tx: ReturnType<typeof tag>) => Promise<unknown>) => db.transaction((tx) => callback(tag(tx))) }) as ReturnType<typeof postgres>;
  await db.query("INSERT INTO scans(id,url,status,phase,created_at,payload) VALUES($1,$2,'failed','Scan could not be completed',now()-$3::interval,$4::jsonb)", [
    "11111111-1111-4111-8111-111111111111", "https://www.learnfrommistakes.in/", "2 minutes", JSON.stringify({ error: "The live page render was interrupted before the review could finish. Try again." }),
  ]);
  await db.query("INSERT INTO scans(id,url,status,phase,created_at,payload) VALUES($1,$2,'complete','Report ready',now(),$3::jsonb)", [
    "22222222-2222-4222-8222-222222222222", "https://cevace.com/", JSON.stringify({ score: 70 }),
  ]);
});

afterAll(async () => { await db.close(); });

describe("admin recent scans", () => {
  it("returns the stored failure reason for failed scans", async () => {
    const rows = await adminRecentScans();
    expect(rows.map((row) => ({ url: row.url, status: row.status, error: row.error, score: row.score }))).toEqual([
      { url: "https://cevace.com/", status: "complete", error: null, score: 70 },
      { url: "https://www.learnfrommistakes.in/", status: "failed", error: "The live page render was interrupted before the review could finish. Try again.", score: null },
    ]);
  });
});
