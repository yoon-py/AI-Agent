import { z } from "zod";
import { addCallMessage, createCall, createContact, findCallBySid } from "@/lib/db";
import { isWorkerWebhookAuthorized } from "@/lib/internal-auth";
import { runCompletedCallPipeline } from "@/lib/call-completion";

const payloadSchema = z.object({
  callSid: z.string().min(1),
  role: z.enum(["assistant", "user", "system"]),
  text: z.string().min(1).max(4000)
});

async function ensureCallExists(callSid: string) {
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
      note: "Auto-created from transcript webhook"
    },
    { allowExisting: true }
  );
  await createCall(contactId, callSid, "in-progress", {
    callLanguage: "ko",
    questionSetId: null
  });
  return await findCallBySid(callSid);
}

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

  const call = await ensureCallExists(parsed.callSid);
  if (!call) {
    return Response.json({ ok: false, error: "call_create_failed" }, { status: 500 });
  }

  await addCallMessage(call.id, parsed.role, parsed.text);

  // MEDIA_STREAM_DISCONNECTED는 Realtime Worker가 보내는 마지막 이벤트.
  // 이 시점에서 모든 user/assistant 메시지가 이미 저장되었으므로
  // 파이프라인(체크리스트 추출 + 요약)을 안전하게 실행할 수 있음.
  if (parsed.role === "system" && parsed.text === "MEDIA_STREAM_DISCONNECTED") {
    await runCompletedCallPipeline(parsed.callSid);
  }

  return Response.json({ ok: true });
}
