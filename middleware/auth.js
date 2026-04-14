import { verifyAccessToken } from "../utils/jwt.js";
import User from "../models/User.js";

const SUSPENDED_MSG = "Your account has been suspended. Contact support for help.";

/** Sets req.user when valid Bearer token present; otherwise continues without user. */
export function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();
  const token = authHeader.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.sub, role: decoded.role };
  } catch {
    /* ignore invalid token for optional auth */
  }
  next();
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required", data: null });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.sub, role: decoded.role };
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token", data: null });
  }

  User.findById(req.user.id)
    .select("isBanned isDeleted")
    .lean()
    .then((u) => {
      if (!u || u.isDeleted) {
        return res.status(401).json({ success: false, message: "Invalid or expired token", data: null });
      }
      if (u.isBanned) {
        return res.status(403).json({ success: false, message: SUSPENDED_MSG, data: null });
      }
      next();
    })
    .catch(() => res.status(500).json({ success: false, message: "Internal server error", data: null }));
}
