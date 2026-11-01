import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { database, readScan } from "@/lib/store";
import { readBoundedBody } from "@/lib/http";
import { SITE_URL, PRODUCT_NAME } from "@/config/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LeadSchema = z.object({ scanId: z.string().uuid(), email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  const limit = await rateLimit(request, "lead");
  if (limit.misconfigured) return Response.json({ error: "Lead capture is not configured for this deployment." }, { status: 503 });
  if (!limit.allowed) return Response.json({ error: "Too many email requests. Try again tomorrow." }, { status: 429 });
  const body = await readBoundedBody(request, 2048); if (body.error === "too_large") return Response.json({ error: "Email request was too large." }, { status: 413 });
  let payload: unknown; try { payload = JSON.parse(body.body ?? ""); } catch { return Response.json({ error: "Enter a valid email address." }, { status: 400 }); }
  const parsed = LeadSchema.safeParse(payload); if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const scan = await readScan(parsed.data.scanId); if (!scan || scan.status !== "complete") return Response.json({ error: "This report is not ready." }, { status: 404 });
  const email = parsed.data.email.toLowerCase(); const sql = database();
  if (process.env.NODE_ENV === "production" && !sql) return Response.json({ error: "Email saving is unavailable because the report database is not configured." }, { status: 503 });
  try {
    if (sql) await sql`INSERT INTO leads (scan_id,url,email,score) VALUES (${scan.id},${scan.url},${email},${scan.score ?? null}) ON CONFLICT (scan_id,email) DO NOTHING`;
    else { const dir = path.join(process.cwd(), "data"); await mkdir(dir, { recursive: true }); await appendFile(path.join(dir, "leads.jsonl"), `${JSON.stringify({ scanId: scan.id, url: scan.url, email, score: scan.score ?? null, createdAt: new Date().toISOString() })}\n`, { mode: 0o600 }); }
    let emailed = false;
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const reportUrl = `${SITE_URL.replace(/\/$/, "")}/r/${encodeURIComponent(scan.id)}`;
      try {
        const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, signal: AbortSignal.timeout(7000), body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [email], subject: `Your ${PRODUCT_NAME} report for ${scan.domain ?? "your page"}`, text: `Your ${PRODUCT_NAME} report is ready: ${reportUrl}\n\nThis link contains your free report.`, html: `<p>Your ${PRODUCT_NAME} report is ready.</p><p><a href="${reportUrl}">Open your report</a></p><p>This link contains your free report.</p>` }) });
        emailed = response.ok;
      } catch { emailed = false; }
    }
    return Response.json({ saved: true, emailed }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Your email could not be saved. Please try again." }, { status: 503 }); }
}
