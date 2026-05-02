import rateLimit from "express-rate-limit";

const M15 = 15 * 60 * 1000;
const M2 = 2 * 60 * 1000;
const H1 = 60 * 60 * 1000;

export const apiGeneralLimiter = rateLimit({
  windowMs: M15,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = String(req.path || "");
    if (req.method === "POST" && p === "/orders") return true;
    if (req.method !== "GET") return false;
    return (
      p === "/health" ||
      p === "/products" ||
      p.startsWith("/products/") ||
      p === "/banners"
    );
  },
  message: { success: false, message: "Too many requests. Please try again later.", data: null },
});

export const authLoginLimiter = rateLimit({
  windowMs: M2,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try after 2 mins", data: null },
});

export const authRegisterLimiter = rateLimit({
  windowMs: H1,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many registration attempts. Try again in an hour.", data: null },
});

export const authForgotPasswordLimiter = rateLimit({
  windowMs: H1,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset requests. Try again in an hour.", data: null },
});

export const authOtherLimiter = rateLimit({
  windowMs: M15,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later.", data: null },
});

/** Coupon apply attempts per user session (auth). */
export const couponApplyLimiter = rateLimit({
  windowMs: M15,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many coupon attempts. Please try again later.", data: null },
});

/** Public newsletter signups. */
export const newsletterSubscribeLimiter = rateLimit({
  windowMs: M15,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many sign-up attempts. Please try again later.", data: null },
});

/** Order creation limiter (separate from general API limiter). */
export const orderCreateLimiter = rateLimit({
  windowMs: M15,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many order attempts. Please try again later.", data: null },
});

/** Storefront analytics beacons (cart/checkout). */
export const analyticsTrackLimiter = rateLimit({
  windowMs: M15,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many analytics requests. Please try again later.", data: null },
});
