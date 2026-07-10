# Automation Deployment Readiness

## Required Processes

Run the API and both workers for full automation support:

```bash
npm run start
npm run start:worker:payments
npm run start:worker:webhooks
```

During local development use:

```bash
npm run dev
npm run worker:payments
npm run worker:webhooks
```

## Environment Variables

Core runtime:

- `MONGODB_URI`
- `FRONTEND_ORIGIN`
- `FIBER_PROVIDER=rpc`
- `FIBER_RPC_URL`
- `FIBER_PEER_ID`
- `FIBER_API_KEY` if required by the Fiber RPC provider
- `FIBERPASS_VAULT_CODE_HASH`
- `FIBERPASS_VAULT_HASH_TYPE`
- `FIBERPASS_OPERATOR_LOCK_HASH`

Automation workers:

- `PAYMENT_WORKER_INTERVAL_MS`
- `PAYMENT_WORKER_BATCH_SIZE`
- `WEBHOOK_WORKER_INTERVAL_MS`
- `WEBHOOK_WORKER_BATCH_SIZE`
- `WEBHOOK_DELIVERY_TIMEOUT_MS`

Automation safety limits:

- `AUTOMATION_MAX_INVOICE_CKB`
- `AUTOMATION_MAX_BATCH_CKB`
- `AUTOMATION_DAILY_LIMIT_CKB`

## Mongo Indexes

Mongoose declares indexes for:

- Recipients by `recipientId`, owner/app, app/status, and external id.
- Invoices by `invoiceId`, session/status, app/recipient, idempotency key, external reference, and queue ordering.
- Payment jobs by `invoiceId`, app/idempotency key, status/runAfter/lock, and owner/app.
- Payment batches by `batchId`, session/status, app/idempotency key, and external reference.
- Webhook deliveries by `deliveryId`, status/runAfter, app/event, and owner/app.

Before beta, run the backend once against the target database with `autoIndex` enabled or apply equivalent indexes through a migration.

## Production Safety Checklist

- Confirm `FRONTEND_ORIGIN` is not `*` in production.
- Confirm Fiber RPC is testnet/mainnet target intended for the release.
- Confirm vault lock deployment values are set.
- Confirm payment and webhook workers are supervised separately from the API.
- Confirm worker logs and API logs are collected.
- Confirm webhook endpoints use HTTPS in production.
- Confirm app API keys are generated with least-privilege scopes.
- Confirm automation safety limits match beta policy.
- Confirm database backups and restore steps exist.
- Confirm the E2E demo flow succeeds before opening beta access.

## Verification Commands

```bash
npm run build
npm test
npm run demo:automation
```

`demo:automation` requires real environment values described in `docs/automation-e2e-demo.md`.
