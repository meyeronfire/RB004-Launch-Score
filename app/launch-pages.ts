export const launchPages = {
  "vibe-coding-launch-checklist": {
    title: "Vibe coding launch checklist",
    desc: "Move a vibe-coded prototype toward launch with practical checks for user data, secrets, product flows, and deployment.",
    intro: "A fast prototype can become a real product, but the production work is still yours. Use this checklist to review the user journey, data boundaries, operational basics, and public page before launch.",
    steps: ["Test the central user journey on the deployed app with a new account.", "Review server-side authorization and database policies using multiple test users.", "Remove credentials from browser code, logs, and source history; rotate any exposed keys.", "Exercise failure, empty, and slow-network states on mobile.", "Confirm backups, monitoring, support ownership, and a rollback plan."],
  },
  "ai-app-launch-checklist": {
    title: "AI app launch checklist",
    desc: "A practical launch checklist for AI-built applications, from generated code review to production access controls.",
    intro: "AI-built applications need the same production checks as any other app. Focus on areas generated tools cannot own for you: who can access data, how secrets are stored, and what happens when production fails.",
    steps: ["Review generated code and dependency changes before release.", "Test account boundaries at each API and database layer.", "Keep private keys server-side and validate the deployed app, redirects, metadata, and mobile experience.", "Document migration, backup, alerting, and rollback procedures."],
  },
  "website-launch-checklist": {
    seoTitle: "Website Launch Checklist for Founders",
    title: "Website launch checklist: what to check before you publish",
    desc: "A practical website launch checklist for founders and small teams: messaging, mobile, accessibility, trust, search basics, and deployment.",
    intro: "A website launch is ready when a new visitor can understand the offer, use the page on their device, trust the next step, and reach the right destination. Use this checklist for product sites, landing pages, portfolios, and marketing websites, whatever tools or team built them.",
    sections: [
      {
        heading: "Make the page clear to a first-time visitor",
        body: "Ask someone unfamiliar with the project to look at the first screen for a few seconds, then explain what the site offers and what they would do next. Their answer is more useful than whether the headline sounds clever to the team.",
        points: ["Name the audience and the outcome in plain language.", "Give the main action a clear label and make it easy to find.", "Keep the headline, supporting copy, and call to action focused on the same promise."],
      },
      {
        heading: "Test the complete mobile experience",
        body: "A responsive screenshot is only the start. Use the page on a narrow screen and complete its important journey, including forms, menus, pricing choices, and any confirmation or error state.",
        points: ["Check that text, navigation, and buttons fit without horizontal scrolling.", "Try every form with valid, missing, and invalid information.", "Confirm the next step works after submission, not just that the button responds."],
      },
      {
        heading: "Check access, readability, and trust",
        body: "Visitors need to operate the page in different ways and decide whether they trust its claims. Review the experience with a keyboard, visible focus, readable contrast, and honest supporting details.",
        points: ["Give form fields labels and explain errors beside the relevant field.", "Make pricing, contact details, privacy information, and important terms easy to find.", "Use real proof and identify examples clearly; avoid implying results you cannot support."],
      },
      {
        heading: "Prepare the page to be found and shared",
        body: "Search engines need a crawlable, stable page with a clear topic. These basics make the page easier to understand, but they do not guarantee rankings or traffic.",
        points: ["Use a unique page title, useful description, and one descriptive main heading.", "Check that the canonical URL, redirects, sitemap, and indexing rules agree.", "Write useful page content for the visitor rather than repeating keywords; check how the link preview appears when shared."],
      },
      {
        heading: "Verify the published version",
        body: "Review the live domain after deployment. Local previews and design files cannot confirm that production links, tracking, redirects, or page resources work as expected.",
        points: ["Open the site on a phone and desktop, then follow every important link.", "Check HTTPS, page response, image loading, and the final destination of calls to action.", "Know who owns updates and how to correct or roll back a broken release."],
      },
    ],
    sources: [
      { label: "Google Search Essentials", url: "https://developers.google.com/search/docs/essentials" },
      { label: "W3C: Accessibility, usability, and inclusion", url: "https://www.w3.org/WAI/fundamentals/accessibility-usability-inclusion/" },
    ],
    steps: [],
  },
  "saas-launch-checklist": {
    seoTitle: "SaaS Launch Checklist for First Users",
    title: "SaaS launch checklist: prepare for your first users",
    desc: "Prepare your SaaS for its first customers with a founder-focused checklist for onboarding, account security, billing, support, and operations.",
    intro: "A SaaS is ready for its first users when people can reach the product's main value, their data stays within the right account, payments behave as expected, and someone can respond when something goes wrong. This checklist works across stacks, whether you built the product yourself, with AI tools, or with a team.",
    sections: [
      {
        heading: "Prove that a new user can reach the core value",
        body: "Ask someone outside the project to sign up and complete the main task using a fresh account. Watch where they hesitate, what they misunderstand, and whether the app explains what to do when there is no data yet.",
        points: ["Test sign-up, verification, sign-in, password recovery, and sign-out.", "Complete the key user journey from a clean account, not only an administrator account.", "Check empty, loading, success, and error states on mobile and desktop."],
      },
      {
        heading: "Verify account and data boundaries",
        body: "A working interface does not prove that account data is isolated. Test permissions through the server and database paths a real session uses, including attempts that should be denied.",
        points: ["Use two ordinary test accounts and confirm neither can access the other's records.", "Check authorization on every API, server action, and data operation—not only in the interface.", "Review roles, invitations, exports, and account deletion if your product supports them."],
      },
      {
        heading: "Exercise billing and recovery paths",
        body: "Treat billing as a lifecycle rather than a single successful checkout. Use the provider's test mode before charging anyone, and verify that webhook delays or failures can be noticed and reconciled.",
        points: ["Test checkout, success, cancellation, failed payment, renewal, and plan changes in test mode.", "Confirm that access follows the actual subscription or payment state.", "Know how to investigate a missed event, refund, or customer billing question."],
      },
      {
        heading: "Make the product operable after launch",
        body: "Someone should know where to look when a user is blocked, data needs recovery, or a release causes a regression. Keep the first operating plan small, but make ownership explicit.",
        points: ["Provide a real support contact and a clear path for users to report problems.", "Know where production errors appear and who responds to them.", "Confirm backups, restore expectations, release ownership, and a rollback path."],
      },
      {
        heading: "Make the public site match the product",
        body: "The marketing site sets expectations before someone creates an account. Make the promise, price, privacy details, and next action consistent with what the product actually delivers.",
        points: ["Explain who the SaaS serves, what it helps them do, and what happens after sign-up.", "Make pricing, terms, privacy information, and contact paths easy to find.", "Test the published page on mobile and check that links, forms, and account entry points work."],
      },
    ],
    sources: [
      { label: "OWASP Authorization Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html" },
      { label: "Stripe: Test your integration", url: "https://docs.stripe.com/testing" },
    ],
    steps: [],
  },
  "ai-app-security-checker": {
    title: "AI app security checks",
    desc: "Review public security signals for an AI-built app and learn which private checks still require an owner.",
    intro: "A public page can reveal useful baseline signals, such as transport security and response headers. It cannot prove the safety of private code, authentication logic, database rules, or stored secrets.",
    steps: ["Run a Ready for Real public scan to review observable headers and exposed page signals.", "Inspect database policies and test access as anonymous and separate ordinary users.", "Review server routes for authorization and validate untrusted inputs.", "Keep credentials out of client bundles and rotate any exposed secrets.", "Use an authorized security review for deeper testing; a URL scan is not a penetration test."],
  },
  "website-launch-readiness-checker": {
    seoTitle: "Free Website Launch Readiness Checker",
    title: "Free website launch readiness checker for founders",
    desc: "Scan a public app or website before launch. Get a free, evidence-based review of clarity, usability, trust, mobile, security, and search readiness.",
    intro: "Ready for Real is an online launch readiness checker for founders preparing a website or web app for real users. Enter a public URL to get a free report based on the page visitors can actually reach—whether the product was built with AI tools, a development team, or both.",
    sections: [
      {
        heading: "What the free launch readiness scan reviews",
        body: "The report brings the main public-page signals together so you can see where to look next. Results are tied to the evidence recorded during the scan, and checks that could not be verified stay unknown rather than being presented as passes.",
        points: ["Clarity, conversion, design, and trust signals visitors see on the page.", "Mobile behavior, links, response, and available PageSpeed measurements.", "Visible security headers, exposed public files, metadata, indexing rules, and structured data."],
      },
      {
        heading: "How to use the checker",
        body: "Start with the deployed URL you want a new visitor to open. The scan takes about a minute in typical conditions; then use its findings to choose what to fix and what you need to verify inside your own code or platform.",
        points: ["Submit a publicly accessible page without creating an account.", "Review the overall score, seven category scores, and the findings captured for that scan.", "Apply changes, then scan again to compare the public page signals."],
      },
      {
        heading: "Who it is for",
        body: "The checker is designed for solo founders and small teams who want a second look before inviting users or promoting a launch. It works with public websites and app entry pages across different stacks; it does not require an AI builder or a particular hosting provider.",
        points: ["Founders checking a marketing site, landing page, portfolio, or SaaS entry page.", "Teams reviewing an AI-built or traditionally developed web app before launch.", "Operators checking whether a public page still reflects the product after a release."],
      },
      {
        heading: "Know what a URL scan cannot confirm",
        body: "This is a public-page review, not a full application audit. A browser-visible scan cannot prove that private APIs, source code, database rules, payment webhooks, or backups are configured correctly. Treat those as owner checks and use a qualified security review when the risk calls for one.",
        points: ["The scan samples the submitted page and selected same-site links; it is not a complete site crawl.", "It cannot sign in, access private pages, or inspect your repository or hosting account.", "A score is a prioritization aid, not a certification, compliance result, or guarantee of launch success."],
      },
      {
        heading: "Free report and optional launch plan",
        body: "Start with the free report: it includes the score, category scores, and findings recorded by the scan, with the highest-priority items highlighted. If you need a more structured next step, the optional one-time launch plan organizes the findings into a checklist and coding-agent brief. The offer and price are shown on the homepage before checkout.",
        points: ["No signup is needed to run the first free scan.", "The paid plan is optional; the public scan itself does not charge you.", "Read the methodology to understand the score and its evidence limits."],
      },
    ],
    steps: [],
  },
} as const;
