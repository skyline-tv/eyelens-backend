import { body } from "express-validator";

export function shippingAddressError(addr) {
  if (!addr || typeof addr !== "object") return "shippingAddress is required";
  const phone = String(addr.phone ?? "").replace(/\D/g, "");
  if (phone.length !== 10) return "Enter a valid 10-digit phone number";
  const pin = String(addr.pincode ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return "Enter a valid 6-digit pincode";
  const street = String(addr.address ?? "").trim();
  if (street.length < 5) return "Address must be at least 5 characters";
  if (street.length > 500) return "Address is too long";
  const city = String(addr.city ?? "").trim();
  if (!city || city.length > 120) return "City is required";
  const state = String(addr.state ?? "").trim();
  if (!state || state.length > 120) return "State is required";
  const fn = String(addr.firstName ?? "").trim();
  const ln = String(addr.lastName ?? "").trim();
  const full = String(addr.fullName ?? "").trim();
  if (!full && (!fn || !ln)) return "First and last name (or full name) is required";
  if (fn.length > 80 || ln.length > 80) return "Name is too long";
  if (full.length > 200) return "Full name is too long";
  return null;
}

export const placeOrderRules = [
  body("items")
    .isArray({ min: 1 })
    .withMessage("At least one item is required")
    .custom((items) => {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("At least one item is required");
      }
      for (const it of items) {
        const pid = it?.productId || it?.product;
        if (!pid) throw new Error("Each item must include productId");
      }
      return true;
    }),
  body("shippingAddress")
    .isObject()
    .withMessage("shippingAddress is required")
    .custom((addr) => {
      const err = shippingAddressError(addr);
      if (err) throw new Error(err);
      return true;
    }),
  body("paymentMethod")
    .trim()
    .notEmpty()
    .withMessage("paymentMethod is required")
    .isIn(["cod", "razorpay", "upi", "card"])
    .withMessage("Invalid payment method"),
];
