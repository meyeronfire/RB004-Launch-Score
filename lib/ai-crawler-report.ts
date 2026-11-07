import { getRobotsPolicy } from "./robots";
import type { AiCrawlerPolicy, AiCrawlerReport, AiCrawlerPreference } from "./types";

type Input = { robotsText?: string; robotsUrl?: string; pagePath: string; fetchedAt: string };

const crawlers: Array<{ name: string; userAgent: string; purpose: string }> = [
  { name: "GPTBot", userAgent: "GPTBot", purpose: "OpenAI model crawler token" },
  { name: "OAI-SearchBot", userAgent: "OAI-SearchBot", purpose: "OpenAI search crawler token" },
  { name: "OAI-AdsBot", userAgent: "OAI-AdsBot", purpose: "OpenAI advertising crawler token" },
  { name: "ChatGPT-User", userAgent: "ChatGPT-User", purpose: "OpenAI user-triggered retrieval token" },
  { name: "ClaudeBot", userAgent: "ClaudeBot", purpose: "Anthropic model crawler token" },
  { name: "Claude-SearchBot", userAgent: "Claude-SearchBot", purpose: "Anthropic search crawler token" },
  { name: "Claude-User", userAgent: "Claude-User", purpose: "Anthropic user-triggered retrieval token" },
  { name: "PerplexityBot", userAgent: "PerplexityBot", purpose: "Perplexity search crawler token" },
  { name: "Perplexity-User", userAgent: "Perplexity-User", purpose: "Perplexity user-triggered retrieval token" },
];
const preferenceTokens = [
  { signal: "Google-Extended", label: "Google-Extended preference" },
  { signal: "__usage_ai-training", label: "AIPREF training preference (support varies)" },
];

export function buildAiCrawlerReport(input: Input): AiCrawlerReport {
  const known = input.robotsText !== undefined;
  const policies: AiCrawlerPolicy[] = crawlers.map((crawler) => {
    const result = known ? getRobotsPolicy(input.robotsText ?? "", crawler.userAgent, input.pagePath) : undefined;
    const effective = result?.effective;
    return {
      ...crawler,
      policy: !known ? "unknown" : effective ? effective.directive === "disallow" ? "blocked" : "allowed" : "no_matching_rule",
      matchedRules: result?.matchedRules ?? [],
      requestTested: false,
    };
  });
  const preferences: AiCrawlerPreference[] = preferenceTokens.map(({ signal, label }) => {
    const result = known ? getRobotsPolicy(input.robotsText ?? "", signal, input.pagePath, { fallbackToWildcard: signal !== "__usage_ai-training", exactAgentMatch: signal === "__usage_ai-training" }) : undefined;
    const effective = result?.effective;
    return {
      signal, label,
      status: !known ? "unknown" : effective ? effective.directive === "disallow" ? "blocked" : "allowed" : "not_declared",
      matchedRules: result?.matchedRules ?? [],
    };
  });
  return {
    state: known ? "checked" : "unknown",
    ...(input.robotsUrl ? { robotsUrl: input.robotsUrl } : {}),
    fetchedAt: input.fetchedAt,
    policies,
    preferences,
    note: "This is a robots.txt policy read for the scanned path; no crawler requests were sent. It does not prove real bot traffic, indexing, citations, or whether a provider uses or retains page data for training. User-triggered fetchers may not be governed by robots.txt; provider behavior is not tested here.",
  };
}
