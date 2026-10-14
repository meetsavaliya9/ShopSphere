# ShopSphere NestJS API

The existing Next.js frontend uses this NestJS API, Prisma, and MySQL. There is no standalone legacy Express API or server to run; NestJS uses its configured HTTP platform adapter.

## Requirements and environment

- Node.js 22.15 or newer and npm.
- A running MySQL server and a private `nest-api/.env` with `DATABASE_URL` pointing to the existing XAMPP `shopsphere` database.
- `CSRF_SECRET` in `nest-api/.env`, with at least 32 bytes.
- Optional SMTP, Cloudinary, and Razorpay settings are documented in `.env.example`.
- `HOST` and `PORT` default to `127.0.0.1` and `3004`.

The configured database contains existing ShopSphere records. Keep `.env` files private; do not reset, drop, recreate, or migrate this database without a reviewed plan and explicit approval.

## Install, generate, and run

```powershell
Set-Location "C:\Users\meets\OneDrive\Desktop\NewProject\ShopSphere\nest-api"
npm install
npx prisma generate
npm run build
npm test
npm run start:dev
```

The NestJS health endpoint is `http://127.0.0.1:3004/api/v1/health`. The frontend server-side `NEST_API_URL` should point to `http://127.0.0.1:3004/api/v1`; the root `npm run dev` launcher keeps the ports aligned when `PORT` is overridden.

## Authentication and privileged accounts

Authentication, products, category management, cart, wishlist, orders, order/payment administration, Razorpay verification, and signed payment webhooks are implemented by NestJS. Customers use OTP for registration and login; existing ADMIN, MANAGER, and INVENTORY_MANAGER accounts log in directly. CSRF, session cookies, role authorization, password hashing, and OTP protections remain enabled. Inventory Manager permissions are stored per account in MySQL, default to none, and are enforced by the manager inventory APIs; Admins manage them in the frontend Roles & Access section.

Razorpay checkout and webhooks require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`; configure test-mode credentials before checkout testing. Provider-backed payment success is not simulated.

To create an ADMIN or MANAGER account in the database configured by NestJS, run:

```powershell
npm run create:privileged-user
```

The command prompts for the role, name, email, and a password entered without terminal echo. It hashes the password, marks the new account's email as verified, refuses duplicate emails, and does not create, change, or delete any account when validation fails. Use a secure password and keep it private. Do not grant elevated roles through customer registration.

## Tests

```powershell
npm run build
npm test
```

The authentication tests use a fake Prisma client and do not connect to MySQL or send email. They cover customer OTP/session flows, direct ADMIN/MANAGER login, CSRF, and account security behavior.
