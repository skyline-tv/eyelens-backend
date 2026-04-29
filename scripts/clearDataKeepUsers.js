import "dotenv/config";
import mongoose from "mongoose";

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGO_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const keep = new Set(["users"]);
  const protectedCollections = new Set(["system.indexes", "system.profile", ...keep]);
  const collections = Object.keys(mongoose.connection.collections || {});

  if (!collections.length) {
    console.log("No collections found. Nothing to delete.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const deleted = [];
  const skipped = [];

  for (const name of collections) {
    if (protectedCollections.has(name)) {
      skipped.push(name);
      continue;
    }
    await mongoose.connection.collection(name).deleteMany({});
    deleted.push(name);
  }

  console.log("Data wipe complete (login data preserved).");
  console.log(`Kept collections: ${skipped.join(", ") || "none"}`);
  console.log(`Cleared collections: ${deleted.join(", ") || "none"}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (error) => {
  console.error("Failed to clear data:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
