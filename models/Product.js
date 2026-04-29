import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    userName: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 },
    imageUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    images: [{ type: String }],
    colors: [
      {
        name: { type: String, trim: true, default: "" },
        hex: { type: String, trim: true, default: "" },
        stock: { type: Number, default: null, min: 0 },
        images: [{ type: String }],
      },
    ],
    category: { type: String, default: "General", trim: true },
    stock: { type: Number, default: 0, min: 0 },
    /** Reserved for future cart-hold flows */
    reserved: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    modelNumber: { type: String, default: "", trim: true },
    frameType: { type: String, default: "" },
    material: { type: String, default: "" },
    warranty: { type: String, default: "1 Year Full" },
    deliveryPrimary: { type: String, default: "Free delivery by Saturday" },
    deliverySecondary: { type: String, default: "Order before 6 PM today" },
    gender: {
      type: String,
      enum: ["unisex", "men", "women", "kids"],
      default: "unisex",
    },
    emoji: { type: String, default: "👓" },
    bg: { type: String, default: "linear-gradient(135deg,#F7F8F6,#EEF4F1)" },
    badge: { type: String, default: "" },
    origPrice: { type: Number, min: 0 },
    outOfStock: { type: Boolean, default: false },
    frameSize: { type: String, default: "" },
    dimensions: { type: String, default: "" },
    weight: { type: String, default: "" },
    /** Legacy default; kept in sync with review average when reviews exist */
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    reviews: { type: [reviewSchema], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ name: "text", description: "text" });

export default mongoose.model("Product", productSchema);
