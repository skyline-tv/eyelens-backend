import mongoose from "mongoose";

/** percentage = discount off subtotal; flat = fixed rupee amount */
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    /** Human-readable name for admin list */
    label: { type: String, default: "", trim: true },
    discountType: { type: String, enum: ["percentage", "flat"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    /** Optional per-user one-time usage lock */
    oneTimePerUser: { type: Boolean, default: false },
    /** Restrict coupon to a user's first successful order */
    newUsersOnly: { type: Boolean, default: false },
    /** If true, discount applies only on frame subtotal (ignores lens add-ons) */
    frameOnlyDiscount: { type: Boolean, default: false },
    /** Buy 1 Get 1 on frames: free cheapest eligible frame(s) in cart */
    bogoEnabled: { type: Boolean, default: false },
    /** Tracks users who have consumed this coupon (for oneTimePerUser) */
    usedByUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Coupon", couponSchema);
