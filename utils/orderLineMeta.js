/** Lens add-ons allowed by storefront PDP (rupees). */
export const ALLOWED_LENS_ADDONS = new Set([0, 499, 999, 1599]);

/** PDP lens option ids → price (must match storefront lensOptions). */
export const LENS_ID_TO_PRICE = {
  "screenguard-single": 0,
  "ultrachrome-single": 499,
  "screenguard-progressive": 999,
  "ultrachrome-progressive": 1599,
};

function trimStr(s, max) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Resolve lens add-on rupees from request line (trusts lens id+price pair or numeric lensPrice).
 */
export function resolveLensAddon(line) {
  const lid = String(line?.lens?.id || "").trim();
  const lp = Number(line?.lens?.price);
  if (lid && LENS_ID_TO_PRICE[lid] !== undefined && lp === LENS_ID_TO_PRICE[lid]) {
    return LENS_ID_TO_PRICE[lid];
  }
  if (ALLOWED_LENS_ADDONS.has(lp)) return lp;
  const fromPrice = Number(line?.lensPrice);
  return ALLOWED_LENS_ADDONS.has(fromPrice) ? fromPrice : 0;
}

/** Persist lens row for fulfillment; omit if no lens metadata and zero add-on. */
export function buildLensSnapshot(line, resolvedPrice) {
  const id = trimStr(line?.lens?.id, 64);
  const name = trimStr(line?.lens?.name, 220);
  const price = Math.round(Math.max(0, Number(resolvedPrice) || 0) * 100) / 100;
  if (!id && !name && price === 0) return undefined;
  return { id, name: name || (id ? id.replace(/_/g, " ") : "Lenses"), price };
}

/** Prescription snapshot for lab / support (bounded fields). */
export function buildPrescriptionSnapshot(rx) {
  if (!rx || typeof rx !== "object") return undefined;
  const mode = trimStr(rx.mode, 20) || "none";
  const out = {
    mode: ["none", "saved"].includes(mode) ? mode : "none",
    patientName: trimStr(rx.patientName, 120),
    date: trimStr(rx.date, 40),
    odSphere: trimStr(rx.odSphere, 24),
    odCylinder: trimStr(rx.odCylinder, 24),
    odAxis: trimStr(rx.odAxis, 24),
    osSphere: trimStr(rx.osSphere, 24),
    osCylinder: trimStr(rx.osCylinder, 24),
    osAxis: trimStr(rx.osAxis, 24),
    add: trimStr(rx.add, 40),
    pd: trimStr(rx.pd, 40),
    notes: trimStr(rx.notes, 500),
  };
  if (out.mode === "none" && !out.patientName && !out.odSphere && !out.osSphere) {
    return { mode: "none" };
  }
  return out;
}

export function buildFrameOptionsSnapshot(fo) {
  if (!fo || typeof fo !== "object") return undefined;
  const color = trimStr(fo.color, 80);
  const size = trimStr(fo.size, 40);
  if (!color && !size) return undefined;
  return { color, size };
}
