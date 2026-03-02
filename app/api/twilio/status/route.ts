import {
  finalizeCallStatus,
  findCallBySid,
  getTranscriptForCall,
  setCallSummary,
  updateCallStatus
} from "@/lib/db";
import { summarizeCallTranscript } from "@/lib/openai";

const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled"
]);

async function trySummarizeCall(callSid: string): Promise<void> {
  const call = findCallBySid(callSid);
  if (!call || call.summary) {
    return;
  }

  const history = getTranscriptForCall(call.id);
  try {
    const summary = await summarizeCallTranscript({
      contactName: call.contact_name,
      history
    });
    setCallSummary(call.id, summary);
  } catch (error) {
    console.error("[twilio/status] summary generation failed", {
      callSid,
      error: error instanceof Error ? error.message : String(error)
    });
    setCallSummary(call.id, "요약 생성 실패: API 상태를 확인해주세요.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();

  const callSid = String(formData.get("CallSid") ?? "");
  const callStatus = String(formData.get("CallStatus") ?? "").toLowerCase();

  if (!callSid) {
    return Response.json({ ok: true });
  }

  if (callStatus) {
    updateCallStatus(callSid, callStatus);
  }

  if (TERMINAL_STATUSES.has(callStatus)) {
    finalizeCallStatus(callSid, callStatus);
  }

  if (callStatus === "completed") {
    await trySummarizeCall(callSid);
  }

  return Response.json({ ok: true });
}
