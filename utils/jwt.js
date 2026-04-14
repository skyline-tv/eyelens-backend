import jwt from "jsonwebtoken";
import crypto from "crypto";

export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    issuer: "eyelens-api",
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
    issuer: "eyelens-api",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: "eyelens-api" });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, { issuer: "eyelens-api" });
}

export function createJti() {
  return crypto.randomBytes(32).toString("hex");
}
