import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { consumeCouponIfValid, peekCouponDiscount } from "./couponController.js";
import {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendReturnRequestAdminEmail,
  sendReturnStatusUserEmail,
} from "../utils/emailService.js";
import {
  resolveLensAddon,
  buildLensSnapshot,
  buildPrescriptionSnapshot,
  buildFrameOptionsSnapshot,
} from "../utils/orderLineMeta.js";

function couponErrorMessage(code) {
  const map = {
    INVALID_COUPON: "Invalid coupon code",
    MIN_ORDER: "Order does not meet the minimum for this coupon",
    NO_DISCOUNT: "This coupon does not apply",
    COUPON_EXHAUSTED: "Coupon is no longer available",
    "Coupon usage limit reached": "Coupon is no longer available",
    "Coupon is not active": "Coupon is not active",
    "Coupon has expired": "Coupon has expired",
    FIRST_ORDER_ONLY: "Coupon is for first order only",
    ONE_TIME_PER_USER: "Coupon can be used only once per account",
  };
  return map[code] || code || "Coupon error";
}

async function rollbackOrderAndStock(orderId, lineItems) {
  await Order.findByIdAndDelete(orderId);
  for (const li of lineItems) {
    const colorName = String(li.color || "").trim();
    if (colorName) {
      await Product.updateOne(
        { _id: li.product, "colors.name": colorName },
        { $inc: { stock: li.qty, "colors.$.stock": li.qty } }
      );
    } else {
      await Product.updateOne({ _id: li.product }, { $inc: { stock: li.qty } });
    }
  }
}

/**
 * Deduct stock + create order atomically when possible (replica set).
 * Falls back to sequential findOneAndUpdate without session on standalone MongoDB.
 */
async function deductStockAndCreateOrder({ userId, lineItems, orderPayload }) {
  const tryWithSession = async () => {
    const session = await mongoose.startSession();
    try {
      let createdId;
      await session.withTransaction(async () => {
        for (const li of lineItems) {
          const colorName = String(li.color || "").trim();
          const filter = colorName
            ? { _id: li.product, stock: { $gte: li.qty }, colors: { $elemMatch: { name: colorName, stock: { $gte: li.qty } } } }
            : { _id: li.product, stock: { $gte: li.qty } };
          const update = colorName ? { $inc: { stock: -li.qty, "colors.$[picked].stock": -li.qty } } : { $inc: { stock: -li.qty } };
          const options = colorName
            ? { new: true, session, arrayFilters: [{ "picked.name": colorName }] }
            : { new: true, session };
          const updated = await Product.findOneAndUpdate(filter, update, options);
          if (!updated) {
            throw new Error(`INSUFFICIENT_STOCK:${li.name}`);
          }
        }
        const [doc] = await Order.create([{ ...orderPayload, user: userId }], { session });
        createdId = doc._id;
      });
      return createdId;
    } finally {
      await session.endSession();
    }
  };

  const tryWithoutSession = async () => {
    const rolled = [];
    try {
      for (const li of lineItems) {
        const colorName = String(li.color || "").trim();
        const filter = colorName
          ? { _id: li.product, stock: { $gte: li.qty }, colors: { $elemMatch: { name: colorName, stock: { $gte: li.qty } } } }
          : { _id: li.product, stock: { $gte: li.qty } };
        const update = colorName ? { $inc: { stock: -li.qty, "colors.$[picked].stock": -li.qty } } : { $inc: { stock: -li.qty } };
        const options = colorName ? { new: true, arrayFilters: [{ "picked.name": colorName }] } : { new: true };
        const updated = await Product.findOneAndUpdate(filter, update, options);
        if (!updated) {
          for (const r of rolled) {
            const rolledColor = String(r.color || "").trim();
            if (rolledColor) {
              await Product.updateOne(
                { _id: r.product, "colors.name": rolledColor },
                { $inc: { stock: r.qty, "colors.$.stock": r.qty } }
              );
            } else {
              await Product.updateOne({ _id: r.product }, { $inc: { stock: r.qty } });
            }
          }
          throw new Error(`INSUFFICIENT_STOCK:${li.name}`);
        }
        rolled.push({ product: li.product, qty: li.qty, color: colorName });
      }
      const doc = await Order.create({ ...orderPayload, user: userId });
      return doc._id;
    } catch (e) {
      for (const r of rolled) {
        const rolledColor = String(r.color || "").trim();
        if (rolledColor) {
          await Product.updateOne(
            { _id: r.product, "colors.name": rolledColor },
            { $inc: { stock: r.qty, "colors.$.stock": r.qty } }
          );
        } else {
          await Product.updateOne({ _id: r.product }, { $inc: { stock: r.qty } });
        }
      }
      throw e;
    }
  };

  try {
    return await tryWithSession();
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.startsWith("INSUFFICIENT_STOCK:")) throw e;
    const code = e?.codeName || e?.code;
    if (
      code === 20 ||
      msg.includes("Transaction") ||
      msg.includes("replica set") ||
      msg.includes("mongos")
    ) {
      return tryWithoutSession();
    }
    return tryWithoutSession();
  }
}

export async function createOrder(req, res, next) {
  try {
    const { items, shippingAddress, paymentMethod: rawPm, couponCode: rawCoupon } = req.body;
    if (!items?.length || !shippingAddress || !rawPm) {
      return res.status(400).json({ success: false, message: "items, shippingAddress, paymentMethod required" });
    }

    const pm = String(rawPm).toLowerCase();
    const allowedPm = ["cod", "razorpay", "upi", "card"];
    if (!allowedPm.includes(pm)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    const lineItems = [];
    const couponEvalItems = [];
    const unavailableMsg = "Some items in your cart are no longer available. Please review your cart.";
    let total = 0;

    for (const line of items) {
      const pid = line.productId || line.product;
      if (!mongoose.isValidObjectId(pid)) {
        return res.status(400).json({ success: false, message: unavailableMsg });
      }
      const product = await Product.findById(pid);
      if (!product) return res.status(400).json({ success: false, message: unavailableMsg });
      const qty = Math.max(1, Number(line.qty) || 1);
      const lensAddon = resolveLensAddon(line);
      const price = Math.round((product.price + lensAddon) * 100) / 100;
      total += price * qty;
      couponEvalItems.push({
        qty,
        framePrice: Number(product.price) || 0,
        lensPrice: Number(lensAddon) || 0,
      });
      const lensSnap = buildLensSnapshot(line, lensAddon);
      const rxSnap = buildPrescriptionSnapshot(line.prescription);
      const frameSnap = buildFrameOptionsSnapshot(line.frameOptions);
      const row = {
        product: product._id,
        name: product.name,
        brand: product.brand,
        price,
        qty,
        emoji: product.emoji || "👓",
      };
      if (lensSnap) row.lens = lensSnap;
      if (rxSnap) row.prescription = rxSnap;
      if (frameSnap) row.frameOptions = frameSnap;
      const colorName = String(frameSnap?.color || "").trim();
      lineItems.push(row);
      lineItems[lineItems.length - 1].color = colorName;
    }

    const itemsSubtotal = Math.round(total * 100) / 100;
    let discountAmount = 0;
    let couponCode = "";

    if (rawCoupon && String(rawCoupon).trim()) {
      try {
        const peek = await peekCouponDiscount(String(rawCoupon).trim(), {
          subtotal: itemsSubtotal,
          items: couponEvalItems,
          userId: req.user.id,
        });
        discountAmount = peek.discountAmount;
        couponCode = peek.coupon?.code || "";
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: couponErrorMessage(e.message),
        });
      }
    }

    /** Final amount = product lines only (no shipping, no GST). Coupon discount still applies. */
    const shippingAmount = 0;
    const gstAmount = 0;
    const totalAmount = Math.round(Math.max(0, itemsSubtotal - discountAmount) * 100) / 100;

    const orderPayload = {
      items: lineItems,
      itemsSubtotal,
      shippingAmount,
      discountAmount,
      gstAmount,
      couponCode,
      totalAmount,
      status: "pending",
      shippingAddress,
      paymentMethod: pm,
      paymentStatus: "pending",
      paymentId: "",
      razorpayOrderId: "",
    };

    let orderId;
    try {
      orderId = await deductStockAndCreateOrder({
        userId: req.user.id,
        lineItems,
        orderPayload,
      });
    } catch (e) {
      const m = e?.message || "";
      if (m.startsWith("INSUFFICIENT_STOCK:")) {
        const name = m.split(":")[1] || "item";
        return res.status(400).json({ success: false, message: `Insufficient stock for ${name}` });
      }
      throw e;
    }

    if (rawCoupon && String(rawCoupon).trim()) {
      try {
        await consumeCouponIfValid(String(rawCoupon).trim(), {
          subtotal: itemsSubtotal,
          items: couponEvalItems,
          userId: req.user.id,
        });
      } catch (e) {
        await rollbackOrderAndStock(orderId, lineItems);
        return res.status(400).json({
          success: false,
          message: couponErrorMessage(e.message),
        });
      }
    }

    const populated = await Order.findById(orderId).populate("items.product").lean();
    User.findById(req.user.id)
      .select("name email")
      .lean()
      .then((u) => {
        if (u?.email) sendOrderConfirmation(u, populated).catch(() => {});
      })
      .catch(() => {});

    res.status(201).json({ success: true, message: "Order created", data: populated });
  } catch (err) {
    next(err);
  }
}

export async function getOrderById(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }
    const order = await Order.findById(req.params.id).populate("user", "name email").lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const uid = String(order.user?._id || order.user);
    if (req.user.role !== "admin" && uid !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

export async function myOrders(req, res, next) {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

export async function allOrders(req, res, next) {
  try {
    const orders = await Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const now = new Date();
    order.status = status;
    if (status === "confirmed" && !order.confirmedAt) order.confirmedAt = now;
    if (status === "shipped" && !order.shippedAt) order.shippedAt = now;
    if (status === "delivered" && !order.deliveredAt) order.deliveredAt = now;
    await order.save();

    const buyer = await User.findById(order.user).select("name email").lean();
    if (buyer?.email) {
      sendOrderStatusUpdate(buyer, order.toObject()).catch(() => {});
    }

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

const RETURN_STATUSES = ["requested", "approved", "rejected", "completed"]; // list filter + validation

/** POST /api/orders/:id/return */
export async function requestReturn(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order id", data: null });
    }
    const reason = String(req.body?.reason || "").trim().slice(0, 2000);
    if (!reason) {
      return res.status(400).json({ success: false, message: "Return reason is required", data: null });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found", data: null });
    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Not allowed", data: null });
    }
    if (order.status !== "delivered") {
      return res.status(400).json({ success: false, message: "Returns are only allowed for delivered orders", data: null });
    }
    if (!order.deliveredAt) {
      return res.status(400).json({ success: false, message: "Delivery date missing; contact support", data: null });
    }
    const days = (Date.now() - new Date(order.deliveredAt).getTime()) / (24 * 60 * 60 * 1000);
    if (days > 7) {
      return res.status(400).json({ success: false, message: "Return window (7 days) has expired", data: null });
    }
    if (order.returnStatus && !["rejected"].includes(order.returnStatus)) {
      return res.status(400).json({ success: false, message: "A return request already exists for this order", data: null });
    }

    order.returnStatus = "requested";
    order.returnReason = reason;
    order.returnRequestedAt = new Date();
    order.returnResolvedAt = null;
    await order.save();

    const buyer = await User.findById(order.user).select("name email").lean();
    sendReturnRequestAdminEmail(order, buyer, reason).catch(() => {});

    res.json({ success: true, message: "Return requested", data: order });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/orders/:id/return/status — admin */
export async function updateReturnStatus(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order id", data: null });
    }
    const status = String(req.body?.status || "").toLowerCase();
    if (!["approved", "rejected", "completed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid return status", data: null });
    }

    const order = await Order.findById(id).populate("user", "name email");
    if (!order) return res.status(404).json({ success: false, message: "Order not found", data: null });
    if (!order.returnStatus || order.returnStatus === "rejected") {
      return res.status(400).json({ success: false, message: "No active return request for this order", data: null });
    }
    if (order.returnStatus === "completed") {
      return res.status(400).json({ success: false, message: "Return already completed", data: null });
    }

    order.returnStatus = status;
    order.returnResolvedAt = new Date();
    await order.save();

    const buyer = order.user;
    if (buyer?.email) {
      sendReturnStatusUserEmail(buyer, order.toObject(), status).catch(() => {});
    }

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

/** GET /api/orders/returns — admin */
export async function listReturnRequests(req, res, next) {
  try {
    const { status } = req.query;
    const q =
      status && RETURN_STATUSES.includes(String(status))
        ? { returnStatus: String(status) }
        : { returnStatus: { $in: RETURN_STATUSES } };
    const list = await Order.find(q)
      .populate("user", "name email")
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .lean();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
}
