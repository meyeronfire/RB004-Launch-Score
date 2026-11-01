import Link from "next/link";
import { RELEASE_CODE, PRODUCT_NAME } from "@/config/release";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main>
    <header className="wrap masthead"><Link className="brand" href="/"><span className="brand-mark">{RELEASE_CODE}</span><span>{PRODUCT_NAME}</span></Link><span className="mast-meta">A REGULAR BASIS RELEASE · BERLIN</span></header>
    <article className="wrap legal-content"><h1>{title}</h1><p className="mono legal-date">LAST UPDATED · 31 OCTOBER 2026</p>{children}</article>
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Legal pages"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund">Refunds</Link><Link href="/">Back to {PRODUCT_NAME}</Link></nav></footer>
  </main>;
}
