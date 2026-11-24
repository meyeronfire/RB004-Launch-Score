import type { Category } from "@/lib/types";

export const CATEGORY_ACCENTS: Record<Category, string> = {
  clarity: "#72dce6",
  conversion: "#ff967a",
  design_brand: "#bea8ff",
  trust: "#f1c66e",
  technical: "#75bfff",
  security: "#ff7f9b",
  seo_aeo: "#73d7af",
};

export const CATEGORY_INDICATOR_ACCENTS: Record<Category, string> = {
  clarity: "#72dce6",
  conversion: "#ff967a",
  design_brand: "#bea8ff",
  trust: "#f1c66e",
  technical: "#75bfff",
  security: "#ff7f9b",
  seo_aeo: "#73d7af",
};

export function categoryAccent(category: Category): string {
  return CATEGORY_ACCENTS[category];
}

export function categoryIndicatorAccent(category: Category): string {
  return CATEGORY_INDICATOR_ACCENTS[category];
}
