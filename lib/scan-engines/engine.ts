import { createHash } from "node:crypto";
import { findingResult } from "../finding-result";
import { withScanSignal } from "../ssrf";
import type { EngineCoverage, EngineId, Finding, FindingSource } from "../types";

export type ScanEngine<Input, Output> = {
  id: EngineId;
  version: string;
  timeoutMs: number;
  run: (input: Input, signal: AbortSignal) => Promise<{
    value: Output;
    status: EngineCoverage["status"];
    note?: string;
    version?: string;
  }>;
};

export async function runEngine<Input, Output>(
  engine: ScanEngine<Input, Output>,
  input: Input,
  parent?: AbortSignal,
): Promise<{ coverage: EngineCoverage; value?: Output }> {
  const startedAt = Date.now();
  const timeout = AbortSignal.timeout(engine.timeoutMs);
  const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
  const base = { id: engine.id, version: engine.version };
  const elapsed = () => Date.now() - startedAt;

  let abort = () => {};
  try {
    signal.throwIfAborted();
    const deadline = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    const result = await Promise.race([deadline, withScanSignal(signal, () => engine.run(input, signal))]);
    return {
      value: result.value,
      coverage: { ...base, version: result.version ?? base.version, status: result.status, note: result.note, durationMs: elapsed() },
    };
  } catch {
    const status = signal.aborted ? "incomplete" : "unavailable";
    const note = parent?.aborted ? "The scan ended before this check finished." :
      timeout.aborted ? "This check reached its time limit." : "This check did not return a usable result.";
    return { coverage: { ...base, status, note, durationMs: elapsed() } };
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export function evidenceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.username = "";
  url.password = "";
  return url.toString();
}

export function fingerprint(rule: string, url: string) {
  return createHash("sha256").update(`v1\0${rule}\0${evidenceUrl(url)}`).digest("hex").slice(0, 24);
}

export function recordFinding(finding: Finding, url: string, source: FindingSource, observedAt: string, issueKey = `${source.engine}:${source.ruleId}`): Finding {
  const verification = finding.confidence === "unknown" ? "unknown" : findingResult(finding) === "Needs review" ? "manual" : "observed";
  return {
    ...finding,
    confidence: finding.confidence ?? (verification === "manual" ? "review" : undefined),
    verification,
    affectedUrl: evidenceUrl(url),
    fingerprint: fingerprint(issueKey, url),
    observedAt,
    sources: [source],
  };
}

export function combineFindings(findings: Finding[]) {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const key = finding.fingerprint ?? finding.id;
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, finding);
      continue;
    }
    const preferred = previous.verification !== "observed" && finding.verification === "observed" ? finding : previous;
    const sources = new Map((previous.sources ?? []).map((source) => [`${source.engine}:${source.ruleId}`, source]));
    for (const source of finding.sources ?? []) sources.set(`${source.engine}:${source.ruleId}`, source);
    unique.set(key, { ...preferred, sources: [...sources.values()] });
  }
  return [...unique.values()];
}
