import type { CallLanguage } from "@/lib/domain";
import { resolveCallLanguagePreference } from "@/lib/domain";
import {
  createCall,
  getContactById,
  resolveQuestionSetForContact
} from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getTwilioClient } from "@/lib/twilio";

type StartCallResult =
  | { ok: true; callSid: string; callLanguage: CallLanguage }
  | { ok: false; error: string };

function toSafeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const maybeMessage = Reflect.get(error, "message");
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim().slice(0, 220);
    }
  }
  return "Failed to start call.";
}

export async function startOutboundCall(
  contactId: number
): Promise<StartCallResult> {
  const contact = await getContactById(contactId);
  if (!contact) {
    return { ok: false, error: "Contact not found." };
  }

  try {
    const env = getEnv();
    const client = getTwilioClient();
    const webhookBaseUrl = env.CALL_WEBHOOK_BASE_URL || env.APP_BASE_URL;

    const callLanguage = resolveCallLanguagePreference({
      preferredLanguage: contact.preferred_language,
      phoneE164: contact.phone_e164,
      defaultLanguage: env.DEFAULT_CALL_LANGUAGE
    });

    const { questionSet } = await resolveQuestionSetForContact(contact.id);

    const voiceUrl = new URL(`${webhookBaseUrl}/api/twilio/voice`);
    voiceUrl.searchParams.set("contactId", String(contact.id));
    voiceUrl.searchParams.set("callLanguage", callLanguage);
    voiceUrl.searchParams.set("contactName", contact.name);

    const twilioCall = await client.calls.create({
      to: contact.phone_e164,
      from: env.TWILIO_PHONE_NUMBER,
      url: voiceUrl.toString(),
      statusCallback: `${webhookBaseUrl}/api/twilio/status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
    });

    await createCall(contact.id, twilioCall.sid, twilioCall.status ?? "queued", {
      callLanguage,
      questionSetId: questionSet?.id ?? null
    });

    return {
      ok: true,
      callSid: twilioCall.sid,
      callLanguage
    };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error) };
  }
}
