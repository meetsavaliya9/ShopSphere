# ShopSphere API integration

## Runtime ownership

The supported runtime is the existing Next.js frontend plus the native NestJS API. No standalone `express-api` service is present or required. NestJS uses an HTTP platform adapter; its controllers, guards, services, Prisma access, and API startup are owned by `nest-api/`.

The root `npm run dev` command starts NestJS, Next.js, and local MailDev when SMTP is configured for localhost. NestJS defaults to `127.0.0.1:3004`; Next.js defaults to `127.0.0.1:3000`. The launcher passes the selected NestJS API URL to the frontend. For separately started processes, set `frontend/.env.local` `NEST_API_URL` to the actual NestJS URL with the `/api/v1` prefix.

## Native NestJS route coverage

All routes use the `/api/v1` prefix.

| Route group | Implementation and access |
| --- | --- |
| Health, products | Public read endpoints; product mutations require an administrator. |
| Auth, OTP, profile | HTTP-only session cookies, CSRF protection, verified customer OTP, and server-side session checks. |
| Categories | Administrator-only category listing and mutations; product category strings are synchronized when a category is renamed. |
| Cart, wishlist | Customer-only, scoped to the authenticated user and existing Prisma tables. |
| Admin inventory, users, products, categories | Administrator-only, with CSRF checks for mutations. |
| Manager inventory | Manager-only and scoped to products assigned to that manager. |
| Customer orders | Customer-only checkout, order history/details, cancellation before payment order creation, and server-side payment verification. |
| Payment webhooks | Public route protected by the Razorpay webhook signature and event-idempotency checks. |
| Admin orders and payments | Administrator-only; payment success can only be established by verified provider data. |

The current NestJS API includes admin customers, coupon, report, and Cloudinary-backed product image endpoints. These image endpoints require Cloudinary credentials in `nest-api/.env` and do not use a legacy backend.

## Authentication and database

The browser calls same-origin Next.js route handlers. The proxy forwards session cookies and CSRF headers and preserves upstream status codes. The backend is the source of truth for session, role, and record ownership checks. Passwords, password hashes, OTPs, session tokens, and payment credentials are never returned as profile data.

NestJS Prisma is configured for the existing XAMPP MySQL database `shopsphere`. Do not reset, drop, recreate, migrate, or push a schema to this database without a reviewed plan and explicit approval. See the root README and `nest-api/README.md` for current startup and test commands.
