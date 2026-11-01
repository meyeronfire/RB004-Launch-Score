import { describe, expect, it } from "vitest";
import { scanFailureMessage } from "../lib/scanner";
import { SafeFetchError } from "../lib/ssrf";

describe("scan failure messages", () => {
  it("explains common public scan failures and avoids internal error details", () => {
    expect(scanFailureMessage(new SafeFetchError("The page took too long to respond."))).toMatch(/too long to respond/i);
    expect(scanFailureMessage(new SafeFetchError("This site is blocking automated review."))).toMatch(/blocking automated review/i);
    expect(scanFailureMessage(new SafeFetchError("This URL does not return a reviewable HTML page."))).toMatch(/reviewable HTML page/i);
    expect(scanFailureMessage(new Error("secret internal stack trace"))).toMatch(/could not be scanned/i);
  });
});
