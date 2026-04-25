import mongoose from "mongoose";
import Banner from "../models/Banner.js";
import { getCachedBanners, setCachedBanners, invalidateBannersCache } from "../utils/apiCache.js";

/** Public: active banners sorted by order */
export async function listPublicBanners(req, res, next) {
  try {
    const hit = getCachedBanners();
    if (hit) return res.json(hit);
    const list = await Banner.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean();
    const payload = { success: true, data: list };
    setCachedBanners(payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function listAllBanners(req, res, next) {
  try {
    const list = await Banner.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
}

export async function createBanner(req, res, next) {
  try {
    const b = await Banner.create(req.body);
    invalidateBannersCache();
    res.status(201).json({ success: true, data: b });
  } catch (err) {
    next(err);
  }
}

export async function updateBanner(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const b = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!b) return res.status(404).json({ success: false, message: "Banner not found" });
    invalidateBannersCache();
    res.json({ success: true, data: b });
  } catch (err) {
    next(err);
  }
}

export async function deleteBanner(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    await Banner.findByIdAndDelete(req.params.id);
    invalidateBannersCache();
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

