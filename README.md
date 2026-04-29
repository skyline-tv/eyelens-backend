# Eyelens API

Express + MongoDB backend for the Eyelens storefront and admin apps (separate repositories).

## Quick start

1. `cp .env.example .env` and fill required variables (see below).
2. `npm install`
3. Optional local MongoDB: `docker compose up -d` (see `docker-compose.yml`).
4. `npm run seed` (optional demo data).
5. `npm run dev` — API at `http://localhost:5001`.

## Required environment

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string (min 16 chars; use 32+ in production) |
| `REFRESH_TOKEN_SECRET` | Another long random string |
| `CLIENT_URLS` | Comma-separated browser origins (store + admin), e.g. `http://localhost:3000,http://localhost:3001` |
| `PRODUCT_UPLOAD_MAX_MB` | Max product image upload size in MB (optional, default `10`) |

See `.env.example` for optional keys (Razorpay, SMTP, Cloudinary).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon |
| `npm start` | Production |
| `npm test` | Unit tests |
| `npm run seed` | Seed admin, products, test user, coupon |
| `npm run export:data` | Export products/users JSON to `seed-data/` |

## Production

- **Docker:** `docker compose -f docker-compose.prod.yml up -d --build` (from this directory). Set `MONGO_URI=mongodb://mongo:27017/eyelens` in `.env` when using the bundled Mongo service.
- **nginx:** See `deploy/nginx.example.conf` for reverse-proxying `/api/` and TLS.
- **Upload limits:** Ensure nginx `client_max_body_size` is >= `PRODUCT_UPLOAD_MAX_MB`.
- **CORS:** Client `Origin` must match an entry in `CLIENT_URLS` in production.
- **HSTS:** Enabled in production via Helmet.

## Docs

- Manual QA: [TESTING_GUIDE.md](./TESTING_GUIDE.md)

## Email notifications

When SMTP is configured, Eyelens sends transactional emails for:
- Welcome email on signup
- Password reset email
- Order confirmation
- Order status updates (confirmed/shipped/delivered/cancelled)
- Payment status updates (paid/failed for Razorpay)
- Return request/admin update emails
- Newsletter subscription confirmation

Required SMTP env vars:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Optional:
- `SMTP_FROM` (defaults to `SMTP_USER`)
- `ADMIN_EMAIL` for admin-facing notifications (defaults to `SMTP_USER`)

### Using Resend

This backend already works with Resend via SMTP (no code changes needed). Set:
- `SMTP_HOST=smtp.resend.com`
- `SMTP_PORT=465` (or `587`)
- `SMTP_USER=resend`
- `SMTP_PASS=<your_resend_smtp_api_key>`
- `SMTP_FROM=<verified_sender@yourdomain.com>`

Notes:
- Verify your sending domain/sender in Resend first.
- Keep `SMTP_FROM` on your verified domain for best deliverability.
