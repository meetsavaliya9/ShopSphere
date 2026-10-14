# ShopSphere Backend Status

ShopSphere's active application architecture is the existing Next.js frontend plus the NestJS API. No standalone Express API or Express server is used or required for development.

## Active services

- Frontend: `frontend/` (Next.js).
- Backend: `nest-api/` (NestJS).
- Persistence: the NestJS-owned Prisma schema/client with MySQL.
- Local development database: `shopsphere_dev`. Never reset, drop, or recreate the existing `shopsphere` database.
- Frontend API upstream: server-only `NEST_API_URL`, normally `http://127.0.0.1:3003/api/v1`.

NestJS uses its configured standard HTTP platform adapter internally. This does not add a separate Express application, listener, or API service.

## NestJS route coverage

The current NestJS modules implement health, authentication and OTP, products, categories, cart, and wishlist. Authentication includes CSRF and session protection, direct ADMIN/MANAGER login, and customer OTP flows. Product and category management is guarded by role and CSRF checks.

Do not assume that other legacy or planned capabilities are available unless their NestJS routes and tests exist. In particular, verify order, payment, upload, and reporting support in the current NestJS source before enabling those frontend flows.

## Development and verification

Install only the two active applications' dependencies:

```powershell
npm --prefix nest-api install
npm --prefix frontend install
npm exec --prefix nest-api -- prisma generate
```

Run both services with `npm run dev`, or individually with `npm run dev:backend` and `npm run dev:frontend`. Validate with `npm run build` and `npm test` from the project root.

Remove obsolete Express API URLs, setup instructions, and rollback configuration rather than starting or restoring an Express backend.
