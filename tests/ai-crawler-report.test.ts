import { describe, expect, it } from "vitest";
import { getRobotsPolicy } from "../lib/robots";
import { buildAiCrawlerReport } from "../lib/ai-crawler-report";

describe("AI crawler policy report", () => {
  it("reports per-crawler robots matches without claiming live crawler requests", () => {
    const report = buildAiCrawlerReport({
      robotsText: "User-agent: *\nDisallow: /private\nUser-agent: GPTBot\nDisallow: /\nUser-agent: OAI-SearchBot\nAllow: /",
      robotsUrl: "https://site.test/robots.txt",
      pagePath: "/",
      fetchedAt: "2026-11-07T00:00:00.000Z",
    });
    expect(report.state).toBe("checked");
    expect(report.policies.find((bot) => bot.userAgent === "GPTBot")).toMatchObject({ policy: "blocked", requestTested: false });
    expect(report.policies.find((bot) => bot.userAgent === "OAI-SearchBot")).toMatchObject({ policy: "allowed", requestTested: false });
    expect(report.policies.find((bot) => bot.userAgent === "ClaudeBot")).toMatchObject({ policy: "no_matching_rule", requestTested: false });
    expect(report.policies.find((bot) => bot.userAgent === "Perplexity-User")).toMatchObject({ policy: "no_matching_rule", requestTested: false });
  });

  it("uses bounded matching and longest-rule allow precedence for crawler policies", () => {
    const rules = `User-agent: *\nDisallow: /private\nUser-agent: GPTBot\nDisallow: /private/secret\nAllow: /private/secret/open`;
    const report = buildAiCrawlerReport({ robotsText: rules, pagePath: "/private/secret/open", fetchedAt: "2026-11-07T00:00:00.000Z" });
      const reportPolicy = report.policies.find((bot) => bot.userAgent === "GPTBot");
    expect(reportPolicy).toMatchObject({ policy: "allowed", requestTested: false });
    expect(reportPolicy?.matchedRules).toEqual(getRobotsPolicy(rules, "GPTBot", "/private/secret/open").matchedRules);
    const start = performance.now();
    expect(getRobotsPolicy(`User-agent: GPTBot\nDisallow: /${"a*".repeat(15)}b$`, "GPTBot", `/${"a".repeat(100)}c`).effective).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("keeps training/data-use preferences separate from crawler access and the score", () => {
    const report = buildAiCrawlerReport({
      robotsText: "User-agent: Google-Extended\nDisallow: /\nUser-agent: __usage_ai-training\nDisallow: /",
      robotsUrl: "https://site.test/robots.txt",
      pagePath: "/",
      fetchedAt: "2026-11-07T00:00:00.000Z",
    });
    expect(report.preferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ signal: "Google-Extended", status: "blocked" }),
      expect.objectContaining({ signal: "__usage_ai-training", status: "blocked" }),
    ]));
    expect(report.note).toMatch(/does not prove|nicht belegt/i);
  });

  it("does not treat wildcard crawl rules as a shared training-use preference", () => {
    const report = buildAiCrawlerReport({ robotsText: "User-agent: *\nDisallow: /", pagePath: "/", fetchedAt: "2026-11-07T00:00:00.000Z" });
    expect(report.policies.find((bot) => bot.userAgent === "GPTBot")?.policy).toBe("blocked");
    expect(report.preferences.find((preference) => preference.signal === "__usage_ai-training")?.status).toBe("not_declared");
  });

  it("matches the AIPREF training-use token exactly", () => {
    const report = buildAiCrawlerReport({ robotsText: "User-agent: __usage_ai\nDisallow: /", pagePath: "/", fetchedAt: "2026-11-07T00:00:00.000Z" });
    expect(report.preferences.find((preference) => preference.signal === "__usage_ai-training")?.status).toBe("not_declared");
  });

  it("marks robots-derived access unknown when robots.txt could not be fetched", () => {
    const report = buildAiCrawlerReport({ robotsText: undefined, pagePath: "/", fetchedAt: "2026-11-07T00:00:00.000Z" });
    expect(report.state).toBe("unknown");
    expect(report.policies.every((bot) => bot.policy === "unknown" && bot.requestTested === false)).toBe(true);
    expect(report.preferences.every((preference) => preference.status === "unknown")).toBe(true);
  });
});
