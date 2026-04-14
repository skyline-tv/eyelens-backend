import { Router } from "express";
import { newsletterSubscribeLimiter } from "../middleware/rateLimiters.js";
import { subscribeNewsletter } from "../controllers/newsletterController.js";

const router = Router();

router.post("/subscribe", newsletterSubscribeLimiter, subscribeNewsletter);

export default router;
