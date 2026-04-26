import PDFDocument from "pdfkit";
import Order from "../models/Order.js";

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

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const filename = `eyelens-invoice-${String(order._id).slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    const invoiceNo = `INV-${String(order._id).slice(-8).toUpperCase()}`;
    const addr = order.shippingAddress || {};
    const billToLines = [
      addr.fullName || `${addr.firstName || ""} ${addr.lastName || ""}`.trim(),
      addr.phone || "",
      addr.address || "",
      [addr.city, addr.state, addr.pincode].filter(Boolean).join(", "),
    ].filter(Boolean);

    // Header
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(26).text("Eyelens", left, 44);
    doc.fillColor("#334155").font("Helvetica").fontSize(11).text("Premium Eyewear", left, 74);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("TAX INVOICE", right - 120, 48, { width: 120, align: "right" });
    doc.moveTo(left, 94).lineTo(right, 94).strokeColor("#d1d5db").lineWidth(1).stroke();

    // Invoice info block (2 columns)
    const blockTop = 108;
    const colW = pageWidth / 2;
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(9).text("Invoice Number", left, blockTop);
    doc.fillColor("#111827").font("Helvetica").fontSize(11).text(invoiceNo, left, blockTop + 12);
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(9).text("Invoice Date", left, blockTop + 32);
    doc.fillColor("#111827").font("Helvetica").fontSize(11).text(order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "—", left, blockTop + 44);

    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(9).text("Order ID", left + colW, blockTop);
    doc.fillColor("#111827").font("Helvetica").fontSize(11).text(String(order._id), left + colW, blockTop + 12, { width: colW, align: "left" });
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(9).text("Payment Method", left + colW, blockTop + 32);
    doc.fillColor("#111827").font("Helvetica").fontSize(11).text(formatPaymentMethod(order.paymentMethod), left + colW, blockTop + 44);

    // Bill To
    const billTop = 182;
    doc.roundedRect(left, billTop, pageWidth, 74).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fillColor("#334155").font("Helvetica-Bold").fontSize(10).text("Bill To", left + 12, billTop + 10);
    doc.fillColor("#0f172a").font("Helvetica").fontSize(10).text(billToLines.join("\n"), left + 12, billTop + 24, {
      width: pageWidth - 24,
      lineGap: 2,
    });

    // Items table
    const tableTop = 274;
    const colX = {
      idx: left,
      name: left + 34,
      lens: left + 236,
      qty: left + 356,
      unit: left + 402,
      amount: left + 492,
    };
    const colWidths = { idx: 34, name: 202, lens: 120, qty: 46, unit: 90, amount: 70 };
    const rowH = 24;

    doc.rect(left, tableTop, pageWidth, rowH).fill("#e2e8f0");
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
    doc.text("#", colX.idx + 10, tableTop + 8, { width: colWidths.idx - 12, align: "left" });
    doc.text("Product Name", colX.name + 4, tableTop + 8, { width: colWidths.name - 8 });
    doc.text("Lens Type", colX.lens + 4, tableTop + 8, { width: colWidths.lens - 8 });
    doc.text("Qty", colX.qty + 2, tableTop + 8, { width: colWidths.qty - 4, align: "center" });
    doc.text("Unit Price", colX.unit + 2, tableTop + 8, { width: colWidths.unit - 4, align: "right" });
    doc.text("Amount", colX.amount + 2, tableTop + 8, { width: colWidths.amount - 4, align: "right" });

    (order.items || []).forEach((line, i) => {
      const y = tableTop + rowH + i * rowH;
      if (i % 2 === 0) {
        doc.rect(left, y, pageWidth, rowH).fill("#f8fafc");
      }
      const lensType = line.lens?.name
        ? String(line.lens.name).slice(0, 42)
        : line.lens?.id
          ? String(line.lens.id).replace(/_/g, " ").slice(0, 42)
          : "—";
      const amount = Number(line.price || 0) * Number(line.qty || 1);
      doc.fillColor("#1f2937").font("Helvetica").fontSize(9);
      doc.text(String(i + 1), colX.idx + 10, y + 8, { width: colWidths.idx - 12 });
      doc.text(`${line.brand ? `${line.brand} ` : ""}${line.name || ""}`, colX.name + 4, y + 8, { width: colWidths.name - 8, ellipsis: true });
      doc.text(lensType, colX.lens + 4, y + 8, { width: colWidths.lens - 8, ellipsis: true });
      doc.text(String(line.qty || 1), colX.qty + 2, y + 8, { width: colWidths.qty - 4, align: "center" });
      doc.text(money(line.price), colX.unit + 2, y + 8, { width: colWidths.unit - 4, align: "right" });
      doc.text(money(amount), colX.amount + 2, y + 8, { width: colWidths.amount - 4, align: "right" });
    });

    const bodyEndY = tableTop + rowH + (order.items || []).length * rowH;
    doc.rect(left, tableTop, pageWidth, bodyEndY - tableTop).strokeColor("#e2e8f0").lineWidth(1).stroke();

    // Summary (right aligned)
    const summaryTop = bodyEndY + 18;
    const summaryW = 250;
    const sx = right - summaryW;
    const summaryRows = [
      ["Items subtotal", money(order.itemsSubtotal ?? order.totalAmount)],
      ...(Number(order.discountAmount || 0) > 0 ? [["Discount", `- ${money(order.discountAmount)}`]] : []),
    ];
    let sy = summaryTop;
    summaryRows.forEach(([label, value]) => {
      doc.fillColor("#475569").font("Helvetica").fontSize(10).text(label, sx, sy, { width: 120, align: "left" });
      doc.fillColor("#111827").font("Helvetica").fontSize(10).text(value, sx + 120, sy, { width: 130, align: "right" });
      sy += 18;
    });
    doc.moveTo(sx, sy + 2).lineTo(right, sy + 2).strokeColor("#cbd5e1").stroke();
    sy += 10;
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13).text("Total Paid", sx, sy, { width: 120, align: "left" });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13).text(money(order.totalAmount), sx + 120, sy, { width: 130, align: "right" });

    // Footer
    const footerY = doc.page.height - 74;
    doc.moveTo(left, footerY - 10).lineTo(right, footerY - 10).strokeColor("#e2e8f0").stroke();
    doc.fillColor("#334155").font("Helvetica-Bold").fontSize(10).text("Thank you for shopping with Eyelens", left, footerY);
    doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("Support: support@eyelens.com | +91 98765 43210", left, footerY + 14);

    doc.end();
  } catch (err) {
    next(err);
  }
}
