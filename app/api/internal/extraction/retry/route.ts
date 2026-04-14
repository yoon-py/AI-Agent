import { z } from "zod";
import { findCallBySid, getCallById } from "@/lib/db";
import { isWorkerWebhookAuthorized } from "@/lib/internal-auth";
import { runCompletedCallPipeline } from "@/lib/call-completion";

const payloadSchema = z.object({
  callId: z.number().int().positive().optional(),
  callSid: z.string().min(1).optional()
});

export async function POST(request: Request): Promise<Response> {
  if (!isWorkerWebhookAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  let callSid = parsed.callSid || "";
  if (!callSid && parsed.callId) {
    const call = await getCallById(parsed.callId);
    callSid = call?.twilio_call_sid || "";
  }

  if (!callSid) {
    return Response.json({ ok: false, error: "call_not_found" }, { status: 404 });
  }

  const call = await findCallBySid(callSid);
  if (!call) {
    return Response.json({ ok: false, error: "call_not_found" }, { status: 404 });
  }

  await runCompletedCallPipeline(callSid);

  return Response.json({ ok: true, callSid });
}
