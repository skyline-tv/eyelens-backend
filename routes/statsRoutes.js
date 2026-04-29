import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { dashboardStats, resetDataKeepLogin } from "../controllers/statsController.js";

const router = Router();

router.get("/dashboard", authenticate, requireRole("admin"), dashboardStats);
router.post("/reset-data-keep-login", authenticate, requireRole("admin"), resetDataKeepLogin);

export default router;
