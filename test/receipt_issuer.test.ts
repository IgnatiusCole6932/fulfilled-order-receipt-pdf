import assert from "node:assert/strict";
import test from "node:test";
import { issueReceipt, type ReceiptRequest } from "../src/receipt_issuer.js";

const fulfilledOrder: ReceiptRequest = {
  orderId: "order-course-1042",
  paymentStatus: "paid",
  fulfillmentStatus: "fulfilled",
  customer: { name: "Ari Chen", email: "ari@example.com" },
  course: { title: "Practical Geometry", cohort: "Autumn 2026" },
  payment: { amount: 49, currency: "USD", paidAt: "2026-09-03T08:00:00.000Z" }
};

test("issues one receipt and records the customer update after payment and fulfillment", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (_input, init) => {
    calls += 1;
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("idempotency-key"), "receipt-order-course-1042");
    return new Response(JSON.stringify({ ok: true, data: { url: "https://example.com/receipt.pdf" }, metadata: {} }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await issueReceipt(fulfilledOrder, "test-key", fakeFetch);
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    orderId: "order-course-1042",
    customerUpdate: "receipt_issued",
    receiptUrl: "https://example.com/receipt.pdf",
    jobId: undefined
  });
});

test("does not call PDF generation before course access is fulfilled", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async () => {
    calls += 1;
    throw new Error("unexpected request");
  };

  await assert.rejects(
    issueReceipt({ ...fulfilledOrder, fulfillmentStatus: "unfulfilled" }, "test-key", fakeFetch),
    /fulfilled course access/
  );
  assert.equal(calls, 0);
});
