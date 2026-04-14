# Testing Guide

## Manual Test Checklist

### Auth Flow

- [ ] Register new user → welcome email received (if SMTP configured)
- [ ] Login with wrong password → error shown
- [ ] Forgot password → email with reset link (if SMTP configured)
- [ ] Reset password → login with new password
- [ ] Banned user login → suspended message shown

### Shopping Flow

- [ ] Browse products on homepage
- [ ] Filter by category on PLP
- [ ] Search products in navbar
- [ ] Open product detail page
- [ ] Add to cart
- [ ] Apply coupon SAVE10 → discount applied (min order ₹500)
- [ ] Checkout with COD → order placed
- [ ] Checkout with Pay online → Razorpay opens (if keys configured)
- [ ] Order confirmation email received (if SMTP configured)
- [ ] View order in account → orders tab
- [ ] Track order status
- [ ] Download invoice PDF

### Admin Flow

- [ ] Login as admin
- [ ] Dashboard KPIs show real numbers
- [ ] Dashboard refreshes every 30s; “Last updated” advances
- [ ] Add product → appears on storefront (may take up to cache TTL for list)
- [ ] Edit product price → updated on storefront
- [ ] Delete product → gone from storefront (with confirm)
- [ ] Update order to Shipped → user sees update
- [ ] Update order to Delivered → user can request return (within 7 days)
- [ ] Ban user → user cannot login
- [ ] Create coupon → user can apply at checkout
- [ ] Returns tab lists requests; approve / reject works (reject confirm)

### Payments & Returns

- [ ] Without `RAZORPAY_KEY_ID`, storefront hides “Pay online”
- [ ] With Razorpay keys, payment verifies and order shows PAID
- [ ] Admin orders table shows payment status badges
- [ ] User return request appears in admin Returns

### Order detail & validation (server + storefront)

- [ ] Place order with configured frame (lens + prescription + color/size) → admin order detail shows lens, Rx summary, and frame options
- [ ] Order confirmation email lists lens / Rx hints per line (if SMTP configured)
- [ ] Invalid shipping address from API client (bad phone or pincode) → `400` with clear message
- [ ] Cart: add same frame configuration twice → after login or page reload with session, duplicate lines merge into one line with summed qty (where configuration matches)

### Rate limits & abuse

- [ ] Rapid `POST /api/coupons/apply` → eventually `429` / “Too many coupon attempts”
- [ ] Rapid `POST /api/newsletter/subscribe` → eventually throttled

### SEO (storefront)

- [ ] Navigate Home → PLP → PDP → browser tab title and meta description update; leaving page restores defaults

### Automated

- [ ] `npm test` in this directory passes
