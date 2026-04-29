import mongoose from "mongoose";
import multer from "multer";

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages[0] || "Validation error", errors: messages, data: null });
  }

  if (err.code === 11000) {
    const keys = err.keyPattern ? Object.keys(err.keyPattern) : [];
    const dupKey = keys[0] || "";
    if (dupKey === "code") {
      return res.status(409).json({ success: false, message: "A coupon with this code already exists", data: null });
    }
    if (dupKey === "email") {
      return res.status(409).json({ success: false, message: "Email already registered", data: null });
    }
    return res.status(409).json({
      success: false,
      message: dupKey ? `Duplicate value for ${dupKey}` : "This record already exists",
      data: null,
    });
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Invalid or expired token", data: null });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: "Invalid resource id", data: null });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const defaultMb = 10;
      const parsedMb = Number(process.env.PRODUCT_UPLOAD_MAX_MB);
      const maxMb = Number.isFinite(parsedMb) && parsedMb > 0 ? parsedMb : defaultMb;
      return res.status(400).json({
        success: false,
        message: `Image must be ${maxMb}MB or smaller`,
        data: null,
      });
    }
    return res.status(400).json({ success: false, message: err.message || "Upload error", data: null });
  }
  if (err?.message === "Only JPG, PNG, and WebP images are allowed") {
    return res.status(400).json({ success: false, message: err.message, data: null });
  }

  const status = err.status || err.statusCode || 500;
  const message = status === 500 ? "Internal server error" : err.message || "Something went wrong";
  return res.status(status).json({ success: false, message, data: null });
}
