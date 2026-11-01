import { ADMIN_COOKIE, adminCookieToken } from "@/lib/admin-auth";
import { readBoundedBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const limit = await rateLimit(request, "admin-login");
  if (limit.misconfigured || !limit.allowed) return Response.json({ error: "Admin access could not be verified." }, { status: limit.misconfigured ? 503 : 429 });
  const body = await readBoundedBody(request, 1024);
  let input: unknown; try { input = JSON.parse(body.body ?? ""); } catch { input = undefined; }
  const secret = input && typeof input === "object" && typeof (input as { secret?: unknown }).secret === "string" ? (input as { secret: string }).secret : "";
  const expected = process.env.ADMIN_SECRET ? createHash("sha256").update(process.env.ADMIN_SECRET).digest() : Buffer.alloc(32);
  const actual = createHash("sha256").update(secret.slice(0,512)).digest();
  if (!process.env.ADMIN_SECRET || !secret || secret.length > 512 || !timingSafeEqual(actual, expected)) return Response.json({ error: "Admin access could not be verified." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${ADMIN_COOKIE}=${adminCookieToken()}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=28800${secure}` } });
}
