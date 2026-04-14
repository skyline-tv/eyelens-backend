import "dotenv/config";
import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Set MONGO_URI in .env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  const coupons = [
    {
      code: "FIRST200",
      label: "First order ₹200 off",
      discountType: "flat",
      discountValue: 200,
      minOrderValue: 0,
      maxUses: null,
      isActive: true,
      expiresAt: nextYear,
    },
    {
      code: "EYELENS10",
      label: "Eyelens 10% off",
      discountType: "percentage",
      discountValue: 10,
      minOrderValue: 0,
      maxUses: null,
      isActive: true,
      expiresAt: nextYear,
    },
    {
      code: "SAVE10",
      label: "Save 10%",
      discountType: "percentage",
      discountValue: 10,
      minOrderValue: 500,
      maxUses: 100,
      isActive: true,
      expiresAt: nextYear,
    },
  ];

  for (const coupon of coupons) {
    await Coupon.findOneAndUpdate(
      { code: coupon.code },
      {
        $set: coupon,
        $setOnInsert: {
          usedCount: 0,
        },
      },
      { upsert: true }
    );
  }
  console.log("Coupons upserted: FIRST200, EYELENS10, SAVE10");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
