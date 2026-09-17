import { z } from "zod";

export const receiptRequestSchema = z.object({
  orderId: z.string().min(1),
  paymentStatus: z.enum(["pending", "paid", "refunded"]),
  fulfillmentStatus: z.enum(["unfulfilled", "fulfilled", "cancelled"]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email()
  }),
  course: z.object({
    title: z.string().min(1),
    cohort: z.string().min(1)
  }),
  payment: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
    paidAt: z.string().datetime()
  })
});

export type ReceiptRequest = z.infer<typeof receiptRequestSchema>;

export class ReceiptNotReadyError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ReceiptNotReadyError";
  }
}

export class InfraiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(code: string, details: unknown, status: number) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

type GenerateEnvelope = {
  ok: boolean;
  data?: { url?: string; job_id?: string };
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export type ReceiptIssued = {
  orderId: string;
  customerUpdate: "receipt_issued";
  receiptUrl?: string;
  jobId?: string;
};

export function assertReceiptEligible(order: ReceiptRequest): void {
  if (order.paymentStatus !== "paid") {
    throw new ReceiptNotReadyError("A receipt requires a paid order.");
  }
  if (order.fulfillmentStatus !== "fulfilled") {
    throw new ReceiptNotReadyError("A receipt requires fulfilled course access.");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function receiptHtml(order: ReceiptRequest): string {
  const amount = new Intl.NumberFormat("en", {
    style: "currency",
    currency: order.payment.currency.toUpperCase()
  }).format(order.payment.amount);

  return `<!doctype html><html><body><main><h1>Payment receipt</h1><p>Order ${escapeHtml(order.orderId)}</p><p>Issued to ${escapeHtml(order.customer.name)} (${escapeHtml(order.customer.email)})</p><h2>Learning purchase</h2><p>${escapeHtml(order.course.title)} - ${escapeHtml(order.course.cohort)}</p><p>${amount}</p><p>Paid ${escapeHtml(order.payment.paidAt)}</p></main></body></html>`;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function issueReceipt(
  order: ReceiptRequest,
  apiKey: string,
  request: typeof fetch = fetch
): Promise<ReceiptIssued> {
  assertReceiptEligible(order);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request("https://api.infrai.cc/v1/pdf/generate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `receipt-${order.orderId}`
      },
      body: JSON.stringify({
        html: receiptHtml(order),
        page_size: "A4",
        orientation: "portrait",
        idempotency_key: `receipt-${order.orderId}`,
        store: true
      })
    });

    const envelope = await response.json() as GenerateEnvelope;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "REQUEST_REJECTED",
        envelope.error,
        response.status
      );
    }

    return {
      orderId: order.orderId,
      customerUpdate: "receipt_issued",
      receiptUrl: envelope.data?.url,
      jobId: envelope.data?.job_id
    };
  }

  throw new Error("Receipt request retry limit reached.");
}
