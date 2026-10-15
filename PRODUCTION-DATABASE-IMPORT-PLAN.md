# ShopSphere production database import plan

**Status: plan only. No production import or database write has been run.**

## Connection and restore preflight (2026-10-15 10:35 Asia/Kolkata)

- Railway CLI is authenticated and linked to project `shopsphere`; both
  `MySQL` and `shopsphere-api` have active production deployments.
- The backend's `DATABASE_URL` matches the MySQL service's internal URL and
  selects `railway`. The public endpoint is configured.
- Fresh read-only metadata query over the configured public endpoint succeeded:
  it identified MySQL `8.4.11`, database `railway`, zero base tables, and no
  `_prisma_migrations` table.
- A direct client probe using the XAMPP MariaDB 10.4.32 client and
  `--ssl-verify-server-cert` failed certificate verification. A separate
  Prisma probe connected without TLS (no active TLS cipher). Do not bulk-import
  over this path and do not disable certificate verification.
- The private Railway tunnel is unavailable until an SSH public key is
  registered; neither a local public key nor a registered Railway key is
  available. No key was created/registered. Creating/registering a key is a
  security-setting change and needs approval.
- The owner approved an encrypted local SSH key and Windows SSH Agent for
  tunnel setup. The Windows `ssh-agent` service is installed but disabled;
  starting it failed, and changing its startup mode requires elevated Windows
  permissions. No service setting or SSH key was changed. Interactive
  passphrase entry also cannot be completed non-interactively in this session.
- PITR remains disabled with two service-configuration blockers, with no
  on-demand or scheduled backups listed. No backup, security, networking, or
  database configuration was changed.
- The Railway API health endpoint returns HTTP 200 and recent logs show Nest
  startup. This does not indicate DB tables exist. A local `railway run` probe
  using the private internal hostname cannot reach Railway from the developer
  machine; treat that as expected local network scope, not proof of a
  production-backend connectivity failure.
- The SQL backup is intact at 35,758 bytes with SHA-256
  `e5f939aa9184540d439d254b4df6e3cf0585e1917a4d6aa716e1e2a449e2bbe3`.
  Prisma validation passes, all 15 model tables match the backup's 15
  application tables, and all 15 migration checksums match.

**Decision: restore is not yet approved for execution.** Before asking for
database-write approval, establish a verified secure import route (for example,
an approved private SSH tunnel) and an agreed recovery plan. The target is
currently empty; if it remains empty immediately before import, preserve that
state as the recovery baseline and stop if any table appears. The proposed
restore itself creates 16 tables, inserts source rows, adds foreign keys and
indexes, and seeds 15 migration-history records.

## Revalidation (2026-10-15 10:28 Asia/Kolkata)

- Railway CLI reports authenticated, linked to `shopsphere`, and lists active
  production deployments for `shopsphere-api` and `MySQL`.
- `shopsphere-api`'s `DATABASE_URL` still resolves to the internal
  `MySQL.MYSQL_URL` and database `railway`.
- A fresh read-only production query again returned `railway`, zero base tables,
  and no `_prisma_migrations` table.
- The API health endpoint returned HTTP 200. A secret-suppressed scan of the
  last 100 API log lines found the successful Nest application startup message;
  it found no `P1001`, database connection failure, migration failure, or
  `EADDRINUSE` markers.
- `npx prisma validate` passed locally. The backup still has 16 tables, 15
  matching Prisma application tables, and 15 finished migration records. All
  migration names/checksums match local migration files.
- PITR remains disabled; there are no listed on-demand or scheduled backups.
  Railway reports two PITR blockers for the MySQL image/start command. There is
  no local or registered Railway SSH key, so the CLI private SSH tunnel is not
  available. No public-networking or security configuration was changed.
- Diagnosis: the API is running and has a healthy HTTP endpoint, but that is not
  evidence that application tables exist. The target remains empty because no
  import has been performed. A production restore is still gated on an
  independently verified recovery point and an approved secure transfer
  channel.

## Final pre-import check (2026-10-15)

- Canonical source path checked: `C:\Users\meets\OneDrive\Desktop\NewProject\ShopSphere\shopsphere.sql`.
- Size: 35,758 bytes.
- SHA-256: `e5f939aa9184540d439d254b4df6e3cf0585e1917a4d6aa716e1e2a449e2bbe3`.
- The checked file is the project-root `shopsphere.sql`, not a newly generated copy. Its hash matched the earlier inspection.
- Railway project and production services were rechecked. `shopsphere-api` and `MySQL` both had active deployments. The API URL resolved to internal MySQL URL and selected database `railway`.
- A fresh read-only metadata query reported `DATABASE() = railway`, zero base tables, and no `_prisma_migrations` table.
- Railway MySQL PITR status: disabled. Railway reported PITR blockers for this service's MySQL image (`mysql:8`) and its configured start command. No existing on-demand backups were listed, and no automatic backup schedule was listed.
- Therefore **there is no independent Railway snapshot/backup confirmed available before import**. Do not proceed with a production import until an independent recovery path is enabled/created through a separately approved, supported procedure and its completion is verified. Enabling/changing PITR configuration is outside this read-only check and is not authorized here.
- The Railway CLI is authenticated and linked to the `shopsphere` project; the active production environment lists `MySQL` and `shopsphere-api`, not another project/service.
- A local private SSH tunnel is not currently available: no SSH public key was found under the current Windows user's `.ssh` directory. The Railway CLI supports `--tunnel-only`, but the connection attempt failed because no SSH key is configured. No key was created or uploaded.
- The existing `MYSQL_PUBLIC_URL` is present and was previously used for read-only checks. The default `railway connect MySQL` route may use the public TCP proxy. **That route has not been approved or security-validated for transferring this backup; do not use it for the import by assumption.** No public networking configuration was changed.
- The current API health endpoint returned HTTP 200. This proves the API responds, not that the API has working production database tables.
- The backup's current source row counts (not production data) are: `cart` 3, `cartitem` 1, `category` 4, `coupon` 1, `customerpermission` 29, `inventorymanagerpermission` 16, `inventorystockhistory` 13, `order` 7, `orderitem` 7, `payment` 7, `product` 5, `session` 14, `user` 5, `wishlistitem` 1, `_prisma_migrations` 15. `paymentwebhookevent` has no INSERT group. These counts are for post-restore comparison only.

All checks above are point-in-time. Re-run target and backup checks immediately
before an approved import. The recorded hash identifies the exact local file
checked; it does not by itself prove that an external copy or prior export came
from a particular database.

This runbook describes a possible import of the preserved `shopsphere.sql` backup
into the Railway MySQL database `railway`. The source XAMPP database, its local
`.env`, the SQL backup, and the production database must all be preserved. Any
production write, deployment pause, restore, or other state change requires a
separate explicit approval immediately before execution.

## Verified preflight facts

- Railway project: `shopsphere`; environment: `production`.
- Services: `shopsphere-api` and `MySQL`; both had active deployments at the
  time of inspection.
- The API's resolved `DATABASE_URL` matched the MySQL service's internal
  `MYSQL_URL`. It selected database `railway`; it did not match
  `MYSQL_PUBLIC_URL`.
- The public health endpoint returned HTTP 200. That confirms API availability,
  not database readiness.
- A read-only query through the existing Railway MySQL public connection
  returned database `railway`, no base tables, and no `_prisma_migrations`
  table. This is a point-in-time observation; repeat it immediately before any
  import. The API deployment was still online.
- Local XAMPP database `shopsphere` and its connection configuration were not
  changed. The local XAMPP MySQL client tools are present at
  `C:\xampp\mysql\bin`.
- Local Prisma migration status was reported as up to date before this plan was
  prepared.

## Backup and migration comparison

Inspection of `shopsphere.sql` was limited to DDL, statement/table names, and
migration metadata; application row values and credentials were not displayed.

- The file is 35,758 bytes and contains 16 `CREATE TABLE` statements: the 15
  Prisma model tables plus `_prisma_migrations`.
- It contains 14 application-table `INSERT` statements/table groups (all
  application tables except `paymentwebhookevent`) plus an
  `_prisma_migrations` insert group. The insert statements can contain multiple
  rows; this was not treated as a row count.
- All 15 Prisma model tables and scalar columns matched the current
  `nest-api/prisma/schema.prisma`; no missing or extra application columns were
  found by the structural comparison.
- The dump includes 37 `ALTER TABLE` statements, 14 `ADD CONSTRAINT`
  operations (all foreign keys), and 28 index/key operations. Foreign keys and
  indexes are added after the insert groups.
- Table creation and inserts are interleaved. Child rows occur before some
  parent rows (for example, carts before users); the foreign keys are added
  later, so the dump defers those checks until its ALTER phase. There is no
  `FOREIGN_KEY_CHECKS=0` directive. Do not reorder or edit the dump.
- The dump contains no `CREATE DATABASE`, `DROP DATABASE`, or `DROP TABLE`
  statements, and no `USE` statement. The target must be selected explicitly
  when connecting.
- The `_prisma_migrations` data has 15 unique records, all marked finished,
  none rolled back. Their names match all 15 local migration directories, and
  every stored checksum matched its corresponding local `migration.sql`.
- These checks establish structural and migration-history compatibility, not
  that every application row is valid or that restoring is risk-free.

## Safe execution sequence (not executed)

### 1. Preserve the source and rehearse away from production

Keep the original `shopsphere.sql` untouched and make a protected copy outside
the repository. Calculate a checksum for the original and copy. Do not print or
commit SQL row data.

From CMD, start PowerShell for the local copy/checksum step:

```cmd
cd /d C:\Users\meets\OneDrive\Desktop\NewProject\ShopSphere
powershell -NoProfile
```

Then in PowerShell:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$copy = Join-Path $env:USERPROFILE "Documents\shopsphere-preimport-$stamp.sql"
Copy-Item .\shopsphere.sql $copy
Get-FileHash .\shopsphere.sql, $copy -Algorithm SHA256
```

The copy contains sensitive application data. Keep it access-controlled and
outside the repository; do not attach it to tickets or commit it.

If an already-approved, isolated staging MySQL database is available, verify it
is empty and restore the unchanged dump there first. Compare staging table
definitions, migration status, per-table row counts, and application behavior.
Do not create a new Railway database/service as part of this runbook; provisioning
or changing Railway resources needs separate approval.

### 2. Establish a recoverable production backup

Immediately before a production import:

1. Take a Railway-supported pre-import backup/snapshot of the MySQL service, if
   available, and confirm it completed. Keep it until post-import verification
   is accepted.
2. If the Railway service does not provide a usable backup/snapshot, stop and
   request approval for a separately reviewed, encrypted database export
   procedure. Do not put credentials in shell arguments, command output, logs,
   source files, or the repository.
3. Protect the existing local `shopsphere` database and `shopsphere.sql`
   independently; do not overwrite either with production data.

This inspection did not verify that Railway snapshot/point-in-time restore is
enabled. A restore can overwrite production data and is not authorized by this
plan.

### 3. Reconfirm the target and protect against concurrent writes

Use the already configured Railway MySQL connection; do not enable public
networking, change credentials/permissions, or replace the API's internal
`DATABASE_URL` reference.

With an approved operator, query `SELECT DATABASE();` and `SHOW TABLES;` again.
Proceed only if the database is still `railway` and the result is completely
empty. If any table exists, abort; do not merge, truncate, drop, or overwrite.

The API is online. Schedule a maintenance window and pause writes / stop the API
through the approved Railway deployment controls before importing. This is a
production state change and requires separate explicit approval. Keep it paused
until verification is complete.

### 4. Import the unchanged dump

**Transfer gate is not currently satisfied.** The Railway CLI supports a
private SSH tunnel:

```cmd
railway connect MySQL --environment production --tunnel-only --port 33306
```

It was not usable during this check because no SSH key is configured locally;
do not create or register a key without approval. Railway's file upload and
service SSH commands are also available in the CLI, but they would transfer the
customer-data dump into a live production container. Their interaction with the
MySQL service filesystem and credentials has not been validated, so they are
not approved as an import path here. The ordinary `railway connect` command may
use the existing public TCP proxy; TLS and its safe handling of credentials
were not validated for a bulk import. Do not use it for import by assumption.

After a secure import channel and independent recovery method are approved and
verified, connect through that channel and first run:

```sql
SELECT DATABASE();
SHOW TABLES;
```

Proceed only if the database is `railway` and has no tables. Then import the
unchanged file:

```sql
source C:/Users/meets/OneDrive/Desktop/NewProject/ShopSphere/shopsphere.sql;
```

Do not run the `source` command if the target check is not exactly as expected.
If `source` reports any error, stop immediately; do not retry the complete dump
or manually drop partial objects. Record only sanitized error codes/messages.

Until those gates are met, the `source` command above is a plan only and must
not be executed.

### 5. Verify before resuming the API

In the same MySQL session, verify that the expected database is selected and
that all 16 tables exist:

```sql
SELECT DATABASE();
SHOW TABLES;
```

Then run per-table row-count queries. These reveal counts only, not customer
records:

```sql
SELECT 'cart' AS table_name, COUNT(*) AS row_count FROM `cart`
UNION ALL SELECT 'cartitem', COUNT(*) FROM `cartitem`
UNION ALL SELECT 'category', COUNT(*) FROM `category`
UNION ALL SELECT 'coupon', COUNT(*) FROM `coupon`
UNION ALL SELECT 'customerpermission', COUNT(*) FROM `customerpermission`
UNION ALL SELECT 'inventorymanagerpermission', COUNT(*) FROM `inventorymanagerpermission`
UNION ALL SELECT 'inventorystockhistory', COUNT(*) FROM `inventorystockhistory`
UNION ALL SELECT 'order', COUNT(*) FROM `order`
UNION ALL SELECT 'orderitem', COUNT(*) FROM `orderitem`
UNION ALL SELECT 'payment', COUNT(*) FROM `payment`
UNION ALL SELECT 'paymentwebhookevent', COUNT(*) FROM `paymentwebhookevent`
UNION ALL SELECT 'product', COUNT(*) FROM `product`
UNION ALL SELECT 'session', COUNT(*) FROM `session`
UNION ALL SELECT 'user', COUNT(*) FROM `user`
UNION ALL SELECT 'wishlistitem', COUNT(*) FROM `wishlistitem`
UNION ALL SELECT '_prisma_migrations', COUNT(*) FROM `_prisma_migrations`;
```

Also check migration state from the backend workspace. This command is intended
to read migration status only; do not substitute `migrate deploy`, `db push`,
or any schema-changing command:

```cmd
cd /d C:\Users\meets\OneDrive\Desktop\NewProject\ShopSphere\nest-api
railway run --no-local --service shopsphere-api --environment production -- npx prisma migrate status
```

Require all 15 migrations to report applied/up to date, and compare production
row counts with the staging rehearsal and the source backup counts collected
without exposing row values. Check table/column definitions against the Prisma
schema. Only after those checks pass should an approved operator resume the API
and smoke-test its health and safe database-backed endpoints.

## Abort and rollback plan

- **Before import:** if backup/snapshot is unavailable, the target is not empty,
  target database name differs, migration status is unexpected, or the dump
  checksum changes, abort without writing.
- **Import error or verification mismatch:** keep the API paused; do not retry
  the dump, run migrations, or remove partial tables. Preserve sanitized
  diagnostics and take a protected snapshot of the partial state if supported.
- **Recovery:** compare the partial state with the pre-import snapshot and
  prepare a provider-supported restore plan. Restoring a snapshot may overwrite
  the current production database; stop and get explicit confirmation before
  executing it. If restore is unavailable or unsafe, keep the API paused and
  request a reviewed repair plan rather than improvising destructive SQL.
- **After success:** retain the pre-import snapshot and original local backup
  until the owner accepts application verification. Never use the local
  `shopsphere.sql` as a rollback by re-importing it over non-empty production.

## Command risk summary

| Command/action | Expected effect | Risk |
|---|---|---|
| `Get-FileHash .\shopsphere.sql -Algorithm SHA256` | Reads the local dump | Low; no data change |
| `railway connect MySQL --environment production` | Opens a database client session | Low by itself; session can issue writes |
| `SELECT DATABASE();`, `SHOW TABLES;`, row-count `SELECT`s | Reads production metadata/counts | Low; counts can reveal approximate data volume |
| Railway snapshot/export | Reads or snapshots production data | Low to availability; backup contains sensitive data and must be access-controlled |
| `source ...\shopsphere.sql` | Creates tables, inserts data, adds constraints/indexes, imports migration history | **High; production write. Run only after explicit confirmation and all gates pass** |
| Railway pause/resume deployment controls | Changes service availability | **Medium/high; production availability change and needs approval** |
| Snapshot restore | Replaces database state with a prior snapshot | **Critical/destructive; requires a separate explicit confirmation** |
| `prisma migrate status` | Reads migration status | Low; do not replace with a deploy/push command |

## Approval gate

This document is an execution plan, not permission to execute it. Before any
production import, deployment pause, restore, or other production modification,
stop and obtain explicit confirmation for the specific action.
