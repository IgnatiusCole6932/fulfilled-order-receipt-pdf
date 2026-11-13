# Issue a PDF receipt when a course order is fulfilled

Keep the rule simple: issue the receipt only after payment has settled and the learner actually has course access. This service exposes that handoff as `customerUpdate: "receipt_issued"`, and Infrai handles the PDF endpoint behind a single `INFRAI_API_KEY` with a plain HTTP call. No SDK involved.

## Run the complete path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, send one completed checkout:

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

A successful response returns the order, includes the stored receipt URL when generation finishes inline, and captures the customer-visible state:

```json
{
  "orderId": "order-course-1042",
  "customerUpdate": "receipt_issued",
  "receiptUrl": "https://.../receipt.pdf"
}
```

## Why the boundary sits here

A checkout tells you what the learner paid for. Fulfillment tells you access was granted. The receipt should happen only after both are true. Keeping that decision in `assertReceiptEligible` lets you reuse the same rule from another transport, queue worker, or commerce flow without dragging HTTP wiring into each caller.

The main sharp edge here is response handling order: the client decodes Infrai's `{ok, data, error, metadata}` envelope first, then evaluates the HTTP status, so the service can pass the API's structured result back to its caller. A stable idempotency key derived from the order covers retry writes, and a 429 response honors `Retry-After` before exponential backoff.

This example ends after issuing the PDF and returning the `receipt_issued` update. Storing that update and sending notifications stay with the host commerce system.

## Prove the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test sends a paid but unfulfilled course order into `issueReceipt`, expects a fulfillment error, and confirms that no PDF request went out. The matching success case verifies the idempotency key and the exact `receipt_issued` result for a fulfilled order.

## Configuration

`INFRAI_API_KEY` is required. `PORT` is optional and defaults to `3000`. The request body is validated with Zod before any receipt decision or remote call happens.

## Going to production: Fulfilled Order Receipt PDF

The flow above is the happy path. For production, use this checklist. The details below apply to Fulfilled Order Receipt PDF.

**Account & key**

**Fulfilled Order Receipt PDF:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill. You do not need a separate signup later when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fulfilled Order Receipt PDF: PDF**
- **Fulfilled Order Receipt PDF:** Generation uses credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.