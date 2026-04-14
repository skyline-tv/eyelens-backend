import { body } from "express-validator";

export const createProductRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 200 }),
  body("brand").trim().notEmpty().withMessage("Brand is required"),
  body("price").isFloat({ min: 0 }).withMessage("Valid price required"),
  body("stock").isInt({ min: 0 }).withMessage("Stock must be a non-negative integer"),
];
