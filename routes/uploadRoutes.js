import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { uploadProductDisk, uploadReviewDisk } from "../middleware/upload.js";
import { uploadProductFile, uploadReviewFile } from "../controllers/uploadController.js";

const router = Router();

router.post("/", authenticate, uploadReviewDisk, uploadReviewFile);
router.post("/product", authenticate, requireRole("admin"), uploadProductDisk, uploadProductFile);

export default router;
