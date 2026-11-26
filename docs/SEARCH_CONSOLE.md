# Google Search Console and organic query review

## Connect the domain

1. In Google Search Console, add `readyforreal.dev` as a **Domain property**.
2. Copy the TXT verification value Google gives you and add it at the domain's DNS provider. Do not commit that token to this repository.
3. Wait for DNS propagation, then verify the property.
4. Submit `https://readyforreal.dev/sitemap.xml` under **Sitemaps**.
5. Inspect the home page and new public resource URLs with URL Inspection. Request indexing only for canonical public pages; never submit `/admin`, `/api`, or customer report URLs.

No verification token is embedded because Google must generate a property-specific value.

## Export and review performance data

Export the Search Console Performance report as CSV with query, page, clicks, impressions, CTR, and average position. Preserve the property, search type, country/device filters, and date range alongside the export. Suggested repeatable input structure:

```json
{
  "source": "google-search-console",
  "property": "sc-domain:readyforreal.dev",
  "searchType": "web",
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "filters": { "country": null, "device": null },
  "rows": [{ "query": "", "page": "", "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 }]
}
```

Review queries with meaningful impressions and no relevant page, positions 5–30, high impressions with weak CTR, and pages losing visibility against a comparable prior period. Group close variants by intent; improve a relevant page before proposing a new URL. Check whether multiple pages serve the same intent before publishing. Treat small samples cautiously and record the export date and decision so the review can be repeated.

Do not infer search volume, rankings, or conversions from this template. Search Console reports search performance, not revenue. Microsoft Clarity events and Plausible events (when configured) carry a sanitized `landing_path` through CTA clicks, scan starts, completed scans, and checkout starts. Stripe-confirmed purchases emit a `purchased` Clarity event after the customer returns; Plausible receives its server-side `purchased` event from the signed webhook, using the originating path as its event URL and optionally including UTM source, medium, and campaign. Compare Search Console landing-page impressions and clicks with these first-party events by path; do not include scanned URLs, report IDs, or findings in analytics payloads.

## Leo Command Center handoff

Future integrations can ingest the JSON structure above through Leo Command Center. Keep Search Console credentials outside this app, use read-only access, and store only aggregated query/page metrics needed for analysis.
