import mongoose from "mongoose";
import Product from "../models/Product.js";
import {
  productsListCacheKey,
  getCachedProducts,
  setCachedProducts,
  invalidateProductsCache,
} from "../utils/apiCache.js";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeImageList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 20);
}

function normalizeColorName(value) {
  return String(value || "")
    .trim()
    .replace(/^(color|colour)\s*[—\-:]\s*/i, "")
    .trim();
}

function normalizeColors(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        const name = normalizeColorName(entry);
        if (!name) return null;
        return { name, hex: "", images: [] };
      }
      const name = normalizeColorName(entry.name);
      if (!name) return null;
      const hex = String(entry.hex || "").trim();
      const rawStock = entry.stock;
      const parsedStock = rawStock === "" || rawStock == null ? null : Number(rawStock);
      const stock = Number.isFinite(parsedStock) && parsedStock >= 0 ? Math.floor(parsedStock) : null;
      const images = normalizeImageList(entry.images);
      return { name, hex, stock, images };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeProductPayload(payload) {
  const body = { ...(payload || {}) };
  if ("images" in body) {
    body.images = normalizeImageList(body.images);
  }
  if ("colors" in body) {
    body.colors = normalizeColors(body.colors);
  }
  return body;
}

/** GET /api/products — optional: category, gender, frameType, minPrice, maxPrice, sort, search, brand */
export async function listProducts(req, res, next) {
  try {
    const { category, gender, frameType, minPrice, maxPrice, sort, search, brand } = req.query;
    const filter = {};

    if (category && String(category).trim()) {
      filter.category = new RegExp(escapeRegex(String(category).trim()), "i");
    }
    if (gender && ["unisex", "men", "women", "kids"].includes(gender)) {
      filter.gender = gender;
    }
    if (frameType && String(frameType).trim()) {
      filter.frameType = new RegExp(escapeRegex(String(frameType).trim()), "i");
    }
    if (brand && String(brand).trim()) {
      filter.brand = new RegExp(escapeRegex(String(brand).trim()), "i");
    }

    const min = minPrice != null && minPrice !== "" ? Number(minPrice) : null;
    const max = maxPrice != null && maxPrice !== "" ? Number(maxPrice) : null;
    if ((min != null && !Number.isNaN(min)) || (max != null && !Number.isNaN(max))) {
      filter.price = {};
      if (min != null && !Number.isNaN(min)) filter.price.$gte = min;
      if (max != null && !Number.isNaN(max)) filter.price.$lte = max;
    }

    if (search && String(search).trim()) {
      const q = escapeRegex(String(search).trim());
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { brand: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { frameType: { $regex: q, $options: "i" } },
        { material: { $regex: q, $options: "i" } },
        { gender: { $regex: q, $options: "i" } },
      ];
    }

    /** ?lowStock=true → stock below 5 */
    if (String(req.query.lowStock).toLowerCase() === "true") {
      filter.stock = { $lt: 5, $gte: 0 };
    }

    let sortOpt = { createdAt: -1 };
    switch (sort) {
      case "price-asc":
      case "price_asc":
        sortOpt = { price: 1 };
        break;
      case "price-desc":
      case "price_desc":
        sortOpt = { price: -1 };
        break;
      case "newest":
        sortOpt = { createdAt: -1 };
        break;
      case "popular":
        sortOpt = { stock: -1 };
        break;
      default:
        sortOpt = { createdAt: -1 };
    }

    const limitRaw = req.query.limit;
    const limit =
      limitRaw != null && limitRaw !== ""
        ? Math.min(100, Math.max(1, parseInt(String(limitRaw), 10) || 0))
        : null;

    const cacheKey = productsListCacheKey(req.query);
    const cached = getCachedProducts(cacheKey);
    if (cached) return res.json(cached);

    let query = Product.find(filter).sort(sortOpt).select("-reviews");
    if (limit) query = query.limit(limit);
    const products = await query.lean();
    const payload = { success: true, data: products };
    setCachedProducts(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const product = await Product.findById(req.params.id)
      .select("-reviews")
      .lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

export async function createProduct(req, res, next) {
  try {
    const product = await Product.create(normalizeProductPayload(req.body));
    invalidateProductsCache();
    res.status(201).json({ success: true, message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const body = normalizeProductPayload(req.body);
    let update = body;
    if ("origPrice" in body && (body.origPrice === null || body.origPrice === "")) {
      delete body.origPrice;
      update = { $set: body, $unset: { origPrice: "" } };
    }
    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    invalidateProductsCache();
    res.json({ success: true, message: "Product updated", data: product });
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    invalidateProductsCache();
    res.json({ success: true, message: "Product deleted", data: null });
  } catch (err) {
    next(err);
  }
}
