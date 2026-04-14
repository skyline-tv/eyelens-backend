import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { validate } from "../middleware/validate.js";
import { placeOrderRules } from "../validators/orderValidators.js";
import {
  createOrder,
  myOrders,
  allOrders,
  updateOrderStatus,
  getOrderById,
  requestReturn,
  updateReturnStatus,
  listReturnRequests,
} from "../controllers/orderController.js";
import { streamOrderInvoice } from "../controllers/orderPdfController.js";

const router = Router();

router.get("/my", authenticate, myOrders);
router.get("/returns", authenticate, requireRole("admin"), listReturnRequests);

router.post("/", authenticate, placeOrderRules, validate, createOrder);

router.get("/:id/invoice", authenticate, streamOrderInvoice);
router.post("/:id/return", authenticate, requestReturn);
router.put("/:id/return/status", authenticate, requireRole("admin"), updateReturnStatus);
router.get("/:id", authenticate, getOrderById);

router.get("/", authenticate, requireRole("admin"), allOrders);
router.put("/:id/status", authenticate, requireRole("admin"), updateOrderStatus);

export default router;
