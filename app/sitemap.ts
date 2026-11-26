import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/release";
import { launchPages } from "@/app/launch-pages";
import { builderPages, guidePages } from "@/lib/content/organic-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const editorialPaths = [
    "checklists",
    "methodology",
    "guides",
    "tools",
    "compare/lighthouse",
    ...Object.keys(guidePages).map((slug) => `guides/${slug}`),
    ...Object.keys(builderPages).map((builder) => `for/${builder}`),
    ...Object.keys(launchPages),
  ];

  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...editorialPaths.map((path) => ({ url: `${SITE_URL}/${path}`, changeFrequency: "monthly" as const, priority: path.startsWith("for/") ? 0.65 : 0.8 })),
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/refund`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
