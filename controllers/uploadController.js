function publicBaseUrl(req) {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = req.get("host") || `localhost:${process.env.PORT || 5001}`;
  return `${req.protocol}://${host}`;
}

/** POST /api/upload/product */
export async function uploadProductFile(req, res, next) {
  try {
    if (!req.file?.filename) {
      return res.status(400).json({ success: false, message: "No image file provided", data: null });
    }
    const base = publicBaseUrl(req);
    const url = `${base}/uploads/products/${req.file.filename}`;
    res.json({
      success: true,
      message: "Uploaded",
      data: { url, filename: req.file.filename },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/upload (review image) */
export async function uploadReviewFile(req, res, next) {
  try {
    if (!req.file?.filename) {
      return res.status(400).json({ success: false, message: "No image file provided", data: null });
    }
    const base = publicBaseUrl(req);
    const url = `${base}/uploads/reviews/${req.file.filename}`;
    res.json({
      success: true,
      message: "Uploaded",
      data: { url, filename: req.file.filename },
    });
  } catch (err) {
    next(err);
  }
}
