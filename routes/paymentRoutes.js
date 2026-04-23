import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getPaymentsConfig,
  createRazorpayOrder,
  verifyRazorpayPayment,
  markRazorpayPaymentFailed,
} from "../controllers/paymentController.js";

const router = Router();

router.get("/config", getPaymentsConfig);
router.post("/create-order", authenticate, createRazorpayOrder);
router.post("/verify", authenticate, verifyRazorpayPayment);
router.post("/fail", authenticate, markRazorpayPaymentFailed);

export default router;
