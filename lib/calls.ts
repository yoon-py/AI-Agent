import { createCall, getContactById } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getTwilioClient } from "@/lib/twilio";

export async function startOutboundCall(contactId: number): Promise<{ callSid: string }> {
  const contact = getContactById(contactId);
  if (!contact) {
    throw new Error("통화할 연락처를 찾을 수 없습니다.");
  }

  const env = getEnv();
  const client = getTwilioClient();

  const twilioCall = await client.calls.create({
    to: contact.phone,
    from: env.TWILIO_PHONE_NUMBER,
    url: `${env.APP_BASE_URL}/api/twilio/voice?contactId=${contact.id}`,
    statusCallback: `${env.APP_BASE_URL}/api/twilio/status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
  });

  createCall(contact.id, twilioCall.sid, twilioCall.status ?? "queued");

  return { callSid: twilioCall.sid };
}
