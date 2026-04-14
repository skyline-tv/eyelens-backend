import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { couponApplyLimiter } from "../middleware/rateLimiters.js";
import { sanitizeCouponBody } from "../middleware/sanitize.js";
import {
  applyCoupon,
  listPublicCoupons,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/couponController.js";

const router = Router();

router.get("/public", listPublicCoupons);
router.post("/apply", authenticate, couponApplyLimiter, applyCoupon);

router.get("/", authenticate, requireRole("admin"), listCoupons);
router.post("/", authenticate, requireRole("admin"), sanitizeCouponBody, createCoupon);
router.put("/:id", authenticate, requireRole("admin"), sanitizeCouponBody, updateCoupon);
router.delete("/:id", authenticate, requireRole("admin"), deleteCoupon);

export default router;
