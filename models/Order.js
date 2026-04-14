import mongoose from "mongoose";

const orderLensSchema = new mongoose.Schema(
  {
    id: { type: String, maxlength: 64, default: "" },
    name: { type: String, maxlength: 220, default: "" },
    price: { type: Number, min: 0, max: 50000, default: 0 },
  },
  { _id: false }
);

const orderPrescriptionSchema = new mongoose.Schema(
  {
    mode: { type: String, maxlength: 20, default: "none" },
    patientName: { type: String, maxlength: 120, default: "" },
    date: { type: String, maxlength: 40, default: "" },
    odSphere: { type: String, maxlength: 24, default: "" },
    odCylinder: { type: String, maxlength: 24, default: "" },
    odAxis: { type: String, maxlength: 24, default: "" },
    osSphere: { type: String, maxlength: 24, default: "" },
    osCylinder: { type: String, maxlength: 24, default: "" },
    osAxis: { type: String, maxlength: 24, default: "" },
    add: { type: String, maxlength: 40, default: "" },
    pd: { type: String, maxlength: 40, default: "" },
    notes: { type: String, maxlength: 500, default: "" },
  },
  { _id: false }
);

const orderFrameOptionsSchema = new mongoose.Schema(
  {
    color: { type: String, maxlength: 80, default: "" },
    size: { type: String, maxlength: 40, default: "" },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    brand: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    emoji: { type: String, default: "👓" },
    lens: { type: orderLensSchema },
    prescription: { type: orderPrescriptionSchema },
    frameOptions: { type: orderFrameOptionsSchema },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true, validate: [(v) => v.length > 0, "Order needs items"] },
    /** Sum of line items (frames + lenses) before shipping/discount */
    itemsSubtotal: { type: Number, default: 0, min: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: "" },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    /** Shown on tracking / invoice when status transitions */
    confirmedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    shippingAddress: { type: mongoose.Schema.Types.Mixed, required: true },
    paymentMethod: {
      type: String,
      enum: ["cod", "razorpay", "upi", "card"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentId: { type: String, default: "" },
    /** Razorpay order id (for verify) */
    razorpayOrderId: { type: String, default: "" },
    /** null = no return; otherwise requested | approved | rejected | completed */
    returnStatus: { type: String, default: null },
    returnReason: { type: String, default: "", maxlength: 2000 },
    returnRequestedAt: { type: Date, default: null },
    returnResolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ returnStatus: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model("Order", orderSchema);
