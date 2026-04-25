import crypto from "crypto";
import Razorpay from "razorpay";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { sendPaymentStatusUserEmail } from "../utils/emailService.js";

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

/** Public: expose key id for Checkout (safe client-side). */
export function getPaymentsConfig(req, res) {
  res.json({
    success: true,
    data: { razorpayKeyId: process.env.RAZORPAY_KEY_ID || null },
  });
}

/**
 * POST /api/payments/create-order
 * Body: { orderId } — Eyelens order _id; amount taken from stored order total.
 */
export async function createRazorpayOrder(req, res, next) {
  try {
    const rz = getRazorpay();
    if (!rz) {
      return res.status(503).json({
        success: false,
        message: "Online payments are not configured",
        data: null,
      });
    }

    const orderId = req.body?.orderId;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId required", data: null });
    }

    const currency = String(req.body?.currency || "INR").toUpperCase();
    if (currency !== "INR") {
      return res.status(400).json({ success: false, message: "Only INR is supported", data: null });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found", data: null });
    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Not allowed", data: null });
    }
    if (order.paymentMethod !== "razorpay") {
      return res.status(400).json({ success: false, message: "Order is not an online payment order", data: null });
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Order already paid", data: null });
    }

    const serverTotal = Math.round(Number(order.totalAmount) * 100) / 100;
    if (req.body?.amount != null && req.body.amount !== "") {
      const clientTotal = Math.round(Number(req.body.amount) * 100) / 100;
      if (!Number.isFinite(clientTotal) || Math.abs(serverTotal - clientTotal) > 0.02) {
        return res.status(400).json({
          success: false,
          message: "Amount does not match order total",
          data: null,
        });
      }
    }

    const amountPaise = Math.round(serverTotal * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ success: false, message: "Invalid order amount", data: null });
    }

    const receipt = String(order._id).slice(-12);
    const rzpOrder = await rz.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { eyelensOrderId: String(order._id) },
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      success: true,
      data: {
        orderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/verify
 * Body: orderId (Eyelens), razorpay_order_id, razorpay_payment_id, razorpay_signature
 */
export async function verifyRazorpayPayment(req, res, next) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(503).json({ success: false, message: "Payments not configured", data: null });
    }

    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment verification fields", data: null });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature", data: null });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found", data: null });
    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Not allowed", data: null });
    }
    if (order.paymentMethod === "razorpay") {
      if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).json({ success: false, message: "Payment does not match this order", data: null });
      }
    }

    order.paymentStatus = "paid";
    order.paymentId = razorpay_payment_id;
    await order.save();

    User.findById(order.user)
      .select("name email")
      .lean()
      .then((buyer) => {
        if (buyer?.email) sendPaymentStatusUserEmail(buyer, order, "paid").catch(() => {});
      })
      .catch(() => {});

    res.json({ success: true, message: "Payment verified", data: { orderId: order._id } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/fail
 * Body: orderId (Eyelens), optional razorpay_order_id
 */
export async function markRazorpayPaymentFailed(req, res, next) {
  try {
    const { orderId, razorpay_order_id } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId required", data: null });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found", data: null });
    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Not allowed", data: null });
    }
    if (order.paymentMethod !== "razorpay") {
      return res.status(400).json({ success: false, message: "Order is not an online payment order", data: null });
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Order already paid", data: null });
    }

    const incomingRzpOrderId = String(razorpay_order_id || "").trim();
    if (incomingRzpOrderId) {
      if (order.razorpayOrderId && order.razorpayOrderId !== incomingRzpOrderId) {
        return res.status(400).json({ success: false, message: "Payment does not match this order", data: null });
      }
      order.razorpayOrderId = incomingRzpOrderId;
    }

    order.paymentStatus = "failed";
    await order.save();

    User.findById(order.user)
      .select("name email")
      .lean()
      .then((buyer) => {
        if (buyer?.email) sendPaymentStatusUserEmail(buyer, order, "failed").catch(() => {});
      })
      .catch(() => {});

    res.json({ success: true, message: "Payment marked failed", data: { orderId: order._id } });
  } catch (err) {
    next(err);
  }
}
