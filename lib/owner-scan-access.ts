export function isOwnerScanRedirectAllowed(from: URL, to: URL) {
  return !isOwnerScanTarget(from) || isOwnerScanTarget(to);
}

export function isOwnerScanTarget(target: URL) {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  const ownerHosts = (process.env.RB004_OWNER_SCAN_HOSTS ?? "").split(/[\s,]+/).map((host) => host.trim().toLowerCase()).filter(Boolean);
  return ownerHosts.includes(target.hostname);
}
