# ShopSphere E-commerce Next-Phase Audit

Inspected `node-core`, `express-api`, `nest-api`, Prisma schema/migrations, route/controller/service wiring, storefront pages/components, and available automated tests. The highest-priority safely scoped next feature was server-backed customer wishlists: a wishlist UI already existed, but its data was only browser-local and could not be private, account-scoped, or synchronized. A persistent wishlist was implemented after documenting the original gap.

## Feature status

| Feature | Status | Code-verified evidence and remaining gaps |
| --- | --- | --- |
| Wishlist | **Complete** | Express `GET /api/v1/wishlist`, `POST /api/v1/wishlist/items`, and `DELETE /api/v1/wishlist/items/:id` are protected by session authentication, `CUSTOMER` role checks, and CSRF on mutations. Services query/write using only the authenticated `request.user.id`; schema `WishlistItem` has unique `(userId, productId)` and cascading user/product foreign keys. The Next.js `/favorites` page and product heart actions use the same-origin `/api/wishlist` proxy for signed-in customers; guests retain explicitly browser-local favorites. Duplicate adds are idempotent. No automatic guest-to-account merge is performed. Express automated tests cover role denial, CSRF, invalid/missing products, idempotency, isolation between users, and owner-only visibility/removal. Live single-customer Express CRUD was also exercised. |
| Checkout | **Missing** | No checkout page or checkout API route/controller/service exists in Express, Node Core, or NestJS. The bag page labels checkout unavailable and contains a disabled button. No order/payment success is simulated. |
| Orders | **Missing** | No Prisma order/order-line model, migration, order route/controller/service, order-history page, or order test exists. Consequently there is no order-ownership behavior to verify. |
| Payment integration | **Missing** | No provider SDK/configuration, payment endpoint, webhook route/signature validation, payment persistence, or payment tests were found. |
| Inventory management | **Partial** | `Product.inStock` is a single boolean, not a quantity. Admin can create products, assign managers, and use server-guarded product `POST`/`PUT`/`DELETE`; manager APIs list only assigned products and update only `{ inStock: boolean }` with an `updateMany` scoped by both product ID and manager ID. The manager page exposes this toggle. There is no stock count, reservation, decrement, low-stock handling, or concurrent checkout protection. The cart rejects boolean out-of-stock items but does not reserve stock. |
| Admin operations | **Partial** | Express server guards `ADMIN` on product creation/update/deletion and `/api/v1/admin` role/assignment operations. The `/admin` UI manages roles, assignments, product creation and deletion, but does not expose product editing through its available `PUT` API, nor user deletion/security settings. API tests cover write denial for non-admins and admin role/assignment behavior. |
| Manager operations | **Partial** | Express server guards manager routes with `MANAGER`; reads and availability writes are constrained to products assigned to `request.user.id`. `/manager` offers assigned-product availability toggles only. There are no order operations, product detail edits, stock counts, or manager creation workflow beyond admin role promotion. Automated API tests cover assignment scoping and unauthorized access. |

## Cross-backend boundaries and security

- **Express** is the only backend with database-backed commerce identity and authorization. Customer cart and wishlist operations are scoped by authenticated user ID; role values supplied by a client are not used to select the owner.
- **Node Core** exposes public sample product and health routes only. It has no identity, wishlist/cart/order, payment, inventory-write, admin, or manager operations to protect.
- **NestJS** exposes public in-memory sample product and health routes only. It has no identity, wishlist/cart/order, payment, inventory-write, admin, or manager operations to protect.
- Express product catalog reads are public; product writes require `ADMIN`, authentication, and CSRF. Admin APIs require `ADMIN`; manager APIs require `MANAGER` and assignment-scoped database updates; cart and wishlist APIs require `CUSTOMER`.
- Cart totals are recalculated from current database product prices. Wishlist responses also use current product rows rather than client-submitted product details. There are no order snapshots or transactionally reserved inventory because order creation is not implemented.

## Verification performed

| Check | Result |
| --- | --- |
| Express automated tests (`npm test`) | **34 passed, 0 failed**, including 3 wishlist tests and existing cart/auth/RBAC/product tests. |
| Frontend tests (`npm test`) | **5 passed, 0 failed**. |
| Frontend production build (`npm run build`) | **Passed**; Next.js generated `/api/wishlist` and `/api/wishlist/[...segments]` route handlers. |
| Node Core tests (`npm test`) | **5 passed, 0 failed**. |
| NestJS tests (`npm test`) | **6 passed, 0 failed**. |
| Prisma schema validation/client generation | **Passed**. |
| Wishlist migration | `20261011143000_add_customer_wishlists` applied using `npx prisma migrate deploy`; `prisma migrate status` reports schema up to date. |
| Existing product data | IDs `[1, 2, 3]` were read before and after migration; all remain. No test wishlist records remain after cleanup. |
| Live Express wishlist smoke test | **Passed** for a disposable customer: registration with forged role remained `CUSTOMER`; list, add, and owner remove worked. |
| Same-origin wishlist proxy | **Passed** unauthenticated denial: `GET http://127.0.0.1:3003/api/wishlist` returned HTTP 401 from the Express authorization path. |
| Guest favorites UI | **Passed** in the production storefront: toggling a product heart updated the header count and displayed the product on `/favorites` as a browser-local guest favorite. |
| Live cross-customer wishlist run | Not completed: local registration rate limiting blocked further disposable registrations. Multi-customer ownership/isolation is covered by the automated route test with distinct authenticated identities; no claim of a live two-account run is made. |

## Next recommended work

Add real integer inventory counts and reconciliation of existing boolean-only availability before implementing orders. Then design order creation to atomically validate cart quantities, snapshot authoritative prices, decrement/reserve inventory, and bind order reads to the authenticated customer. Integrate a payment provider only after orders and webhook verification have a defined, testable lifecycle.
