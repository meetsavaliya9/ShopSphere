# ShopSphere E-commerce Feature Audit

**Updated:** 2026-10-13  
**Runtime:** Next.js frontend on port 3000, backed by the native NestJS API on port 3003 (`/api/v1`).

| Feature | Current implementation | Verification and boundaries |
| --- | --- | --- |
| Authentication and OTP | NestJS auth module; HTTP-only `shopsphere_session` cookie, CSRF protection, OTP verification, and session expiry/revocation. | Automated tests cover registration, OTP, login, current-user, expiration, logout, and safe failure logging. Anonymous and invalid-cookie live requests return 401 through both NestJS and Next.js. A live valid login was blocked because the configured admin password does not match the existing account; no password or user record was changed. |
| Catalog, search, filters, product details | NestJS products module uses Prisma and the existing MySQL schema. | Build and service tests pass; live public product API and storefront pages return 200. |
| Categories | NestJS category module; integer IDs and product category strings match the existing schema. Rename synchronizes products; deleting a category in use is rejected. | Service and route tests pass. No schema or migration changes were made. |
| Cart and wishlist | NestJS customer-scoped modules use the existing `cartitem` and `wishlistitem` models. Cart prices and availability come from products. | Tests pass; unauthenticated live requests return 401. |
| Checkout, orders, payments | NestJS orders module prices checkout from the database and verifies Razorpay payment status, amount, signatures, webhook signatures, and event idempotency. | Provider behavior and failure paths are tested with mocks. No live checkout or charge was created. Payment availability depends on valid server-side Razorpay settings. |
| Admin and manager access | Role-protected NestJS routes for products, inventory, users, customers, coupons, reports, orders, and payments. Managers are limited to assigned inventory availability. Coupon mutations require CSRF. | Admin service tests and unauthenticated-route checks pass. Product image operations use signed Cloudinary requests, enforce image type/size and a scoped public-ID path, and are covered with mocked provider responses; no external upload was made. |
| UI and API proxy | Existing storefront and dashboards call same-origin Next.js routes, which proxy to one configured `NEST_API_URL`. | Production build passes. Public pages and product APIs return 200; protected endpoints preserve 401. |
| Database | Prisma schema targets the existing XAMPP MySQL `shopsphere` database. | Schema validation passes. No migration, schema synchronization, destructive SQL, or database record mutation was run in this audit. |

## Backend ownership

The supported runtime is the Next.js frontend plus the NestJS API. No standalone `express-api` backend is part of the runtime. The `express` package remains a NestJS platform/parser dependency; it is not a separate application server or legacy service. Backend modules, guards, route registration, Prisma access, and startup are owned by `nest-api/`.

## Validation run

- `npm test`: NestJS 10 suites / 60 tests passed; frontend 7 tests passed.
- `npm run build`: NestJS JavaScript build check and Next.js production build passed.
- `npx prisma validate --schema prisma/schema.prisma`: passed using the existing configured database URL; this did not modify the database.
- Live smoke tests after restarting with `npm run dev`: NestJS health 200; anonymous and invalid-session `/auth/me` 401 through backend and frontend; storefront and public products 200; protected admin, manager, cart, wishlist, and order routes 401.
- Live valid-session testing could not complete because the administrator credentials in local configuration do not match the existing administrator's stored password. Automated auth tests cover valid sessions. No credentials were reset or displayed.
- No real payment, Cloudinary upload, or destructive database operation was performed.
