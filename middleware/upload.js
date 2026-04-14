import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", "uploads");

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const REVIEW_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_REVIEW = new Set(["image/jpeg", "image/png"]);

function ensureSubdir(sub) {
  const dir = path.join(uploadsRoot, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function diskStorage(subdir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureSubdir(subdir)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".jpg";
      const safe = /^\.\w{2,5}$/.test(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${safe}`);
    },
  });
}

function fileFilter(_req, file, cb) {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new Error("Only JPG, PNG, and WebP images are allowed"));
}

function reviewFileFilter(_req, file, cb) {
  if (ALLOWED_REVIEW.has(file.mimetype)) return cb(null, true);
  cb(new Error("Only JPG and PNG images are allowed"));
}

/** Admin product image — max 5MB, saved under uploads/products */
export const uploadProductDisk = multer({
  storage: diskStorage("products"),
  limits: { fileSize: MAX_BYTES },
  fileFilter,
}).single("image");

/** Review image — max 2MB, JPG/PNG, saved under uploads/reviews */
export const uploadReviewDisk = multer({
  storage: diskStorage("reviews"),
  limits: { fileSize: REVIEW_MAX_BYTES },
  fileFilter: reviewFileFilter,
}).single("image");
