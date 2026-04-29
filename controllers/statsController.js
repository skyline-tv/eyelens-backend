import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Admin dashboard: KPIs, charts, top products */
export async function dashboardStats(req, res, next) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayStart = startOfToday();
    const monthStart = startOfMonth();

    const [
      orderCount,
      productCount,
      userCount,
      revenueAgg,
      recentOrdersRaw,
      statusAgg,
      revenueByDayAgg,
      revenueByDay30Agg,
      last7Rev,
      prev7Rev,
      todayAgg,
      monthAgg,
      topSellingProductsRaw,
      lowStockCount,
      outOfStockCount,
    ] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),
      Order.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Order.find()
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, t: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
        { $group: { _id: null, t: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $unwind: "$items" },
        { $match: { "items.product": { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$items.product",
            unitsSold: { $sum: "$items.qty" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
            lineName: { $first: "$items.name" },
            lineBrand: { $first: "$items.brand" },
            linePrice: { $first: "$items.price" },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: 5 },
        {
          $addFields: {
            _lookupId: {
              $convert: { input: "$_id", to: "objectId", onError: null, onNull: null },
            },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_lookupId",
            foreignField: "_id",
            as: "p",
          },
        },
        {
          $project: {
            _id: 0,
            productId: "$_id",
            name: { $ifNull: [{ $arrayElemAt: ["$p.name", 0] }, "$lineName"] },
            brand: { $ifNull: [{ $arrayElemAt: ["$p.brand", 0] }, "$lineBrand"] },
            price: { $ifNull: [{ $arrayElemAt: ["$p.price", 0] }, "$linePrice"] },
            imageUrl: {
              $let: {
                vars: { doc: { $arrayElemAt: ["$p", 0] } },
                in: {
                  $cond: {
                    if: { $eq: ["$$doc", null] },
                    then: "",
                    else: { $arrayElemAt: [{ $ifNull: ["$$doc.images", []] }, 0] },
                  },
                },
              },
            },
            unitsSold: 1,
            revenue: 1,
          },
        },
      ]),
      Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
      Product.countDocuments({ stock: 0 }),
    ]);

    const totalRevenue = Math.round((revenueAgg[0]?.total || 0) * 100) / 100;
    const l7 = last7Rev[0]?.t || 0;
    const p7 = prev7Rev[0]?.t || 0;
    const revenueChangePercent = p7 > 0 ? Math.round(((l7 - p7) / p7) * 100) : l7 > 0 ? 100 : 0;

    const ordersByStatus = {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    statusAgg.forEach((row) => {
      if (row._id && ordersByStatus[row._id] !== undefined) {
        ordersByStatus[row._id] = row.count;
      }
    });

    const revenueByDay = revenueByDayAgg.map((d) => ({
      date: d._id,
      revenue: Math.round(d.revenue * 100) / 100,
    }));

    const revenueByDayLast30 = revenueByDay30Agg.map((d) => ({
      date: d._id,
      revenue: Math.round(d.revenue * 100) / 100,
    }));

    const recentOrders = recentOrdersRaw.map((o) => ({
      _id: o._id,
      totalAmount: o.totalAmount,
      status: o.status,
      createdAt: o.createdAt,
      user: o.user,
      items: o.items,
    }));

    const topSellingProducts = (topSellingProductsRaw || []).map((row) => ({
      ...row,
      name: row.name || "Product",
      brand: row.brand || "",
      imageUrl: row.imageUrl || "",
      price: Number(row.price) || 0,
      unitsSold: row.unitsSold || 0,
      revenue: Math.round((Number(row.revenue) || 0) * 100) / 100,
    }));

    const todayRevenue = Math.round((todayAgg[0]?.revenue || 0) * 100) / 100;
    const todayOrders = todayAgg[0]?.orders || 0;
    const thisMonthRevenue = Math.round((monthAgg[0]?.revenue || 0) * 100) / 100;
    const thisMonthOrders = monthAgg[0]?.orders || 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders: orderCount,
        totalProducts: productCount,
        totalUsers: userCount,
        revenue: totalRevenue,
        orders: orderCount,
        products: productCount,
        users: userCount,
        revenueChangePercent,
        recentOrders,
        ordersByStatus,
        revenueByDay,
        revenueByDayLast30,
        todayRevenue,
        todayOrders,
        thisMonthRevenue,
        thisMonthOrders,
        topSellingProducts,
        lowStockCount,
        outOfStockCount,
        /** @deprecated use outOfStockCount */
        zeroStockCount: outOfStockCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Admin action: clear all app data except login users. */
export async function resetDataKeepLogin(req, res, next) {
  try {
    const keepCollections = new Set(["users", "system.indexes", "system.profile"]);
    const collections = Object.keys(mongoose.connection.collections || {});

    const cleared = [];
    const kept = [];

    for (const name of collections) {
      if (keepCollections.has(name)) {
        kept.push(name);
        continue;
      }
      await mongoose.connection.collection(name).deleteMany({});
      cleared.push(name);
    }

    res.json({
      success: true,
      message: "Data reset complete. Login data was preserved.",
      data: { keptCollections: kept, clearedCollections: cleared },
    });
  } catch (err) {
    next(err);
  }
}
