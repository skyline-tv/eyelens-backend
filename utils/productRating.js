import Product from "../models/Product.js";

/** Recompute averageRating, reviewCount, and legacy rating field from embedded reviews. */
export async function recalcProductRating(productId) {
  const p = await Product.findById(productId).select("reviews");
  if (!p || !p.reviews?.length) {
    await Product.updateOne({ _id: productId }, { $set: { averageRating: 0, reviewCount: 0 } });
    return;
  }
  const sum = p.reviews.reduce((s, r) => s + r.rating, 0);
  const avg = Math.round((sum / p.reviews.length) * 10) / 10;
  await Product.updateOne(
    { _id: productId },
    { $set: { averageRating: avg, reviewCount: p.reviews.length, rating: avg } }
  );
}
