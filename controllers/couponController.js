import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

/** Compute discount in rupees (not more than subtotal). */
export function computeDiscount(coupon, subtotal) {
  const sub = Math.max(0, Number(subtotal) || 0);
  if (sub < (coupon.minOrderValue || 0)) return 0;
  if (coupon.discountType === "percentage") {
    const pct = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0));
    return Math.min(sub, Math.round((sub * pct) / 100 * 100) / 100);
  }
  const flat = Math.max(0, Number(coupon.discountValue) || 0);
  return Math.min(sub, flat);
}

function isCouponUsable(coupon, now = new Date()) {
  if (!coupon.isActive) return { ok: false, message: "Coupon is not active" };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return { ok: false, message: "Coupon has expired" };
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, message: "Coupon usage limit reached" };
  }
  return { ok: true };
}

/** POST /api/coupons/apply { code, subtotal } */
export async function applyCoupon(req, res, next) {
  try {
    const code = normalizeCode(req.body?.code);
    const subtotal = Number(req.body?.subtotal);
    if (!code) {
      return res.status(400).json({ success: false, message: "code required" });
    }
    if (Number.isNaN(subtotal) || subtotal < 0) {
      return res.status(400).json({ success: false, message: "valid subtotal required" });
    }
    const coupon = await Coupon.findOne({ code });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }
    const usable = isCouponUsable(coupon);
    if (!usable.ok) return res.status(400).json({ success: false, message: usable.message });
    if (subtotal < (coupon.minOrderValue || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value ₹${coupon.minOrderValue} required`,
      });
    }
    const discountAmount = computeDiscount(coupon, subtotal);
    if (discountAmount <= 0) {
      return res.status(400).json({ success: false, message: "Coupon does not apply to this cart" });
    }
    res.json({
      success: true,
      data: {
        code: coupon.code,
        couponId: coupon._id,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Public: active coupons for storefront chips (no auth). */
export async function listPublicCoupons(req, res, next) {
  try {
    const now = new Date();
    const list = await Coupon.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .select("code label discountType discountValue minOrderValue maxUses usedCount expiresAt")
      .sort({ code: 1 })
      .lean();

    const usable = list.filter((c) => c.maxUses == null || (c.usedCount ?? 0) < c.maxUses);
    res.json({ success: true, data: usable });
  } catch (err) {
    next(err);
  }
}

/** Admin: list */
export async function listCoupons(req, res, next) {
  try {
    const list = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
}

export async function createCoupon(req, res, next) {
  try {
    const c = await Coupon.create(req.body);
    res.status(201).json({ success: true, data: c });
  } catch (err) {
    next(err);
  }
}

export async function updateCoupon(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const c = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, data: c });
  } catch (err) {
    next(err);
  }
}

export async function deleteCoupon(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/** Read-only coupon validation for order totals (no usedCount increment). */
export async function peekCouponDiscount(code, subtotal) {
  const norm = normalizeCode(code);
  if (!norm) return { discountAmount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: norm });
  if (!coupon) throw new Error("INVALID_COUPON");
  const usable = isCouponUsable(coupon);
  if (!usable.ok) throw new Error(usable.message);
  const sub = Math.max(0, Number(subtotal) || 0);
  if (sub < (coupon.minOrderValue || 0)) throw new Error("MIN_ORDER");
  const discountAmount = computeDiscount(coupon, sub);
  if (discountAmount <= 0) throw new Error("NO_DISCOUNT");
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new Error("COUPON_EXHAUSTED");
  return { discountAmount, coupon };
}

/** Used by orderController: validate + increment usedCount atomically */
export async function consumeCouponIfValid(code, subtotal) {
  const norm = normalizeCode(code);
  if (!norm) return { discountAmount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: norm });
  if (!coupon) throw new Error("INVALID_COUPON");
  const usable = isCouponUsable(coupon);
  if (!usable.ok) throw new Error(usable.message);
  if (subtotal < (coupon.minOrderValue || 0)) throw new Error("MIN_ORDER");
  const discountAmount = computeDiscount(coupon, subtotal);
  if (discountAmount <= 0) throw new Error("NO_DISCOUNT");

  const filter = { _id: coupon._id, isActive: true };
  if (coupon.maxUses != null) filter.usedCount = { $lt: coupon.maxUses };
  const inc = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } });
  if (inc.modifiedCount !== 1) throw new Error("COUPON_EXHAUSTED");
  return { discountAmount, coupon };
}
