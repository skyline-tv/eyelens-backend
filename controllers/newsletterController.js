import Newsletter from "../models/Newsletter.js";
import { sendNewsletterWelcomeEmail } from "../utils/emailService.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** POST /api/newsletter/subscribe */
export async function subscribeNewsletter(req, res, next) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email required", data: null });
    }

    const existing = await Newsletter.findOne({ email }).lean();
    if (existing) {
      return res.json({ success: true, message: "Already subscribed!", data: null });
    }

    await Newsletter.create({ email, subscribedAt: new Date(), isActive: true });
    sendNewsletterWelcomeEmail(email).catch(() => {});
    res.status(201).json({ success: true, message: "Successfully subscribed!", data: null });
  } catch (err) {
    next(err);
  }
}
