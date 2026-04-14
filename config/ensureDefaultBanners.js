import Banner from "../models/Banner.js";
import { invalidateBannersCache } from "../utils/apiCache.js";
import { DEFAULT_HERO_SLIDES } from "./defaultHeroBanners.js";

/** Seed hero slides once when the database has no banner documents at all. */
export async function ensureDefaultBannersOnStartup() {
  const total = await Banner.countDocuments();
  if (total > 0) return;
  await Banner.insertMany(DEFAULT_HERO_SLIDES);
  invalidateBannersCache();
  console.log("[banners] Seeded default hero carousel (empty database).");
}
