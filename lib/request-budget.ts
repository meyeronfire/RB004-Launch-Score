import { AsyncLocalStorage } from "node:async_hooks";

export const MAX_SCAN_REQUESTS = 60;
export class ScanRequestLimitError extends Error {}

export class ScanRequestBudget {
  private requests = 0;

  get used() { return this.requests; }
  get remaining() { return Math.max(0, MAX_SCAN_REQUESTS - this.requests); }

  consume() {
    if (this.requests >= MAX_SCAN_REQUESTS) throw new ScanRequestLimitError("This scan reached its 60-request limit.");
    this.requests += 1;
  }
}

const budgets = new AsyncLocalStorage<ScanRequestBudget>();
export const currentRequestBudget = () => budgets.getStore();
export function withRequestBudget<T>(budget: ScanRequestBudget, operation: () => Promise<T>) {
  return budgets.run(budget, operation);
}
