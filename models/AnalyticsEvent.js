import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, maxlength: 64, index: true },
    visitorId: { type: String, required: true, maxlength: 80, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ createdAt: -1, event: 1 });
analyticsEventSchema.index({ event: 1, visitorId: 1 });

export default mongoose.model("AnalyticsEvent", analyticsEventSchema);
