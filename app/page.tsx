import Link from "next/link";
import { RELEASE_CODE, PRODUCT_NAME, PRICE_FIX_PROMPT_USD } from "@/config/release";
import { ScanForm } from "@/components/scan-form";
import { exampleReport } from "@/lib/example";
import { HeroReportPreview } from "@/components/hero-report-preview";
import { PricingActions } from "@/components/landing-actions";
import { GlassCard } from "@/components/glass-card";

import { ChromeRibbon } from "@/components/chrome-ribbon";
import { ScrollReveal } from "@/components/scroll-reveal";

const checks = [
  ["Clarity", "Offer, audience, headline, and the first action", "Can a new visitor tell what the product does and why it matters?"],
  ["Conversion", "Calls to action, forms, and mobile interactions", "Are the next steps clear, reachable, and usable?"],
  ["Design & Brand", "Visual hierarchy, spacing, typography, and contrast", "Does the page feel coherent and readable across screen sizes?"],
  ["Trust", "Proof, pricing, FAQs, and contact paths", "Can visitors find the details they need before they commit?"],
  ["Technical", "Performance, page response, links, and mobile fit", "What do the browser capture and available Lighthouse measurements show?"],
  ["Security", "HTTPS, response headers, exposed files, and public bundles", "Which visible baseline protections could be confirmed?"],
  ["SEO / AEO", "Indexing, metadata, canonical URL, sitemap, and structured data", "Can search and answer engines discover and interpret the page?"],
];

const reportDetails = [
  { title: "Search & answer readiness", text: "See recorded title and description signals, canonical alignment, robots directives, sitemap checks, structured data, and answer-ready content." },
  { title: "Linked pages sampled", text: "The scan checks up to four prioritized same-site links for basic page signals. It is a useful sample, not a full site crawl." },
  { title: "Performance evidence", text: "Review browser capture timings and, when available, separate mobile and desktop Lighthouse results with their limits clearly labeled." },
  { title: "AI crawler access", text: "See robots.txt policies and selected crawler reachability signals where the scan can verify them. Training preferences stay separate from access." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const rescanUrl = typeof query.url === "string" ? query.url : "";
  const exampleUpdated = exampleReport.scoringVersion === 3 && Object.keys(exampleReport.categoryScores ?? {}).length === 7;
  return <main className="landing-page">
    <ScrollReveal selectors=".editorial, .check-list li, .price-item, .faq-item, .example-block-link" />
    <div className="landing-stage">
      <ChromeRibbon className="chrome-ribbon--stage" />
      <header className="wrap masthead">
        <Link className="brand" href="https://regularbasis.studio"><span className="brand-name">Ready for Real<span className="brand-dot">.</span></span><span className="brand-sub">Launch Readiness</span></Link>
        <span className="mast-meta">A REGULAR BASIS RELEASE · BERLIN</span>
      </header>
      <section className="wrap hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title">Will Your Launch Page Convert a <em>Stranger?</em></h1>
          <p className="hero-sub">The launch score for vibe-coded apps.</p>
          <ScanForm initialUrl={rescanUrl} />
          <p className="microcopy">FREE · ABOUT 60 SECONDS · NO SIGNUP</p>
        </div>
        <HeroReportPreview />
      </section>
    </div>
    <section className="wrap editorial" aria-labelledby="checks-title">
      <div className="section-head"><h2 id="checks-title">Seven views of your launch page.</h2><p>One report connects the first impression to the details behind it, with each finding tied to recorded evidence.</p></div>
      <ol className="check-list">{checks.map(([title, signal, copy], i) => <li key={title} data-check={i}><span className="check-num" aria-hidden="true">0{i + 1}</span><div className="check-copy"><h3>{title}</h3><p className="check-signal">{signal}</p></div><p>{copy}</p></li>)}</ol>
    </section>
    <section className="wrap editorial report-depth" aria-labelledby="depth-title">
      <div className="section-head"><h2 id="depth-title">More than a score.</h2><p>Open the report to see where the result came from: page evidence, technical signals, and what still needs a human check.</p></div>
      <div className="report-depth-grid">{reportDetails.map(({ title, text }) => <GlassCard as="article" key={title} className="report-depth-card" shellClassName="report-depth-shell"><h3>{title}</h3><p>{text}</p></GlassCard>)}</div>
      <p className="report-depth-note mono">CHECKS VARY BY PAGE · UNKNOWN RESULTS STAY UNKNOWN · NO FULL-SITE CRAWL CLAIM</p>
    </section>
    <section className="wrap editorial launch-journey" aria-labelledby="journey-title">
      <div className="section-head"><h2 id="journey-title">From scan to launch.</h2><p>Use Ready for Real to find what matters, make a practical plan, then hand your coding agent a prompt built around the evidence.</p></div>
      <div className="launch-journey-grid">
        <article><span className="mono">SCAN</span><h3>See what the page shows today.</h3><p>Start with a free report and every finding the scan recorded.</p></article>
        <article><span className="mono">PLAN</span><h3>Choose what to do next.</h3><p>Get the findings prioritized, plus owner checks the public scan cannot verify.</p></article>
        <article><span className="mono">BUILD</span><h3>Give your agent the full brief.</h3><p>Copy a tool-specific prompt with evidence, acceptance criteria, and regression guidance.</p></article>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="example-title">
      <div className="section-head"><h2 id="example-title">See What Comes Back.</h2><p>A real format preview, clearly marked as an example.</p></div>
        <GlassCard as={Link} className="example example-block-link" href="/r/example" aria-label="Read the full example report from regularbasis.studio, scanned 31 October 2026" shellClassName="example-glass-shell">
        <div className="example-score" aria-label={`Example score ${exampleReport.score} of 100`}>{exampleReport.score}<span>/100</span></div>
        <div className="example-copy"><span className="example-label">EXAMPLE REPORT · REGULARBASIS.STUDIO · 31 OCT 2026</span><h3>A real scan of the Regular Basis studio site.</h3><p>{exampleUpdated ? "See how the seven-category review connects visible evidence to practical fixes." : "This saved example predates the SEO/AEO category. New scans include it and show each check's recorded status."}</p><span className="example-link">Read the example report <span aria-hidden="true">→</span></span></div>
        </GlassCard>
    </section>
    <section className="wrap editorial" aria-labelledby="pricing-title">
      <div className="section-head"><h2 id="pricing-title">Start Free. Go Deeper When It Helps.</h2><p>Your score and findings are free. Unlock a personalized launch plan and complete coding-agent brief with one payment per URL.</p></div>
      <div className="pricing">
        <GlassCard as="article" className="price-item" shellClassName="pricing-glass-shell"><h3>Free Report</h3><p className="price">$0 · FIRST SCAN, NO SIGNUP</p><p>Get your overall score, seven category scores, and all recorded findings, with the three highest-priority items highlighted.</p><ul><li>Desktop and mobile review</li><li>Shareable score card</li><li>Evidence-backed findings</li></ul><PricingActions kind="free" /></GlassCard>
        <GlassCard as="article" className="price-item" accent shellClassName="pricing-glass-shell pricing-glass-shell--accent"><h3>Launch Plan + Agent Brief</h3><p className="price">${PRICE_FIX_PROMPT_USD} · ONE-TIME</p><p className="price-once mono">Pay once per URL. No subscription.</p><p>Turn the scan into ordered next steps, an owner checklist, and a complete coding-agent prompt grounded in your findings.</p><ul><li>Every finding, evidence, and recommended fix</li><li>Prioritized launch checklist with local progress</li><li>Owner checks for code, data, spend, and rollback</li><li>Page-copy drafts and prompts for Cursor, Claude Code, Lovable, Bolt, v0, and Codex</li><li>Unlimited re-scans of that URL for seven days</li></ul><PricingActions kind="paid" /></GlassCard>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="faq-title">
      <div className="faq-layout">
        <div className="faq-intro"><h2 id="faq-title">A Few Useful Answers.</h2><p>Clear expectations make better reviews.</p></div>
        <div className="faq-list">
          <details className="faq-item" open><summary>Why not just ask ChatGPT?</summary><p>{PRODUCT_NAME} renders the live page, measures what it can, and checks the experience on desktop and mobile. The paid launch plan turns scan evidence into ordered fixes and a complete agent prompt.</p></details>
          <details className="faq-item"><summary>What does the score mean?</summary><p>It combines clarity, conversion, design, trust, technical, security, and SEO/AEO signals. Every score is based on findings we could verify; unavailable checks stay unknown.</p></details>
          <details className="faq-item"><summary>Do I need an account?</summary><p>You get one free scan without an account. An email link can unlock up to two more free scans. The personalized launch plan and full agent brief are a separate one-time purchase for the URL you scanned.</p></details>
          <details className="faq-item"><summary>Can every page be checked?</summary><p>The page must be publicly accessible. Private, sign-in protected, or blocked pages cannot be scanned.</p></details>
          <details className="faq-item"><summary>What do I get for ${PRICE_FIX_PROMPT_USD}?</summary><p>A personalized launch checklist, manual owner checks, the complete report with recommended fixes, page-copy options, and a full prompt for your coding agent. One payment also includes unlimited re-scans of that URL for seven days.</p></details>
          <details className="faq-item"><summary>Can I re-scan after fixing?</summary><p>Yes. The one-time purchase includes unlimited re-scans of the same URL for seven days.</p></details>
        </div>
      </div>
    </section>
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Regular Basis releases"><a href="https://www.getklare.com/">RB001</a><a href="https://epkay.com/">RB002</a><a href="https://urtype.app/">RB003</a><a href="/terms">TERMS</a><a href="/privacy">PRIVACY</a><a href="/refund">REFUNDS</a><a href="https://regularbasis.studio">REGULAR BASIS</a></nav></footer>
  </main>;
}
