import type { Category } from "@/lib/types";

export const CATEGORY_ACCENTS: Record<Category, string> = {
  clarity: "#f4c95d",
  conversion: "#ff2e7e",
  design_brand: "#b99aff",
  trust: "#62d9be",
  technical: "#70bdff",
  security: "#ff745e",
  seo_aeo: "#70df9b",
};

export function categoryAccent(category: Category): string {
  return CATEGORY_ACCENTS[category];
}
