import { describe, expect, it } from "vitest";
import { isRobotsDisallowed } from "../lib/scanner";

const disallowed = (pattern: string, target: string) => isRobotsDisallowed(`User-agent: *\nDisallow: ${pattern}`, target);
describe("bounded robots wildcard matching", () => {
  it("returns promptly for the tiny repeated-wildcard backtracking attack", () => {
    const start = performance.now();
    expect(disallowed(`/${"a*".repeat(15)}b$`, `/${"a".repeat(100)}c`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
  it("keeps prefix anchoring, suffix anchors, literal regex punctuation and wildcard semantics", () => {
    for (const [pattern, target, expected] of [
      ["/private", "/private/page", true], ["/private", "/public/private", false],
      ["/*.pdf$", "/files/report.pdf", true], ["/*.pdf$", "/files/report.pdf?download=1", false],
      ["/a*b*c$", "/a/one/b/two/c", true], ["/a*b*c$", "/ab/c/extra", false],
      ["/a*a$", "/a", false], ["/a*a$", "/aa", true], ["/**$", "/anything", true],
      ["/file.json?x=[1]$", "/file.json?x=[1]", true], ["/file.json$", "/fileXjson", false],
    ] as const) expect(disallowed(pattern, target), `${pattern}: ${target}`).toBe(expected);
  });
  it("preserves longest-match Allow and equally specific Allow precedence", () => {
    const rules = "User-agent: *\nDisallow: /private/\nAllow: /private/shared/\nDisallow: /*.pdf$\nAllow: /private/shared/open.pdf$";
    expect(isRobotsDisallowed(rules, "/private/shared/page")).toBe(false);
    expect(isRobotsDisallowed(rules, "/private/hidden")).toBe(true);
    expect(isRobotsDisallowed(rules, "/private/shared/open.pdf")).toBe(false);
    expect(isRobotsDisallowed("User-agent: *\nDisallow: /same\nAllow: /same", "/same/page")).toBe(false);
  });
});
