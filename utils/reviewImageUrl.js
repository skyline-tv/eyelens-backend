/**
 * Allow only same-origin upload paths or Cloudinary image URLs for review photos.
 * Returns safe string to persist (path or full HTTPS URL), or "".
 */
export function sanitizeReviewImageUrl(raw) {
  const u = String(raw || "").trim().slice(0, 2000);
  if (!u) return "";
  if (u.startsWith("/uploads/reviews/") && !u.includes("..")) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return "";
    if (parsed.pathname.startsWith("/uploads/reviews/") && !parsed.pathname.includes("..")) {
      return `${parsed.pathname}${parsed.search || ""}`;
    }
    if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//i.test(u)) return u;
  } catch {
    /* ignore */
  }
  return "";
}
