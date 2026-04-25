import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { sanitizeBannerBody } from "../middleware/sanitize.js";
import {
  listPublicBanners,
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../controllers/bannerController.js";

const router = Router();

/** Public carousel */
router.get("/", listPublicBanners);

/** Admin: full list for CMS */
router.get("/admin/all", authenticate, requireRole("admin"), listAllBanners);
router.post("/", authenticate, requireRole("admin"), sanitizeBannerBody, createBanner);
router.put("/:id", authenticate, requireRole("admin"), sanitizeBannerBody, updateBanner);
router.delete("/:id", authenticate, requireRole("admin"), deleteBanner);

export default router;
