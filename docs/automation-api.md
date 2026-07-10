# Automation API Reference

All endpoints are available both at the root path and under `/v1`. Wallet endpoints require a JoyID-authenticated bearer token. App automation endpoints require `x-fiberpass-api-key` or app bearer auth with the listed scopes.

## Wallet Developer Endpoints

- `GET /apps/:appId/recipients`
- `POST /apps/:appId/recipients`
- `PATCH /apps/:appId/recipients/:recipientId`
- `POST /apps/:appId/recipients/:recipientId/disable`
- `GET /apps/:appId/invoices?sessionId=`
- `POST /apps/:appId/invoices`
- `POST /apps/:appId/invoices/:invoiceId/queue`
- `GET /apps/:appId/invoice-batches?sessionId=`
- `POST /apps/:appId/invoice-batches`
- `POST /apps/:appId/invoice-batches/:batchId/queue`
- `GET /apps/:appId/payment-jobs?sessionId=`
- `POST /apps/:appId/webhook`
- `GET /apps/:appId/webhook-deliveries`

## App API Key Endpoints

- `GET /apps/:appId/automation/recipients` requires `recipients:read`
- `POST /apps/:appId/automation/recipients` requires `recipients:write`
- `PATCH /apps/:appId/automation/recipients/:recipientId` requires `recipients:write`
- `POST /apps/:appId/automation/recipients/:recipientId/disable` requires `recipients:write`
- `GET /apps/:appId/automation/invoices` requires `invoices:create`
- `POST /apps/:appId/automation/invoices` requires `invoices:create`
- `GET /apps/:appId/automation/invoice-batches` requires `invoices:create`
- `POST /apps/:appId/automation/invoice-batches` requires `invoices:create`
- `GET /apps/:appId/automation/payment-jobs` requires `payments:queue`
- `POST /apps/:appId/automation/invoices/:invoiceId/queue` requires `payments:queue`
- `POST /apps/:appId/automation/invoice-batches/:batchId/queue` requires `payments:queue`

## Safety Rules

An invoice or batch can be created only when:

- The FiberPass session belongs to the same wallet and app/service address.
- The session is active and unexpired.
- The session was created with automation permission enabled.
- The invoice includes a Fiber invoice/payment request before queueing.
- The amount fits remaining session balance after open automation exposure.
- The amount fits configured per-invoice, per-batch, and daily safety limits.

## Webhook Signatures

Webhook requests include:

- `x-fiberpass-delivery`
- `x-fiberpass-event`
- `x-fiberpass-timestamp`
- `x-fiberpass-signature`

The signature is `sha256=` plus HMAC-SHA256 over `timestamp + '.' + rawBody` using the app webhook signing secret.
