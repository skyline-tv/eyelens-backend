import NodeCache from "node-cache";

/** Short TTL caches for public GET responses */
const productsCache = new NodeCache({ stdTTL: 60, checkperiod: 75, useClones: false });
const bannersCache = new NodeCache({ stdTTL: 300, checkperiod: 320, useClones: false });

export function productsListCacheKey(query) {
  const sorted = Object.keys(query || {})
    .sort()
    .reduce((acc, k) => {
      acc[k] = query[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export function getCachedProducts(key) {
  return productsCache.get(key);
}

export function setCachedProducts(key, data) {
  productsCache.set(key, data);
}

export function invalidateProductsCache() {
  productsCache.flushAll();
}

export function getCachedBanners() {
  return bannersCache.get("public");
}

export function setCachedBanners(data) {
  bannersCache.set("public", data);
}

export function invalidateBannersCache() {
  bannersCache.flushAll();
}
