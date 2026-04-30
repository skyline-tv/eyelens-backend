import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeCouponItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((line) => {
    const qty = Math.max(1, Number(line?.qty) || 1);
    const framePrice = Math.max(
      0,
      Number(
        line?.framePrice ??
          line?.price ??
          line?.frame?.price ??
          0
      ) || 0
    );
    const lensPrice = Math.max(
      0,
      Number(line?.lensPrice ?? line?.lens?.price ?? 0) || 0
    );
    return { qty, framePrice, lensPrice };
  });
}

function computeSubtotals(items = [], fallbackSubtotal = 0) {
  const normalized = normalizeCouponItems(items);
  const framesSubtotal = normalized.reduce((a, i) => a + i.framePrice * i.qty, 0);
  const lensesSubtotal = normalized.reduce((a, i) => a + i.lensPrice * i.qty, 0);
  const subtotalFromItems = Math.round((framesSubtotal + lensesSubtotal) * 100) / 100;
  const fallback = Math.max(0, Number(fallbackSubtotal) || 0);
  const subtotal = subtotalFromItems > 0 ? subtotalFromItems : fallback;
  return { normalized, framesSubtotal, lensesSubtotal, subtotal };
}

function computeBogoDiscount(items = [], frameOnlyCap = Infinity) {
  const units = [];
  for (const line of items) {
    const qty = Math.max(1, Number(line?.qty) || 1);
    const framePrice = Math.max(0, Number(line?.framePrice) || 0);
    for (let i = 0; i < qty; i += 1) units.push(framePrice);
  }
  if (units.length < 2) return 0;
  units.sort((a, b) => a - b);
  const freeCount = Math.floor(units.length / 2);
  const freeSum = units.slice(0, freeCount).reduce((a, p) => a + p, 0);
  return Math.max(0, Math.min(frameOnlyCap, Math.round(freeSum * 100) / 100));
}

/** Compute discount in rupees (not more than eligible subtotal). */
export function computeDiscount(coupon, subtotalOrContext) {
  const context =
    typeof subtotalOrContext === "number"
      ? { subtotal: subtotalOrContext, items: [] }
      : subtotalOrContext || {};
  const { normalized, framesSubtotal, subtotal } = computeSubtotals(
    context.items || [],
    context.subtotal
  );
  const eligibleSubtotal = coupon.frameOnlyDiscount ? framesSubtotal : subtotal;
  if (eligibleSubtotal < (coupon.minOrderValue || 0)) return 0;

  if (coupon.bogoEnabled) {
    return computeBogoDiscount(normalized, eligibleSubtotal);
  }

  if (coupon.discountType === "percentage") {
    const pct = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0));
    return Math.min(eligibleSubtotal, Math.round((eligibleSubtotal * pct) / 100 * 100) / 100);
  }
  const flat = Math.max(0, Number(coupon.discountValue) || 0);
  return Math.min(eligibleSubtotal, flat);
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
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
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
    const hasOrderBefore = await Order.exists({
      user: req.user.id,
      status: { $ne: "cancelled" },
    });
    if (coupon.newUsersOnly && hasOrderBefore) {
      return res.status(400).json({ success: false, message: "Coupon is for first order only" });
    }
    if (
      coupon.oneTimePerUser &&
      coupon.usedByUsers?.some((uid) => String(uid) === String(req.user.id))
    ) {
      return res.status(400).json({ success: false, message: "Coupon can be used only once per account" });
    }

    const { subtotal: finalSubtotal } = computeSubtotals(items, subtotal);
    const eligibleSubtotal = coupon.frameOnlyDiscount
      ? computeSubtotals(items, subtotal).framesSubtotal
      : finalSubtotal;
    if (eligibleSubtotal < (coupon.minOrderValue || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value ₹${coupon.minOrderValue} required`,
      });
    }
    const discountAmount = computeDiscount(coupon, { subtotal: finalSubtotal, items });
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
        bogoEnabled: Boolean(coupon.bogoEnabled),
        frameOnlyDiscount: Boolean(coupon.frameOnlyDiscount),
        ruleTags: [
          coupon.bogoEnabled ? "BOGO on frames" : null,
          coupon.frameOnlyDiscount ? "Frame-only discount" : null,
          coupon.newUsersOnly ? "First order only" : null,
          coupon.oneTimePerUser ? "One-time use per account" : null,
        ].filter(Boolean),
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
  let context = subtotal;
  if (typeof subtotal === "number") {
    context = { subtotal, items: [], userId: null };
  }
  if (!context || typeof context !== "object") {
    context = { subtotal: 0, items: [], userId: null };
  }
  const norm = normalizeCode(code);
  if (!norm) return { discountAmount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: norm });
  if (!coupon) throw new Error("INVALID_COUPON");
  const usable = isCouponUsable(coupon);
  if (!usable.ok) throw new Error(usable.message);
  if (coupon.newUsersOnly && context.userId) {
    const hasOrderBefore = await Order.exists({
      user: context.userId,
      status: { $ne: "cancelled" },
    });
    if (hasOrderBefore) throw new Error("FIRST_ORDER_ONLY");
  }
  if (
    coupon.oneTimePerUser &&
    context.userId &&
    coupon.usedByUsers?.some((uid) => String(uid) === String(context.userId))
  ) {
    throw new Error("ONE_TIME_PER_USER");
  }
  const { subtotal: finalSubtotal, framesSubtotal } = computeSubtotals(context.items, context.subtotal);
  const minEligible = coupon.frameOnlyDiscount ? framesSubtotal : finalSubtotal;
  if (minEligible < (coupon.minOrderValue || 0)) throw new Error("MIN_ORDER");
  const discountAmount = computeDiscount(coupon, { subtotal: finalSubtotal, items: context.items });
  if (discountAmount <= 0) throw new Error("NO_DISCOUNT");
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new Error("COUPON_EXHAUSTED");
  return { discountAmount, coupon };
}

/** Used by orderController: validate + increment usedCount atomically */
export async function consumeCouponIfValid(code, subtotalOrContext) {
  let context = subtotalOrContext;
  if (typeof subtotalOrContext === "number") {
    context = { subtotal: subtotalOrContext, items: [], userId: null };
  }
  if (!context || typeof context !== "object") {
    context = { subtotal: 0, items: [], userId: null };
  }
  const norm = normalizeCode(code);
  if (!norm) return { discountAmount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: norm });
  if (!coupon) throw new Error("INVALID_COUPON");
  const usable = isCouponUsable(coupon);
  if (!usable.ok) throw new Error(usable.message);
  if (coupon.newUsersOnly && context.userId) {
    const hasOrderBefore = await Order.exists({
      user: context.userId,
      status: { $ne: "cancelled" },
    });
    if (hasOrderBefore) throw new Error("FIRST_ORDER_ONLY");
  }
  if (
    coupon.oneTimePerUser &&
    context.userId &&
    coupon.usedByUsers?.some((uid) => String(uid) === String(context.userId))
  ) {
    throw new Error("ONE_TIME_PER_USER");
  }
  const { subtotal: finalSubtotal, framesSubtotal } = computeSubtotals(context.items, context.subtotal);
  const minEligible = coupon.frameOnlyDiscount ? framesSubtotal : finalSubtotal;
  if (minEligible < (coupon.minOrderValue || 0)) throw new Error("MIN_ORDER");
  const discountAmount = computeDiscount(coupon, { subtotal: finalSubtotal, items: context.items });
  if (discountAmount <= 0) throw new Error("NO_DISCOUNT");

  const filter = { _id: coupon._id, isActive: true };
  if (coupon.maxUses != null) filter.usedCount = { $lt: coupon.maxUses };
  if (coupon.oneTimePerUser && context.userId) {
    filter.usedByUsers = { $ne: context.userId };
  }
  const update = { $inc: { usedCount: 1 } };
  if (context.userId) {
    update.$addToSet = { usedByUsers: context.userId };
  }
  const inc = await Coupon.updateOne(filter, update);
  if (inc.modifiedCount !== 1) throw new Error("COUPON_EXHAUSTED");
  return { discountAmount, coupon };
}
