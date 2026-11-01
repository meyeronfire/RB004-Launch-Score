import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import postgres from "postgres";
import type { ScanRecord } from "./types";

let sqlClient: ReturnType<typeof postgres> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) return undefined;
  sqlClient ??= postgres(process.env.DATABASE_URL, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  return sqlClient;
}
const scanDir = path.join(process.cwd(), "data", "scans");
function fileFor(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid scan id"); return path.join(scanDir, `${id}.json`); }

export async function saveScan(scan: ScanRecord, expectedLease?: string) {
  const sql = database();
  if (sql) {
    const rows = await sql`INSERT INTO scans (id,url,status,phase,created_at,updated_at,payload,is_paid,content_hash,lease_token)
      VALUES (${scan.id},${scan.url},${scan.status},${scan.phase},${scan.createdAt},${scan.updatedAt},${sql.json(scan)},${scan.paid ?? false},${scan.cacheKey ?? null},${scan.leaseToken ?? null})
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,phase=EXCLUDED.phase,updated_at=EXCLUDED.updated_at,payload=EXCLUDED.payload,is_paid=scans.is_paid OR EXCLUDED.is_paid,content_hash=COALESCE(EXCLUDED.content_hash,scans.content_hash)
      WHERE scans.lease_token IS NOT DISTINCT FROM ${expectedLease ?? null} RETURNING id`;
    if (!rows.length) throw new Error("Scan lease changed before this worker could save results.");
  } else {
    await mkdir(scanDir, { recursive: true });
    const target = fileFor(scan.id); const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(scan), { mode: 0o600 }); await rename(temp, target);
  }
}

export async function readScan(id: string): Promise<ScanRecord | undefined> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return undefined;
  const sql = database();
  if (sql) {
    const rows = await sql<{ payload: ScanRecord; is_paid: boolean; lease_token: string | null }[]>`SELECT payload,is_paid,lease_token FROM scans WHERE id=${id} LIMIT 1`;
    const row = rows[0]; if (!row) return undefined;
    return { ...row.payload, paid: row.is_paid, leaseToken: row.lease_token ?? undefined };
  }
  try { return JSON.parse(await readFile(fileFor(id), "utf8")) as ScanRecord; } catch { return undefined; }
}

export async function updateScan(id: string, update: (current: ScanRecord) => ScanRecord, expectedLease?: string) {
  const current = await readScan(id); if (!current) return undefined;
  if (expectedLease !== undefined && current.leaseToken !== expectedLease) return undefined;
  const next = update(current); await saveScan(next, expectedLease); return next;
}

export async function claimNextScan() {
  const sql = database();
  if (sql) {
    const leaseToken = randomUUID();
    const rows = await sql<{ id: string; lease_token: string }[]>`WITH candidate AS (
      SELECT id FROM scans WHERE status='queued' OR (status='scanning' AND (lease_expires_at IS NULL OR lease_expires_at < now()))
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE scans SET status='scanning',phase='Starting scan…',updated_at=now(),lease_token=${leaseToken},lease_expires_at=now()+interval '2 minutes',
      payload=jsonb_set(jsonb_set(jsonb_set(payload,'{status}','"scanning"'::jsonb),'{phase}','"Starting scan…"'::jsonb),'{leaseToken}',to_jsonb(${leaseToken}::text))
      FROM candidate WHERE scans.id=candidate.id RETURNING scans.id,scans.lease_token`;
    return rows[0] ? { id: rows[0].id, leaseToken: rows[0].lease_token } : undefined;
  }
  await mkdir(scanDir, { recursive: true });
  const files = await readdir(scanDir);
  for (const file of files) if (file.endsWith(".json")) {
    const scan = await readScan(file.slice(0, -5));
    if (scan && scan.status === "queued") return { id: scan.id, leaseToken: undefined };
  }
  return undefined;
}

export async function findCachedScan(url: string, cacheKey: string) {
  const sql = database();
  if (sql) {
    const rows = await sql<{ payload: ScanRecord }[]>`SELECT payload FROM scans WHERE url=${url} AND content_hash=${cacheKey} AND status='complete' AND updated_at > now()-interval '24 hours' ORDER BY updated_at DESC LIMIT 1`;
    return rows[0]?.payload;
  }
  await mkdir(scanDir, { recursive: true });
  for (const file of await readdir(scanDir)) if (file.endsWith(".json")) {
    const record = await readScan(file.slice(0, -5));
    if (record?.status === "complete" && record.url === url && record.cacheKey === cacheKey && Date.now() - Date.parse(record.updatedAt) < 24 * 60 * 60 * 1000) return record;
  }
  return undefined;
}

export async function workerHeartbeat(workerId: string) {
  const sql = database(); if (!sql) throw new Error("A database is required for the scan worker.");
  await sql`INSERT INTO worker_heartbeats (worker_id,seen_at) VALUES (${workerId},now()) ON CONFLICT (worker_id) DO UPDATE SET seen_at=now()`;
}

export async function hasLiveWorker() {
  const sql = database(); if (!sql) return false;
  const rows = await sql<{ ready: boolean }[]>`SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE seen_at > now()-interval '30 seconds') AS ready`;
  return Boolean(rows[0]?.ready);
}

export function publicScan(scan: ScanRecord) {
  const safe = { ...scan };
  delete safe.paidPayload; delete safe.leadEmail; delete safe.paid; delete safe.cacheKey; delete safe.leaseToken;
  return { ...safe,
    paidAvailable: Boolean(scan.paidPayload?.available),
    findings: (scan.findings ?? []).slice(0, 3).map(({ id, category, severity, title, why_it_matters }) => ({ id, category, severity, title, why_it_matters })),
    categoryCoverage: scan.categoryCoverage,
    lockedCount: Math.max(0, (scan.findings?.length ?? 0) - 3),
    lockedTitles: (scan.findings ?? []).slice(3).map(({ title }) => title),
  };
}
