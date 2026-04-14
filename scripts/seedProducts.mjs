import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Product from "../models/Product.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productsJsonPath = path.join(__dirname, "../seed-data/products.json");

/** Hero + secondary image per product; cycled across the full catalog */
const UNSPLASH_PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600",
  "https://images.unsplash.com/photo-1508296695146-257a814070b4?w=600",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600",
  "https://images.unsplash.com/photo-1577803645773-f96470509666?w=600",
  "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600",
  "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=600",
  "https://images.unsplash.com/photo-1509695507497-903c140c43b0?w=600",
];

function assignUnsplashImages(docs) {
  const n = UNSPLASH_PRODUCT_IMAGES.length;
  return docs.map((doc, idx) => ({
    ...doc,
    images: [
      UNSPLASH_PRODUCT_IMAGES[idx % n],
      UNSPLASH_PRODUCT_IMAGES[(idx + 1) % n],
    ],
  }));
}

/** Remove Mongo-specific fields so insertMany creates fresh documents */
function stripForInsert(docs) {
  return docs.map((doc) => {
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    return rest;
  });
}

function loadProductsFromSeedFile() {
  if (!fs.existsSync(productsJsonPath)) return null;
  try {
    const raw = fs.readFileSync(productsJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.products;
    if (!Array.isArray(list) || list.length === 0) return null;
    return stripForInsert(list);
  } catch (e) {
    console.warn("Could not read seed-data/products.json, using default seed:", e.message);
    return null;
  }
}
const DEFAULT_REVIEWS = [
  {
    userName: "Rahul M.",
    rating: 5,
    comment:
      "Excellent quality frames! Very lightweight and comfortable for daily use. Highly recommend.",
    createdAt: new Date("2024-11-15"),
  },
  {
    userName: "Priya S.",
    rating: 4,
    comment: "Good product, nice design. The lens clarity is great. Delivery was fast too.",
    createdAt: new Date("2024-12-01"),
  },
  {
    userName: "Arjun K.",
    rating: 5,
    comment: "Perfect fit! Exactly as shown in pictures. Worth every rupee.",
    createdAt: new Date("2025-01-10"),
  },
];

function buildReviews(seed) {
  if (seed % 3 === 0) return [DEFAULT_REVIEWS[0], DEFAULT_REVIEWS[1]];
  if (seed % 3 === 1) return [DEFAULT_REVIEWS[1], DEFAULT_REVIEWS[2]];
  return [...DEFAULT_REVIEWS];
}

function withRatings(product, seed) {
  const reviews = buildReviews(seed);
  const avg = Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10;
  return {
    ...product,
    reviews,
    reviewCount: reviews.length,
    averageRating: avg,
    rating: avg,
  };
}

function buildProducts() {
  const products = [
    // Sunglasses (5) — images assigned in run() via assignUnsplashImages()
    { name: "Milano Round Titanium", brand: "Eyelens Premium", category: "Sunglasses", frameType: "Round", material: "Titanium", gender: "men", price: 4399, stock: 24, description: "Ultra-lightweight titanium round frames with polarised UV400 tinted lenses. Minimalist design perfect for everyday wear." },
    { name: "Urban Aviator Classic", brand: "Ray-Frame", category: "Sunglasses", frameType: "Aviator", material: "Metal", gender: "unisex", price: 3899, stock: 20, description: "Classic metal aviator sunglasses with gradient lenses. Timeless style with full UV protection." },
    { name: "Coastal Wayfarer Matte", brand: "OptiMax", category: "Sunglasses", frameType: "Wayfarer", material: "Acetate", gender: "women", price: 3199, stock: 22, description: "Matte acetate wayfarer sunglasses built for coastal glare and long drives. Comfortable fit with durable daily-wear hinges." },
    { name: "Solar Square Edge", brand: "VisionPro", category: "Sunglasses", frameType: "Square", material: "Polycarbonate", gender: "unisex", price: 2899, stock: 18, description: "Sharp square polycarbonate shades with scratch-resistant coated lenses. Bold silhouette made for bright outdoor days." },
    { name: "Rimless Air Tint", brand: "Eyelens Gold", category: "Sunglasses", frameType: "Rimless", material: "Titanium", gender: "men", price: 4999, stock: 12, description: "Feather-light rimless titanium sunglasses with clean floating lens aesthetics. Premium finish with all-day comfort and UV defense." },

    // Eyeglasses (5)
    { name: "Cartier-Cut Rectangle", brand: "Eyelens Gold", category: "Eyeglasses", frameType: "Rectangle", material: "Acetate", gender: "men", price: 4199, stock: 28, description: "Premium acetate rectangular eyeglasses with a polished luxury profile. Designed for sharp office-ready styling and daily comfort." },
    { name: "Forest Tortoise Round", brand: "Eyelens Nature", category: "Eyeglasses", frameType: "Round", material: "TR90", gender: "women", price: 2799, stock: 35, description: "Light TR90 round frames in classic tortoise tones. Flexible build and soft nose support make them ideal for long wear." },
    { name: "Tokyo Cat-Eye Luxe", brand: "OptiMax", category: "Eyeglasses", frameType: "Cat-Eye", material: "Metal", gender: "women", price: 3399, stock: 16, description: "Bold cat-eye metal frames for women. Adds a retro-luxe edge to any look with anti-reflective coating." },
    { name: "Berlin Square Everyday", brand: "Eyelens", category: "Eyeglasses", frameType: "Square", material: "Polycarbonate", gender: "unisex", price: 2299, stock: 30, description: "Everyday square eyeglasses in lightweight polycarbonate. Simple modern frame geometry for versatile day-to-night use." },
    { name: "Vienna Oval Slim", brand: "VisionPro", category: "Eyeglasses", frameType: "Oval", material: "Titanium", gender: "kids", price: 2599, stock: 14, description: "Slim oval titanium eyeglasses with a gentle lightweight fit. Great for smaller face profiles with durable premium construction." },

    // Computer Glasses (5)
    { name: "Hex Screen Shield", brand: "BlueGuard", category: "Computer Glasses", frameType: "Rectangle", material: "TR90", gender: "unisex", price: 1899, stock: 40, description: "Rectangular TR90 blue-light frames tuned for screen-heavy workdays. Lightweight feel with anti-fatigue lens coating support." },
    { name: "NightShift Wayfarer", brand: "BlueGuard", category: "Computer Glasses", frameType: "Wayfarer", material: "Acetate", gender: "men", price: 2199, stock: 26, description: "Wayfarer acetate computer glasses for late-night productivity. Helps reduce digital eye strain while keeping a smart casual style." },
    { name: "Focus Round Lite", brand: "VisionPro", category: "Computer Glasses", frameType: "Round", material: "Polycarbonate", gender: "women", price: 1699, stock: 32, description: "Round lightweight polycarbonate computer frames with blue-filter compatibility. Built for clarity during long laptop sessions." },
    { name: "DeskPro Rimless", brand: "Eyelens Premium", category: "Computer Glasses", frameType: "Rimless", material: "Metal", gender: "unisex", price: 2499, stock: 21, description: "Minimal rimless metal computer eyewear for clean professional looks. Balanced comfort and reduced reflections for desk work." },
    { name: "Coder Aviator Bluecut", brand: "BlueGuard", category: "Computer Glasses", frameType: "Aviator", material: "Titanium", gender: "men", price: 2799, stock: 19, description: "Titanium aviator computer frames with bluecut lens support. Premium lightweight build for developers and all-day screen use." },

    // Sports (5)
    { name: "Velocity Wraparound", brand: "Eyelens Sport", category: "Sports", frameType: "Wraparound", material: "TR90", gender: "unisex", price: 3499, stock: 27, description: "High-grip TR90 wraparound sports frames. Flexible, impact-resistant, and designed for running and cycling." },
    { name: "Sprint Rectangle Pro", brand: "Eyelens Sport", category: "Sports", frameType: "Rectangle", material: "Polycarbonate", gender: "men", price: 2999, stock: 25, description: "Rectangular polycarbonate sports eyewear with secure temple grip. Built for fast-paced training and outdoor endurance sessions." },
    { name: "Aero Oval Flex", brand: "VisionPro", category: "Sports", frameType: "Oval", material: "TR90", gender: "women", price: 2699, stock: 17, description: "Aerodynamic oval TR90 sports frames with flexible fit. Lightweight profile ideal for active routines and weekend rides." },
    { name: "Trail Square Shield", brand: "OptiMax", category: "Sports", frameType: "Square", material: "Metal", gender: "kids", price: 2399, stock: 13, description: "Square metal sport frames with shield-inspired coverage and stable fit. Great for trail walks, play, and outdoor activities." },
    { name: "Runner Wayfarer Grip", brand: "Eyelens Sport", category: "Sports", frameType: "Wayfarer", material: "Acetate", gender: "unisex", price: 2899, stock: 23, description: "Wayfarer-inspired acetate sport frames with enhanced grip arms. Designed to stay secure during jogs and high-movement routines." },
  ];

  return products.map((p, idx) =>
    withRatings(
      {
        ...p,
        origPrice: Math.round(p.price * 1.25),
        emoji: ["🕶️", "👓", "💻", "✨", "🔶"][idx % 5],
        bg: "linear-gradient(135deg,#F7F8F6,#EEF4F1)",
        badge: idx % 5 === 0 ? "NEW" : "",
        frameSize: ["Small", "Medium", "Large"][idx % 3],
        dimensions: `${138 + (idx % 8)}mm × ${42 + (idx % 5)}mm`,
        weight: `${18 + (idx % 11)}g`,
      },
      idx
    )
  );
}

async function run() {
  await connectDB();
  // Wipe catalog so old/broken image URLs are never mixed with new seed data
  await Product.deleteMany({});
  const fromFile = loadProductsFromSeedFile();
  const rawDocs = assignUnsplashImages(
    fromFile ? fromFile.map((doc, idx) => withRatings(doc, idx)) : buildProducts()
  );
  if (fromFile) {
    console.log(`Using ${rawDocs.length} products from seed-data/products.json`);
  }
  await Product.insertMany(rawDocs);
  console.log(`Seeded ${rawDocs.length} products`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
