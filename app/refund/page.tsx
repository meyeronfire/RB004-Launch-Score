import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/config/release";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: `Refunds — ${PRODUCT_NAME}`, robots: { index: true, follow: true } };

export default function RefundPage() {
  return <LegalPage title="Refunds"><section><h2>Launch Plan + Agent Brief purchase</h2><p>The Launch Plan + Agent Brief is a one-time digital report for one URL. If you were charged more than once for the same purchase, or a technical problem prevented access to the report, contact us through the <a href="https://regularbasis.studio">Regular Basis site</a> with the checkout email and report link. We will review the charge and resolve it.</p></section><section><h2>Before you buy</h2><p>The paid report is available when the full report and page-copy draft are ready for that scan. It includes the scan-specific launch checklist, owner-confirmation checklist, and coding-agent prompts. Your free report remains available if the paid report is unavailable.</p></section></LegalPage>;
}
