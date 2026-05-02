/**
 * End-to-end API checks against a running server (default http://localhost:5000).
 * Run: node scripts/e2e-api-test.mjs
 */
import "dotenv/config";

const BASE = process.env.E2E_API_BASE || "http://localhost:5000/api";

const results = [];

function record(name, pass, reason = "") {
  results.push({ name, pass, reason });
}

function extractRefreshCookie(setCookieHeader) {
  if (!setCookieHeader) return "";
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const line of parts) {
    const m = /^refreshToken=([^;]+)/.exec(line);
    if (m) return `refreshToken=${m[1]}`;
  }
  return "";
}

function cookieValue(cookieStr) {
  const i = cookieStr.indexOf("=");
  if (i === -1) return "";
  return cookieStr.slice(i + 1);
}

async function req(method, path, { json, token, cookie, expectStatus } = {}) {
  const headers = { Accept: "application/json" };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { _raw: raw };
  }

  const setCookie = res.headers.getSetCookie?.() || [];
  const legacy = res.headers.get("set-cookie");
  const cookieHeader = setCookie.length ? setCookie : legacy ? [legacy] : [];

  if (expectStatus != null && res.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus} got ${res.status}: ${raw.slice(0, 200)}`);
  }
  return { res, body, setCookie: cookieHeader };
}

async function main() {
  const suffix = Date.now();
  const userEmail = `e2e_user_${suffix}@test.local`;
  const userPassword = "E2ETestPass123!";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@eyelens.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123";

  let userToken = "";
  let adminToken = "";
  let refreshCookie = "";
  let productId = "";
  let productIdForOrder = "";
  let orderId = "";
  let couponId = "";
  let bannerId = "";
  let secondUserId = "";

  try {
    // —— AUTH ——
    const reg = await req("POST", "/auth/register", {
      json: { name: "E2E User", email: userEmail, password: userPassword },
      expectStatus: 201,
    });
    userToken = reg.body?.data?.accessToken || "";
    refreshCookie = extractRefreshCookie(reg.setCookie);
    record("POST /api/auth/register → new user", Boolean(userToken && reg.res.status === 201));

    const login = await req("POST", "/auth/login", {
      json: { email: userEmail, password: userPassword },
    });
    record(
      "POST /api/auth/login → get JWT token",
      login.res.ok && login.body?.data?.accessToken,
      login.res.ok ? "" : JSON.stringify(login.body)
    );
    userToken = login.body?.data?.accessToken || userToken;
    refreshCookie = extractRefreshCookie(login.setCookie) || refreshCookie;

    const me = await req("GET", "/auth/me", { token: userToken });
    record("GET /api/auth/me → verify token works", me.res.ok && me.body?.data?.user?.email === userEmail);

    const rtBeforeLogout = cookieValue(refreshCookie);
    const out = await req("POST", "/auth/logout", { cookie: refreshCookie });
    const afterLogout = await req("POST", "/auth/refresh", { json: { refreshToken: rtBeforeLogout } });
    record(
      "POST /api/auth/logout → clears session",
      out.res.ok && afterLogout.res.status === 401,
      `logout ${out.res.status}, refresh after ${afterLogout.res.status}`
    );

    const relogin = await req("POST", "/auth/login", {
      json: { email: userEmail, password: userPassword },
    });
    userToken = relogin.body?.data?.accessToken || "";
    refreshCookie = extractRefreshCookie(relogin.setCookie) || refreshCookie;

    const refr = await req("POST", "/auth/refresh", {
      cookie: refreshCookie || undefined,
    });
    record(
      "POST /api/auth/refresh → refresh token works",
      refr.res.ok && refr.body?.data?.accessToken,
      refr.res.ok ? "" : JSON.stringify(refr.body)
    );
    if (refr.res.ok) {
      userToken = refr.body.data.accessToken;
      refreshCookie = extractRefreshCookie(refr.setCookie) || refreshCookie;
    }

    const adminLogin = await req("POST", "/auth/login", {
      json: { email: adminEmail, password: adminPassword },
    });
    adminToken = adminLogin.body?.data?.accessToken || "";
    record("Admin login (for protected routes)", Boolean(adminToken), adminLogin.res.ok ? "" : JSON.stringify(adminLogin.body));

    // —— PRODUCTS ——
    const list = await req("GET", "/products");
    record("GET /api/products → all products load", list.res.ok && Array.isArray(list.body?.data) && list.body.data.length > 0);
    productIdForOrder = list.body?.data?.[0]?._id || "";
    productId = productIdForOrder;

    const cat = await req("GET", "/products?category=sunglasses");
    const catOk =
      cat.res.ok &&
      Array.isArray(cat.body?.data) &&
      cat.body.data.every((p) => /sunglasses/i.test(p.category || ""));
    record("GET /api/products?category=sunglasses → filter works", catOk);

    const search = await req("GET", "/products?search=ray");
    const searchOk = search.res.ok && Array.isArray(search.body?.data);
    record("GET /api/products?search=ray → search works", searchOk && search.body.data.length > 0);

    const sort = await req("GET", "/products?sort=price_asc");
    const prices = (sort.body?.data || []).map((p) => p.price);
    const sorted = prices.every((v, i) => i === 0 || prices[i - 1] <= v);
    record("GET /api/products?sort=price_asc → sort works", sort.res.ok && sorted && prices.length > 1);

    const one = await req("GET", `/products/${productId}`);
    record("GET /api/products/:id → single product loads", one.res.ok && one.body?.data?._id === productId);

    const newProd = {
      name: `E2E Product ${suffix}`,
      brand: "E2E",
      price: 999,
      category: "Sunglasses",
      stock: 10,
      description: "e2e",
      frameType: "Round",
      material: "TR90",
      gender: "unisex",
      images: ["https://picsum.photos/seed/e2e/400/400"],
    };
    const created = await req("POST", "/products", { json: newProd, token: adminToken, expectStatus: 201 });
    const newId = created.body?.data?._id;
    record("POST /api/products → admin can add product", Boolean(newId));

    const updated = await req("PUT", `/products/${newId}`, {
      token: adminToken,
      json: { ...newProd, name: `E2E Product ${suffix} Updated`, stock: 9 },
    });
    record(
      "PUT /api/products/:id → admin can edit product",
      updated.res.ok && updated.body?.data?.name?.includes("Updated")
    );

    const del = await req("DELETE", `/products/${newId}`, { token: adminToken });
    const gone = await req("GET", `/products/${newId}`);
    record(
      "DELETE /api/products/:id → admin can delete product",
      del.res.ok && gone.res.status === 404
    );

    // —— COUPONS (before order, so we can apply on order if needed) ——
    const coupCreate = await req("POST", "/coupons", {
      token: adminToken,
      json: {
        code: `E2E${suffix}`,
        discountType: "percentage",
        discountValue: 10,
        minOrderValue: 0,
        maxUses: 100,
        isActive: true,
      },
      expectStatus: 201,
    });
    couponId = coupCreate.body?.data?._id;
    record("POST /api/coupons → admin creates coupon", Boolean(couponId));

    const apply = await req("POST", "/coupons/apply", {
      token: userToken,
      json: { code: `E2E${suffix}`, subtotal: 5000 },
    });
    record(
      "POST /api/coupons/apply → user applies coupon",
      apply.res.ok && apply.body?.data?.discountAmount > 0
    );

    const coupList = await req("GET", "/coupons", { token: adminToken });
    record(
      "GET /api/coupons → admin sees all coupons",
      coupList.res.ok && Array.isArray(coupList.body?.data)
    );

    // —— ORDERS ——
    const orderBody = {
      items: [{ productId: productIdForOrder, qty: 1 }],
      shippingAddress: { line1: "1 Test St", city: "Mumbai", state: "MH", pincode: "400001" },
      paymentMethod: "cod",
    };
    const ord = await req("POST", "/orders", { token: userToken, json: orderBody, expectStatus: 201 });
    orderId = ord.body?.data?._id;
    record("POST /api/orders → user can place order", Boolean(orderId));

    const my = await req("GET", "/orders/my", { token: userToken });
    const hasOrder = my.res.ok && (my.body?.data || []).some((o) => String(o._id) === String(orderId));
    record("GET /api/orders/my → user sees own orders", hasOrder);

    const all = await req("GET", "/orders", { token: adminToken });
    const adminSees = all.res.ok && (all.body?.data || []).some((o) => String(o._id) === String(orderId));
    record("GET /api/orders → admin sees all orders", adminSees);

    const stUp = await req("PUT", `/orders/${orderId}/status`, {
      token: adminToken,
      json: { status: "confirmed" },
    });
    record("PUT /api/orders/:id/status → admin updates status", stUp.res.ok);

    const my2 = await req("GET", "/orders/my", { token: userToken });
    const statusUpdated = (my2.body?.data || []).find((o) => String(o._id) === String(orderId));
    record(
      "User sees updated status in GET /api/orders/my",
      statusUpdated?.status === "confirmed"
    );

    // —— USERS ——
    const patch = await req("PATCH", "/users/me", {
      token: userToken,
      json: { name: "E2E User Patched" },
    });
    record(
      "PATCH /api/users/me → user can update profile",
      patch.res.ok && String(patch.body?.data?.name || "").includes("Patched")
    );

    const users = await req("GET", "/users", { token: adminToken });
    secondUserId = (users.body?.data || []).find((u) => u.email === userEmail)?._id;
    const rolePut = await req("PUT", `/users/${secondUserId}/role`, {
      token: adminToken,
      json: { role: "admin" },
    });
    const roleBack = await req("PUT", `/users/${secondUserId}/role`, {
      token: adminToken,
      json: { role: "user" },
    });
    record(
      "GET /api/users → admin sees all users",
      users.res.ok && Array.isArray(users.body?.data) && users.body.data.length > 0
    );
    record(
      "PUT /api/users/:id/role → admin can change role",
      rolePut.res.ok && roleBack.res.ok
    );

    // —— WISHLIST ——
    const wAdd = await req("POST", `/users/wishlist/${productIdForOrder}`, { token: userToken });
    record("POST /api/users/wishlist/:productId → add to wishlist", wAdd.res.ok);

    const wGet = await req("GET", "/users/wishlist", { token: userToken });
    const inList = (wGet.body?.data || []).some((p) => String(p._id || p) === String(productIdForOrder));
    record("GET /api/users/wishlist → get wishlist", wGet.res.ok && inList);

    const wDel = await req("DELETE", `/users/wishlist/${productIdForOrder}`, { token: userToken });
    const wGet2 = await req("GET", "/users/wishlist", { token: userToken });
    const outList = !(wGet2.body?.data || []).some((p) => String(p._id || p) === String(productIdForOrder));
    record("DELETE /api/users/wishlist/:productId → remove", wDel.res.ok && outList);

    // —— REVIEWS (after order contains product) ——
    const revPost = await req("POST", `/products/${productIdForOrder}/reviews`, {
      token: userToken,
      json: { rating: 5, comment: "Great frames" },
      expectStatus: 201,
    });
    record("POST /api/products/:id/reviews → user adds review", revPost.res.ok);

    const revGet = await req("GET", `/products/${productIdForOrder}/reviews`);
    const hasRev = (revGet.body?.data || []).some((r) => r.rating === 5);
    record("GET /api/products/:id/reviews → reviews load", revGet.res.ok && hasRev);

    // —— STATS ——
    const dash = await req("GET", "/stats/dashboard", { token: adminToken });
    const dashOk =
      dash.res.ok &&
      dash.body?.data &&
      typeof dash.body.data.todayRevenue === "number" &&
      Array.isArray(dash.body.data.topSellingProducts);
    record("GET /api/stats/dashboard → KPIs load correctly", dashOk);

    const funnelGet = await req("GET", "/stats/funnel?period=7d", { token: adminToken });
    const funnelOk =
      funnelGet.res.ok &&
      funnelGet.body?.data &&
      typeof funnelGet.body.data.uniqueCartVisitors === "number" &&
      typeof funnelGet.body.data.uniqueCheckoutVisitors === "number";
    record("GET /api/stats/funnel → checkout funnel metrics", funnelOk);

    const trackEv = await req("POST", "/stats/track-event", {
      json: { event: "cart_view", visitorId: "e2e-analytics-visitor-01" },
    });
    record("POST /api/stats/track-event → storefront beacon", trackEv.res.ok);

    // —— BANNERS ——
    const ban = await req("POST", "/banners", {
      token: adminToken,
      json: {
        title: "E2E Banner",
        subtitle: "Hello",
        imageUrl: "https://picsum.photos/seed/ban/1200/400",
        linkUrl: "/",
        isActive: true,
        order: 0,
      },
      expectStatus: 201,
    });
    bannerId = ban.body?.data?._id;
    record("POST /api/banners → admin adds banner", Boolean(bannerId));

    const pub = await req("GET", "/banners");
    const pubOk = pub.res.ok && Array.isArray(pub.body?.data);
    record("GET /api/banners → banners load on storefront", pubOk);

    // cleanup banner
    if (bannerId) await req("DELETE", `/banners/${bannerId}`, { token: adminToken });

    // —— INTEGRATION (explicit) ——
    const intProd = await req("POST", "/products", {
      token: adminToken,
      json: {
        name: `Integration ${suffix}`,
        brand: "Int",
        price: 1299,
        category: "Eyeglasses",
        stock: 5,
        description: "int",
        frameType: "Rectangle",
        material: "Acetate",
        gender: "unisex",
        images: [],
      },
      expectStatus: 201,
    });
    const intId = intProd.body?.data?._id;
    const intList = await req("GET", "/products");
    const appears = (intList.body?.data || []).some((p) => String(p._id) === String(intId));
    record("Integration: admin add product → appears on GET /api/products", Boolean(intId && appears));

    await req("DELETE", `/products/${intId}`, { token: adminToken });
    const intGone = await req("GET", `/products/${intId}`);
    record("Integration: admin delete product → gone", intGone.res.status === 404);

    record(
      "Integration: user order → admin GET /api/orders",
      adminSees,
      adminSees ? "" : "covered above"
    );
    record(
      "Integration: admin status → user my orders",
      statusUpdated?.status === "confirmed",
      ""
    );
  } catch (e) {
    record("FATAL", false, e?.message || String(e));
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(JSON.stringify({ passed, failed, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main();
