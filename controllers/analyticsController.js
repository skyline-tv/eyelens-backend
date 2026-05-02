import AnalyticsEvent from "../models/AnalyticsEvent.js";
import Order from "../models/Order.js";

/** Storefront funnel events (extend as needed). */
export const ALLOWED_STORE_EVENTS = new Set(["cart_view", "checkout_start"]);

function periodBounds(period) {
  const end = new Date();
  const start = new Date(end);
  if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "90d") start.setDate(start.getDate() - 90);
  else start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

async function uniqueVisitorsForEvent(event, start, end) {
  const rows = await AnalyticsEvent.aggregate([
    { $match: { event, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: "$visitorId" } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

export async function trackStoreEvent(req, res, next) {
  try {
    const event = String(req.body?.event || "").trim();
    const visitorId = String(req.body?.visitorId || "").trim().slice(0, 80);
    if (!ALLOWED_STORE_EVENTS.has(event)) {
      return res.status(400).json({ success: false, message: "Invalid event", data: null });
    }
    if (visitorId.length < 8) {
      return res.status(400).json({ success: false, message: "visitorId required", data: null });
    }
    const userId = req.user?.id || null;
    await AnalyticsEvent.create({ event, visitorId, userId });
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/** Admin: checkout funnel + orders for selected window. */
export async function funnelStats(req, res, next) {
  try {
    const raw = String(req.query.period || "7d");
    const period = raw === "30d" || raw === "90d" ? raw : "7d";
    const { start, end } = periodBounds(period);

    const [uniqueCartVisitors, uniqueCheckoutVisitors, ordersAgg, uniqueBuyersAgg] = await Promise.all([
      uniqueVisitorsForEvent("cart_view", start, end),
      uniqueVisitorsForEvent("checkout_start", start, end),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, user: { $exists: true, $ne: null } } },
        { $group: { _id: "$user" } },
        { $count: "n" },
      ]),
    ]);

    const ordersPlaced = ordersAgg[0]?.count || 0;
    const revenueInPeriod = Math.round((ordersAgg[0]?.revenue || 0) * 100) / 100;
    const uniqueCustomersWhoOrdered = uniqueBuyersAgg[0]?.n || 0;

    const cartToCheckoutPercent =
      uniqueCartVisitors > 0 ? Math.round((uniqueCheckoutVisitors / uniqueCartVisitors) * 1000) / 10 : 0;
    const checkoutToOrderPercent =
      uniqueCheckoutVisitors > 0 ? Math.round((ordersPlaced / uniqueCheckoutVisitors) * 1000) / 10 : 0;

    res.json({
      success: true,
      data: {
        period,
        range: { start: start.toISOString(), end: end.toISOString() },
        uniqueCartVisitors,
        uniqueCheckoutVisitors,
        ordersPlaced,
        uniqueCustomersWhoOrdered,
        revenueInPeriod,
        cartToCheckoutPercent,
        checkoutToOrderPercent,
      },
    });
  } catch (err) {
    next(err);
  }
}
