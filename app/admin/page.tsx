import { cookies } from "next/headers";
import { AdminLogin } from "@/components/admin-login";
import { adminMetrics } from "@/lib/free-tier";
import { ADMIN_COOKIE, validAdminCookie } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!validAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value)) return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE</span></header><section className="admin-login-wrap"><h1>Launch Score Admin.</h1><p>Private operations overview.</p><AdminLogin /></section></main>;
  let metrics: Awaited<ReturnType<typeof adminMetrics>> | undefined;
  try { metrics = await adminMetrics(); } catch { return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE</span></header><section className="admin-login-wrap"><h1>Dashboard unavailable.</h1><p>Try again when reporting is available.</p></section></main>; }
  const entries = [["Scans today", metrics.scans_today], ["Estimated spend today", `$${Number(metrics.spend_today).toFixed(3)}`], ["Estimated spend this month", `$${Number(metrics.spend_month).toFixed(3)}`], ["Emails collected", metrics.emails_collected], ["Paid conversions today", metrics.paid_conversions_today], ["Paid conversions this month", metrics.paid_conversions_month]] as const;
  return <main className="wrap admin-page"><header className="masthead"><span className="brand-mark">RB004</span><span className="mast-meta">PRIVATE · ADMIN</span></header><section className="admin-login-wrap"><h1>Operations.</h1><div className="admin-metrics">{entries.map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></section></main>;
}
