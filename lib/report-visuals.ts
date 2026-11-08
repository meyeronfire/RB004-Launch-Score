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

export const CATEGORY_INDICATOR_ACCENTS: Record<Category, string> = {
  clarity: "#78e8f3",
  conversion: "#ff2e7e",
  design_brand: "#9edcff",
  trust: "#ffad78",
  technical: "#78c9ef",
  security: "#ff2e7e",
  seo_aeo: "#ffad78",
};

export function categoryAccent(category: Category): string {
  return CATEGORY_ACCENTS[category];
}

export function categoryIndicatorAccent(category: Category): string {
  return CATEGORY_INDICATOR_ACCENTS[category];
}
