import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function isWorkerWebhookAuthorized(request: Request): boolean {
  const env = getEnv();
  const expected = (env.WORKER_WEBHOOK_SECRET || "").trim();
  if (!expected) {
    // If secret is not set, keep backward-compatible open mode.
    return true;
  }
  const incoming = (request.headers.get("x-worker-secret") || "").trim();
  if (!incoming) {
    return false;
  }
  return safeEqual(incoming, expected);
}
