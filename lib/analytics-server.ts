import { RELEASE_CODE, SITE_URL } from "../config/release";

/** Optional telemetry runs after payment commit and never changes the purchase outcome. */
export async function trackPurchased(metadata?: Record<string, string | undefined>) {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return;
  try {
    await fetch("https://plausible.io/api/event", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `${RELEASE_CODE}-Launch-Score-Server/1.0` },
      body: JSON.stringify({ name: "purchased", domain, url: `${SITE_URL}${metadata?.sourcePath ?? "/"}`, props: { price_usd: 12, ...(metadata?.utmSource ? { utm_source: metadata.utmSource } : {}), ...(metadata?.utmMedium ? { utm_medium: metadata.utmMedium } : {}), ...(metadata?.utmCampaign ? { utm_campaign: metadata.utmCampaign } : {}) } }),
      signal: AbortSignal.timeout(2000),
    });
  } catch { /* Analytics must not make Stripe retry a successfully committed purchase. */ }
}
