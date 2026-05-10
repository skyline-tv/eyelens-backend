import PDFDocument from "pdfkit";
import Order from "../models/Order.js";

const BRAND = {
  dark: "#0d1c13",
  green: "#16a34a",
  slate700: "#334155",
  slate500: "#64748b",
  slate400: "#94a3b8",
  border: "#e2e8f0",
  zebra: "#f8fafc",
  headerBand: "#0d1c13",
};

function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPaymentMethod(pm) {
  const x = String(pm || "").toLowerCase();
  if (x === "cod") return "Cash on Delivery";
  if (x === "razorpay") return "Razorpay";
  if (x === "upi") return "UPI";
  if (x === "card") return "Card";
  return pm || "—";
}

function formatPaymentStatus(ps) {
  const x = String(ps || "").toLowerCase();
  if (x === "paid") return "Paid";
  if (x === "pending") return "Pending";
  if (x === "failed") return "Failed";
  if (x === "refunded") return "Refunded";
  return ps || "—";
}

function safe(s, max = 200) {
  const t = String(s ?? "").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function ensureY(doc, y, minSpaceBelow) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + minSpaceBelow > bottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

/** Stream invoice PDF for an order (user owns it or admin). */
export async function streamOrderInvoice(req, res, next) {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email").lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const isOwner = String(order.user?._id || order.user) === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const filename = `eyelens-invoice-lens-receipt-${String(order._id).slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    const invoiceNo = `INV-${String(order._id).slice(-8).toUpperCase()}`;
    const rxNo = `RX-${String(order._id).slice(-8).toUpperCase()}`;

    const addr = order.shippingAddress || {};
    const billToLines = [
      addr.fullName || `${addr.firstName || ""} ${addr.lastName || ""}`.trim(),
      addr.phone || "",
      addr.address || addr.line1 || "",
      [addr.city, addr.state, addr.pincode].filter(Boolean).join(", "),
    ].filter(Boolean);

    const buyer = order.user;
    const buyerName = safe(buyer?.name || billToLines[0] || "Customer", 120);
    const buyerEmail = safe(buyer?.email || "", 80);

    // —— Header band —— //
    doc.save();
    doc.rect(left, 40, pageWidth, 56).fill(BRAND.headerBand);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text("Eyelens", left + 16, 54);
    doc.font("Helvetica").fontSize(9).fillColor("rgba(255,255,255,0.75)").text("Premium eyewear · India", left + 16, 78);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text("TAX INVOICE", right - 140, 52, { width: 124, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("rgba(255,255,255,0.85)").text("& LENS / RX RECEIPT", right - 140, 68, { width: 124, align: "right" });
    doc.restore();

    let y = 112;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(BRAND.border).lineWidth(0.5).stroke();
    y += 14;

    // —— Meta grid —— //
    const colW = pageWidth / 2 - 8;
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("INVOICE NO.", left, y);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(11).text(invoiceNo, left, y + 11);
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("RX REFERENCE", left + colW + 16, y);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(11).text(rxNo, left + colW + 16, y + 11);

    y += 38;
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("DATE", left, y);
    doc
      .fillColor(BRAND.dark)
      .font("Helvetica")
      .fontSize(10)
      .text(order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "—", left, y + 11);
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("ORDER ID", left + colW + 16, y);
    doc.fillColor("#475569").font("Helvetica").fontSize(8).text(String(order._id), left + colW + 16, y + 11, { width: colW });

    y += 40;
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("PAYMENT", left, y);
    doc.fillColor(BRAND.dark).font("Helvetica").fontSize(10).text(formatPaymentMethod(order.paymentMethod), left, y + 11);
    doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("PAYMENT STATUS", left + colW + 16, y);
    doc.fillColor(BRAND.dark).font("Helvetica").fontSize(10).text(formatPaymentStatus(order.paymentStatus), left + colW + 16, y + 11);
    if (order.paymentId) {
      y += 32;
      doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(8).text("PAYMENT REF", left, y);
      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(9).text(safe(order.paymentId, 64), left, y + 11);
    }

    y += 42;

    // —— Ship / Bill to card —— //
    doc.roundedRect(left, y, pageWidth, 78, 8).fillAndStroke("#f0fdf4", BRAND.border);
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(9).text("Deliver to · Bill to", left + 14, y + 10);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(10).text(buyerName, left + 14, y + 26, { width: pageWidth - 28 });
    const addrText = billToLines.length ? billToLines.join("\n") : "—";
    doc.fillColor(BRAND.slate700).font("Helvetica").fontSize(9).text(addrText, left + 14, y + 42, { width: pageWidth - 28, lineGap: 2 });
    if (buyerEmail && buyerEmail !== "—") {
      doc.fillColor(BRAND.slate500).font("Helvetica").fontSize(8).text(buyerEmail, left + 14, y + 64);
    }
    y += 92;

    // —— Line items —— //
    y = ensureY(doc, y, 160);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(12).text("Order lines", left, y);
    doc.fillColor(BRAND.slate500).font("Helvetica").fontSize(8).text("Frames, lens package, qty and amounts", left, y + 14);
    y += 34;

    const rowHHead = 22;
    const baseRowH = 30;
    const tableStartY = y;
    doc.rect(left, y, pageWidth, rowHHead).fill(BRAND.border);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(8);
    const c0 = left + 8;
    const c1 = left + 28;
    const c2 = left + 230;
    const c3 = left + 380;
    const c4 = left + 414;
    const c5 = right - 72;
    doc.text("#", c0, y + 7, { width: 16 });
    doc.text("Item", c1, y + 7, { width: 196 });
    doc.text("Lens package", c2, y + 7, { width: 138 });
    doc.text("Qty", c3, y + 7, { width: 26, align: "center" });
    doc.text("Unit", c4, y + 7, { width: 56, align: "right" });
    doc.text("Amount", c5, y + 7, { width: 70, align: "right" });
    y += rowHHead;

    const items = order.items || [];
    items.forEach((line, i) => {
      y = ensureY(doc, y, baseRowH + 8);
      const rowTop = y;
      if (i % 2 === 0) doc.rect(left, rowTop, pageWidth, baseRowH).fill(BRAND.zebra);

      const title = `${line.brand ? `${line.brand} ` : ""}${line.name || "Item"}`.trim();
      const frameBits = [line.frameOptions?.color, line.frameOptions?.size].filter(Boolean).join(" · ");
      const lensType = line.lens?.name
        ? String(line.lens.name)
        : line.lens?.id
          ? String(line.lens.id).replace(/_/g, " ")
          : "—";
      const lensAddon =
        line.lens && Number(line.lens.price) > 0 ? ` (+${money(line.lens.price)})` : "";

      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(9).text(String(i + 1), c0, rowTop + 8, { width: 16 });
      doc.text(safe(title, 90), c1, rowTop + 6, { width: 196 });
      if (frameBits) {
        doc.fillColor(BRAND.slate500).font("Helvetica").fontSize(7.5).text(`Frame: ${safe(frameBits, 80)}`, c1, rowTop + 18, { width: 196 });
      }
      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(8.5).text(safe(lensType, 48) + lensAddon, c2, rowTop + 8, { width: 138 });
      doc.text(String(line.qty || 1), c3, rowTop + 8, { width: 26, align: "center" });
      doc.text(money(line.price), c4, rowTop + 8, { width: 56, align: "right" });
      const amount = Number(line.price || 0) * Number(line.qty || 1);
      doc.font("Helvetica-Bold").text(money(amount), c5, rowTop + 8, { width: 70, align: "right" });

      y += baseRowH;
    });

    const tableBodyH = rowHHead + items.length * baseRowH;
    doc.rect(left, tableStartY, pageWidth, tableBodyH).strokeColor(BRAND.border).lineWidth(0.5).stroke();

    y += 8;

    // —— Totals —— //
    y = ensureY(doc, y, 120);
    const summaryW = Math.min(280, pageWidth * 0.55);
    const sx = right - summaryW;

    const summaryRows = [
      ["Items subtotal", money(order.itemsSubtotal ?? order.totalAmount)],
      ...(Number(order.shippingAmount || 0) > 0 ? [["Shipping", money(order.shippingAmount)]] : []),
      ...(Number(order.gstAmount || 0) > 0 ? [["GST / tax", money(order.gstAmount)]] : []),
      ...(Number(order.discountAmount || 0) > 0 ? [["Discount", `− ${money(order.discountAmount)}`]] : []),
    ];
    const summaryPanelH = 28 + summaryRows.length * 16 + 36;
    const sumTop = y;
    doc.save();
    doc.rect(sx - 12, sumTop, summaryW + 12, 3).fill(BRAND.green);
    doc.roundedRect(sx - 12, sumTop + 3, summaryW + 12, summaryPanelH, 6).fill("#fafafa");
    doc.roundedRect(sx - 12, sumTop + 3, summaryW + 12, summaryPanelH, 6).strokeColor(BRAND.border).stroke();
    doc.restore();

    let ty = y + 22;
    summaryRows.forEach(([label, value]) => {
      doc.fillColor(BRAND.slate700).font("Helvetica").fontSize(10).text(label, sx, ty, { width: 140 });
      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(10).text(value, sx + 130, ty, { width: summaryW - 140, align: "right" });
      ty += 16;
    });
    doc.moveTo(sx, ty + 6).lineTo(right, ty + 6).strokeColor(BRAND.border).stroke();
    ty += 16;
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(12).text("Total", sx, ty, { width: 140 });
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(12).text(money(order.totalAmount), sx + 130, ty, { width: summaryW - 140, align: "right" });
    y = sumTop + 3 + summaryPanelH + 16;

    // —— Lens & prescription receipt (lab / customer copy) —— //
    y = ensureY(doc, y, 100);
    doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(12).text("Lens specification & prescription", left, y);
    doc.fillColor(BRAND.slate500).font("Helvetica").fontSize(8).text("Fulfillment reference — confirm lens type and powers before edging.", left, y + 14);
    y += 36;

    items.forEach((line, i) => {
      const boxPad = 12;
      const rx = line.prescription;
      const hasRx =
        rx &&
        rx.mode === "saved" &&
        (rx.patientName ||
          rx.odSphere ||
          rx.osSphere ||
          rx.odCylinder ||
          rx.osCylinder ||
          rx.add ||
          rx.pd);

      const estH = hasRx ? 168 : 88;
      y = ensureY(doc, y, estH + 24);

      doc.roundedRect(left, y, pageWidth, estH, 8).fillAndStroke("#ffffff", BRAND.border);
      doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(9).text(`Line ${i + 1}`, left + boxPad, y + boxPad);
      const lineTitle = `${line.brand ? `${line.brand} ` : ""}${line.name || "Frame"}`.trim();
      doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(10).text(safe(lineTitle, 100), left + boxPad + 52, y + boxPad, { width: pageWidth - boxPad * 2 - 52 });

      let innerY = y + boxPad + 22;
      const lensLabel = line.lens?.name
        ? safe(line.lens.name, 120)
        : line.lens?.id
          ? safe(String(line.lens.id).replace(/_/g, " "), 120)
          : "Not specified";
      doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(7).text("LENS PACKAGE", left + boxPad, innerY);
      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(9).text(lensLabel, left + boxPad, innerY + 10, { width: pageWidth - boxPad * 2 });
      innerY += 30;

      const fc = [line.frameOptions?.color, line.frameOptions?.size].filter(Boolean).join(" · ") || "—";
      doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(7).text("FRAME", left + boxPad, innerY);
      doc.fillColor(BRAND.dark).font("Helvetica").fontSize(9).text(fc, left + boxPad, innerY + 10, { width: pageWidth - boxPad * 2 });
      innerY += 30;

      if (!hasRx) {
        doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(7).text("PRESCRIPTION", left + boxPad, innerY);
        const rxCopy =
          rx?.mode === "none" || !rx
            ? "Not supplied on this order (non‑prescription lenses or Rx to follow as per checkout)."
            : rx?.mode === "saved"
              ? "Prescription flagged as saved — powers not embedded in this printable. Check your Eyelens account or order notes."
              : "See order details.";
        doc.fillColor(BRAND.slate700).font("Helvetica").fontSize(9).text(rxCopy, left + boxPad, innerY + 10, { width: pageWidth - boxPad * 2 });
      } else {
        doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(7).text("PRESCRIPTION", left + boxPad, innerY);
        innerY += 12;
        const meta1 = `Patient: ${safe(rx.patientName || "—", 80)}    Date: ${safe(rx.date || "—", 24)}`;
        doc.fillColor(BRAND.dark).font("Helvetica").fontSize(9).text(meta1, left + boxPad, innerY, { width: pageWidth - boxPad * 2 });
        innerY += 18;

        // Mini table header
        const tLeft = left + boxPad;
        const tW = pageWidth - boxPad * 2;
        const colA = tLeft;
        const colB = tLeft + 42;
        const colC = tLeft + 118;
        const colD = tLeft + 178;
        const hdrH = 16;
        const rowRx = 18;
        const rxTableTop = innerY;
        doc.rect(tLeft, innerY, tW, hdrH).fill(BRAND.border);
        doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(7.5);
        doc.text("Eye", colA + 4, innerY + 4, { width: 34 });
        doc.text("Sphere (SPH)", colB, innerY + 4, { width: 56 });
        doc.text("Cylinder (CYL)", colC, innerY + 4, { width: 56 });
        doc.text("Axis", colD, innerY + 4, { width: 40 });
        innerY += hdrH;

        doc.fillColor(BRAND.zebra).rect(tLeft, innerY, tW, rowRx).fill(BRAND.zebra);
        doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(8).text("OD (Right)", colA + 4, innerY + 5, { width: 74 });
        doc.font("Helvetica").fontSize(9).text(safe(rx.odSphere, 16), colB, innerY + 5, { width: 56 });
        doc.text(safe(rx.odCylinder, 16), colC, innerY + 5, { width: 56 });
        doc.text(safe(rx.odAxis, 16), colD, innerY + 5, { width: 40 });
        innerY += rowRx;
        doc.fillColor("#ffffff").rect(tLeft, innerY, tW, rowRx).fill("#ffffff");
        doc.fillColor(BRAND.dark).font("Helvetica-Bold").fontSize(8).text("OS (Left)", colA + 4, innerY + 5, { width: 74 });
        doc.font("Helvetica").fontSize(9).text(safe(rx.osSphere, 16), colB, innerY + 5, { width: 56 });
        doc.text(safe(rx.osCylinder, 16), colC, innerY + 5, { width: 56 });
        doc.text(safe(rx.osAxis, 16), colD, innerY + 5, { width: 40 });
        innerY += rowRx;

        doc.rect(tLeft, rxTableTop, tW, hdrH + rowRx * 2).strokeColor(BRAND.border).lineWidth(0.5).stroke();

        innerY += 10;
        const extras = [`ADD: ${safe(rx.add, 16)}`, `PD: ${safe(rx.pd, 16)}`].join("    ");
        doc.fillColor(BRAND.dark).font("Helvetica").fontSize(8).text(extras, left + boxPad, innerY);
        innerY += 14;
        if (rx.notes && String(rx.notes).trim()) {
          doc.fillColor(BRAND.slate500).font("Helvetica-Bold").fontSize(7).text("NOTES", left + boxPad, innerY);
          doc.fillColor(BRAND.slate700).font("Helvetica").fontSize(8).text(safe(rx.notes, 400), left + boxPad, innerY + 10, { width: pageWidth - boxPad * 2 });
        }
      }

      y += estH + 14;
    });

    // —— Footer —— //
    y = ensureY(doc, y, 72);
    const footTop = y + 8;
    doc.moveTo(left, footTop).lineTo(right, footTop).strokeColor(BRAND.border).stroke();
    doc.fillColor(BRAND.slate700).font("Helvetica-Bold").fontSize(9).text("Thank you for choosing Eyelens", left, footTop + 12);
    doc.fillColor(BRAND.slate500).font("Helvetica").fontSize(8).text("This document serves as your bill and internal lens RX reference.", left, footTop + 26, {
      width: pageWidth - 8,
      lineGap: 2,
    });
    doc.text("Questions? support@eyelens.com · +91 98765 43210", left, footTop + 48, { width: pageWidth });

    doc.end();
  } catch (err) {
    next(err);
  }
}
