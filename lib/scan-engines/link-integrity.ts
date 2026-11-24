import { makeFinding } from "../score";
import { evidenceUrl, recordFinding, type ScanEngine } from "./engine";

export function linkState(status: number | undefined) {
  if (status === 404 || status === 410) return "missing";
  if (status === 304 || (status !== undefined && status >= 200 && status < 300)) return "reachable";
  if (status === 401 || status === 403 || status === 429) return "restricted";
  if (status !== undefined && status >= 500 && status < 600) return "server_error";
  return "unknown";
}

export function summarizeLinkStatuses(statuses: Array<number | undefined>) {
  const states = statuses.map(linkState);
  return {
    checked: statuses.filter((status) => status !== undefined).length,
    brokenCount: states.filter((state) => state === "missing").length,
    unknownCount: states.filter((state) => state !== "missing" && state !== "reachable").length,
  };
}

export function isLinkProbeCandidate(url: URL) {
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search &&
    !/(?:^|\/)(?:logout|log-out|signout|sign-out|unsubscribe|delete|checkout-session)(?:\/|$)/i.test(url.pathname);
}

type Target = { url: string; priority: boolean };
type Probe = { status?: number; redirects?: number; redirectLimit?: boolean };
type Observations = { entryUrl: string; targets: Target[]; date: string; probe: (url: string) => Promise<Probe> };
type Result = { statusByUrl: Map<string, number | undefined>; findings: ReturnType<typeof makeFinding>[]; checked: number; broken: string[]; unknownCount: number };

export const linkIntegrity: ScanEngine<Observations, Result> = {
  id: "links",
  version: "2",
  timeoutMs: 17_000,
  async run({ entryUrl, targets, date, probe }, signal) {
    const selected = new Map<string, Target & { aliases: string[] }>();
    for (const target of [...targets].sort((a, b) => Number(b.priority) - Number(a.priority))) {
      let url: URL;
      try { url = new URL(target.url); } catch { continue; }
      if (!isLinkProbeCandidate(url)) continue;
      url.hash = "";
      if (url.href === evidenceUrl(entryUrl)) continue;
      const previous = selected.get(url.href);
      if (previous) previous.aliases.push(target.url);
      else if (selected.size < 12) selected.set(url.href, { ...target, url: url.href, aliases: [target.url] });
    }

    const result: Result = { statusByUrl: new Map(), findings: [], checked: 0, broken: [], unknownCount: 0 };
    const candidates = [...selected.values()];
    let redirectIssues = 0;
    const statuses: Array<number | undefined> = [];
    for (let offset = 0; offset < candidates.length; offset += 4) {
      signal.throwIfAborted();
      await Promise.all(candidates.slice(offset, offset + 4).map(async ({ url, priority, aliases }) => {
        const observation = await probe(url).catch((): Probe => ({}));
        const state = linkState(observation.status);
        statuses.push(observation.status);
        for (const alias of aliases) result.statusByUrl.set(alias, observation.status);
        if (state === "missing") result.broken.push(url);
        if (state !== "missing" && !observation.redirectLimit && (observation.redirects ?? 0) < 3) return;
        const missing = state === "missing";
        if (!missing) redirectIssues++;
        const ruleId = missing ? "missing-destination" : "redirect-chain";
        const finding = makeFinding({
          category: priority ? "conversion" : "technical", section: "technical",
          severity: missing ? (priority ? "high" : "medium") : "low",
          confidence: missing ? "confirmed" : "review",
          title: missing ? (priority ? "A primary action points to a missing page" : "A link points to a missing resource") : "A link uses a long redirect chain",
          why_it_matters: priority ? "Visitors may miss the next step in their journey." : "Visitors may be unable to open the linked resource reliably.",
          evidence: `${evidenceUrl(url)} · ${missing ? `HTTP ${observation.status}` : observation.redirectLimit ? "Exceeded the redirect limit" : `${observation.redirects} redirects`}`,
          fix: "Update the link to the working destination and verify it in the deployed page.",
        });
        const normalized = recordFinding(finding, url, { engine: "links", version: "2", ruleId }, date);
        result.findings.push({ ...normalized, id: `link-${normalized.fingerprint}` });
      }));
    }
    const summary = summarizeLinkStatuses(statuses);
    result.checked = summary.checked;
    result.unknownCount = summary.unknownCount;
    result.findings.sort((a, b) => (a.affectedUrl ?? "").localeCompare(b.affectedUrl ?? ""));
    return {
      value: result,
      status: candidates.length === 0 ? "not_applicable" : result.unknownCount ? "incomplete" : result.broken.length ? "issues" : redirectIssues ? "manual" : "passed",
      note: `${candidates.length} destinations sampled. ${result.unknownCount} could not be confirmed.`,
    };
  },
};
