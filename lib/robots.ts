export type RobotsDirective = "allow" | "disallow";
export type RobotsRule = { directive: RobotsDirective; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup = { agents: [], rules: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent" && value) {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length && value) {
      group.rules.push({ directive: key, path: value });
    }
  }
  if (group.agents.length) groups.push(group);
  return groups;
}

function robotsPathMatches(rulePath: string, target: string) {
  const end = rulePath.endsWith("$");
  const segments = (end ? rulePath.slice(0, -1) : rulePath).split("*");
  if (!target.startsWith(segments[0])) return false;
  if (segments.length === 1) return !end || target.length === segments[0].length;
  let cursor = segments[0].length;
  for (let index = 1; index < segments.length; index++) {
    const segment = segments[index];
    if (end && index === segments.length - 1) return target.endsWith(segment) && target.length - segment.length >= cursor;
    const found = target.indexOf(segment, cursor);
    if (found < 0) return false;
    cursor = found + segment.length;
  }
  return true;
}

export type RobotsPolicyOptions = { fallbackToWildcard?: boolean; exactAgentMatch?: boolean };

export function getRobotsPolicy(text: string, userAgent: string, target: string, options: RobotsPolicyOptions = {}) {
  const normalizedAgent = userAgent.toLowerCase();
  const groups = parseRobotsGroups(text);
  const specificity = (group: RobotsGroup) => Math.max(0, ...group.agents
    .filter((agent) => agent !== "*" && (options.exactAgentMatch ? normalizedAgent === agent : normalizedAgent.includes(agent)))
    .map((agent) => agent.length));
  const maxSpecificity = Math.max(0, ...groups.map(specificity));
  const selected = maxSpecificity
    ? groups.filter((group) => specificity(group) === maxSpecificity)
    : options.fallbackToWildcard === false ? [] : groups.filter((group) => group.agents.includes("*"));
  const matchedRules = selected.flatMap((group) => group.rules)
    .filter((rule) => robotsPathMatches(rule.path, target))
    .sort((a, b) => b.path.replace(/[\*$]/g, "").length - a.path.replace(/[\*$]/g, "").length || Number(b.directive === "allow") - Number(a.directive === "allow"));
  return { effective: matchedRules[0], matchedRules };
}

export function isRobotsDisallowed(text: string, target: string) {
  return getRobotsPolicy(text, "rb004-launch-score", target).effective?.directive === "disallow";
}
