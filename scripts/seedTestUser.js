import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = process.env.SEED_CUSTOMER_EMAIL || "customer@eyelens.com";
const password = process.env.SEED_CUSTOMER_PASSWORD || "Customer@123";
const name = process.env.SEED_CUSTOMER_NAME || "Test Customer";

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Set MONGO_URI in .env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Test customer already exists: ${email}`);
    await mongoose.disconnect();
    process.exit(0);
    return;
  }
  await User.create({
    name,
    email,
    password,
    role: "user",
  });
  console.log(`Test customer created: ${email}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
