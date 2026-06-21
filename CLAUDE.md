# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend for **Apteka CRM** — a pharmacy point-of-sale and inventory system. NestJS 11 + Prisma 6 + PostgreSQL. The companion frontend lives in a separate repo (`aptekaCRM-frontend`). Code comments and user-facing error messages are written in **Uzbek**; keep that convention when editing.

## Commands

```bash
npm install
cp .env.example .env            # set DATABASE_URL, PORT, FRONTEND_URL, JWT_SECRET,
                                # and the bootstrap ADMIN_USERNAME / ADMIN_PASSWORD
                                # (a first user is auto-created on boot if none exist)

npm run prisma:generate         # regenerate Prisma client after schema edits
npm run prisma:migrate          # create + apply a dev migration (prisma migrate dev)
npm run db:seed                 # run prisma/seed.ts

npm run start:dev               # watch mode (http://localhost:3000/api)
npm run start:prod              # node dist/main (after npm run build)

npm test                        # jest unit tests (*.spec.ts under src/)
npm test -- pricing             # run a single test file / pattern
npm run test:e2e                # jest with test/jest-e2e.json
npm run test:cov                # coverage

npm run lint                    # eslint --fix
npm run format                  # prettier --write
```

There are currently no `.spec.ts` files committed; `npm test` passes vacuously until you add them.

## Architecture

Standard NestJS module-per-domain layout under `src/`, each with `*.module.ts` / `*.controller.ts` / `*.service.ts` (+ `dto/`). Modules: `auth`, `products`, `inventory`, `notifications`, `sales`, `superadmin`, plus `prisma` (DB) and `common` (shared logic). All wired in `app.module.ts`; `ConfigModule` is global. `app.module.ts` also registers `TenantContextMiddleware` for every route (see Multi-tenancy below).

Global setup in `main.ts`: all routes are under the `/api` prefix; body-parser limit raised to 10 MB (catalog imports send thousands of rows); a global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform` (DTOs reject unknown fields and coerce types); CORS is locked to `FRONTEND_URL`; `AllExceptionsFilter` produces a uniform error JSON shape and maps Prisma `P2002` (unique conflict) → HTTP 409.

`PrismaService` (`src/prisma/`) extends `PrismaClient`, applies the `tenantExtension` (see below), and connects/disconnects on Nest lifecycle hooks. Inject it into services for DB access.

## Multi-tenancy, auth & roles (read before touching ANY query)

This is a multi-tenant SaaS: one deployment serves many pharmacies (`Pharmacy` = tenant), plus a single `SUPERADMIN` who owns the platform. Three roles (`Role` enum): `SUPERADMIN` (manages all pharmacies, not bound to one), `ADMIN` (pharmacy owner/manager), `CASHIER`. **Every domain table except `Pharmacy` carries a `pharmacyId`** (directly, or via relation for `SaleItem`/`ReturnItem`).

- **Tenant isolation is automatic and global — never filter by `pharmacyId` by hand.** `TenantContextMiddleware` (`src/common/`) optimistically reads the JWT on each request and stashes `{ pharmacyId, role, userId }` into an `AsyncLocalStorage` (`tenant-context.ts`, via `enterWith` so the store survives deferred Prisma calls). The Prisma client extension `tenantExtension` (`src/prisma/tenant-scope.ts`) reads that store and **injects the `pharmacyId` filter into every query** for `ADMIN`/`CASHIER`, and stamps `pharmacyId` onto every create. `SUPERADMIN` and context-less system work (login, seed, boot) are not filtered. If an `ADMIN`/`CASHIER` request somehow has no `pharmacyId`, it falls back to `-1` (zero rows) — fail-closed. Models scoped by column vs by relation are listed in `COLUMN_MODELS` / `RELATION_SCOPE` in that file; add new tenant tables there.
- Use `requirePharmacyId()` (`tenant-context.ts`) only when you need the current pharmacy id explicitly (rare — creates are stamped automatically).
- **Auth** (`src/auth/`): `JwtAuthGuard` + `RolesGuard` + `SubscriptionGuard` are the request gates. `@Public()` skips auth (login), `@Roles(...)` restricts by role, `@AllowBlocked()` lets a route through even when the pharmacy subscription is blocked. `@CurrentUser()` injects the authenticated user. `auth.service.ts` issues JWTs (`{ sub, role, pharmacyId }`); passwords are bcrypt hashes (`User.passwordHash`).
- **Subscriptions**: `Pharmacy.status` (`ACTIVE`/`BLOCKED`) and `subscriptionEndsAt`. A blocked/expired pharmacy is locked out of data routes by `SubscriptionGuard`. When a subscription lapses, a superadmin-scoped `SUBSCRIPTION_EXPIRED` notification is created.
- **Notifications are dual-scoped** (`Notification.pharmacyId` is nullable): non-null → a pharmacy cashier (`PRICE_DROP`, `CATALOG_SKIPPED`); null → the `SUPERADMIN` (`SUBSCRIPTION_EXPIRED`). The `notifications` module serves pharmacy users; `superadmin` has its own notification endpoints.

## Domain model & invariants (read before touching inventory/sales/pricing)

The data model is in `prisma/schema.prisma`. The non-obvious rules that span multiple files:

- **Stock is always stored in PIECES (dona).** `Batch.quantity` is a piece count. `Product.unitsPerPack` converts packs ↔ pieces (a syrup bottle has `unitsPerPack = 1`). Anything user-facing in "packs" must multiply/divide by `unitsPerPack`.
- **Batches + FEFO.** Each product has many `Batch` rows (a *partiya* / receipt), each with its own `costPrice`, `sellPrice`, and `expiryDate`. Stock is consumed **First-Expiry-First-Out**: queries order batches by `expiryDate asc`, and the "current" price always comes from `batches[0]` (the front batch). Selling can span multiple batches but records a single `SaleItem` pointing at the front batch.
- **Piece pricing is derived, never stored.** `src/common/pricing.ts` `computePiecePrice(packPrice, unitsPerPack)` = packPrice / unitsPerPack, **rounded UP (ceil)** to whole soʻm — always in the pharmacy's favor. Use this helper everywhere a per-piece price is needed; don't reinvent it.
- **Price-drop guard on stock import** (`inventory.service.ts` `resolvePriceWithGuard`): when receiving a new batch for an *existing* product, if the incoming `sellPrice` is lower than the current FEFO sell price, the **old (higher) price is kept** and a `PRICE_DROP` `Notification` is created for the cashier. New products skip the comparison.
- **Money** is `Decimal(12,2)` in the DB and is serialized to the frontend as **strings**. Do arithmetic with `Prisma.Decimal`, not JS numbers.
- **Sales** (`sales.service.ts`) run in a single `$transaction`: validate stock (in pieces), decrement batches FEFO, freeze the unit price into `SaleItem.price`, then apply the discount. Discount (`PERCENT` or `AMOUNT`) is clamped to `[0, subtotal]` and rounded to whole soʻm. If any line lacks stock the whole transaction rolls back. This subtotal→discount→total logic is mirrored in the frontend cart — keep them in sync.
- **Returns** (`sales.service.ts`, `POST /sales/:id/return`): a sale can be partially/fully returned. Each return creates a `Return` + `ReturnItem` audit trail and adds the pieces back to stock; returned quantities are capped against what was sold minus prior returns. `ReturnItem` has no `pharmacyId` column — it is tenant-scoped through `saleItem → sale`.
- **Inventory adjustment** (`inventory.service.ts`, `POST /inventory/adjust`): the *inventarizatsiya* flow — set a batch's counted quantity directly (stock-take correction), separate from receiving.

### Two distinct import paths

- **Catalog import** (`products.service.ts` `importCatalog`, `POST /products/import-catalog`): bulk-loads product *cards only* (no batches) via a single `createMany`. `Product.name` is **not** unique; duplicates are de-duped in app code by a normalized name (lowercased, collapsed whitespace) against both existing rows and within the file. Skipped duplicates generate `CATALOG_SKIPPED` notifications.
- **Stock import** (`inventory.service.ts` `importStock`, `POST /inventory/import`): atomic transaction that, per row, finds the product by `productId` or creates a new one, then adds a batch (applying the price-drop guard).

### API surface

Routes (all under `/api`):
- `auth`: `login`, `me`.
- `products`: CRUD + `import-catalog`, `search-pos`, `barcode/:code`. `GET /products/search-pos` and `GET /products/barcode/:code` return the product enriched with `totalStock`, `packPrice`, and computed `piecePrice` for the POS.
- `inventory`: `receive`, `import`, `adjust`, `stock`, `expiring`, `batch/:id` (PATCH/DELETE).
- `notifications`: list, `read-all`, `:id/read` (pharmacy-scoped).
- `sales`: create, `:id/return`, paginated list, `:id`, plus admin analytics `stats` / `top` / `daily`.
- `superadmin` (SUPERADMIN only): `dashboard`, `pharmacies` (list/create/`:id` update/`:id/block`/`:id/activate`), `notifications` (list, `read-all`, `:id/read`).
