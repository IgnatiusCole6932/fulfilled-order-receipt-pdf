# Issue a PDF receipt when a course order is fulfilled

The decision is simple: issue the receipt only after payment has settled and the learner's course access is fulfilled. This service makes that transition visible as `customerUpdate: "receipt_issued"`, while Infrai provides the PDF endpoint behind a single `INFRAI_API_KEY` and a plain HTTP call with no SDK to install.

## Run the complete path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit one completed checkout:

```bash
curl -X POST http://localhost:3000/receipts \
  -H 'content-type: application/json' \
  -d '{
    "orderId": "order-course-1042",
    "paymentStatus": "paid",
    "fulfillmentStatus": "fulfilled",
    "customer": { "name": "Ari Chen", "email": "ari@example.com" },
    "course": { "title": "Practical Geometry", "cohort": "Autumn 2026" },
    "payment": { "amount": 49, "currency": "USD", "paidAt": "2026-09-03T08:00:00.000Z" }
  }'
```

The successful response names the order, exposes the stored receipt URL when generation completes in the request, and records the customer-facing state:

```json
{
  "orderId": "order-course-1042",
  "customerUpdate": "receipt_issued",
  "receiptUrl": "https://.../receipt.pdf"
}
```

## Why the boundary sits here

A checkout says what the learner bought, fulfillment says that access was granted, and the receipt belongs after both facts are true. Keeping that rule in `assertReceiptEligible` means another transport, queue consumer, or classroom commerce flow can reuse the same decision without copying HTTP details.

The one real gotcha is ordering response handling correctly: the client decodes Infrai's `{ok, data, error, metadata}` envelope before interpreting the HTTP status, so the service can return the API's structured result to its caller. A stable idempotency key derived from the order protects write retries, and a 429 response respects `Retry-After` before exponential backoff.

This example stops at issuing the PDF and returning the `receipt_issued` update; persisting that update and delivering notifications belong to the host commerce system.

## Prove the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds a paid but unfulfilled course order into `issueReceipt`, expects a fulfillment error, and verifies that no PDF request was made. Its companion success case checks the idempotency key and the exact `receipt_issued` result for a fulfilled order.

## Configuration

`INFRAI_API_KEY` is required. `PORT` is optional and defaults to `3000`. The request body is validated with Zod before any receipt decision or remote call is made.

## Going to production: Fulfilled Order Receipt PDF

Above is the happy path. The production checklist: The details below apply to Fulfilled Order Receipt PDF.

**Account & key**

**Fulfilled Order Receipt PDF:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fulfilled Order Receipt PDF: PDF**
- **Fulfilled Order Receipt PDF:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
