import { Resend } from "resend";

/** Public storefront URL for links in emails */
export function getStorefrontUrl() {
  const raw =
    process.env.STOREFRONT_URL ||
    (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim();
  return raw.replace(/\/$/, "");
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/** Lazy Resend client — returns null if env not set */
let resendClient = null;
function getResendClient() {
  if (!isResendConfigured()) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const brandGreen = "#16a34a";
const brandDark = "#0d1c13";

/** Shared responsive HTML shell — Eyelens green branding */
function layout({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.06);">
          <tr>
            <td style="background:linear-gradient(135deg,${brandDark} 0%,#1a3a25 100%);padding:24px 28px;">
              <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.02em;">eye<span style="color:${brandGreen};">lens</span></div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">Premium eyewear</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 32px;color:#1a1a1a;font-size:15px;line-height:1.55;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px;font-size:12px;color:#64748b;">
              © ${new Date().getFullYear()} Eyelens. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMailSafe({ to, subject, html, text }) {
  const client = getResendClient();
  if (!client) return;
  const from = process.env.RESEND_FROM;
  try {
    await client.emails.send({
      from,
      to,
      subject,
      html,
      text: text || subject,
    });
  } catch (err) {
    console.error("[emailService] send failed:", err?.message || err);
  }
}

/**
 * Password reset link (called from auth flow).
 */
export async function sendPasswordResetEmail(email, resetUrl) {
  const html = layout({
    title: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">Reset your password</p>
      <p style="margin:0 0 20px;">We received a request to reset your Eyelens password. Click the button below (valid for 1 hour).</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${resetUrl}" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Reset password</a>
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;">If you didn’t request this, you can ignore this email.</p>
    `,
  });
  await sendMailSafe({
    to: email,
    subject: "Reset your Eyelens password",
    html,
    text: `Reset your password: ${resetUrl}`,
  });
}

export async function sendWelcomeEmail(user) {
  const base = getStorefrontUrl();
  const name = user?.name || "there";
  const html = layout({
    title: "Welcome to Eyelens",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">Welcome, ${escapeHtml(name)}!</p>
      <p style="margin:0 0 20px;">Thanks for creating an account. Discover frames you’ll love — honest pricing and fast delivery.</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${base}/" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Start shopping</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: "Welcome to Eyelens",
    html,
    text: `Welcome to Eyelens! Shop now: ${base}/`,
  });
}

export async function sendLoginAlertEmail(user, meta = {}) {
  const base = getStorefrontUrl();
  const name = user?.name || "there";
  const when = meta.when ? new Date(meta.when) : new Date();
  const whenLabel = Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString();
  const ip = String(meta.ip || "Unknown");
  const userAgent = String(meta.userAgent || "Unknown device/browser");
  const html = layout({
    title: "New login alert",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">New login to your Eyelens account</p>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(name)}, we noticed a new login.</p>
      <p style="margin:0 0 6px;"><strong>Time (UTC)</strong> ${escapeHtml(whenLabel)}</p>
      <p style="margin:0 0 6px;"><strong>IP address</strong> ${escapeHtml(ip)}</p>
      <p style="margin:0 0 20px;"><strong>Device</strong> ${escapeHtml(userAgent)}</p>
      <p style="margin:0 0 20px;">If this was you, no action is needed. If not, reset your password immediately.</p>
      <p style="margin:0;text-align:center;">
        <a href="${base}/forgot-password" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Reset password</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: "New login alert for your Eyelens account",
    html,
    text: `New login detected. Time (UTC): ${whenLabel}. IP: ${ip}. Device: ${userAgent}. If this was not you, reset your password: ${base}/forgot-password`,
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orderLineMetaHtml(it) {
  const bits = [];
  if (it.lens?.name) bits.push(`Lenses: ${escapeHtml(it.lens.name)}`);
  if (it.frameOptions?.color || it.frameOptions?.size) {
    bits.push(
      `Frame: ${escapeHtml([it.frameOptions.color, it.frameOptions.size].filter(Boolean).join(" · "))}`
    );
  }
  if (it.prescription?.mode === "saved" && (it.prescription.patientName || it.prescription.odSphere || it.prescription.osSphere)) {
    bits.push(`Rx: ${escapeHtml(it.prescription.patientName || "Attached")}`);
  } else if (it.prescription?.mode === "none") {
    bits.push("Rx: Not supplied");
  }
  if (!bits.length) return "";
  return `<div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.4;">${bits.join(" · ")}</div>`;
}

export async function sendOrderConfirmation(user, order) {
  const items = (order.items || [])
    .map(
      (it) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.name || "")} × ${it.qty}${orderLineMetaHtml(
          it
        )}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;">₹${Number(
          (it.price || 0) * (it.qty || 1)
        ).toLocaleString("en-IN")}</td></tr>`
    )
    .join("");
  const addr = order.shippingAddress || {};
  const addrStr = [addr.address || addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
  const html = layout({
    title: "Order confirmed",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">Thank you for shopping with Eyelens!</p>
      <p style="margin:0 0 8px;"><strong>Order</strong> #${String(order._id).slice(-8)}</p>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px;">${new Date(order.createdAt).toLocaleString()}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">${items}</table>
      <p style="margin:0 0 8px;"><strong>Total</strong> ₹${Number(order.totalAmount || 0).toLocaleString("en-IN")}</p>
      <p style="margin:0 0 8px;"><strong>Payment</strong> ${escapeHtml(order.paymentMethod || "—")}</p>
      <p style="margin:0 0 20px;"><strong>Delivery address</strong><br/>${escapeHtml(addrStr || "—")}</p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: `Eyelens order confirmed #${String(order._id).slice(-8)}`,
    html,
  });
}

export async function sendPaymentStatusUserEmail(user, order, paymentStatus) {
  const base = getStorefrontUrl();
  const trackUrl = `${base}/order/${order._id}`;
  const orderShort = String(order._id).slice(-8);
  const isPaid = String(paymentStatus || "").toLowerCase() === "paid";
  const title = isPaid ? "Payment successful" : "Payment failed";
  const message = isPaid
    ? "Your online payment was received successfully."
    : "We could not complete your payment. You can retry payment from your account/orders.";
  const html = layout({
    title,
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">${title}</p>
      <p style="margin:0 0 10px;">Order <strong>#${orderShort}</strong></p>
      <p style="margin:0 0 10px;"><strong>Payment method</strong> ${escapeHtml(order.paymentMethod || "—")}</p>
      <p style="margin:0 0 20px;"><strong>Status</strong> <span style="color:${isPaid ? brandGreen : "#dc2626"};font-weight:700;">${escapeHtml(
        String(paymentStatus || "").toUpperCase()
      )}</span></p>
      <p style="margin:0 0 24px;">${escapeHtml(message)}</p>
      <p style="margin:0;text-align:center;">
        <a href="${trackUrl}" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">View order</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: `Eyelens payment ${isPaid ? "successful" : "failed"} — #${orderShort}`,
    html,
    text: `Order #${orderShort} payment is ${paymentStatus}. View order: ${trackUrl}`,
  });
}

const statusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export async function sendOrderStatusUpdate(user, order) {
  const base = getStorefrontUrl();
  const trackUrl = `${base}/order/${order._id}`;
  const label = statusLabels[order.status] || order.status;
  let extra = "";
  if (order.status === "shipped") {
    extra = "<p style=\"margin:16px 0 0;color:#64748b;font-size:14px;\">Your order is on the way. Estimated delivery depends on your location and courier.</p>";
  }
  const html = layout({
    title: "Order update",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">Order update</p>
      <p style="margin:0 0 8px;">Order <strong>#${String(order._id).slice(-8)}</strong></p>
      <p style="margin:0 0 20px;">New status: <strong style="color:${brandGreen};">${escapeHtml(label)}</strong></p>
      ${extra}
      <p style="margin:24px 0 0;text-align:center;">
        <a href="${trackUrl}" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Track order</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: `Eyelens order ${label} — #${String(order._id).slice(-8)}`,
    html,
    text: `Order #${String(order._id).slice(-8)} is now ${label}. Track: ${trackUrl}`,
  });
}

/** Notify admin inbox when a customer requests a return */
export async function sendReturnRequestAdminEmail(order, buyer, reason) {
  // Admin emails are temporarily disabled.
  void order;
  void buyer;
  void reason;
}

export async function sendReturnStatusUserEmail(user, order, returnStatus) {
  const base = getStorefrontUrl();
  const trackUrl = `${base}/account`;
  const label = returnStatus.charAt(0).toUpperCase() + returnStatus.slice(1);
  const html = layout({
    title: "Return update",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">Return request update</p>
      <p>Order <strong>#${String(order._id).slice(-8)}</strong></p>
      <p>Your return status is now: <strong style="color:${brandGreen};">${escapeHtml(label)}</strong></p>
      <p style="margin:24px 0 0;text-align:center;">
        <a href="${trackUrl}" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">View account</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: user.email,
    subject: `Eyelens return ${label} — #${String(order._id).slice(-8)}`,
    html,
  });
}

export async function sendNewsletterWelcomeEmail(email) {
  const base = getStorefrontUrl();
  const html = layout({
    title: "Subscribed to Eyelens",
    bodyHtml: `
      <p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${brandDark};">You are subscribed!</p>
      <p style="margin:0 0 20px;">Thanks for subscribing to Eyelens updates. We will share new arrivals, deals, and restock alerts.</p>
      <p style="margin:0;text-align:center;">
        <a href="${base}/plp" style="display:inline-block;background:${brandGreen};color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Browse frames</a>
      </p>
    `,
  });
  await sendMailSafe({
    to: email,
    subject: "You are subscribed to Eyelens",
    html,
    text: `Thanks for subscribing to Eyelens. Browse frames: ${base}/plp`,
  });
}
