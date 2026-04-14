import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "" },
    linkUrl: { type: String, default: "" },
    /** "" = hero carousel slide; home_cat_* = homepage category tile image only (not in carousel). */
    placement: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, order: 1 });
bannerSchema.index({ placement: 1, isActive: 1 });

export default mongoose.model("Banner", bannerSchema);
