import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { detectFrontendSecrets, formFindings, inspectExposedFiles, inspectSecurityHeaders, sourceMapUrls } from "../lib/depth-checks";
import { MAX_SCAN_REQUESTS, ScanRequestBudget } from "../lib/request-budget";
import { promptVariants, emptyDrafts } from "../lib/fix-prompts";
import { dedupeFindings, makeFinding, scoreFindings } from "../lib/score";
import { findingResult } from "../lib/finding-result";

describe("security depth checks", () => {
  it("recognizes common fake keys and returns only masked values", () => {
    const serviceRole = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signaturetoken123`;
    const source = ["sk-" + "a".repeat(24), "sk_live_" + "b".repeat(20), "AIza" + "c".repeat(35), "ghp_" + "d".repeat(28), "xoxb-" + "e".repeat(24), "AKIA" + "ABCDEFGH12345678", serviceRole].join(" ");
    const findings = detectFrontendSecrets(source, "https://site.test/assets/app.js");
    expect(findings.map((item) => item.type)).toEqual(expect.arrayContaining(["API secret (sk-)", "Stripe secret key", "Google API key", "GitHub token", "Slack token", "AWS access key ID", "Supabase service_role token"]));
    expect(findings.every((item) => item.masked.endsWith("••••"))).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("a".repeat(24));
    expect(JSON.stringify(findings)).not.toContain(serviceRole);
  });

  it("parses header names case-insensitively and accepts either frame defense", () => {
    const result = inspectSecurityHeaders({ "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'", "Strict-Transport-Security": "max-age=31536000", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=()" });
    expect(result.checks).toMatchObject({ contentSecurityPolicy: { value: "Present" }, frameProtection: { value: "Present" }, strictTransportSecurity: { value: "Present" }, contentTypeOptions: { value: "Present" } });
    expect(result.findings.map((item) => item.title)).not.toContain("Missing frame-ancestors / X-Frame-Options security header");
  });

  it("distinguishes missing, safely configured, and explicitly weak CSP headers", () => {
    const missing = inspectSecurityHeaders({});
    const safe = inspectSecurityHeaders({ "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'" });
    const weak = inspectSecurityHeaders({ "content-security-policy": "default-src *; script-src 'self' 'unsafe-eval'" });
    const inlineWeak = inspectSecurityHeaders({ "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'" });
    const defaultInlineWeak = inspectSecurityHeaders({ "content-security-policy": "default-src 'self' 'unsafe-inline'" });
    const nonceBacked = inspectSecurityHeaders({ "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-abc123'" });
    expect(missing.checks.contentSecurityPolicy.value).toBe("Missing");
    expect(missing.findings.map((finding) => finding.title)).toContain("Missing Content-Security-Policy security header");
    expect(safe.checks.contentSecurityPolicy.value).toBe("Present");
    expect(safe.findings.some((finding) => /Content-Security-Policy/.test(finding.title))).toBe(false);
    expect(weak.checks.contentSecurityPolicy.value).toBe("Weak");
    const weakPolicyFindings = weak.findings.filter((finding) => finding.title.includes("Content-Security-Policy"));
    expect(weakPolicyFindings).toHaveLength(1);
    expect(weakPolicyFindings[0].title).toContain("weak script sources");
    expect(inlineWeak.checks.contentSecurityPolicy.value).toBe("Weak");
    expect(defaultInlineWeak.checks.contentSecurityPolicy.value).toBe("Weak");
    expect(nonceBacked.checks.contentSecurityPolicy.value).toBe("Present");
  });

  it("does not treat a missing form action as proof of a broken form", () => {
    const form = { action: "", method: "get", fields: 1, unlabeledFields: 0, emailInputs: 0, invalidEmailInputs: 0, handlerVisible: false };
    const findings = formFindings({ forms: [form], primaryCtas: [], statusByUrl: new Map(), baseUrl: "https://site.test/" });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("review");
    expect(findingResult(findings[0])).toBe("Needs review");
    expect(findings[0].evidence).toContain("Native forms may submit to the current page");
    expect(scoreFindings(findings, { conversion: 1 }).categoryScores.conversion).toBe(100);
  });

  it("accepts script-handled and labeled forms, and leaves absent or dynamic forms unflagged", () => {
    const statusByUrl = new Map<string, number | undefined>();
    const baseUrl = "https://site.test/";
    const jsForm = { action: "", method: "post", fields: 1, unlabeledFields: 0, emailInputs: 1, invalidEmailInputs: 0, handlerVisible: true };
    expect(formFindings({ forms: [jsForm], primaryCtas: [], statusByUrl, baseUrl })).toEqual([]);
    expect(formFindings({ forms: [], primaryCtas: [], statusByUrl, baseUrl })).toEqual([]);
    const labeled = { ...jsForm, action: "/submit" };
    expect(formFindings({ forms: [labeled], primaryCtas: [], statusByUrl, baseUrl })).toEqual([]);
  });

  it("aggregates repeated form findings without losing which forms need review", () => {
    const forms = [
      { action: "", method: "post", fields: 2, unlabeledFields: 1, emailInputs: 0, invalidEmailInputs: 0, handlerVisible: false },
      { action: "", method: "post", fields: 2, unlabeledFields: 2, emailInputs: 0, invalidEmailInputs: 0, handlerVisible: false },
    ];
    const findings = formFindings({ forms, primaryCtas: [], statusByUrl: new Map(), baseUrl: "https://site.test/" });
    expect(findings).toHaveLength(2);
    expect(findings.find((finding) => finding.confidence === "review")?.evidence).toContain("Forms 1, 2");
    expect(findings.find((finding) => finding.title.includes("accessible label"))?.evidence).toContain("3 unlabeled user-facing fields in total");
  });

  it("deduplicates repeated rules and retains the confirmed observation", () => {
    const base = { section: "security" as const, category: "security" as const, severity: "high" as const, title: "Missing CSP", why_it_matters: "Headers matter.", evidence: "CSP missing.", fix: "Set CSP." };
    const review = makeFinding({ ...base, confidence: "review" });
    const confirmed = makeFinding(base);
    expect(dedupeFindings([review, confirmed])).toEqual([confirmed]);
    expect(scoreFindings([review], { security: 1 }).categoryScores.security).toBe(100);
    expect(scoreFindings([confirmed], { security: 1 }).categoryScores.security).toBe(87);
  });

  it("does not deduct heuristic trust findings that the report labels for review", () => {
    const review = makeFinding({ section: "other", category: "trust", severity: "medium", title: "No recognizable proof signal was detected", why_it_matters: "Proof may need owner review.", evidence: "No proof signal detected.", fix: "Review proof with the owner." });
    expect(findingResult(review)).toBe("Needs review");
    expect(scoreFindings([review], { trust: 1 }).categoryScores.trust).toBe(100);
  });

  it("finds exposed environment files and source maps without retaining response contents", async () => {
    const bodies: Record<string, string> = { "/.env": "PRIVATE_TEST_SECRET=do-not-store", "/assets/app.js.map": JSON.stringify({ version: 3, sources: ["app.js"], mappings: "AAAA", sourcesContent: ["const key='sk-" + "z".repeat(25) + "';"] }) };
    let server: Server | undefined;
    const origin = await new Promise<string>((resolve) => {
      server = createServer((request, response) => { const body = bodies[request.url ?? ""]; response.statusCode = body ? 200 : 404; response.end(request.method === "HEAD" ? undefined : body); });
      server.listen(0, "127.0.0.1", () => { const address = server?.address(); if (address && typeof address === "object") resolve(`http://127.0.0.1:${address.port}`); });
    });
    try {
      const result = await inspectExposedFiles(origin, [{ url: `${origin}/assets/app.js`, source: "//# sourceMappingURL=app.js.map" }], async (url, options) => {
        const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(options.timeoutMs) });
        return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()).subarray(0, options.maxBytes) };
      });
      expect(result.exposed).toEqual(expect.arrayContaining(["/.env", "/assets/app.js.map"]));
      expect(result.findings.some((finding) => finding.evidence.includes("sk-z••••"))).toBe(true);
      expect(JSON.stringify(result)).not.toContain("PRIVATE_TEST_SECRET");
      expect(JSON.stringify(result)).not.toContain("do-not-store");
      expect(JSON.stringify(result)).not.toContain("z".repeat(25));
    } finally { if (server?.listening) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve())); }
  });

  it("keeps source maps same-suffix and request budgets capped", () => {
    expect(sourceMapUrls("//# sourceMappingURL=app.js.map", "https://site.test/assets/app.js")).toEqual(["https://site.test/assets/app.js.map"]);
    const budget = new ScanRequestBudget();
    for (let index = 0; index < MAX_SCAN_REQUESTS; index++) budget.consume();
    expect(budget.remaining).toBe(0);
    expect(() => budget.consume()).toThrow("60-request limit");
  });

  it("asks the coding tool to inspect the repository and gives finding-specific acceptance checks", () => {
    const prompt = promptVariants({ url: "https://site.test/", title: "Launch", stack: ["Next.js"], copyDrafts: emptyDrafts(), findings: [
      makeFinding({ section: "security", category: "security", severity: "high", title: "Missing CSP", why_it_matters: "Headers matter.", evidence: "CSP was missing.", fix: "Set CSP." }),
      makeFinding({ section: "seo", category: "seo_aeo", severity: "medium", title: "Missing canonical", why_it_matters: "Canonical matters.", evidence: "None found.", fix: "Add canonical." }),
    ] }).Codex;
    expect(prompt).toContain("Inspect the actual repository");
    expect(prompt).toContain("**ACCEPTANCE CRITERIA**\nThe relevant response");
    expect(prompt).toContain("**ACCEPTANCE CRITERIA**\nThe rendered document");
    expect(prompt).not.toContain("async headers()");
    expect(promptVariants({ url: "https://site.test/", title: "Launch", stack: [], copyDrafts: emptyDrafts(), findings: [] })["Claude Code"]).toContain("Work in the existing repository");
  });
});
