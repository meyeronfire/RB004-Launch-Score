import type { Category } from "@/lib/types";

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  clarity: 25,
  conversion: 25,
  design_brand: 15,
  trust: 10,
  technical: 15,
  security: 10,
};

// The four Lighthouse category values inform one Technical score only.
// They are shown separately in the report and never become duplicate findings.
export const LIGHTHOUSE_TECHNICAL_SHARE = 0.35;
