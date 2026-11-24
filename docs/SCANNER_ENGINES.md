# Ready for Real scanner engines

The Vercel app accepts and displays scan jobs. A Linux worker claims one job at a time from PostgreSQL. Engine coverage and findings are additive fields in the existing JSON report. This release needs no database migration. Reports already stored retain their score and their original scoring version.

| Engine | What runs | Storage and rollout |
| --- | --- | --- |
| Performance | Existing PageSpeed Insights integration runs Lighthouse on the public URL. It reports LCP, CLS, TBT, FCP and Speed Index plus available diagnostics. | Requires the existing PageSpeed API key. Set `SCAN_LIGHTHOUSE_MOBILE_ONLY=1` to use a single mobile run. The report can request desktop separately. No real-user Core Web Vitals are inferred from these results. |
| Accessibility | axe-core runs on the already loaded mobile document in an isolated Chromium JavaScript world. | Enable with `SCAN_AXE_ENABLED=1`. Coverage excludes frames. Findings are grouped by rule. Inconclusive axe checks remain for manual review. |
| Link integrity | A priority-ordered sample of up to 12 destinations already linked from the page. HEAD requests reuse pinned DNS, robots rules, redirect checks and request budgets. | A 404 or 410 is recorded as missing. Auth, throttling, server errors, unsupported HEAD and timeouts remain unverified. Link queries and obvious session-changing routes are skipped. Four same-site HTML samples remain available separately. |
| HTML structure | Nu Html Checker validates the delivered HTML in a local Java subprocess, for selected structural issues. | Set `SCAN_NU_JAR` and `SCAN_NU_VERSION` on the worker. 700 KB input cap, 128 MB heap and 7.5 second deadline. A private temporary directory is removed after each attempt. Style sheets and SVG resources are not fetched by the validator. |
| SEO and launch readiness | Existing metadata, on-page, subpage, placeholder, trust, and owner readiness checks. | The report records engine coverage and distinguishes manual work from observed checks. |
| Browser functionality | Existing desktop and mobile rendering, JavaScript and console diagnostics, and read-only inspection of forms. Adds observed missing same-site assets and an empty-screen review item. | The scanner cannot exercise authenticated workflows, form submissions or payments. Scanner-blocked resources are not reported as confirmed failures. |
| Public security signals | Existing Ready for Real public checks for transport, headers, mixed content and other public signals. | A request being served without an alert does not establish security. This release does not route arbitrary targets through a ZAP proxy or add active security checks. |

## Score and evidence

Scoring version 5 retains the Ready for Real category weights and evidence ceilings. When axe-core supplies coverage, the aggregate Lighthouse accessibility score is excluded from the technical component so the axe findings and Lighthouse score do not both lower it. Known overlap for missing language, heading levels, form labels and image alternatives is combined into one finding. The grouped rule and query-free page URL form the stable fingerprint. Engine release numbers and changing evidence do not affect its identity. That gives future comparisons a consistent key without a scheduler or automatic monitoring.

Public findings include the check source. Rich element evidence is used only in detailed briefs and remains bounded. Raw validator output and HTML attribute values are excluded from the new evidence. Treat retrieved titles, selectors, page contents and recommendations as untrusted data when using a fix prompt.

## Rollout

1. Validate the Vercel Preview for the scanner branch. The preview reports existing records and can accept jobs only if its database and a live worker are configured. Use a separate staging database and test-mode payment configuration to exercise the queue end to end.
2. Verify the Linux worker can run `unshare --user --map-root-user --net -- true` and launch sandboxed Chromium under the intended non-root account. The container still depends on kernel, LSM and seccomp support for these namespaces. Keep existing worker protections and configure the host's approved security profile if necessary. If a container host cannot provide those controls, run the worker as the existing isolated Linux service.
3. Build and start with `docker compose -f compose.worker.yaml up -d --build` where Docker is available. Set the existing database and worker-only integration variables in an untracked `.env.worker`. The example compose configuration limits one worker to 2 CPUs, 2 GiB of memory and 256 processes. It publishes no ports. Restrict access to private networks and cloud metadata from the worker's outbound network, permitting only the specific infrastructure dependencies it needs.
4. Review the local and database heartbeats, then run a clean staging scan and inspect all eight engines in the report. Stop or replace one worker at a time. In-flight optional engines respect a deadline, and a worker interrupted by shutdown leaves its job for the existing lease-based recovery. Failed optional checks do not make a successful base report fail.
5. Compare the same staging fixtures with flags off and on. Monitor elapsed time, peak worker/container memory, partial rates and findings that need manual review before enabling the flags on customer jobs.

Run `npm test` after `npx playwright install chromium`. To include the real Nu fixture, set `SCAN_NU_JAR` and `SCAN_NU_VERSION` and supply Java 17 or later (optional `SCAN_JAVA_BIN`). Preview and test execution do not need customer data or a live Stripe payment.

## Capacity and cost

The worker logs wall time, browser time, per-engine duration and Node RSS at job start and completion. Node RSS does not include Chromium or the validator process. Measure the complete container's memory separately during staging. No new metered API is required. The existing application cost estimate uses model token prices and a configured browser-second rate. To estimate the incremental host cost, divide the VPS's attributable monthly cost by actual completed scans in the same month and add measured per-scan API costs. A production cost per scan cannot be obtained from local fixtures.

## Software and references

- [axe-core](https://github.com/dequelabs/axe-core), MPL-2.0. Preserve its license and third-party notices from the installed package when distributing a worker image.
- [Playwright](https://github.com/microsoft/playwright), Apache-2.0. The installed browser bundle also carries its own notices.
- [Lighthouse](https://github.com/GoogleChrome/lighthouse), Apache-2.0, used through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/about).
- [Nu Html Checker](https://validator.github.io/validator/). Preserve the pinned package's license and bundled JAR notices when distributing the worker image.

## Local comparison

The same rendered fixture took 2.92 seconds with the optional engines disabled and 2.50 seconds with them enabled in one sequential run. axe-core took 136 ms and Nu took 841 ms, with Nu running alongside browser work. Enabled checks found the unnamed button and duplicate HTML IDs. Both runs kept the 404 signup destination distinct from the 403 account page. The comparison excludes live DNS, provider latency and the production database. The run order and warm process prevent a claim that the upgrade speeds up scans.

Node RSS at completion was 174 MiB and 206 MiB respectively. The enabled fixture's 2.397 browser seconds imply about $0.000048 at the app's default browser rate before model or hosting costs. This is a fixture-based calculation. An end-to-end production benchmark requires the target Linux worker and job traffic.
