import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicScan, readScan } from "@/lib/store";
import { ReportClient } from "@/components/report-client";
import { RELEASE_CODE, PRODUCT_NAME } from "@/config/release";
import { exampleReport } from "@/lib/example";
import { shareCardImagePath } from "@/lib/share-card";

export const dynamic = "force-dynamic";

function cardImages(id: string, updatedAt?: string) {
  const image = shareCardImagePath(id, updatedAt);
  return { image, images: [{ url: image, width: 1200, height: 630, alt: "Ready for Real launch score card" }] };
}

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (id === "example") {
    const { image, images } = cardImages(id, exampleReport.updatedAt);
    const title = `${exampleReport.score}/100 ${PRODUCT_NAME} for regularbasis.studio`;
    return { title: `${exampleReport.score}/100 Example ${PRODUCT_NAME} for regularbasis.studio — ${RELEASE_CODE}`, robots: { index: false, follow: false }, openGraph: { title, description: "An example based on a real, verified studio-site scan.", images }, twitter: { card: "summary_large_image", title, images: [image] } };
  }
  const scan = await readScan(id);
  if (!scan) return { title: "Report not found" };
  const title = scan.status === "complete" ? `${scan.score}/100 ${PRODUCT_NAME} for ${scan.domain}` : `${PRODUCT_NAME} report`;
  const { image, images } = cardImages(id, scan.updatedAt);
  return { title: `${title} — ${RELEASE_CODE}`, robots: { index: false, follow: false }, openGraph: { title, description: "A rendered review of clarity, conversion, design, trust, technical readiness, and security.", images }, twitter: { card: "summary_large_image", title, images: [image] } };
}

export default async function ReportPage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params; const scan = await readScan(id);
  if (id === "example") return <ReportClient initial={publicScan(exampleReport)} />;
  if (!scan) notFound();
  return <ReportClient initial={publicScan(scan)} />;
}
