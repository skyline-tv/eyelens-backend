import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { sanitizeUserMeBody, sanitizePrescriptionBody } from "../middleware/sanitize.js";
import {
  listUsers,
  updateUserRole,
  getMe,
  updateMe,
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
  banUser,
  unbanUser,
  deleteUser,
  getMyPrescriptions,
  addMyPrescription,
  deleteMyPrescription,
} from "../controllers/userListController.js";

const router = Router();

router.get("/wishlist", authenticate, getWishlist);
/** Add to wishlist (canonical). */
router.post("/wishlist/:productId", authenticate, addWishlistItem);
router.delete("/wishlist/:productId", authenticate, removeWishlistItem);

router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, sanitizeUserMeBody, updateMe);
router.get("/me/prescriptions", authenticate, getMyPrescriptions);
router.post("/me/prescriptions", authenticate, sanitizePrescriptionBody, addMyPrescription);
router.delete("/me/prescriptions/:rxId", authenticate, deleteMyPrescription);

router.get("/profile", authenticate, (req, res) => {
  res.json({
    success: true,
    data: { message: "Protected user profile", userId: req.user.id, role: req.user.role },
  });
});

router.get("/admin-only", authenticate, requireRole("admin"), (req, res) => {
  res.json({
    success: true,
    data: { message: "Admin-only route", userId: req.user.id },
  });
});

router.get("/", authenticate, requireRole("admin"), listUsers);
router.put("/:id/ban", authenticate, requireRole("admin"), banUser);
router.put("/:id/unban", authenticate, requireRole("admin"), unbanUser);
router.delete("/:id", authenticate, requireRole("admin"), deleteUser);
router.put("/:id/role", authenticate, requireRole("admin"), updateUserRole);

export default router;
