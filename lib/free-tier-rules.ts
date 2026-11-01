export const ANONYMOUS_SCAN_LIMIT = 1;
export const EMAIL_SCAN_LIMIT = 3;
export const PAID_RESCAN_DAYS = 7;
export const DEFAULT_FREE_DAILY_BUDGET_USD = 5;

export function freeScanDecision(input: { hasAnonymousUse: boolean; authenticatedEmailScans: number | null }) {
  if (input.authenticatedEmailScans !== null) {
    const remaining = Math.max(0, EMAIL_SCAN_LIMIT - input.authenticatedEmailScans);
    return { allowed: remaining > 0, remaining, requiresEmail: false };
  }
  return input.hasAnonymousUse
    ? { allowed: false, remaining: 0, requiresEmail: true }
    : { allowed: true, remaining: ANONYMOUS_SCAN_LIMIT, requiresEmail: false };
}

export function freeBudgetDecision(spentUsd: number, reservationUsd: number, budgetUsd = DEFAULT_FREE_DAILY_BUDGET_USD) {
  return { allowed: spentUsd + reservationUsd <= budgetUsd, spentUsd, budgetUsd };
}

export function emailClaimDecision(scansUsed: number | null, claimEmailHash: string | null, requestedEmailHash: string) {
  if (claimEmailHash && claimEmailHash !== requestedEmailHash) return { allowed: false, attach: false, scansUsed: scansUsed ?? 0 };
  const attach = claimEmailHash === null;
  const nextScansUsed = scansUsed === null ? 1 : scansUsed + Number(attach);
  return { allowed: nextScansUsed <= EMAIL_SCAN_LIMIT, attach, scansUsed: nextScansUsed };
}

export function paidRescanActive(expiresAt: number, now = Date.now()) {
  return expiresAt > now;
}
