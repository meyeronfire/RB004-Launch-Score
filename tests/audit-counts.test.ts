import { describe, expect, it } from "vitest";
import { calculateAuditCounts } from "../lib/audit-counts";

describe("audit counts", () => {
  it("counts only checks with a verified outcome", () => {
    const result = calculateAuditCounts({
      https: { state: "checked", value: "Secure" },
      contentSecurityPolicy: { state: "checked", value: "Missing" },
      designContrastFailures: { state: "checked", value: 0 },
      pageSpeedMobile: { state: "unknown", note: "not configured" },
      designFontFamilies: { state: "checked", value: 3 },
    }, []);
    expect(result).toEqual({ checksRun: 3, passed: 2, issues: 1 });
  });
});
