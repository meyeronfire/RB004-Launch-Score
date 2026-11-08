import type { Category } from "@/lib/types";

export const CATEGORY_ACCENTS: Record<Category, string> = {
  clarity: "#ff2e7e",
  conversion: "#ff2e7e",
  design_brand: "#ff2e7e",
  trust: "#ff2e7e",
  technical: "#ff2e7e",
  security: "#ff2e7e",
  seo_aeo: "#ff2e7e",
};

export function categoryAccent(category: Category): string {
  return CATEGORY_ACCENTS[category];
}
