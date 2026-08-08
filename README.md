# Orders & Settlements

Track customer orders and payments against them, with correct handling of money, status derivation, and concurrent/duplicate payment submissions. Next.js (App Router, TypeScript) + MongoDB, native driver.

## Setup

**Prerequisites:** Node 20+, pnpm, and either a MongoDB Atlas cluster or a local replica-set-enabled MongoDB (the payment path uses transactions, which require a replica set — a plain standalone `mongod` will not work).

```bash
pnpm install
cp .env.example .env.local   # fill in MONGODB_URI, JWT_SECRET, etc.
pnpm run ensure-indexes      # creates required indexes, including the payments idempotency index
pnpm run seed                # optional: seeds a demo user + orders in every status
pnpm dev                     # http://localhost:3000
pnpm test                    # runs the full Jest suite (spins up its own in-memory replica set)
```

Demo login after seeding: `demo@example.com` / `password123`.

## Live URL

_Not deployed in this environment — see "Deploying" below for the steps to put this on Vercel + Atlas._

## API overview

All routes require auth via an httpOnly JWT cookie (`auth_token`, set by signup/login) and are scoped to the authenticated user.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password }` | Sets auth cookie. 409 `EMAIL_TAKEN` on duplicate. |
| POST | `/api/auth/login` | `{ email, password }` | Sets auth cookie. 401 on any credential mismatch (no field-level detail). |
| POST | `/api/auth/logout` | — | Clears the cookie. |
| POST | `/api/orders` | `{ customer, dueDate, lineItems: [{ description, quantity, unitPriceMinor }] }` | `subtotalMinor`/`totalMinor` computed server-side. |
| GET | `/api/orders?status=` | — | `status` is one of `pending`, `partially_paid`, `paid`, `overdue`. Omit for all. |
| GET | `/api/orders/:id` | — | Returns `{ order, payments }`. |
| PATCH | `/api/orders/:id` | `{ customer?, dueDate?, lineItems? }` | `lineItems` rejected with 409 `ORDER_LOCKED` once a payment exists. |
| DELETE | `/api/orders/:id` | — | 409 `ORDER_HAS_PAYMENTS` once a payment exists. |
| POST | `/api/orders/:id/payments` | `{ amountMinor, paidDate, note? }` | Optional `Idempotency-Key` header. 201 on success, 409 `OVERPAYMENT` with `maxAllowedMinor` if it would exceed the amount due. |

The wire contract uses integer minor units directly (`amountMinor`, `unitPriceMinor`) so the client never has to do float math to talk to the API. The payments endpoint also accepts a fallback `amount` (major-unit string, e.g. `"12.50"`) for convenience — it's converted to minor units once, at the route boundary.

Every error response has the same shape:

```json
{ "error": { "code": "OVERPAYMENT", "message": "Payment exceeds amount due. Maximum allowed: 600.00.", "maxAllowedMinor": 60000 } }
```

## Money handling

All amounts are integer minor units (cents) everywhere — in the database, in services, in comparisons, in `$inc` operations. The only places decimal/float math is allowed:

- `lib/money.ts#formatMinor` — the display-layer boundary (`toFixed(2)`), used only for rendering.
- `lib/money.ts#majorToMinor` — validates a major-unit string against `^\d+(\.\d{1,2})?$` before doing `Math.round(parseFloat(str) * 100)` once. Used at the two points a human might type a decimal amount: the payment form and the `amount` fallback field on the payments API.

Nowhere else does the codebase do arithmetic on a major-unit float. This removes an entire class of rounding bugs.

## Status derivation

`lib/services/status.ts` is a pure module with no DB dependency:

- **Stored status** (`pending` / `partially_paid` / `paid`) is derived from `amountPaidMinor` vs `totalMinor` and persisted on the order document.
- **Display status** adds `overdue`, computed at read time as `status !== 'paid' && now > dueDate` — it is never persisted, because "is this overdue" changes with the clock, not with a write.

**Edge case:** an order that gets paid in full *after* its due date displays `paid`, not `overdue` — full payment clears the overdue flag regardless of when it happened. Covered explicitly in `lib/services/status.test.ts`.

## Concurrency & idempotency

The payment endpoint (`lib/services/payments.ts`) is the part of this system where correctness actually matters under load: two concurrent payments on the same order must never be allowed to jointly overpay it, and a retried request (same `Idempotency-Key`) must never be double-counted.

**Design — claim-first, transaction-wrapped:**

1. **Claim idempotency first.** The payment document is inserted *before any money moves*, inside a `session.withTransaction()`. It carries the caller's `Idempotency-Key` (if any), which is enforced by a unique index. If this insert throws a duplicate-key error, a concurrent identical request already won — nothing else has been written yet, so there's nothing to compensate. The transaction aborts (a no-op rollback, since only the insert had happened), and the caller is handed back the winning request's payment as a replay.
2. **Then, atomically increment `amountPaidMinor`,** guarded by `$expr: { $lte: [{ $add: ['$amountPaidMinor', amountMinor] }, '$totalMinor'] } }` inside the `findOneAndUpdate` filter itself. This is the actual concurrency-critical check: the guard and the increment happen as one atomic operation on one document, so there is no read-then-write race window regardless of how many requests hit it at once. **This guard alone is correct even on a standalone MongoDB without transactions.**
3. If the guard matches nothing, the payment is over the amount due. The transaction aborts — which automatically rolls back the payment insert from step 1, since it's in the same transaction — and the caller gets a 409 with `maxAllowedMinor`.
4. On success, the audit log entry and any status change are written in the same transaction, so the payment insert, order update, and audit trail are all-or-nothing.

Why wrap all of this in a transaction if the `$expr` guard is already safe on its own? Because the guard only protects the single `orders` document — it says nothing about the payment insert or audit write. Without the transaction, a process crash between steps could leave an incremented `amountPaidMinor` with no matching payment record, or vice versa. The transaction is what makes the *three* writes atomic as a unit; the `$expr` guard is what makes the *money* correct. They solve different problems and both are load-bearing.

One index gotcha worth calling out: a plain `sparse: true` option on a **compound** index (`{orderId, idempotencyKey}`) only excludes a document when *every* indexed field is missing. Since `orderId` is always present, that would still index (and collide on) every keyless payment for the same order. The fix is a **partial index** — `partialFilterExpression: { idempotencyKey: { $exists: true } }` — which correctly indexes only the payments that actually carry a key. See `scripts/ensureIndexes.ts`.

Tests (`lib/services/payments.test.ts`) run against `MongoMemoryReplSet` (required for transactions) and include a concurrency test (25 iterations of two overlapping payments racing against each other, asserting exactly one wins and `amountPaidMinor` never exceeds `totalMinor`) and an idempotency test (25 iterations of two identical concurrent requests, asserting exactly one payment document is ever created). Both were additionally run 8x in a full-suite loop during development with zero flakes.

## Editability

Orders become read-only for `lineItems` once the first payment is recorded — mutating totals after money has been allocated against them would break reconciliation and could retroactively manufacture an over/under-payment. `customer`, `dueDate`, and `note` remain editable at any time. Deleting an order with any recorded payments is blocked for the same reason (payments are append-only and reference the order).

## Assumptions & tradeoffs

- `amountPaidMinor` on the order is a cached, denormalized aggregate, mutated only inside the guarded payment write. The `payments` collection is the source of truth for reconciliation; the cache can always be rebuilt by summing payments for an order.
- `GET /api/orders?status=overdue` is a real Mongo query on stored fields (`{ status: { $ne: 'paid' }, dueDate: { $lt: now } }`), not an in-memory filter — `overdue` is a predicate over persisted fields, so it's expressible directly.
- Single currency; no currency field on orders or payments.
- `version` exists on the order schema for future optimistic-concurrency use but isn't currently load-bearing — the `$expr`-guarded increment is what actually protects `amountPaidMinor`.

## What I'd improve before production

- Rate limiting on `/api/auth/*` and `/api/orders/*/payments`.
- Structured logging + request tracing for payment-path auditability at the ops level.
- Currency support, refunds, and webhook notifications on status change.
- Pagination on the orders list and payment history once either can grow large.

## Deploying (Vercel + Atlas)

1. Create an Atlas cluster (M0 is fine — Atlas clusters are replica sets by default, so transactions work out of the box).
2. Set `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `JWT_EXPIRES_IN` as Vercel project environment variables.
3. Run `pnpm run ensure-indexes` once against the Atlas URI before first use (or as a deploy step) — the payments idempotency guarantee depends on the partial unique index existing.
4. `vercel deploy` (or connect the repo in the Vercel dashboard). `lib/db.ts` caches the `MongoClient` at module scope so warm serverless invocations reuse the connection instead of reconnecting per request.
