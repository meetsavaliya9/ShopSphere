# ShopSphere

ShopSphere uses the existing Next.js application in `frontend/` and the NestJS API in `nest-api/`. NestJS owns the backend routes, services, authentication, Prisma client, and MySQL access. There is no standalone Express API or separate Express server to install or start.

NestJS currently uses its standard HTTP platform adapter. That adapter is an internal NestJS implementation detail; the application is started and managed as a NestJS API.

## Requirements and environment

- Node.js 22.15 or newer and npm.
- A running local MySQL server (for example, XAMPP).
- `nest-api/.env` with `DATABASE_URL` targeting the existing XAMPP `shopsphere` database and a private `CSRF_SECRET` of at least 32 bytes.
- `frontend/.env.local` with the server-only `NEST_API_URL=http://127.0.0.1:3003/api/v1`.

Optional SMTP, Cloudinary, and Razorpay settings are documented in `nest-api/.env.example`. Keep environment files private and do not put backend secrets in frontend configuration. The configured database contains existing ShopSphere data: preserve it, and do not reset, drop, recreate, or migrate it without a reviewed plan and explicit approval.

New checkout totals use INR and add GST at `GST_RATE_PERCENT` (default `18`) to the database-priced subtotal. Stored product amounts are treated as tax-exclusive INR; no product-price conversion or historical-order recalculation is performed. This single rate is appropriate only if it applies to every product sold. Checkout currently applies no coupon discount or delivery fee. New orders save the exact subtotal, tax, and final total alongside the shipping-address snapshot, so this change requires no database migration. Existing orders retain their original saved totals; historical invoices show a fee/tax breakdown only when one was recorded.

## Install and run

Install the frontend and NestJS dependencies:

```powershell
npm --prefix nest-api install
npm --prefix frontend install
npm exec --prefix nest-api -- prisma generate
```

Run Next.js and NestJS together from the project root:

```powershell
npm run dev
```

Or start either service independently:

```powershell
npm run dev:backend
npm run dev:frontend
```

The frontend defaults to `http://127.0.0.1:3000`; the NestJS health endpoint is `http://127.0.0.1:3003/api/v1/health`. Next.js server-side route handlers proxy API requests to NestJS and preserve session cookies and CSRF headers.

## Backend functionality and checks

NestJS implements authentication and OTP, health, products, categories, cart, wishlist, customer orders, Razorpay payment verification/webhooks, and administration for customers, coupons, reports, orders, payments, products, inventory, and Cloudinary-backed product images using NestJS modules and Prisma. Admin, Manager, and Inventory Manager access is role-protected. Admins assign Inventory Manager permissions from Roles & Access; new Inventory Managers have no inventory permissions until explicitly enabled. Cloudinary operations require the documented server-side settings. The existing Next.js frontend remains the user interface.

Run the current build and tests from the root:

```powershell
npm run build
npm test
```

For local Admin or Manager account provisioning, see [nest-api/README.md](./nest-api/README.md). Do not grant elevated roles through customer registration.
