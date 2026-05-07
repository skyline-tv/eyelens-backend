import mongoose from "mongoose";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { invalidateProductsCache } from "../utils/apiCache.js";
import { recalcProductRating } from "../utils/productRating.js";
import { sanitizeReviewImageUrl } from "../utils/reviewImageUrl.js";

function displayReviewerName(fullName) {
  if (!fullName || typeof fullName !== "string") return "Customer";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Customer";
  if (parts.length === 1) return parts[0];
  const lastInitial = String(parts[parts.length - 1][0] || "").toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

/** GET /api/products/:id/reviews — optional auth adds meta.canReview / hasReviewed */
export async function listProductReviews(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const product = await Product.findById(req.params.id)
      .select("reviews")
      .populate("reviews.user", "name")
      .lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    const reviews = (product.reviews || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        imageUrl: r.imageUrl || "",
        createdAt: r.createdAt,
        userName: displayReviewerName(r.user?.name || r.userName),
        isMine: req.user?.id ? String(r.user?._id || r.user) === req.user.id : false,
      }));

    let meta = { canReview: false, hasReviewed: false, hasPurchased: false };
    if (req.user?.id) {
      const raw = await Product.findById(req.params.id).select("reviews.user").lean();
      const uid = req.user.id;
      const hasReviewed = (raw?.reviews || []).some((r) => String(r.user) === uid);
      const hasOrdered = await Order.exists({
        user: uid,
        status: { $ne: "cancelled" },
        "items.product": req.params.id,
      });
      meta = { hasReviewed, hasPurchased: Boolean(hasOrdered), canReview: Boolean(hasOrdered) && !hasReviewed };
    }

    res.json({ success: true, data: reviews, meta });
  } catch (err) {
    next(err);
  }
}

/** POST /api/products/:id/reviews — must have ordered product; one review per user */
export async function addProductReview(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const { rating, comment = "", imageUrl = "" } = req.body;
    const rNum = Number(rating);
    if (!Number.isInteger(rNum) || rNum < 1 || rNum > 5) {
      return res.status(400).json({ success: false, message: "rating must be 1–5" });
    }

    const hasOrdered = await Order.exists({
      user: req.user.id,
      status: { $ne: "cancelled" },
      "items.product": id,
    });
    if (!hasOrdered) {
      return res.status(403).json({
        success: false,
        message: "You can only review products you have purchased.",
      });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const uid = req.user.id;
    const already = product.reviews.some((x) => String(x.user) === uid);
    if (already) {
      return res.status(400).json({ success: false, message: "You already reviewed this product." });
    }

    product.reviews.push({
      user: uid,
      rating: rNum,
      comment: String(comment).slice(0, 2000),
      imageUrl: sanitizeReviewImageUrl(imageUrl),
    });
    await product.save();
    await recalcProductRating(id);
    invalidateProductsCache();

    const reviewer = await User.findById(uid).select("name").lean();
    const updated = await Product.findById(id)
      .select("reviews")
      .populate("reviews.user", "name")
      .lean();
    const last = updated.reviews.find((x) => String(x.user?._id || x.user) === uid);
    res.status(201).json({
      success: true,
      message: "Review added",
      data: {
        _id: last?._id,
        rating: rNum,
        comment: String(comment).slice(0, 2000),
        imageUrl: String(imageUrl || "").trim().slice(0, 2000),
        createdAt: last?.createdAt || new Date(),
        userName: displayReviewerName(reviewer?.name),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/products/:id/reviews/import — admin: import real client reviews */
export async function importProductReviewsAdmin(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const list = Array.isArray(req.body?.reviews) ? req.body.reviews : [];
    if (!list.length) {
      return res.status(400).json({ success: false, message: "reviews array is required" });
    }
    if (list.length > 500) {
      return res.status(400).json({ success: false, message: "Max 500 reviews per import" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const sanitized = list
      .map((r) => {
        const rating = Number(r?.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
        const comment = String(r?.comment || "").trim().slice(0, 2000);
        const userName = String(r?.userName || "").trim().slice(0, 120) || "Customer";
        const imageUrl = sanitizeReviewImageUrl(r?.imageUrl || "");
        const createdAtRaw = r?.createdAt ? new Date(r.createdAt) : new Date();
        const createdAt = Number.isNaN(createdAtRaw.getTime()) ? new Date() : createdAtRaw;
        return { userName, rating, comment, imageUrl, createdAt };
      })
      .filter(Boolean);

    if (!sanitized.length) {
      return res.status(400).json({ success: false, message: "No valid reviews to import" });
    }

    product.reviews.push(...sanitized);
    await product.save();
    await recalcProductRating(id);
    invalidateProductsCache();

    res.status(201).json({
      success: true,
      message: "Reviews imported",
      data: { imported: sanitized.length },
    });
  } catch (err) {
    next(err);
  }
}
