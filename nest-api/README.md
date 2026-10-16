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

### Repeatable Admin/Manager seed

Use `prisma/seed-accounts.ts` with the existing `npm run seed:accounts` command for a repeatable seed. It uses the same `bcryptjs` library and 12-round hash as customer authentication. Existing accounts with the requested role are skipped unchanged; an existing email with another role stops the seed before either account is created. Newly created privileged accounts are marked email-verified so the existing direct ADMIN/MANAGER login flow works. No password or database URL is printed.

The seed requires `DATABASE_URL` and these environment variables:

- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `MANAGER_NAME`, `MANAGER_EMAIL`, `MANAGER_PASSWORD`
- `EXPECTED_DATABASE_HOST`, `EXPECTED_DATABASE_NAME`

Before a production run, verify the Aiven service/hostname and database name in Aiven Console. Configure `DATABASE_URL` only in the private `nest-api/.env` or the one-time process environment; never commit it. The script checks that the URL matches the two expected-target variables, connects, and checks `SELECT DATABASE()` before account lookup or writes.

PowerShell example from `nest-api` (the password prompts are hidden; use the exact Aiven hostname and database name you verified):

```powershell
$env:EXPECTED_DATABASE_HOST = Read-Host "Verified Aiven hostname"
$env:EXPECTED_DATABASE_NAME = Read-Host "Verified Aiven database name"
$env:ADMIN_NAME = Read-Host "Admin name"
$env:ADMIN_EMAIL = Read-Host "Admin email"
$adminPassword = Read-Host "Admin password" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $adminPassword).Password
$env:MANAGER_NAME = Read-Host "Manager name"
$env:MANAGER_EMAIL = Read-Host "Manager email"
$managerPassword = Read-Host "Manager password" -AsSecureString
$env:MANAGER_PASSWORD = [System.Net.NetworkCredential]::new("", $managerPassword).Password
npm run seed:accounts
Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD, Env:MANAGER_NAME, Env:MANAGER_EMAIL, Env:MANAGER_PASSWORD, Env:EXPECTED_DATABASE_HOST, Env:EXPECTED_DATABASE_NAME
$adminPassword = $null
$managerPassword = $null
```

The command does not run migrations. Review the printed verified host/database before allowing it to proceed; if the Aiven target has not been independently confirmed, do not run it. Re-running with the same inputs is safe and skips the accounts without changing their passwords, names, or roles.

## Tests

```powershell
npm run build
npm test
```

The authentication tests use a fake Prisma client and do not connect to MySQL or send email. They cover customer OTP/session flows, direct ADMIN/MANAGER login, CSRF, and account security behavior.
