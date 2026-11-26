import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFinding } from "../score";
import { recordFinding, type ScanEngine } from "./engine";

type Input = { html: string; url: string; date: string };
type Issue = { type?: string; message?: string; lastLine?: number };
const relevant = [
  { id: "duplicate-id", pattern: /^Duplicate ID/i, title: "HTML contains duplicate IDs", fix: "Give each element a unique ID and update any labels or references to it." },
  { id: "nested-form", pattern: /element [“"]?form[”"]?.*(?:not allowed|open form|form element)|start tag [“"]?form[”"]? seen/i, title: "A form may be parsed in an unexpected location", fix: "Review the form structure and remove invalid nesting. Verify association of fields and submit controls in the rendered DOM." },
  { id: "invalid-interaction", pattern: /(?:element|descendant).*(?:button|interactive|anchor).*(?:not allowed|must not appear)/i, title: "HTML nests interactive controls", fix: "Separate nested links or buttons and verify focus order and activation with a keyboard." },
] as const;

export function markupFindings(messages: Issue[], input: Input, version: string) {
  return relevant.flatMap((rule) => {
    const matches = messages.filter((issue) => issue.type === "error" && rule.pattern.test(issue.message ?? ""));
    if (!matches.length) return [];
    const elements = matches.slice(0, 4).map(({ lastLine }) => ({ detail: Number.isSafeInteger(lastLine) ? `Response HTML, line ${lastLine}` : "Response HTML" }));
    return [recordFinding(makeFinding({
      category: "technical", section: "technical", severity: "low", confidence: "review",
      title: rule.title,
      why_it_matters: "Invalid document structure can change how a browser associates and renders elements.",
      evidence: `Nu Html Checker returned ${matches.length} matching error(s) in the delivered HTML.`,
      fix: rule.fix,
    }), input.url, { engine: "markup", version, ruleId: rule.id, elements, measured: matches.length, expected: 0 }, input.date)];
  });
}

function validateDocument(executable: string, jar: string, file: string, signal: AbortSignal): Promise<string> {
  const args = ["-Xmx128m", "-Djava.io.tmpdir=" + tmpdir(), "-jar", jar, "--format", "json", "--errors-only", "--no-stream", file];
  const isolated = process.env.NODE_ENV === "production";
  return new Promise((resolve, reject) => {
    execFile(isolated ? "/usr/bin/unshare" : executable, isolated ? ["--user", "--map-root-user", "--net", "--", executable, ...args] : args, {
      signal, killSignal: "SIGKILL", maxBuffer: 384_000, env: { NODE_ENV: process.env.NODE_ENV, LANG: "C.UTF-8", PATH: "/usr/bin:/bin" },
    }, (error, stdout, stderr) => {
      if (error && error.code !== 1) return reject(error);
      resolve(stdout.trim() || stderr.trim());
    });
  });
}

export const markup: ScanEngine<Input, ReturnType<typeof markupFindings>> = {
  id: "markup", version: "Nu Html Checker", timeoutMs: 7500,
  async run(input, signal) {
    const jar = process.env.SCAN_NU_JAR;
    const version = process.env.SCAN_NU_VERSION;
    if (!jar || !version) return { value: [], status: "unavailable", note: "The optional Nu Html Checker is not configured on this worker." };
    if (Buffer.byteLength(input.html) > 700_000) return { value: [], status: "incomplete", note: "The full HTML document exceeded the validation size limit." };
    const folder = await mkdtemp(join(tmpdir(), "r4r-markup-"));
    try {
      const file = join(folder, "page.html");
      await writeFile(file, input.html, { mode: 0o600 });
      const output = await validateDocument(process.env.SCAN_JAVA_BIN || "/usr/bin/java", jar, file, signal);
      const data = JSON.parse(output) as { messages?: Issue[] };
      if (!Array.isArray(data.messages) || data.messages.some((issue) => issue.type === "non-document-error")) throw new Error("Nu did not validate the HTML");
      const value = markupFindings(data.messages, input, version);
      return {
        value, version, status: value.length ? "manual" : "passed",
        note: "Only selected structural errors in the delivered HTML are shown. CSS and SVG assets were not fetched.",
      };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
};
