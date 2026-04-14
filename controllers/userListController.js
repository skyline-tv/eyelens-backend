import mongoose from "mongoose";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { toPublicUser } from "./authController.js";

export async function listUsers(req, res, next) {
  try {
    const users = await User.find({ isDeleted: { $ne: true } })
      .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "Cannot change your own role here" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password -refreshTokens");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/** GET /api/users/wishlist — populated products */
export async function getWishlist(req, res, next) {
  try {
    const user = await User.findById(req.user.id).populate("wishlist").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: user.wishlist || [] });
  } catch (err) {
    next(err);
  }
}

/** POST /api/users/wishlist/:productId */
export async function addWishlistItem(req, res, next) {
  try {
    const pid = req.params.productId;
    if (!mongoose.isValidObjectId(pid)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    const exists = await Product.exists({ _id: pid });
    if (!exists) return res.status(404).json({ success: false, message: "Product not found" });
    await User.updateOne({ _id: req.user.id }, { $addToSet: { wishlist: pid } });
    const user = await User.findById(req.user.id).populate("wishlist").lean();
    res.json({ success: true, data: user.wishlist || [] });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/users/wishlist/:productId */
export async function removeWishlistItem(req, res, next) {
  try {
    const pid = req.params.productId;
    if (!mongoose.isValidObjectId(pid)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }
    await User.updateOne({ _id: req.user.id }, { $pull: { wishlist: pid } });
    const user = await User.findById(req.user.id).populate("wishlist").lean();
    res.json({ success: true, data: user.wishlist || [] });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/users/:id/ban — admin only */
export async function banUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id", data: null });
    }
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "Cannot ban your own account", data: null });
    }
    const target = await User.findById(id);
    if (!target || target.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found", data: null });
    }
    if (target.role === "admin") {
      return res.status(400).json({ success: false, message: "Cannot ban another admin", data: null });
    }
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    target.isBanned = true;
    target.bannedAt = new Date();
    target.bannedReason = reason;
    target.refreshTokens = [];
    await target.save({ validateBeforeSave: false });
    res.json({
      success: true,
      message: "User banned",
      data: await User.findById(id).select("-password -refreshTokens").lean(),
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/users/:id/unban */
export async function unbanUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id", data: null });
    }
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "Cannot modify your own ban state here", data: null });
    }
    const target = await User.findById(id);
    if (!target || target.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found", data: null });
    }
    target.isBanned = false;
    target.bannedAt = null;
    target.bannedReason = "";
    await target.save({ validateBeforeSave: false });
    res.json({
      success: true,
      message: "User unbanned",
      data: await User.findById(id).select("-password -refreshTokens").lean(),
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/users/:id — soft delete */
export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id", data: null });
    }
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account", data: null });
    }
    const target = await User.findById(id);
    if (!target || target.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found", data: null });
    }
    if (target.role === "admin") {
      return res.status(400).json({ success: false, message: "Cannot delete an admin account", data: null });
    }
    target.isDeleted = true;
    target.deletedAt = new Date();
    target.refreshTokens = [];
    await target.save({ validateBeforeSave: false });
    res.json({ success: true, message: "User removed", data: null });
  } catch (err) {
    next(err);
  }
}

/** GET /api/users/me — current user (for clients that refetch profile) */
export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("-password -refreshTokens").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { name, email } = req.body;
    const updates = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim().toLowerCase();

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true }).select(
      "-password -refreshTokens"
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "Profile updated", data: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }
    next(err);
  }
}

/** GET /api/users/me/prescriptions */
export async function getMyPrescriptions(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("prescriptions").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const list = (user.prescriptions || []).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
}

/** POST /api/users/me/prescriptions */
export async function addMyPrescription(req, res, next) {
  try {
    const payload = {
      patientName: req.body?.patientName || "",
      date: req.body?.date || new Date(),
      odSphere: req.body?.odSphere || "",
      odCylinder: req.body?.odCylinder || "",
      odAxis: req.body?.odAxis || "",
      osSphere: req.body?.osSphere || "",
      osCylinder: req.body?.osCylinder || "",
      osAxis: req.body?.osAxis || "",
      add: req.body?.add || "",
      pd: req.body?.pd || "",
      notes: req.body?.notes || "",
    };
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.prescriptions.push(payload);
    await user.save();
    const created = user.prescriptions[user.prescriptions.length - 1];
    res.status(201).json({ success: true, message: "Prescription saved", data: created });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/users/me/prescriptions/:rxId */
export async function deleteMyPrescription(req, res, next) {
  try {
    const rxId = req.params.rxId;
    if (!mongoose.isValidObjectId(rxId)) {
      return res.status(400).json({ success: false, message: "Invalid prescription id" });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const idx = user.prescriptions.findIndex((p) => String(p._id) === String(rxId));
    if (idx < 0) return res.status(404).json({ success: false, message: "Prescription not found" });
    user.prescriptions.splice(idx, 1);
    await user.save();
    res.json({ success: true, message: "Prescription deleted", data: null });
  } catch (err) {
    next(err);
  }
}
