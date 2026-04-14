import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import {
  authLoginLimiter,
  authRegisterLimiter,
  authForgotPasswordLimiter,
  authOtherLimiter,
} from "../middleware/rateLimiters.js";

const router = Router();

const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 80 }),
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

const loginRules = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
];

router.post("/register", authRegisterLimiter, registerRules, validate, register);
router.post("/login", authLoginLimiter, loginRules, validate, login);
router.post("/refresh", authOtherLimiter, refresh);
router.post("/logout", authOtherLimiter, logout);
router.get("/me", authOtherLimiter, authenticate, me);

router.post(
  "/forgot-password",
  authForgotPasswordLimiter,
  [body("email").trim().isEmail().withMessage("Valid email required")],
  validate,
  forgotPassword
);
router.post(
  "/reset-password",
  authOtherLimiter,
  [
    body("token").trim().notEmpty().withMessage("Token required"),
    body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  resetPassword
);

export default router;
