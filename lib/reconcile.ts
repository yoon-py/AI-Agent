import {
  finalizeCallStatus,
  findCallBySid,
  getTranscriptForCall,
  listStaleActiveCalls,
  setCallSummary,
  updateCallStatus
} from "@/lib/db";
import { summarizeCallTranscript } from "@/lib/openai";
import { getTwilioClient } from "@/lib/twilio";

const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled"
]);

export async function trySummarizeCompletedCall(callSid: string): Promise<void> {
  const call = findCallBySid(callSid);
  if (!call || call.summary) {
    return;
  }

  try {
    const history = getTranscriptForCall(call.id);
    const summary = await summarizeCallTranscript({
      contactName: call.contact_name,
      history
    });
    setCallSummary(call.id, summary);
  } catch {
    setCallSummary(call.id, "요약 생성 실패: API 상태를 확인해주세요.");
  }
}

export async function reconcileRecentCalls(limit = 8): Promise<void> {
  const staleCalls = listStaleActiveCalls(limit, 45);
  if (staleCalls.length === 0) {
    return;
  }

  let client: ReturnType<typeof getTwilioClient>;
  try {
    client = getTwilioClient();
  } catch {
    return;
  }

  for (const localCall of staleCalls) {
    try {
      const remoteCall = await client.calls(localCall.twilio_call_sid).fetch();
      const remoteStatus = String(remoteCall.status ?? localCall.status).toLowerCase();

      if (TERMINAL_STATUSES.has(remoteStatus)) {
        finalizeCallStatus(localCall.twilio_call_sid, remoteStatus);
        if (remoteStatus === "completed") {
          await trySummarizeCompletedCall(localCall.twilio_call_sid);
        }
        continue;
      }

      if (remoteStatus && remoteStatus !== localCall.status) {
        updateCallStatus(localCall.twilio_call_sid, remoteStatus);
      }
    } catch {
      // Ignore temporary Twilio lookup failures during dashboard refresh.
    }
  }
}
