import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { dashboardStats, resetDataKeepLogin } from "../controllers/statsController.js";
import { trackStoreEvent, funnelStats } from "../controllers/analyticsController.js";
import { analyticsTrackLimiter } from "../middleware/rateLimiters.js";

const router = Router();

router.post("/track-event", analyticsTrackLimiter, optionalAuthenticate, trackStoreEvent);
router.get("/dashboard", authenticate, requireRole("admin"), dashboardStats);
router.get("/funnel", authenticate, requireRole("admin"), funnelStats);
router.post("/reset-data-keep-login", authenticate, requireRole("admin"), resetDataKeepLogin);

export default router;
