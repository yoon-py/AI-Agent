import {
  createCall,
  createContact,
  finalizeCallStatus,
  findCallBySid,
  updateCallStatus
} from "@/lib/db";
import { isWorkerWebhookAuthorized } from "@/lib/internal-auth";

const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled"
]);

async function ensureCallExists(callSid: string, status: string) {
  const existing = await findCallBySid(callSid);
  if (existing) {
    return existing;
  }

  const contactId = await createContact(
    {
      name: "Unknown Contact",
      phone: `unknown-${callSid}`,
      phoneRaw: callSid.replace(/\D/g, "").slice(0, 14),
      countryIso2: "KR",
      dialCode: "+82",
      preferredLanguage: "ko",
      note: "Auto-created from status webhook"
    },
    { allowExisting: true }
  );

  await createCall(contactId, callSid, status || "in-progress", {
    callLanguage: "ko",
    questionSetId: null
  });
  return await findCallBySid(callSid);
}

export async function POST(request: Request): Promise<Response> {
  if (!isWorkerWebhookAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();

  const callSid = String(formData.get("CallSid") ?? "");
  const callStatus = String(formData.get("CallStatus") ?? "").toLowerCase();

  if (!callSid) {
    return Response.json({ ok: true });
  }

  await ensureCallExists(callSid, callStatus);

  if (callStatus) {
    await updateCallStatus(callSid, callStatus);
  }

  if (TERMINAL_STATUSES.has(callStatus)) {
    await finalizeCallStatus(callSid, callStatus);
  }

  // NOTE: 파이프라인(요약/추출)은 여기서 실행하지 않음.
  // transcript webhook의 MEDIA_STREAM_DISCONNECTED 이벤트에서 실행하여
  // 모든 대화 메시지가 저장된 후 파이프라인이 동작하도록 보장함.

  return Response.json({ ok: true });
}
