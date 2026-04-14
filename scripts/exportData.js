/**
 * Export all products and users (no passwords) to server/seed-data/*.json
 * Usage: npm run export:data (from server directory)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDataDir = path.join(__dirname, "../seed-data");

async function run() {
  await connectDB();

  const products = await Product.find().lean();
  const users = await User.find().select("-password -refreshTokens").lean();

  fs.mkdirSync(seedDataDir, { recursive: true });

  const productsPath = path.join(seedDataDir, "products.json");
  const usersPath = path.join(seedDataDir, "users.json");

  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), "utf8");
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");

  console.log(`Exported ${products.length} products → ${path.relative(process.cwd(), productsPath)}`);
  console.log(`Exported ${users.length} users → ${path.relative(process.cwd(), usersPath)}`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
