# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend for **Apteka CRM** — a pharmacy point-of-sale and inventory system. NestJS 11 + Prisma 6 + PostgreSQL. The companion frontend lives in a separate repo (`aptekaCRM-frontend`). Code comments and user-facing error messages are written in **Uzbek**; keep that convention when editing.

## Commands

```bash
npm install
cp .env.example .env            # then set DATABASE_URL, PORT, FRONTEND_URL

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

Standard NestJS module-per-domain layout under `src/`, each with `*.module.ts` / `*.controller.ts` / `*.service.ts` (+ `dto/`). Modules: `products`, `inventory`, `notifications`, `sales`, plus `prisma` (DB) and `common` (shared logic). All wired in `app.module.ts`; `ConfigModule` is global.

Global setup in `main.ts`: all routes are under the `/api` prefix; body-parser limit raised to 10 MB (catalog imports send thousands of rows); a global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform` (DTOs reject unknown fields and coerce types); CORS is locked to `FRONTEND_URL`; `AllExceptionsFilter` produces a uniform error JSON shape and maps Prisma `P2002` (unique conflict) → HTTP 409.

`PrismaService` (`src/prisma/`) extends `PrismaClient` and connects/disconnects on Nest lifecycle hooks. Inject it into services for DB access.

## Domain model & invariants (read before touching inventory/sales/pricing)

The data model is in `prisma/schema.prisma`. The non-obvious rules that span multiple files:

- **Stock is always stored in PIECES (dona).** `Batch.quantity` is a piece count. `Product.unitsPerPack` converts packs ↔ pieces (a syrup bottle has `unitsPerPack = 1`). Anything user-facing in "packs" must multiply/divide by `unitsPerPack`.
- **Batches + FEFO.** Each product has many `Batch` rows (a *partiya* / receipt), each with its own `costPrice`, `sellPrice`, and `expiryDate`. Stock is consumed **First-Expiry-First-Out**: queries order batches by `expiryDate asc`, and the "current" price always comes from `batches[0]` (the front batch). Selling can span multiple batches but records a single `SaleItem` pointing at the front batch.
- **Piece pricing is derived, never stored.** `src/common/pricing.ts` `computePiecePrice(packPrice, unitsPerPack)` = packPrice / unitsPerPack, **rounded UP (ceil)** to whole soʻm — always in the pharmacy's favor. Use this helper everywhere a per-piece price is needed; don't reinvent it.
- **Price-drop guard on stock import** (`inventory.service.ts` `resolvePriceWithGuard`): when receiving a new batch for an *existing* product, if the incoming `sellPrice` is lower than the current FEFO sell price, the **old (higher) price is kept** and a `PRICE_DROP` `Notification` is created for the cashier. New products skip the comparison.
- **Money** is `Decimal(12,2)` in the DB and is serialized to the frontend as **strings**. Do arithmetic with `Prisma.Decimal`, not JS numbers.
- **Sales** (`sales.service.ts`) run in a single `$transaction`: validate stock (in pieces), decrement batches FEFO, freeze the unit price into `SaleItem.price`, then apply the discount. Discount (`PERCENT` or `AMOUNT`) is clamped to `[0, subtotal]` and rounded to whole soʻm. If any line lacks stock the whole transaction rolls back. This subtotal→discount→total logic is mirrored in the frontend cart — keep them in sync.

### Two distinct import paths

- **Catalog import** (`products.service.ts` `importCatalog`, `POST /products/import-catalog`): bulk-loads product *cards only* (no batches) via a single `createMany`. `Product.name` is **not** unique; duplicates are de-duped in app code by a normalized name (lowercased, collapsed whitespace) against both existing rows and within the file. Skipped duplicates generate `CATALOG_SKIPPED` notifications.
- **Stock import** (`inventory.service.ts` `importStock`, `POST /inventory/import`): atomic transaction that, per row, finds the product by `productId` or creates a new one, then adds a batch (applying the price-drop guard).

### API surface

Routes (all under `/api`): `products` (CRUD + `import-catalog`, `search-pos`, `barcode/:code`), `inventory` (`receive`, `import`, `stock`, `expiring`), `notifications` (list, `read-all`, `:id/read`), `sales` (create, paginated list, `:id`). `GET /products/search-pos` and `GET /products/barcode/:code` return the product enriched with `totalStock`, `packPrice`, and computed `piecePrice` for the POS.
