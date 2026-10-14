# ShopSphere Runtime and Migration Audit

**Updated:** 2026-10-13  
**Scope:** Current source tree, runtime routing, backend modules, Prisma schema, scripts, and available tests.

## Supported architecture

- Next.js is the browser-facing application and same-origin API proxy (default port `3000`).
- NestJS is the only backend application (configured port `3003`, API prefix `/api/v1`).
- The frontend's `NEST_API_URL` and the root launcher use that same NestJS address.
- No standalone `express-api` backend is present or required at runtime. The `express` dependency is used by `@nestjs/platform-express` and request parsing inside NestJS; it is not a separate legacy server.
- API features are implemented in native NestJS modules for authentication, products, categories, cart, wishlist, orders/payments, and administration.

## Database and migration safety

- Prisma targets the existing XAMPP MySQL database named `shopsphere`.
- The schema validates with the existing `DATABASE_URL`.
- This audit did not run a migration, `db push`, schema synchronization, destructive SQL, or any database write.
- The existing migration history and records remain untouched. Any future schema change must be reviewed against the actual database and approved before applying it.

## Runtime and feature status

- Authentication uses the existing HTTP-only session cookie and CSRF flow. Missing and invalid sessions return 401; server exceptions are logged safely and retain a generic 500 response.
- The Next.js proxy forwards cookies and CSRF headers and preserves upstream status codes and response bodies.
- The frontend points only to the configured NestJS API. Historical references to `express-api`, port 3001, and port 3005 are not active configuration.
- Admin image operations are implemented natively and require the documented Cloudinary server settings. Payment operations use Razorpay provider verification; no live payment was created.
- Express remains installed only as a NestJS platform dependency, so it has not been removed from package manifests.

## Verification

- `npm test`: 60 NestJS tests and 7 frontend tests passed.
- `npm run build`: NestJS JavaScript check and Next.js production build passed.
- Prisma validation passed without changing the database.
- After restarting via `npm run dev`, health returned 200; anonymous and invalid-session auth requests returned 401 through NestJS and Next.js; public pages and product APIs returned 200; protected admin, manager, cart, wishlist, and order endpoints returned 401.
- A live valid-session check could not use the configured administrator login because its password does not match the existing account. Automated auth tests exercise valid login/session/profile/logout behavior. No credentials were reset.
- No real external payment or Cloudinary upload was made. Cloudinary and SMTP credentials are configured; Razorpay's webhook secret is present in the effective runtime environment.

## Operational commands

From the project root:

```powershell
npm run dev
```

This starts NestJS, Next.js, and local MailDev when the configured SMTP host is local. To run services separately:

```powershell
npm run dev:backend
npm run dev:frontend
```
