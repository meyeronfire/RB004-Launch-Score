import Link from "next/link";
import { RELEASE_CODE, PRODUCT_NAME, PRICE_FIX_PROMPT_USD } from "@/config/release";
import { ScanForm } from "@/components/scan-form";

const checks = [
  ["Clarity", "Can a stranger understand what you offer, who it is for, and why it matters?"],
  ["Conversion", "Does the page make the next step obvious, compelling, and easy to take?"],
  ["Trust", "Do proof, pricing, and answers give someone a reason to believe and continue?"],
  ["Technical", "Does the page load, read, and behave well on desktop and mobile?"],
];

export default function Home() {
  return <main>
    <header className="wrap masthead">
      <Link className="brand" href="https://regularbasis.studio" aria-label="Regular Basis home"><span className="brand-mark">{RELEASE_CODE}</span><span>{PRODUCT_NAME}</span></Link>
      <span className="mast-meta">A REGULAR BASIS RELEASE · BERLIN</span>
    </header>
    <section className="wrap hero" aria-labelledby="hero-title">
      <div className="hero-content">
        <h1 id="hero-title">Will Your Launch Page Convert a <em>Stranger?</em></h1>
        <p className="hero-sub">The launch score for vibe-coded apps. Find out what a first-time visitor sees, understands, and trusts.</p>
        <ScanForm />
        <p className="microcopy">FREE · ABOUT 60 SECONDS · NO SIGNUP</p>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="checks-title">
      <div className="section-head"><h2 id="checks-title">A closer look at the first impression.</h2><p>Not another SEO checklist. We render your page and look at the details that help a new visitor decide.</p></div>
      <ol className="check-list">{checks.map(([title, copy], i) => <li key={title}><span className="check-num">0{i + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
    </section>
    <section className="wrap editorial" aria-labelledby="example-title">
      <div className="section-head"><h2 id="example-title">See what comes back.</h2><p>A real format preview, clearly marked as an example.</p></div>
      <div className="example" aria-label="Illustrative example report">
        <div className="example-score" aria-label="Illustrative score 78">78<span>/100</span></div>
        <div className="example-copy"><span className="example-label">EXAMPLE REPORT · ILLUSTRATIVE</span><h3>A promising first impression, with room to make the offer sharper.</h3><p>Four clear categories, the three most useful opportunities, and evidence from the page. Your score is calculated from what we can actually check.</p><p className="example-note">EXAMPLE ONLY · NOT A LIVE SCAN · 78 IS NOT A PERFORMANCE CLAIM</p></div>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="pricing-title">
      <div className="section-head"><h2 id="pricing-title">Start free. Go deeper when it helps.</h2><p>One URL at a time. No account needed for a score.</p></div>
      <div className="pricing">
        <article className="price-item"><h3>Free report</h3><p className="price">$0 · NO SIGNUP</p><p>Get your overall score, four category scores, and the three issues with the biggest impact.</p><ul><li>Desktop and mobile review</li><li>Shareable score card</li><li>Evidence-backed findings</li></ul></article>
        <article className="price-item"><h3>Fix Prompt</h3><p className="price">${PRICE_FIX_PROMPT_USD} · ONE-TIME</p><p>Get the full ranked report and a copy-ready prompt shaped around your page and tools.</p><ul><li>All findings, ranked by impact</li><li>Three headline options and page copy</li><li>Separate prompts for Cursor, Lovable, Bolt, v0, and Codex</li></ul></article>
      </div>
    </section>
    <section className="wrap editorial" aria-labelledby="faq-title">
      <div className="section-head"><h2 id="faq-title">A few useful answers.</h2><p>Clear expectations make better reviews.</p></div>
      <div className="faq-list">
        <article className="faq-item"><h3>Why not just ask ChatGPT?</h3><p>Launch Score renders the live page, measures what it can, and checks the experience on desktop and mobile. The fix prompt uses evidence and stack hints from that page.</p></article>
        <article className="faq-item"><h3>What does the score mean?</h3><p>It combines clarity, conversion, trust, and technical checks. Every score is based on findings we could verify; unavailable checks stay unknown.</p></article>
        <article className="faq-item"><h3>Do I need an account?</h3><p>No account is needed for a free scan. The full Fix Prompt is a one-time purchase for the URL you scanned.</p></article>
        <article className="faq-item"><h3>Can every page be checked?</h3><p>The page must be publicly accessible. Private, sign-in protected, or blocked pages cannot be scanned.</p></article>
      </div>
    </section>
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Regular Basis releases"><a href="https://www.getklare.com/">RB001</a><a href="https://epkay.com/">RB002</a><a href="https://urtype.app/">RB003</a><a href="https://regularbasis.studio">REGULAR BASIS</a></nav></footer>
  </main>;
}
