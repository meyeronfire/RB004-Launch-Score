import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/config/release";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: `Refunds — ${PRODUCT_NAME}`, robots: { index: true, follow: true } };

export default function RefundPage() {
  return <LegalPage title="Refunds"><section><h2>Fix Prompt purchase</h2><p>The Fix Prompt is a one-time digital report for one URL. If you were charged more than once for the same purchase, or a technical problem prevented access to the report, contact us through the <a href="https://regularbasis.studio">Regular Basis site</a> with the checkout email and report link. We will review the charge and resolve it.</p></section><section><h2>Before you buy</h2><p>The Fix Prompt is available only when the full report and copy draft are ready for that scan. Your free report remains available if a paid report is unavailable.</p></section></LegalPage>;
}
