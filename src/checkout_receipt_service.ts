import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import {
  InfraiError,
  ReceiptNotReadyError,
  issueReceipt,
  receiptRequestSchema
} from "./receipt_issuer.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service.");

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/receipts") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const order = receiptRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await issueReceipt(order, apiKey);
    send(response, 201, result);
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid checkout payload", issues: error.issues });
    } else if (error instanceof ReceiptNotReadyError) {
      send(response, error.status, { error: error.message });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message, code: error.code });
    } else {
      send(response, 500, { error: "Could not issue receipt" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Receipt service listening on http://localhost:${port}`));
