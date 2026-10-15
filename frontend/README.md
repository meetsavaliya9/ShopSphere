# ShopSphere Frontend

ShopSphere's storefront and dashboards use the Next.js App Router, JavaScript/JSX, and Tailwind CSS. Browser API requests use same-origin Next.js route handlers, which proxy to the single NestJS API configured by `NEST_API_URL`.

## Requirements and startup

- Node.js 22.15 or newer and npm.
- The existing XAMPP MySQL `shopsphere` database and private `nest-api/.env` configuration.
- Install dependencies with `npm --prefix nest-api install` and `npm --prefix frontend install`.
- Generate the Prisma client from `nest-api` with `npx prisma generate`.
- Start both services from the project root with `npm run dev`. The launcher uses the configured NestJS `PORT` and sets the matching frontend `NEST_API_URL`.

The defaults are Next.js at `http://127.0.0.1:3000` and NestJS at `http://127.0.0.1:3004`; `frontend/.env.local` contains the standalone frontend default. If starting Next.js directly, keep `NEST_API_URL` aligned with the NestJS bind address and port. No standalone `express-api` service is part of the runtime.

For Vercel, set the server-side `NEST_API_URL` to the NestJS origin, or to that origin with `/api/v1`; the API client applies `/api/v1` exactly once. Do not use a `NEXT_PUBLIC_` variable for the backend URL.

## Current API coverage

NestJS provides authentication (HTTP-only session cookies, CSRF protection, OTP), health, products, category management, customer cart/wishlist, product/user administration, manager inventory, customer orders, payment verification/webhooks, and admin order/payment endpoints. Roles and session ownership are checked by the backend. Inventory Managers use the shared manager dashboard, and each inventory permission is configured by an Admin and enforced by the NestJS API.

The NestJS API serves administrator customer, coupon, report, order, payment, product, inventory, and Cloudinary-backed product-image operations. Image operations require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `nest-api/.env`.

## Database and integrations

The API uses Prisma with the existing XAMPP MySQL database named `shopsphere`. Keep database credentials in `nest-api/.env`; never place private keys or database credentials in frontend configuration. Do not reset, drop, recreate, or migrate the database without a reviewed plan and explicit approval. Optional SMTP, Cloudinary, and Razorpay settings are documented in `nest-api/.env.example`.

The browser receives only the public Razorpay key ID. Payment success is accepted only after a valid provider signature and a server-side captured-payment lookup, or a correctly signed webhook. Validate checkout with Razorpay test-mode credentials; do not use real payment credentials for smoke tests.

## Checks

From the project root, run `npm test` and `npm run build`. For details on authentication and backend operations, see [nest-api/README.md](../nest-api/README.md).
