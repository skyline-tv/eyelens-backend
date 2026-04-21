import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import { connectDB } from "./config/db.js";
import { validateProductionEnv } from "./config/validateEnv.js";
import { ensureDefaultBannersOnStartup } from "./config/ensureDefaultBanners.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiGeneralLimiter } from "./middleware/rateLimiters.js";
import { getHealthReport } from "./utils/healthReport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
for (const sub of ["products", "reviews"]) {
  fs.mkdirSync(path.join(uploadsDir, sub), { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5001;
const defaultOrigins = "http://localhost:3000,http://localhost:3001";
const rawOrigins = process.env.CLIENT_URLS || process.env.CLIENT_URL || defaultOrigins;
const normalizeOrigin = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};
const expandOriginVariants = (origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return [];
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const hostParts = host.split(".");
    const canToggleWww = !isLocal && hostParts.length >= 2;
    if (!canToggleWww) return [normalized];

    const baseHost = host.startsWith("www.") ? host.slice(4) : host;
    const variants = [baseHost, `www.${baseHost}`];
    return variants.map((variantHost) => {
      const variantUrl = new URL(normalized);
      variantUrl.hostname = variantHost;
      return normalizeOrigin(variantUrl.toString());
    });
  } catch {
    return [normalized];
  }
};
let configuredOrigins = rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);
if (configuredOrigins.length === 0) {
  configuredOrigins = defaultOrigins.split(",").map((s) => s.trim()).filter(Boolean);
}
const allowedOrigins = new Set(
  configuredOrigins.flatMap((origin) => expandOriginVariants(origin))
);
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
    hsts: isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        if (isProd) return callback(null, false);
        return callback(null, true);
      }
      if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(compression());
app.use(morgan(isProd ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(mongoSanitize());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  const { body, httpStatus } = getHealthReport({ uploadsDir });
  res.status(httpStatus).json(body);
});

app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  })
);

app.use("/api", apiGeneralLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/newsletter", newsletterRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found", data: null });
});

app.use(errorHandler);

async function start() {
  try {
    validateProductionEnv();
    await connectDB();
    await ensureDefaultBannersOnStartup();
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
