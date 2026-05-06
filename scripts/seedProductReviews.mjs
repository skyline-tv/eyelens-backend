import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Product from "../models/Product.js";

const REVIEWERS = [
  "Aarav M.",
  "Isha R.",
  "Rohan K.",
  "Neha P.",
  "Kunal S.",
  "Ananya T.",
  "Vikram D.",
  "Pooja N.",
  "Sanjay L.",
  "Mira A.",
  "Kabir J.",
  "Ritika G.",
];

const COMMENTS = [
  "Really good finish and comfortable for all-day wear.",
  "Looks premium in person. Fit is exactly what I wanted.",
  "Lightweight frame and clear lens quality. Happy with this purchase.",
  "Great value for money. Delivery and packaging were also good.",
  "Stylish and practical. I have been using it daily without issues.",
  "Build quality feels strong and the frame sits well on the face.",
  "Exactly as shown in photos. Nice design and comfortable nose bridge.",
  "Good for long screen hours. Reduced eye strain for me.",
  "Perfect everyday pair. Ordered another color for my sibling too.",
  "Very clean look and nice detailing on the frame edges.",
  "Satisfied overall. Good support team and smooth ordering experience.",
  "Color and finish are excellent. Got compliments in office.",
];

function pick(arr, idx) {
  return arr[idx % arr.length];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function buildSyntheticReviews(product, productIdx, count) {
  const reviews = [];
  for (let i = 0; i < count; i += 1) {
    // Heavily skew towards 4-5 for storefront trust, with occasional 3.
    const ratingSeed = (productIdx + i) % 10;
    const rating = ratingSeed < 5 ? 5 : ratingSeed < 9 ? 4 : 3;
    const comment = pick(COMMENTS, productIdx * 3 + i);
    const userName = pick(REVIEWERS, productIdx * 5 + i);
    reviews.push({
      userName,
      rating,
      comment,
      imageUrl: "",
      createdAt: daysAgo(productIdx * 2 + i * 3 + 1),
    });
  }
  return reviews;
}

function calcRatingSummary(reviews) {
  if (!reviews.length) return { averageRating: 0, reviewCount: 0, rating: 0 };
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const avg = Math.round((sum / reviews.length) * 10) / 10;
  return { averageRating: avg, reviewCount: reviews.length, rating: avg };
}

async function run() {
  const overwrite = process.argv.includes("--overwrite");
  await connectDB();
  const products = await Product.find({}).select("_id name reviews");

  let touched = 0;
  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    const existing = Array.isArray(p.reviews) ? p.reviews : [];
    if (existing.length > 0 && !overwrite) continue;

    const reviewCountTarget = 3 + (i % 4); // 3-6 reviews per product
    const nextReviews = buildSyntheticReviews(p, i, reviewCountTarget);
    const summary = calcRatingSummary(nextReviews);

    p.reviews = nextReviews;
    p.averageRating = summary.averageRating;
    p.reviewCount = summary.reviewCount;
    p.rating = summary.rating;
    await p.save();
    touched += 1;
  }

  console.log(
    overwrite
      ? `Overwrote reviews for ${touched} product(s).`
      : `Seeded reviews for ${touched} product(s) without existing reviews.`
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
