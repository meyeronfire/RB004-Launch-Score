import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type postgres from "postgres";

const mocks = vi.hoisted(() => ({ sql: undefined as unknown }));
vi.mock("../lib/store", () => ({ database: () => mocks.sql }));
import { addPaidModelCost, emailIdentity, hashOpaqueToken, newOpaqueToken, reserveFreeScan, verifyFreeMagicLink } from "../lib/free-tier";

type Queryable = { query: (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
function tag(client: Queryable) {
  return async (parts: TemplateStringsArray, ...values: unknown[]) => client.query(parts.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, ""), values).then((result) => result.rows);
}

let db: PGlite;
const email = "person@example.test";
const emailHash = emailIdentity(email);
const previousFreeBudget = process.env.FREE_DAILY_BUDGET_USD;

async function seed(scansUsed: number | null, linked = false) {
  const scanId = `scan-${newOpaqueToken()}`;
  const token = newOpaqueToken();
  if (scansUsed !== null) await db.query("INSERT INTO free_scan_entitlements(email_hash,email,scans_used) VALUES($1,$2,$3)", [emailHash, email, scansUsed]);
  await db.query("INSERT INTO free_scan_claims(scan_id,device_hash,ip_hash,email_hash) VALUES($1,'device','ip',$2)", [scanId, linked ? emailHash : null]);
  await db.query("INSERT INTO free_scan_magic_links(token_hash,email_hash,email,device_hash,ip_hash,first_scan_id,expires_at) VALUES($1,$2,$3,'device','ip',$4,now()+interval '1 hour')", [hashOpaqueToken(token), emailHash, email, scanId]);
  return { scanId, token };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/001_initial.sql", "utf8"));
  await db.exec(await readFile("db/migrations/002_free_tier_costs.sql", "utf8"));
  await db.exec("CREATE FUNCTION public.pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'; SET search_path TO public,pg_catalog;");
  const sql = Object.assign(tag(db), { begin: (callback: (tx: ReturnType<typeof tag>) => Promise<unknown>) => db.transaction((tx) => callback(tag(tx))) });
  mocks.sql = sql as ReturnType<typeof postgres>;
});

beforeEach(async () => {
  process.env.FREE_DAILY_BUDGET_USD = "100";
  await db.exec("TRUNCATE free_scan_magic_links,free_scan_sessions,free_scan_claims,free_scan_entitlements CASCADE");
});
afterAll(async () => {
  await db.close();
  if (previousFreeBudget === undefined) delete process.env.FREE_DAILY_BUDGET_USD;
  else process.env.FREE_DAILY_BUDGET_USD = previousFreeBudget;
});

describe("email free-scan entitlement transactions", () => {
  it("counts a fresh anonymous claim against an existing email's lifetime limit", async () => {
    const { scanId, token } = await seed(2);
    const result = await verifyFreeMagicLink(token);
    expect(result?.exhausted).toBe(false);
    expect((await db.query("SELECT scans_used FROM free_scan_entitlements WHERE email_hash=$1", [emailHash])).rows).toEqual([{ scans_used: 3 }]);
    expect((await db.query("SELECT email_hash FROM free_scan_claims WHERE scan_id=$1", [scanId])).rows).toEqual([{ email_hash: emailHash }]);
  });

  it("refuses to attach another anonymous scan after the email has reached three", async () => {
    const { token } = await seed(3);
    const result = await verifyFreeMagicLink(token);
    expect(result).toEqual({ exhausted: true });
    expect((await db.query("SELECT email_hash FROM free_scan_claims")).rows).toEqual([{ email_hash: null }]);
  });

  it("does not charge the same first scan twice when a verified email signs in again", async () => {
    const { token } = await seed(2, true);
    const result = await verifyFreeMagicLink(token);
    expect(result?.exhausted).toBe(false);
    expect((await db.query("SELECT scans_used FROM free_scan_entitlements WHERE email_hash=$1", [emailHash])).rows).toEqual([{ scans_used: 2 }]);
  });

  it("starts a new email's lifetime count at its linked anonymous scan", async () => {
    const { token } = await seed(null);
    const result = await verifyFreeMagicLink(token);
    expect(result?.exhausted).toBe(false);
    expect((await db.query("SELECT scans_used FROM free_scan_entitlements WHERE email_hash=$1", [emailHash])).rows).toEqual([{ scans_used: 1 }]);
  });

  it("bypasses identity quotas for host access while reserving the daily budget", async () => {
    const scanId = "22222222-2222-4222-8222-222222222222";
    await db.query("INSERT INTO free_scan_claims(scan_id,device_hash,ip_hash,reserved_usd) VALUES('prior-claim','same-device','same-ip',0)");

    const result = await reserveFreeScan({ scanId, device: "same-device", ip: "same-ip", skipIdentityLimits: true });

    expect(result).toMatchObject({ allowed: true, budgetPaused: false });
    const claim = await db.query("SELECT device_hash,ip_hash,reserved_usd FROM free_scan_claims WHERE scan_id=$1", [scanId]);
    expect(claim.rows[0]).toMatchObject({ reserved_usd: "0.050000" });
    expect(claim.rows[0]).not.toMatchObject({ device_hash: "same-device", ip_hash: "same-ip" });
  });

  it("still blocks host access when the shared daily cost budget is exhausted", async () => {
    process.env.FREE_DAILY_BUDGET_USD = "0";
    const scanId = "33333333-3333-4333-8333-333333333333";

    const result = await reserveFreeScan({ scanId, device: "device", ip: "ip", skipIdentityLimits: true });

    expect(result).toMatchObject({ allowed: false, budgetPaused: true });
    expect((await db.query("SELECT scan_id FROM free_scan_claims WHERE scan_id=$1", [scanId])).rows).toEqual([]);
  });

  it("fails closed for host access when the budget database is unavailable", async () => {
    const configuredSql = mocks.sql;
    mocks.sql = undefined;
    try {
      const result = await reserveFreeScan({ scanId: "44444444-4444-4444-8444-444444444444", device: "device", ip: "ip", skipIdentityLimits: true });
      expect(result).toMatchObject({ allowed: false, budgetPaused: true });
    } finally {
      mocks.sql = configuredSql;
    }
  });

  it("records a paid prompt cost once even when a worker retries after saving", async () => {
    const scanId = "11111111-1111-4111-8111-111111111111";
    await db.query("INSERT INTO scans(id,url,status,phase,payload) VALUES($1,'https://example.test/','complete','Ready','{}')", [scanId]);
    await db.query("INSERT INTO scan_costs(scan_id,paid) VALUES($1,true)", [scanId]);
    await addPaidModelCost({ scanId, inputTokens: 1000, outputTokens: 1000, model: "gpt-4.1" });
    await addPaidModelCost({ scanId, inputTokens: 1000, outputTokens: 1000, model: "gpt-4.1" });
    expect((await db.query("SELECT estimated_usd FROM paid_prompt_costs WHERE scan_id=$1", [scanId])).rows).toEqual([{ estimated_usd: "0.002000" }]);
    expect((await db.query("SELECT input_tokens,output_tokens FROM scan_costs WHERE scan_id=$1", [scanId])).rows).toEqual([{ input_tokens: 1000, output_tokens: 1000 }]);
  });
});
