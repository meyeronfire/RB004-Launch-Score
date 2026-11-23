import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/release";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["checklists", "methodology", "guides", "tools", "guides/ready-to-launch", "guides/vibe-coding-checklist", "guides/ai-app-security", "for/lovable", "for/bolt", "for/cursor", "for/replit", "for/v0", "for/base44"].map((path) => ({ url: `${SITE_URL}/${path}`, changeFrequency: "monthly" as const, priority: path.startsWith("for/") ? 0.65 : 0.8 })),
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
