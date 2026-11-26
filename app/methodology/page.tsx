import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "How the Launch Readiness Score Works | Ready for Real", description: "See the seven categories, score weights, evidence limits, and finding priorities behind a Ready for Real public launch scan.", alternates: { canonical: "/methodology" }, openGraph: { title: "How the Launch Readiness Score Works", description: "The categories, weights, and evidence limits behind a Ready for Real scan.", url: "/methodology", type: "article" } };

const scoreWeights = [
  ["Conversion", 25, "Primary actions, forms, and mobile interaction signals."],
  ["Clarity", 15, "Whether visitors can understand the offer and audience."],
    ["Design & brand", 15, "Visual hierarchy, consistency, and visual accessibility signals."],
  ["Technical", 15, "Page response, links, browser behavior, and available performance signals."],
  ["Trust", 10, "Visible proof, pricing, FAQs, and contact information."],
  ["Security", 10, "Publicly observable transport, headers, and exposure signals."],
  ["Search & answer readiness", 10, "Metadata, crawl rules, structured data, and related page signals."],
] as const;

export default function MethodologyPage() {
  return <main className="wrap editorial" style={{paddingTop:"3rem",maxWidth:900}}>
    <p className="mono">HOW IT WORKS · PUBLIC PAGE EVIDENCE</p>
    <h1>What a launch readiness scan can tell you.</h1>
    <p>Ready for Real reviews publicly accessible apps and websites—whether they were built with AI tools or traditional code—to surface evidence a founder can act on before or after launch. It is a useful starting point for prioritizing fixes, not a certification or guarantee that an application is safe for production.</p>

    <h2>Seven categories make up the score</h2>
    <p>The overall score is a weighted summary of seven category scores. Conversion is the largest category at 25%; the remaining weights are shown below. Together they total 100 points:</p>
    <div style={{overflowX:"auto"}}>
      <table><thead><tr><th>Category</th><th>Weight</th><th>Evidence examples</th></tr></thead>
        <tbody>{scoreWeights.map(([category,weight,evidence])=><tr key={category}><th>{category}</th><td>{weight}%</td><td>{evidence}</td></tr>)}</tbody>
      </table>
    </div>
    <p>In the current scoring model, confirmed findings deduct 22 points for critical, 13 for high, 7 for medium, and 3 for low severity. Findings marked for review or with unknown confidence are not deducted as confirmed issues. Limited evidence can cap a category's score; when valid PageSpeed Lighthouse results are available, they make up 35% of the technical category score. The result is a prioritization aid, not a pass/fail verdict or a guarantee of business outcomes.</p>

    <h2>What we check</h2>
    <p>The scan reviews page clarity, conversion paths, design and accessibility signals, trust information, technical behavior, visible security headers, and search metadata. Depending on availability, it renders the page on desktop and mobile and records browser, link-check, and PageSpeed measurements. Each result reflects the evidence captured for that scan; a report does not imply that every part of an app was tested.</p>

    <h2>How to read findings</h2>
    <p>Findings are grouped by category and prioritized to help you decide what to address first. A finding includes the observed evidence and a recommended next step. If the scan could not confirm something, it should remain unknown or need review—not be presented as a verified pass. Coding-agent prompts are grounded in the recorded page evidence and still need a human to check the actual code before making changes.</p>

    <h2>What a public scan cannot see</h2>
    <p>A URL scan cannot inspect private source code, validate secrets or backend configuration, prove database authorization rules, test every application state, or replace a professional security assessment. It cannot guarantee uptime, compliance, accessibility conformance, or production readiness. Verify authentication, data access, payment handling, backups, and recovery plans directly in your own environment.</p>

    <h2>Use the report to decide what to do next</h2>
    <p>Review the <Link href="/checklists">founder launch checklist</Link> for owner-only checks, then <Link href="/">scan your public app or website for free</Link> to see the evidence the page exposes.</p>
    <p>For search and AI-powered answer experiences, the durable work is still clear technical access and useful, reliable page content. Read <a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide" rel="noreferrer">Google's guidance for AI features in Search ↗</a>; no special markup or GEO trick guarantees a citation or ranking.</p>
  </main>;
}
