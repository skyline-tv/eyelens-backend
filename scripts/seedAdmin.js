import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = process.env.SEED_ADMIN_EMAIL || "admin@eyelens.com";
const password = process.env.SEED_ADMIN_PASSWORD || "Admin@123";
const name = process.env.SEED_ADMIN_NAME || "Admin";

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Set MONGO_URI in .env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteOne({ email });
  await User.create({
    name,
    email,
    password,
    role: "admin",
  });
  console.log(`Admin user created: ${email}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
