# Local Verification — 1 November 2026

## Passed

- Type generation, TypeScript, ESLint, the production webpack build, and 46 tests across eight files.
- Five saved HTML page fixtures, deterministic scoring ranges, unknown-check ceilings, private-address restrictions, bounded request bodies, and public report projection.
- Real HTTP regression tests for truncated responses, deadlines, cancellation, and body limits. The original interrupted-response hang now rejects promptly.
- The original malicious robots wildcard input returns immediately without regex backtracking.
- PostgreSQL-backed application tests for verified purchases, delayed/replayed sessions, refund ordering, purchaser claims/recovery, optional purchase telemetry, and lease-fenced worker writes. Embedded SQL scheduling stubs do not establish hosted multi-connection behavior.
- Independent PostgreSQL schema smoke: migration application/reapplication, durable token expiry, duplicate receipt/event constraints, and rollback.
- A fresh live studio scan after hardening completed in 10 seconds: 88/100, actual 1440×900 and 390×844 captures, three public findings, and no private fixes/email/paid payload in the public response. Missing model/PageSpeed checks are explicit.
- Landing and report checked at widths 390, 768, 1280, 1440, and 1920: no horizontal overflow, JavaScript page errors, or controls below 44px. The home URL action is above the fold at 1280×720.
- Automated WCAG AA checks found no violations in the 390px and 1440px landing, report, and paid-layout fixture.
- Paid-layout browser fixture: all five tool tabs, prompt copying, clean public-link copying, hidden upsell after unlock, keyboard-scrollable prompt, and responsive sizing. This is mocked UI evidence, not a purchase.
- Unauthenticated paid API returns 403 without a paid payload; an unknown report returns 404; unconfigured checkout returns 503 without creating a payment.
- Production share card returns a valid 1200×630 PNG. Its static Inter Display/Geist Mono fonts are explicitly included in the deployment trace.

## Lighthouse — Local Production Build

| Mode | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| Mobile | 99 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

Reports and screenshots remain locally under `artifacts/final/`; live-scan and SQL evidence is under `artifacts/runtime/`. These generated artifacts are ignored by Git.

## Independent Reviews

The final independent code review found no unresolved blocking local-code security/payment issue. Luna/Sol became unavailable during the task; the user explicitly approved finishing with the current model. The final review used that authorized substitute and is not represented as a fresh Sol review.

The visual review matched the pinned composition, chrome material, embedded type, and report layout. Its last listed fix—the redundant scan/error labels—was scored resolved, with a ship verdict at that fix's scope. The mechanical detector's Inter and chrome-gradient warnings are intentional requirements of the supplied brief.

Production dependency audit: zero reported vulnerabilities. Sixteen moderate advisories remain in development lint/glob tooling; there are no remaining high/critical advisories. A forced audit repair suggested incompatible framework/tooling downgrades and was not applied.

## Not Production Verified

No deployment or real payment/email/model call was made. Stripe Checkout, Resend delivery, configured LLM/PageSpeed enrichment, hosted PostgreSQL concurrency, and the Linux production browser namespace must still be checked with the actual services and host. The browser wrapper fails closed when its required Linux isolation is unavailable; macOS development does not prove the deployed network boundary.

The new landing's own 90+ Launch Score target has not been verified through a fully configured public scan. The dated 88-point studio example is a different page and a partial assessment. The future $29 re-check remains disabled.
