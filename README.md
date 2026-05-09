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

See `.env.example` for optional keys (Razorpay, Resend, Cloudinary).

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

When Resend is configured, Eyelens sends transactional emails for:
- Welcome email on signup
- Password reset email
- Order confirmation
- Order status updates (confirmed/shipped/delivered/cancelled)
- Payment status updates (paid/failed for Razorpay)
- Return request/admin update emails
- Newsletter subscription confirmation

Required Resend env vars:
- `RESEND_API_KEY`
- `RESEND_FROM` (must be a verified sender/domain in Resend)

Optional:
- `ADMIN_EMAIL` for admin-facing notifications (defaults to `RESEND_FROM`)

Notes:
- Verify your sending domain/sender in Resend first.
- Keep `RESEND_FROM` on your verified domain for best deliverability.
