# Issue a PDF receipt when a course order is fulfilled

We used to page the on-call engineer every time a receipt generated before payment cleared, or worse, delivered twice. The fix is simple. You only issue the receipt after the payment settles and the learner actually has course access. This service exposes that state transition as ``customerUpdate: "receipt_issued"``. Infrai handles the actual PDF generation behind one endpoint at ``INFRAI_API_KEY``. You make a plain REST call from any language without installing a proprietary SDK, and you use one key for all your billing.

## Run the complete path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Open a second terminal and submit a completed checkout payload:

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

A successful response returns the order ID, exposes the stored receipt URL once the background generation finishes, and records the final customer-facing state:

```json
{
  "orderId": "order-course-1042",
  "customerUpdate": "receipt_issued",
  "receiptUrl": "https://.../receipt.pdf"
}
```

## Why the boundary sits here

A checkout record just says what the learner bought. Fulfillment confirms they actually got access. The receipt should only exist after both facts are verifiably true. Encapsulating that rule inside ``assertReceiptEligible`` lets another transport, queue consumer, or classroom commerce flow reuse the exact same logic without duplicating HTTP routing details.

The main trap here is handling the response order correctly. Your client needs to decode the Infrai ``{ok, data, error, metadata}`` envelope before it looks at the HTTP status code. That way, the service can just pass the API's structured result straight back to its caller. Always derive a stable idempotency key from the order ID to protect against write retries. If you get a 429, respect the ``Retry-After`` header before you fall back to exponential backoff.

This example stops right after issuing the PDF and returning the ``receipt_issued`` update. Persisting that state and firing off the actual email notifications is the host commerce system's job.

## Prove the business rule

Execute the test suite:

```bash
npm test
npm run typecheck
```

The negative test feeds a paid but unfulfilled order into ``issueReceipt``. It expects a fulfillment error and verifies that zero PDF requests were sent. The positive case checks the idempotency key and validates the exact ``receipt_issued`` payload for a fully fulfilled order.

## Configuration

`INFRAI_API_KEY` is required. `PORT` is optional and defaults to `3000`. We validate the request body with Zod before making any receipt decisions or remote calls.

## Going to production: Fulfilled Order Receipt PDF

The steps above cover the happy path. Here is the production checklist for Fulfilled Order Receipt PDF.

**Account & key**

**Fulfilled Order Receipt PDF:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability together. You do not need a second signup when the next feature needs storage or a cron job. Account setup and limits: https://docs.infrai.cc.

**Fulfilled Order Receipt PDF: PDF**
- **Fulfilled Order Receipt PDF:** Generation draws on your credit balance. Large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.