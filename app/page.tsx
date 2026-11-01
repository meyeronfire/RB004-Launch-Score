import Link from "next/link";
import { RELEASE_CODE, PRODUCT_NAME, PRICE_FIX_PROMPT_USD } from "@/config/release";
import { ScanForm } from "@/components/scan-form";
import { exampleReport } from "@/lib/example";
import { HeroReportPreview } from "@/components/hero-report-preview";
import { PricingActions } from "@/components/landing-actions";
import { GlassCard } from "@/components/glass-card";

const checks = [
  ["Clarity", "Can a stranger understand what you offer, who it is for, and why it matters?"],
  ["Conversion", "Does the page make the next step obvious, compelling, and easy to take?"],
  ["Trust", "Do proof, pricing, and answers give someone a reason to believe and continue?"],
  ["Technical", "What do Lighthouse and the rendered page report on mobile and desktop?"],
  ["Design & Brand", "Lighthouse checks speed. We also check if it looks like a real product."],
  ["Security", "Are transport, headers, exposed files, and browser-delivered secrets checked?"],
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const rescanUrl = typeof query.url === "string" ? query.url : "";
  const exampleUpdated = exampleReport.scoringVersion === 2 && Object.keys(exampleReport.categoryScores ?? {}).length === 6;
  return <main>
    <header className="wrap masthead">
      <Link className="brand" href="https://regularbasis.studio"><span className="brand-mark">{RELEASE_CODE}</span><span>{PRODUCT_NAME}</span></Link>
      <span className="mast-meta">A REGULAR BASIS RELEASE · BERLIN</span>
    </header>
    <section className="wrap hero" aria-labelledby="hero-title">
      <div className="hero-content">
        <h1 id="hero-title">Will Your Launch Page Convert a <em>Stranger?</em></h1>
        <p className="hero-sub">Everything Lighthouse checks — plus whether your page actually convinces.</p>
        <ScanForm initialUrl={rescanUrl} />
        <p className="microcopy">FREE · ABOUT 60 SECONDS · NO SIGNUP</p>
      </div>
      <HeroReportPreview />
    </section>
    <section className="wrap editorial" aria-labelledby="checks-title">
      <div className="section-head"><h2 id="checks-title">A Closer Look at the First Impression.</h2><p>Not another SEO checklist. We render your page and look at the details that help a new visitor decide.</p></div>
      <ol className="check-list">{checks.map(([title, copy], i) => <li key={title}><span className="check-num">0{i + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
    </section>
    <section className="wrap editorial" aria-labelledby="example-title">
      <div className="section-head"><h2 id="example-title">See What Comes Back.</h2><p>A real format preview, clearly marked as an example.</p></div>
        <GlassCard as={Link} className="example example-block-link" href="/r/example" aria-label="Read the full example report from regularbasis.studio, scanned 31 October 2026" shellClassName="example-glass-shell">
        <div className="example-score" aria-label={`Example score ${exampleReport.score} of 100`}>{exampleReport.score}<span>/100</span></div>
        <div className="example-copy"><span className="example-label">EXAMPLE REPORT · REGULARBASIS.STUDIO · 31 OCT 2026</span><h3>A real scan of the Regular Basis studio site.</h3><p>{exampleUpdated ? "See how the six-category review connects visible evidence to practical fixes." : "This saved example predates the six-category update. New scans include Design & Brand, plus the checks that can be verified on desktop and mobile."}</p><span className="example-link">Read the example report <span aria-hidden="true">→</span></span></div>
        </GlassCard>
    </section>
    <section className="wrap editorial" aria-labelledby="pricing-title">
      <div className="section-head"><h2 id="pricing-title">Start Free. Go Deeper When It Helps.</h2><p>One URL at a time. No account needed for a score.</p></div>
      <div className="pricing">
        <GlassCard as="article" className="price-item" shellClassName="pricing-glass-shell"><h3>Free Report</h3><p className="price">$0 · NO SIGNUP</p><p>Get your overall score, six category scores, and the three issues with the biggest impact.</p><ul><li>Desktop and mobile review</li><li>Shareable score card</li><li>Evidence-backed findings</li></ul><PricingActions kind="free" /></GlassCard>
        <GlassCard as="article" className="price-item" accent shellClassName="pricing-glass-shell pricing-glass-shell--accent"><h3>Fix Prompt</h3><p className="price">${PRICE_FIX_PROMPT_USD} · ONE-TIME</p><p className="price-once mono">Pay once per URL. No subscription.</p><p>Get the full ranked report and a copy-ready prompt shaped around your page and tools.</p><ul><li>All findings, ranked by impact</li><li>Three headline options and page copy</li><li>Unlimited re-scans of that URL for seven days</li><li>Separate prompts for Cursor, Claude Code, Lovable, Bolt, v0, and Codex</li></ul><PricingActions kind="paid" /></GlassCard>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="faq-title">
      <div className="faq-layout">
        <div className="faq-intro"><h2 id="faq-title">A Few Useful Answers.</h2><p>Clear expectations make better reviews.</p></div>
        <div className="faq-list">
          <details className="faq-item" open><summary>Why not just ask ChatGPT?</summary><p>{PRODUCT_NAME} renders the live page, measures what it can, and checks the experience on desktop and mobile. The fix prompt uses evidence and stack hints from that page.</p></details>
          <details className="faq-item"><summary>What does the score mean?</summary><p>It combines clarity, conversion, design, trust, technical, and security checks. Every score is based on findings we could verify; unavailable checks stay unknown.</p></details>
          <details className="faq-item"><summary>Do I need an account?</summary><p>No account is needed for a free scan. The full Fix Prompt is a one-time purchase for the URL you scanned.</p></details>
          <details className="faq-item"><summary>Can every page be checked?</summary><p>The page must be publicly accessible. Private, sign-in protected, or blocked pages cannot be scanned.</p></details>
          <details className="faq-item"><summary>What do I get for $12?</summary><p>The full ranked findings, suggested page copy, headline options, and a copy-ready fix prompt for the tool you use.</p></details>
          <details className="faq-item"><summary>Can I re-scan after fixing?</summary><p>A re-check is coming soon. There is no date to promise yet.</p></details>
        </div>
      </div>
    </section>
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Regular Basis releases"><a href="https://www.getklare.com/">RB001</a><a href="https://epkay.com/">RB002</a><a href="https://urtype.app/">RB003</a><a href="/terms">TERMS</a><a href="/privacy">PRIVACY</a><a href="/refund">REFUNDS</a><a href="https://regularbasis.studio">REGULAR BASIS</a></nav></footer>
  </main>;
}
