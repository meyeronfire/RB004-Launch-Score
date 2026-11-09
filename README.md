# RB004 Launch Score

Launch Score renders a public page at desktop and mobile sizes, checks page and link signals, and creates a shareable evidence report. Scores combine measured findings with category coverage limits; unknown checks do not earn points. A saved scan of the Regular Basis studio site is available at `/r/example` as a dated example.

## Local setup

1. Install Node.js 24 and npm (verified locally with Node 24.14.1).
2. Copy `.env.example` to `.env.local`. Keep credentials out of git.
3. Run `npm install`, then `npx playwright install chromium`.
4. Start the app with `npm run dev`. If the cached Playwright browser is unavailable on macOS, set `PLAYWRIGHT_CHANNEL=chrome` for local development.
5. Without `DATABASE_URL`, scan records use atomic local JSON files under `data/scans/`. This fallback is for one local development process; it is not a production queue or shared database.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` for deterministic checks.

See [QA.md](QA.md) for verified results and the remaining production-service checks.

The default port is 3000. For this workspace's preview use `PLAYWRIGHT_CHANNEL=chrome NEXT_PUBLIC_SITE_URL=http://localhost:3004 npm run dev -- --port 3004`. Both development and production builds use Next's supported webpack builder because the local Turbopack helper could not bind its required port.

## Release and scoring configuration

Change `RELEASE_CODE`, `PRODUCT_NAME`, and `PRICE_FIX_PROMPT_USD` in `config/release.ts`. The separate $29 re-check product remains off; a $12 report purchase includes unlimited re-scans of that URL for seven days. Studio catalog links point to the verified RB001–RB003 products.

`config/scoring.ts` weights Clarity 15%, Conversion 25%, Design & Brand 15%, Trust 10%, Technical 15%, Security 10%, and SEO/AEO 10%. The four PageSpeed Insights categories inform the Technical score once as a blended signal; Lighthouse SEO informs SEO/AEO separately. Critical/high/medium/low findings deduct 22/13/7/3 category points. Each category is capped by verified check coverage (`50 + 50 × coverage`); content and design reviews count only when an explicit completed result is recorded. The weighted result is rounded to 0–100. Five saved page fixtures and a local planted-file server exercise exposure detection without relaxing the production SSRF guard.

Fonts and favicon come from the existing Regular Basis assets. Exported graphics use decompressed TrueType equivalents of the same Inter Display and Geist Mono fonts; the image renderer does not accept WOFF2. Example captures retain their live source and capture date in image metadata.

## Production services

Apply [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) and [`db/migrations/002_free_tier_costs.sql`](db/migrations/002_free_tier_costs.sql) to PostgreSQL. Set `DATABASE_URL` in the Next.js app and the separate scan worker. Production scan requests fail closed unless the database and a recently reporting worker are available. The app process accepts jobs; the worker claims them with expiring lease tokens, stores progress and reports in PostgreSQL, and handles the email outbox. Free scans allow one anonymous scan per device/IP, then up to three lifetime scans per verified email. Twenty scan requests per IP are allowed each hour. Identical normalized URLs reuse a complete report for 24 hours. Set `FREE_DAILY_BUDGET_USD` (default `$5`) to pause free scans when estimated daily free-scan costs reach the budget; paid scans remain available. The protected `/admin` dashboard requires `ADMIN_SECRET`.

Run the web process with `NODE_ENV=production npm start`, and run one or more workers with `NODE_ENV=production npm run worker`. Production workers require Linux, Playwright Chromium, `unshare`, and permission to create user and network namespaces. Validate that `unshare --user --map-root-user --net -- true` succeeds in the worker container before routing traffic to it. The Chromium process starts inside a network namespace with no external network; Playwright communicates over its local driver pipe while the Node worker performs DNS-pinned, bounded fetches. Disable browser host networking and keep the worker's host firewall restricted to required PostgreSQL, email, Stripe-independent app, and public page access. Do not run the production worker in a serverless function or a container where namespace isolation is unavailable: it refuses to start.

The worker has a hard 90-second scan deadline, per-request deadlines, byte and concurrency budgets, DNS validation with pinned addresses, safe redirect checks, robots checks, and private-address rejection. This protects the scanner's requests; deployment networking should also deny private and metadata ranges as a second boundary.

For self-hosted production, set `TRUSTED_PROXY_IP_HEADER` only to a header overwritten by your trusted ingress. Vercel uses its platform-assigned client IP header. Production requests do not trust arbitrary forwarded headers. Set a random `RATE_LIMIT_SALT` and keep it stable across app instances.

## Optional services and paid reports

- `OPENAI_API_KEY` enables screenshot and visible-text review and evidence-constrained copy drafts. `LLM_MODEL_FREE` selects the free scan model; `LLM_MODEL_PAID` selects the paid report and Fix Prompt model. Without the key, the app says those checks are unavailable and does not offer a paid Fix Prompt.
- `PAGESPEED_API_KEY` enables separate mobile and desktop PageSpeed checks. Without it, those checks remain unknown and scores are coverage-capped.
- Stripe requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The webhook accepts signed events, validates a fixed one-time $12 USD card payment bound to the scan, and processes duplicate events idempotently.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` enable passwordless free-scan email links and paid report delivery. Paid checkout also requires a stable base64 `REPORT_TOKEN_ENCRYPTION_KEY` containing 32 random bytes. Checkout is disabled until purchaser email delivery is ready. Only after a verified payment does the webhook create a hashed report token and encrypted email outbox entry. The worker sends the purchaser a claim link; opening it creates an HttpOnly cookie for the private paid-report endpoint and redirects to the clean public report URL. The public share page and Open Graph image never include paid findings. Full refunds revoke purchaser access and cancel unsent claim emails.
- The report page can resend access after checking the supplied checkout email against an active purchase. The endpoint returns the same generic response for matching and non-matching email addresses; a new secure token replaces the previous token only for a verified purchaser.
- A payment is not unlocked from a browser query parameter or the Stripe return URL. Only a verified webhook and purchaser claim grant access.

If an email provider is temporarily unavailable after payment, the encrypted outbox retries with backoff. Keep the worker and encryption key available so delivery can recover without another charge. Never rotate the encryption key while pending outbox messages exist unless they are re-encrypted.

## Data and limitations

The app stores scan URL, rendered snapshots, findings, scores, scan progress, submitted lead email, purchase receipt identifiers, hashed purchaser tokens, and encrypted pending email tokens. Public report APIs expose only the free projection. Optional model and PageSpeed results may be unavailable. Technical signals such as proof, pricing, FAQ, and contact use transparent heuristics; they are evidence for review, not a guarantee of conversion. PageSpeed is an external estimate.

The scanner respects robots.txt for the page and fetched resources. When robots rules cannot be confirmed, it stops the scan. It checks up to 50 same-origin links, caps browser requests and downloaded bytes, blocks WebSockets/service workers, and does not load user-provided Open Graph images into the app server or share card.

## Legal and billing

Review `/terms`, `/privacy`, and `/refund` before accepting public traffic or payments. The public share link can be forwarded; paid content requires the purchaser claim link or its browser cookie. A fully refunded purchase loses access.

## Release links

- [RB001 Klare](https://www.getklare.com/)
- [RB002 Epkay](https://epkay.com/)
- [RB003 URTYPE](https://urtype.app/)
- [Regular Basis Studio](https://regularbasis.studio/)

## Optional analytics

Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` for the site registered in Plausible and, if needed, `NEXT_PUBLIC_PLAUSIBLE_SRC` for your tracker URL. Client hooks emit `scan_started` after a job is accepted, `scan_done` when that originating tab observes completion, `share_clicked`, and `checkout_started`. A newly committed, unrefunded payment emits `purchased` from the signed webhook; replayed events do not. Tracking is best effort and never changes scan, payment, or report access behavior. No tracker loads when its domain is unset.
