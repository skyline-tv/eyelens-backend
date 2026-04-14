export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient permissions", data: null });
    }
    next();
  };
}
