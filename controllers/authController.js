import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  createJti,
} from "../utils/jwt.js";
import {
  getStorefrontUrl,
  sendLoginAlertEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../utils/emailService.js";

const BANNED_LOGIN_MSG = "Your account has been suspended. Contact support for help.";

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

const COOKIE_NAME = "refreshToken";

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return String(forwarded[0]).split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const user = await User.create({
      name,
      email,
      password,
      role: role === "admin" ? "user" : role || "user",
    });
    const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
    const jti = createJti();
    const refreshToken = signRefreshToken({ sub: user._id.toString(), jti });
    const decoded = jwt.decode(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);
    user.addRefreshJti(jti, expiresAt);
    await user.save({ validateBeforeSave: false });

    sendWelcomeEmail({ name: user.name, email: user.email }).catch(() => {});

    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    res.status(201).json({
      success: true,
      message: "Account created",
      data: { user: toPublicUser(user), accessToken },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user || user.isDeleted) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: BANNED_LOGIN_MSG, data: null });
    }
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
    const jti = createJti();
    const refreshToken = signRefreshToken({ sub: user._id.toString(), jti });
    const decoded = jwt.decode(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);
    user.addRefreshJti(jti, expiresAt);
    await user.save({ validateBeforeSave: false });

    sendLoginAlertEmail(
      { name: user.name, email: user.email },
      {
        when: new Date(),
        ip: getClientIp(req),
        userAgent: req.get("user-agent") || "",
      }
    ).catch(() => {});

    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    res.json({
      success: true,
      message: "Logged in",
      data: { user: toPublicUser(user), accessToken },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "Refresh token missing" });
    }
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.isDeleted) {
      return res.status(401).json({ success: false, message: "Refresh token revoked or invalid" });
    }
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: BANNED_LOGIN_MSG, data: null });
    }
    if (!user.hasRefreshJti(payload.jti)) {
      return res.status(401).json({ success: false, message: "Refresh token revoked or invalid" });
    }
    user.removeRefreshJti(payload.jti);
    const newJti = createJti();
    const newRefresh = signRefreshToken({ sub: user._id.toString(), jti: newJti });
    const decoded = jwt.decode(newRefresh);
    const expiresAt = new Date(decoded.exp * 1000);
    user.addRefreshJti(newJti, expiresAt);
    await user.save({ validateBeforeSave: false });

    const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
    res.cookie(COOKIE_NAME, newRefresh, cookieOptions());
    res.json({
      success: true,
      data: { accessToken, user: toPublicUser(user) },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const user = await User.findById(payload.sub);
        if (user) {
          user.removeRefreshJti(payload.jti);
          await user.save({ validateBeforeSave: false });
        }
      } catch {
        // ignore invalid token on logout
      }
    }
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json({ success: true, data: { user: toPublicUser(user) } });
}

/**
 * POST /api/auth/forgot-password — always 200; sends email only if user exists.
 */
export function forgotPassword(req, res) {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  res.json({
    success: true,
    message: "If an account exists for that email, you will receive reset instructions shortly.",
    data: null,
  });

  if (!email) return;

  setImmediate(async () => {
    try {
      const user = await User.findOne({ email, isDeleted: { $ne: true } }).select(
        "+resetPasswordToken +resetPasswordExpires"
      );
      if (!user || user.isBanned) return;

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashed = hashResetToken(rawToken);
      user.resetPasswordToken = hashed;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save({ validateBeforeSave: false });

      const base = getStorefrontUrl();
      const resetUrl = `${base}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail(email, resetUrl);
    } catch (e) {
      console.error("[forgotPassword]", e?.message || e);
    }
  });
}

/**
 * POST /api/auth/reset-password { token, newPassword }
 */
export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const raw = String(token || "").trim();
    const pwd = String(newPassword || "");
    if (!raw || pwd.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Valid token and password (min 8 characters) required",
        data: null,
      });
    }

    const hashed = hashResetToken(raw);
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+password +resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Link expired or invalid",
        data: null,
      });
    }

    user.password = pwd;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.refreshTokens = [];
    await user.save();

    res.json({ success: true, message: "Password reset successfully", data: null });
  } catch (err) {
    next(err);
  }
}
