import sanitizeHtml from "sanitize-html";

const NO_TAGS = { allowedTags: [], allowedAttributes: {} };

export function stripHtmlText(val) {
  if (val == null || val === "") return val;
  return sanitizeHtml(String(val), NO_TAGS).trim();
}

/** POST/PUT product body */
export function sanitizeProductBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    if (req.body.name != null) req.body.name = stripHtmlText(req.body.name);
    if (req.body.description != null) req.body.description = stripHtmlText(req.body.description);
    if (req.body.brand != null) req.body.brand = stripHtmlText(req.body.brand);
    if (Array.isArray(req.body.images)) {
      req.body.images = req.body.images.map((img) => stripHtmlText(img)).filter(Boolean);
    }
    if (Array.isArray(req.body.colors)) {
      req.body.colors = req.body.colors.map((color) => {
        if (!color || typeof color !== "object") return color;
        return {
          ...color,
          name: color.name != null ? stripHtmlText(color.name) : "",
          hex: color.hex != null ? stripHtmlText(color.hex) : "",
          stock: color.stock,
          images: Array.isArray(color.images)
            ? color.images.map((img) => stripHtmlText(img)).filter(Boolean)
            : [],
        };
      });
    }
  }
  next();
}

/** POST review */
export function sanitizeReviewBody(req, res, next) {
  if (req.body && req.body.comment != null) {
    req.body.comment = stripHtmlText(req.body.comment);
  }
  next();
}

/** PATCH /users/me */
export function sanitizeUserMeBody(req, res, next) {
  if (req.body && req.body.name != null) {
    req.body.name = stripHtmlText(req.body.name);
  }
  next();
}

/** POST /users/me/prescriptions */
export function sanitizePrescriptionBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    const fields = [
      "patientName",
      "odSphere",
      "odCylinder",
      "odAxis",
      "osSphere",
      "osCylinder",
      "osAxis",
      "add",
      "pd",
      "notes",
    ];
    for (const field of fields) {
      if (req.body[field] != null) req.body[field] = stripHtmlText(req.body[field]);
    }
  }
  next();
}

/** POST/PUT coupon */
export function sanitizeCouponBody(req, res, next) {
  if (req.body && req.body.code != null) {
    req.body.code = stripHtmlText(req.body.code).toUpperCase();
  }
  next();
}

const BANNER_PLACEMENTS = new Set([
  "",
  "home_cat_sunglasses",
  "home_cat_eyeglasses",
  "home_cat_computer",
  "home_cat_sports",
]);

/** POST/PUT banner */
export function sanitizeBannerBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    if (req.body.title != null) req.body.title = stripHtmlText(req.body.title);
    if (req.body.subtitle != null) req.body.subtitle = stripHtmlText(req.body.subtitle);
    if (req.body.placement != null) {
      const p = String(req.body.placement).trim();
      req.body.placement = BANNER_PLACEMENTS.has(p) ? p : "";
    }
  }
  next();
}
