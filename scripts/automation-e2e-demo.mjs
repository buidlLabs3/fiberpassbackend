#!/usr/bin/env node

const apiUrl = (process.env.FIBERPASS_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const authToken = process.env.FIBERPASS_AUTH_TOKEN;
const appId = process.env.FIBERPASS_APP_ID;
const sessionId = process.env.FIBERPASS_SESSION_ID;
const webhookUrl = process.env.FIBERPASS_WEBHOOK_URL || '';
const webhookSecret = process.env.FIBERPASS_WEBHOOK_SECRET || '';

function usage() {
  console.error(`FiberPass automation E2E demo runner

Required env:
  FIBERPASS_AUTH_TOKEN       Wallet auth token from a real JoyID login
  FIBERPASS_APP_ID           Existing developer app id
  FIBERPASS_SESSION_ID       Active FiberPass session id for that app
  FIBERPASS_DEMO_RECIPIENTS  JSON array: [{"name":"Alice","serviceAddress":"ckt1...","amount":"1.25","fiberInvoice":"..."}]

Optional env:
  FIBERPASS_API_URL          API base URL, default http://localhost:4000
  FIBERPASS_WEBHOOK_URL      HTTPS webhook URL to configure before queuing
  FIBERPASS_WEBHOOK_SECRET   Signing secret, otherwise backend keeps/generates one
`);
}

if (!authToken || !appId || !sessionId || !process.env.FIBERPASS_DEMO_RECIPIENTS) {
  usage();
  process.exit(1);
}

let recipientsInput;
try {
  recipientsInput = JSON.parse(process.env.FIBERPASS_DEMO_RECIPIENTS);
} catch (error) {
  console.error('FIBERPASS_DEMO_RECIPIENTS must be valid JSON.');
  throw error;
}

if (!Array.isArray(recipientsInput) || recipientsInput.length === 0) {
  throw new Error('FIBERPASS_DEMO_RECIPIENTS must contain at least one recipient row.');
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + authToken,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error?.message || 'Request failed with ' + response.status;
    const code = body?.error?.code || 'REQUEST_FAILED';
    throw new Error(code + ': ' + message);
  }
  return body;
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object') throw new Error('Recipient row ' + index + ' must be an object.');
  const name = String(row.name || '').trim();
  const serviceAddress = String(row.serviceAddress || '').trim();
  const fiberInvoice = String(row.fiberInvoice || '').trim();
  const amount = Number(row.amount);
  if (!name || !serviceAddress || !fiberInvoice || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Recipient row ' + index + ' needs name, serviceAddress, amount, and fiberInvoice.');
  }
  return { name, serviceAddress, fiberInvoice, amount, description: String(row.description || name + ' payout').trim() };
}

const rows = recipientsInput.map(normalizeRow);

console.log('FiberPass automation E2E demo');
console.log('API:', apiUrl);
console.log('App:', appId);
console.log('Session:', sessionId);
console.log('Recipients:', rows.length);

if (webhookUrl) {
  console.log('Configuring webhook...');
  await request('/apps/' + encodeURIComponent(appId) + '/webhook', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl, ...(webhookSecret ? { signingSecret: webhookSecret } : {}) })
  });
}

const createdRecipients = [];
for (const row of rows) {
  console.log('Creating recipient:', row.name);
  const recipient = await request('/apps/' + encodeURIComponent(appId) + '/recipients', {
    method: 'POST',
    body: JSON.stringify({ name: row.name, serviceAddress: row.serviceAddress })
  });
  createdRecipients.push({ ...recipient, amount: row.amount, fiberInvoice: row.fiberInvoice, description: row.description });
}

console.log('Creating invoice batch...');
const batch = await request('/apps/' + encodeURIComponent(appId) + '/invoice-batches', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    description: 'FiberPass automation E2E demo batch',
    externalReference: 'demo-' + Date.now(),
    invoices: createdRecipients.map((recipient) => ({
      recipientId: recipient.id,
      amount: recipient.amount,
      fiberInvoice: recipient.fiberInvoice,
      description: recipient.description
    }))
  })
});

console.log('Queueing batch:', batch.id);
const queuedBatch = await request('/apps/' + encodeURIComponent(appId) + '/invoice-batches/' + encodeURIComponent(batch.id) + '/queue', {
  method: 'POST',
  body: JSON.stringify({})
});

console.log('Queued batch status:', queuedBatch.status);
console.log('Next: run npm run worker:payments in the backend process, and npm run worker:webhooks if webhook delivery is configured.');
console.log(JSON.stringify({ batchId: queuedBatch.id, invoiceCount: queuedBatch.invoiceCount, status: queuedBatch.status }, null, 2));
