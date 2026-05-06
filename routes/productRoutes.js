import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { validate } from "../middleware/validate.js";
import { sanitizeProductBody, sanitizeReviewBody } from "../middleware/sanitize.js";
import { createProductRules } from "../validators/productValidators.js";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import { listProductReviews, addProductReview, importProductReviewsAdmin } from "../controllers/productReviewController.js";

const router = Router();

router.get("/", listProducts);

router.get("/:id/reviews", optionalAuthenticate, listProductReviews);
router.post("/:id/reviews", authenticate, sanitizeReviewBody, addProductReview);
router.post("/:id/reviews/import", authenticate, requireRole("admin"), importProductReviewsAdmin);

router.get("/:id", getProduct);
router.post("/", authenticate, requireRole("admin"), sanitizeProductBody, createProductRules, validate, createProduct);
router.put("/:id", authenticate, requireRole("admin"), sanitizeProductBody, updateProduct);
router.delete("/:id", authenticate, requireRole("admin"), deleteProduct);

export default router;
