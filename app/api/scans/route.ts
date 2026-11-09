import { createScan, ScanAdmissionError } from "@/lib/scanner";
import { clientIpHash, isObviousBot, rateLimit } from "@/lib/rate-limit";
import { normalizePublicUrl, UnsafeTargetError } from "@/lib/ssrf";
import { findCachedScan, grantPaidCacheAccess, hasLiveWorker } from "@/lib/store";
import { isOwnerScanTarget } from "@/lib/owner-scan-access";
import { cookieValue, DEVICE_COOKIE, deviceHash, FREE_SESSION_COOKIE, newOpaqueToken, freeStatus, PAID_RESCAN_COOKIE } from "@/lib/free-tier";
import { ACCESS_COOKIE, verifyPaidRescanToken } from "@/lib/payments";
import { enqueuePaidPrompt } from "@/lib/paid-prompt";
import { readBoundedBody } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) return Response.json({ error: "Scanning is temporarily unavailable. Please try again later." }, { status: 503 });
  if (isObviousBot(request.headers.get("user-agent"))) return Response.json({ error: "Automated scan requests are not accepted." }, { status: 403 });
  const body = await readBoundedBody(request, 4096);
  if (body.error === "too_large") return Response.json({ error: "Enter a page URL under 4 KB." }, { status: 413 });
  let payload: unknown; try { payload = JSON.parse(body.body ?? ""); } catch { return Response.json({ error: "Enter a valid page URL." }, { status: 400 }); }
  if (payload && typeof payload === "object" && typeof (payload as { website?: unknown }).website === "string" && (payload as { website: string }).website.trim()) return Response.json({ error: "Enter a page URL." }, { status: 400 });
  if (!payload || typeof payload !== "object" || typeof (payload as { url?: unknown }).url !== "string" || (payload as { url: string }).url.length > 2048) return Response.json({ error: "Enter a complete page URL, including https://." }, { status: 400 });
  const rawIpHash = clientIpHash(request); if (!rawIpHash) return Response.json({ error: "Scanning is temporarily unavailable. Please try again later." }, { status: 503 });
  const existingDevice = cookieValue(request, DEVICE_COOKIE);
  const deviceToken = /^[a-zA-Z0-9_-]{30,60}$/.test(existingDevice) ? existingDevice : newOpaqueToken();
  const clientDeviceHash = deviceHash(deviceToken);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const deviceCookie = existingDevice ? "" : `${DEVICE_COOKIE}=${encodeURIComponent(deviceToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
  try {
    const target = normalizePublicUrl((payload as { url: string }).url);
    const ownerBypass = isOwnerScanTarget(target);
    const cached = await findCachedScan(target.toString());
    const rescanToken = cookieValue(request, PAID_RESCAN_COOKIE);
    const paidAccess = rescanToken ? await verifyPaidRescanToken(rescanToken, undefined, target.toString()) : undefined;
    if (paidAccess && cached && !cached.paid) {
      await grantPaidCacheAccess(cached.id, paidAccess.expires_at.toISOString());
      cached.paid = true;
      await enqueuePaidPrompt(cached.id);
    }
    const canUseCache = Boolean(cached);
    if (!canUseCache && process.env.NODE_ENV === "production" && !(await hasLiveWorker())) return Response.json({ error: "Scanning is temporarily unavailable. Please try again later." }, { status: 503 });
    // Readiness failures must not use a visitor's hourly request allowance. The recovery namespace clears slots consumed by the broken attempts.
    const limit = await rateLimit(request, "scan-recovery-20261109");
    if (limit.misconfigured) return Response.json({ error: "Scanning is temporarily unavailable. Please try again later." }, { status: 503 });
    if (!limit.allowed) return Response.json({ error: "That’s 20 scan requests in the past hour. Please try again later." }, { status: 429, headers: { "Retry-After": "3600" } });
    const scan = cached ?? await createScan(target.toString(), { paid: Boolean(paidAccess), paidRescanExpiresAt: paidAccess?.expires_at.toISOString(), freeAdmission: paidAccess ? undefined : { device: clientDeviceHash, ip: rawIpHash, sessionToken: ownerBypass ? undefined : cookieValue(request, FREE_SESSION_COOKIE) || undefined, skipIdentityLimits: ownerBypass } });
    const status = ownerBypass || paidAccess ? undefined : await freeStatus({ device: clientDeviceHash, ip: rawIpHash, sessionToken: cookieValue(request, FREE_SESSION_COOKIE) || undefined });
    const response = Response.json({ id: scan.id, status: scan.status, remaining: status?.remaining ?? null, cached: canUseCache }, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (deviceCookie) response.headers.append("Set-Cookie", deviceCookie);
    if (paidAccess && rescanToken) response.headers.append("Set-Cookie", `${ACCESS_COOKIE}${scan.id}=${encodeURIComponent(rescanToken)}; Path=/api/scans/${scan.id}/paid; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
    return response;
  } catch (error) {
    if (error instanceof ScanAdmissionError) {
      const response = Response.json({ code: error.code, error: error.message }, { status: error.code === "email_required" ? 402 : 429, headers: error.code === "free_paused" ? { "Retry-After": "86400" } : undefined });
      if (deviceCookie) response.headers.append("Set-Cookie", deviceCookie);
      return response;
    }
    if (error instanceof UnsafeTargetError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "A scan could not be started. Please try again." }, { status: 503 });
  }
}
