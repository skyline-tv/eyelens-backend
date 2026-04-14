import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGOOSE_STATE = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

function readPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function dirWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ uploadsDir: string }} opts
 * @returns {{ body: object, httpStatus: number }}
 */
export function getHealthReport(opts) {
  const { uploadsDir } = opts;
  const mem = process.memoryUsage();
  const state = mongoose.connection.readyState;
  const stateLabel = MONGOOSE_STATE[state] ?? `unknown(${state})`;
  const mongoOk = state === 1;

  const integrations = {
    razorpay: {
      configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    },
    smtp: {
      configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    },
    cloudinary: {
      configured: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
      ),
    },
  };

  let uploadsSubdirs = null;
  try {
    uploadsSubdirs = fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    uploadsSubdirs = [];
  }

  const body = {
    ok: mongoOk,
    healthy: mongoOk,
    status: mongoOk ? "ok" : "degraded",
    service: "eyelens-api",
    version: readPackageVersion(),
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    process: {
      node: process.version,
      pid: process.pid,
      platform: process.platform,
      memoryMb: {
        heapUsed: mb(mem.heapUsed),
        heapTotal: mb(mem.heapTotal),
        rss: mb(mem.rss),
        external: mb(mem.external),
      },
    },
    mongodb: {
      ok: mongoOk,
      state,
      stateLabel,
      host: mongoOk ? mongoose.connection.host : null,
      database: mongoOk ? mongoose.connection.db?.databaseName ?? null : null,
    },
    integrations,
    uploads: {
      ok: dirWritable(uploadsDir),
      writable: dirWritable(uploadsDir),
      subdirs: uploadsSubdirs,
    },
  };

  const httpStatus = mongoOk ? 200 : 503;
  return { body, httpStatus };
}
