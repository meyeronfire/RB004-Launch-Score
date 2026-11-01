import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PRICE_FIX_PROMPT_USD, PRODUCT_NAME } from "@/config/release";

export const metadata: Metadata = { title: `Terms — ${PRODUCT_NAME}`, robots: { index: true, follow: true } };

export default function TermsPage() {
  return <LegalPage title="Terms of use"><section><h2>Using {PRODUCT_NAME}</h2><p>{PRODUCT_NAME} reviews a publicly accessible page you ask it to scan. Only submit a page you have permission to review. Pages that are private, sign-in protected, or disallowed by robots.txt cannot be scanned.</p></section><section><h2>Reports and scores</h2><p>Reports are generated from the page as it appeared during a scan and from checks available at that time. Results are informational, may be incomplete, and are not a promise of traffic, sales, accessibility, security, or business performance. Unknown checks are identified as unknown.</p></section><section><h2>One-time purchase</h2><p>The Fix Prompt is a one-time ${PRICE_FIX_PROMPT_USD} purchase for one scanned URL. It includes the full report and the copy and tool-specific prompt available for that scan. Payment is processed by Stripe. Re-checks and subscriptions are not currently offered.</p></section><section><h2>Fair use</h2><p>Do not use the service to access private networks, disrupt a site, or submit content you do not have permission to review. We may limit scanning to keep the service available.</p></section><section><h2>Questions</h2><p>For questions about this release, use the contact options on the <a href="https://regularbasis.studio">Regular Basis site</a>.</p></section></LegalPage>;
}
