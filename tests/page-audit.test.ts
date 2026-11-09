import { describe, expect, it } from "vitest";
import { inspectLinkedPage } from "../lib/page-audit";

describe("lightweight linked-page audits", () => {
  it("extracts visible HTML-level signals and treats empty alt as an intentional value", () => {
    const result = inspectLinkedPage("/pricing", 200, "text/html; charset=utf-8", `
      <html><head><title>Plans for teams</title>
        <meta content="Compare the plans" name="description">
        <meta content="noindex, follow" name="robots">
      </head><body><h1>Pricing</h1><img src="decorative.svg" alt=""><img src="chart.png"></body></html>`);

    expect(result).toEqual({ path: "/pricing", state: "checked", status: 200, title: "Plans for teams", descriptionPresent: true, h1Count: 1, imageCount: 2, imagesMissingAlt: 1, noindex: true });
  });

  it("reports unavailable metadata for HTTP errors and non-HTML pages", () => {
    expect(inspectLinkedPage("/missing", 404, "text/html", "")).toMatchObject({ state: "checked", status: 404, note: "The linked page returned an HTTP error." });
    expect(inspectLinkedPage("/feed.xml", 200, "application/xml", "<feed/>")).toMatchObject({ state: "checked", status: 200, note: "Non-HTML response; page metadata was not inspected." });
  });
});
