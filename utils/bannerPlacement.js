/** Matches storefront + admin: category-only rows are not in the hero carousel. */
export function isHomeCategoryPlacement(placement) {
  return typeof placement === "string" && placement.startsWith("home_cat_");
}
