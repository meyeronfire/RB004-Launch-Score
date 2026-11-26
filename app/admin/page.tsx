import { cookies } from "next/headers";
import { AdminLogin } from "@/components/admin-login";
import { AdminFounderPreview } from "@/components/admin-founder-preview";
import { adminMetrics, adminRecentScans } from "@/lib/free-tier";
import { recentScanFailure } from "@/lib/browser-request-policy";
import { ADMIN_COOKIE, validAdminCookie } from "@/lib/admin-auth";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!validAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value)) return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE</span></header><section className="admin-login-wrap"><h1>Launch Score Admin.</h1><p>Private operations overview.</p><AdminLogin /></section></main>;
  let metrics: Awaited<ReturnType<typeof adminMetrics>> | undefined;
  let recentScans: Awaited<ReturnType<typeof adminRecentScans>> = [];
  try { [metrics, recentScans] = await Promise.all([adminMetrics(), adminRecentScans()]); } catch { return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE</span></header><section className="admin-login-wrap"><h1>Dashboard unavailable.</h1><p>Try again when reporting is available.</p></section></main>; }
  const entries = [["Scans today", metrics.scans_today], ["Scans this month", metrics.scans_month], ["Scans all time", metrics.scans_total], ["Completed scans", metrics.scans_completed_total], ["Emails collected · unique", metrics.emails_collected], ["Estimated spend today", `${Number(metrics.spend_today).toFixed(3)}`], ["Estimated spend this month", `${Number(metrics.spend_month).toFixed(3)}`], ["Paid conversions today", metrics.paid_conversions_today], ["Paid conversions this month", metrics.paid_conversions_month]] as const;
  const displayTarget = (value: string) => { try { const url = new URL(value); return `${url.host}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } };
  return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE · ADMIN</span></header><section className="admin-login-wrap"><h1>Operations.</h1><div className="admin-metrics">{entries.map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><AdminFounderPreview /><section className="admin-recent-scans"><h2>Recent scans</h2><div className="admin-scan-table-wrap"><table className="admin-scan-table"><thead><tr><th>Started</th><th>Scanned URL</th><th>Status</th><th>Score</th></tr></thead><tbody>{recentScans.map((scan) => { const failure = recentScanFailure(scan); return <tr key={scan.id}><td>{new Date(scan.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}</td><td className="admin-scan-url">{failure ? <a href={failure.reportHref}>{displayTarget(scan.url)}</a> : scan.status === "complete" ? <a href={`/r/${scan.id}`}>{displayTarget(scan.url)}</a> : displayTarget(scan.url)}</td><td>{failure ? <span className="admin-scan-status"><span>failed</span><span className="admin-scan-reason">{failure.reason}</span><a href={failure.retryHref}>Retry scan</a></span> : scan.status}</td><td>{scan.score ?? "—"}</td></tr>; })}</tbody></table>{recentScans.length === 0 && <p>No scans yet.</p>}</div></section></section></main>;
}
