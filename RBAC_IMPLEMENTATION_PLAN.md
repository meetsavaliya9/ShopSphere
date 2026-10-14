# ShopSphere RBAC Implementation Plan

> Historical plan: this document describes the architecture before the NestJS migration and is not a description of the current runtime. The supported implementation and current verification status are in [MIGRATION_AUDIT.md](./MIGRATION_AUDIT.md) and [ECOMMERCE_FEATURE_AUDIT.md](./ECOMMERCE_FEATURE_AUDIT.md).

## Inspected architecture

- `express-api` is the only backend using MySQL and Prisma. Its existing schema contains only `Product`; its product API currently permits unauthenticated `POST`, `PUT`, and `DELETE`.
- The existing Prisma migration is `20261011044827_init`. The additive RBAC migration `20261011080228_add_rbac_identity_and_product_assignments` creates role/user/session structures and adds a nullable manager assignment to products. It has been applied; existing product rows and their public response fields remain intact.
- Node Core serves in-memory health/product reads. NestJS serves in-memory health/product reads. Neither has a user store, auth middleware, or protected business operation. Neither will issue or store user roles.
- The Next.js frontend currently has no authentication, dashboard, or role-aware navigation. Its Express calls are proxied through Next route handlers; service URLs remain server-side.
- At the time of the original RBAC implementation, orders, cart persistence, wishlist persistence, and payments did not exist in the backend APIs and were outside that change. Subsequent phases added customer cart persistence and, in this phase, customer wishlist persistence; orders and payments remain unavailable.

## Identity and session design

- Express/MySQL is the single authority for users, roles, and sessions.
- Add `UserRole` with exactly `ADMIN`, `MANAGER`, and `CUSTOMER`; users have a normalized unique email, display name, password hash, role, and timestamps.
- Hash passwords with `bcrypt` at a cost appropriate for the supported Node runtime. Never return or log password hashes.
- Use opaque cryptographically random session credentials. Persist only a SHA-256 hash of each credential with its user and expiration; validate the session against MySQL on each authenticated request. Logout revokes the database session.
- Set the session in an HTTP-only, host-only, `SameSite=Strict` cookie, with `Secure` in production. Do not store auth tokens or authoritative role values in local storage.
- Protect state-changing browser requests with a signed, same-origin double-submit CSRF token, checked in Express. Rotate the opaque session on login; reuse a valid CSRF cookie for its eight-hour lifetime so another tab's CSRF bootstrap cannot invalidate in-memory tokens.
- Rate-limit registration and login. Public registration always creates `CUSTOMER`; submitted role fields are rejected/ignored safely and can never grant privilege.
- Bootstrap the first administrator only through a documented server-side CLI command using `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; refuse bootstrap if an admin already exists. No default credentials.

## Role responsibilities and endpoint authorization

| Role | Permissions |
| --- | --- |
| `ADMIN` | All product operations; assign/unassign product managers; list users and change roles; access the admin dashboard. |
| `MANAGER` | List assigned products and update only their inventory availability (`inStock`); access a read-only operational dashboard for assigned products and their own account. Cannot change product details, create/delete products, assign products, list users, change roles, or access admin features. |
| `CUSTOMER` | Public product browsing and own account read/update (including own password change); no product writes, user administration, or access to manager/admin pages. |

- `GET /api/v1/products` and `GET /api/v1/products/:id` remain public.
- `POST /api/v1/products` and `DELETE /api/v1/products/:id` require `ADMIN`.
- `PUT /api/v1/products/:id` requires `ADMIN`.
- `GET /api/v1/manager/products` and `PATCH /api/v1/manager/products/:id/inventory` require `MANAGER`; the service scopes reads and writes to the authenticated manager's product assignments.
- `GET /api/v1/admin/products`, `GET /api/v1/admin/users`, and `PATCH /api/v1/admin/users/:id/role` require `ADMIN`.
- Auth endpoints provide CSRF bootstrap, customer registration, login, logout, and current-user retrieval; `/me` profile/password update requires a valid session and only affects that session's user.
- This original RBAC scope defined no order, cart, wishlist, or payment permission. Subsequent cart and wishlist routes require an authenticated `CUSTOMER`, and mutations require CSRF; no order or payment routes currently exist.

## Frontend behavior

- Add same-origin Next.js route handlers as a backend-for-frontend for auth, account, product operations, manager inventory, and admin user management. The browser does not receive backend origins, database credentials, or privileged secrets.
- Keep the session cookie HTTP-only; use CSRF tokens only in memory for mutation headers. The API response, not local storage or request input, supplies the current role.
- Add login/registration, customer account, manager dashboard, and admin dashboard pages. Guard page rendering with the Express session and enforce all permissions again in Express.
- Navigation is role-aware for usability, but is not considered an authorization control. Render clear unauthenticated, forbidden, loading, and API-error states.

## Migration and verification

- The additive migration `20261011080228_add_rbac_identity_and_product_assignments` was reviewed and applied without resetting the database or removing/modifying existing product records. The configured local MySQL database reports the schema up to date.
- Add unit/integration tests for registration, login, logout revocation, session expiry, CSRF failures, all three roles, manager product ownership, admin-only role management, account privacy, and the existing public product reads.
- Use isolated test databases/test doubles. Never run tests against or truncate the configured development database.
- Prisma schema validation, client generation, MySQL connectivity, and migration status were verified. The pre-existing product count/IDs were checked before and after migration and preserved.
- Build and test the frontend, and smoke-test role-specific flows only after authentication and migration are running.

## Backend boundaries

- Node Core and NestJS remain independent public sample/health services; they do not accept client-supplied roles or become alternate identity issuers.
- Any future protected operation added to either service must use a documented service-to-service identity mechanism and verify authorization server-side. No such operation currently exists, so no duplicate auth integration is added now.

## Operational prerequisites

- Install Express dependencies for password hashing, cookie parsing, rate limiting, and security headers, plus frontend test/runtime dependencies only if required by implementation.
- Configure a strong `CSRF_SECRET` in `express-api/.env`; session credentials are high-entropy random values stored only as hashes in MySQL. Configure bootstrap email/password only for the one-time bootstrap command and remove those bootstrap variables afterward.
- Use `frontend/.env.local` only for server-side API URLs. Never prefix session, CSRF signing, database, or bootstrap secrets with `NEXT_PUBLIC_`.
