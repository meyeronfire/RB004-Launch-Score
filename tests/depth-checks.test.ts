import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { detectFrontendSecrets, inspectExposedFiles, inspectSecurityHeaders, sourceMapUrls } from "../lib/depth-checks";
import { MAX_SCAN_REQUESTS, ScanRequestBudget } from "../lib/request-budget";
import { promptVariants, emptyDrafts } from "../lib/fix-prompts";
import { makeFinding } from "../lib/score";

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

  it("includes stack-aware security and SEO snippets in the paid fix prompt", () => {
    const prompt = promptVariants({ url: "https://site.test/", title: "Launch", stack: ["Next.js"], copyDrafts: emptyDrafts(), findings: [
      makeFinding({ section: "security", category: "security", severity: "high", title: "Missing CSP", why_it_matters: "Headers matter.", evidence: "CSP was missing.", fix: "Set CSP." }),
      makeFinding({ section: "seo", category: "technical", severity: "medium", title: "Missing canonical", why_it_matters: "Canonical matters.", evidence: "None found.", fix: "Add canonical." }),
    ] }).Codex;
    expect(prompt).toContain("async headers()");
    expect(prompt).toContain("export const metadata");
    expect(prompt).toContain("frame-ancestors 'none'");
    expect(promptVariants({ url: "https://site.test/", title: "Launch", stack: [], copyDrafts: emptyDrafts(), findings: [] })["Claude Code"]).toContain("Work in the existing repository");
  });
});
