/**
 * Fail fast in production when auth/database secrets are missing or trivial.
 * Development keeps defaults so local `npm run dev` still works without a full .env.
 */
export function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const checks = [
    ["MONGO_URI", 10],
    ["JWT_SECRET", 16],
    ["REFRESH_TOKEN_SECRET", 16],
  ];

  const bad = [];
  for (const [key, minLen] of checks) {
    const v = process.env[key];
    if (!v || String(v).trim().length < minLen) bad.push(key);
  }

  if (bad.length) {
    throw new Error(
      `Set strong values for: ${bad.join(", ")} (required in NODE_ENV=production; see server/.env.example)`
    );
  }
}
