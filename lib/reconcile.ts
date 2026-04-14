import {
  finalizeCallStatus,
  findCallBySid,
  listStaleActiveCalls,
  updateCallStatus
} from "@/lib/db";
import { runCompletedCallPipeline } from "@/lib/call-completion";
import { getTwilioClient } from "@/lib/twilio";

const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled"
]);

export async function reconcileRecentCalls(limit = 8): Promise<void> {
  const staleCalls = await listStaleActiveCalls(limit, 45);
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
        await finalizeCallStatus(localCall.twilio_call_sid, remoteStatus);
        if (remoteStatus === "completed") {
          await runCompletedCallPipeline(localCall.twilio_call_sid);
        }
        continue;
      }

      if (remoteStatus && remoteStatus !== localCall.status) {
        await updateCallStatus(localCall.twilio_call_sid, remoteStatus);
      }
    } catch {
      // Ignore temporary Twilio lookup failures during dashboard refresh.
    }
  }
}

export async function trySummarizeCompletedCall(callSid: string): Promise<void> {
  const call = await findCallBySid(callSid);
  if (!call) {
    return;
  }
  await runCompletedCallPipeline(callSid);
}
