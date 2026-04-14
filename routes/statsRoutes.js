import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { dashboardStats } from "../controllers/statsController.js";

const router = Router();

router.get("/dashboard", authenticate, requireRole("admin"), dashboardStats);

export default router;
