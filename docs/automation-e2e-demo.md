# FiberPass Automation E2E Demo

This flow uses real API state. It does not seed fake balances, fake sessions, or fake payments. Before running it, create and fund a JoyID-backed wallet, create an active FiberPass session for the app, and prepare real Fiber invoice/payment request strings for each recipient.

## Prerequisites

- Backend API running with MongoDB and Fiber RPC configured.
- Frontend connected through JoyID so you can copy a current `fiberpass:auth-token` value from browser local storage.
- A developer app whose service address matches the FiberPass session.
- An active FiberPass session created with automation enabled.
- One or more CKB/Fiber recipient addresses.
- One Fiber invoice/payment request per recipient.

## Terminals

Run these processes in separate backend terminals:

```bash
npm run dev
npm run worker:payments
npm run worker:webhooks
```

`worker:webhooks` is only needed if the app has a webhook URL configured.

## Demo Runner

Set real values and run:

```bash
export FIBERPASS_API_URL=http://localhost:4000
export FIBERPASS_AUTH_TOKEN=eyJ...
export FIBERPASS_APP_ID=fp_app_...
export FIBERPASS_SESSION_ID=fp_pass_...
export FIBERPASS_DEMO_RECIPIENTS='[
  {"name":"Alice","serviceAddress":"ckt1...","amount":"1.25","fiberInvoice":"fiber-invoice-1"},
  {"name":"Bob","serviceAddress":"ckt1...","amount":"0.75","fiberInvoice":"fiber-invoice-2"}
]'

npm run demo:automation
```

Optional webhook setup in the same run:

```bash
export FIBERPASS_WEBHOOK_URL=https://app.example/fiberpass-webhooks
export FIBERPASS_WEBHOOK_SECRET=replace-with-app-secret
```

## Expected Flow

1. The script creates recipients under the developer app.
2. The script creates a batch of invoices attached to the active FiberPass session.
3. The script queues the batch.
4. `worker:payments` locks queued jobs, calls the normal `chargeSession` path, and updates invoice/job/batch status.
5. The user dashboard balance and automation tab reflect spending as live session state changes.
6. If the user pauses, revokes, closes, expires, or exhausts the pass, the worker cancels unsafe queued work and records failure reasons.
7. If webhooks are configured, `worker:webhooks` signs and retries webhook deliveries for `invoice.paid`, `invoice.failed`, `batch.completed`, and `session.limit_exhausted`.

## Manual Recovery Checks

- Open the frontend Automation tab to verify invoice and batch status.
- Open Developer Apps to verify recipients, payment jobs, API key scopes, and webhook delivery logs.
- Query `GET /apps/:appId/payment-jobs` to inspect worker attempts.
- Query `GET /apps/:appId/webhook-deliveries` to inspect webhook attempts.
