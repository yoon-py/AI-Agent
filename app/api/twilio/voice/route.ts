import twilio from "twilio";
import {
  assignCallContact,
  createCall,
  createContact,
  findContactByPhoneE164,
  getContactById,
  resolveQuestionSetForContact,
  setCallLanguageAndQuestionSet,
  updateCallStatus
} from "@/lib/db";
import type { CallLanguage } from "@/lib/domain";
import {
  inferPhoneDefaultsFromE164,
  isCallLanguage,
  resolveCallLanguagePreference
} from "@/lib/domain";
import { getEnv } from "@/lib/env";

function toWebSocketBaseUrl(appBaseUrl: string): string {
  if (appBaseUrl.startsWith("https://")) {
    return appBaseUrl.replace("https://", "wss://");
  }
  if (appBaseUrl.startsWith("http://")) {
    return appBaseUrl.replace("http://", "ws://");
  }
  return appBaseUrl;
}

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8"
    }
  });
}

function inferInboundContactName(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `수신자 ${digits.slice(-4)}`;
  }
  return "수신자";
}

function inboundGreetingText(language: CallLanguage): string {
  if (language === "en") {
    return "Hello. This is Alloy. Please wait a moment while we connect you.";
  }
  if (language === "da") {
    return "Hej. Det er Alloy. Vent venligst et øjeblik.";
  }
  if (language === "ar-EG") {
    return "أهلًا. معاك Alloy. استنى لحظة واحدة.";
  }
  if (language === "az") {
    return "Salam. Mən Alloyam. Bir saniyə gözləyin.";
  }
  return "안녕하세요. Alloy입니다. 잠시 후 대화를 시작하겠습니다.";
}

function inboundGreetingSayLanguage(
  language: CallLanguage
): "ko-KR" | "en-US" | "da-DK" | null {
  if (language === "en") {
    return "en-US";
  }
  if (language === "da") {
    return "da-DK";
  }
  if (language === "ar-EG" || language === "az") {
    return null;
  }
  return "ko-KR";
}

type TwilioVoicePayload = {
  callSid: string;
  callStatus: string;
  inboundFrom: string;
  direction: string;
  contactIdParam: string;
  callLanguageParam: string;
};

async function extractTwilioVoicePayload(
  request: Request,
  url: URL
): Promise<TwilioVoicePayload> {
  let formData: FormData | null = null;
  if (request.method !== "GET") {
    try {
      formData = await request.formData();
    } catch {
      formData = null;
    }
  }

  const read = (key: string): string => {
    const fromForm = formData?.get(key);
    if (typeof fromForm === "string" && fromForm.trim()) {
      return fromForm.trim();
    }
    return String(url.searchParams.get(key) || "").trim();
  };

  return {
    callSid: read("CallSid"),
    callStatus: read("CallStatus") || "in-progress",
    inboundFrom: read("From"),
    direction: read("Direction").toLowerCase(),
    contactIdParam: read("contactId"),
    callLanguageParam: read("callLanguage")
  };
}

async function resolveContactForVoice(params: {
  contactId: number;
  inboundFrom: string;
}) {
  if (Number.isFinite(params.contactId) && params.contactId > 0) {
    return await getContactById(params.contactId);
  }

  const inboundFrom = params.inboundFrom.trim();
  if (!inboundFrom) {
    return undefined;
  }

  const existing = await findContactByPhoneE164(inboundFrom);
  if (existing) {
    return existing;
  }

  const profile = inferPhoneDefaultsFromE164(inboundFrom);
  const newContactId = await createContact(
    {
      name: inferInboundContactName(inboundFrom),
      phone: inboundFrom,
      phoneRaw: inboundFrom.replace(/\D/g, ""),
      countryIso2: profile.countryIso2,
      dialCode: profile.dialCode,
      preferredLanguage: profile.preferredLanguage,
      note: "Auto-created from inbound call"
    },
    { allowExisting: true }
  );

  return await getContactById(newContactId);
}

async function handleVoiceRequest(request: Request): Promise<Response> {
  const env = getEnv();
  const url = new URL(request.url);
  const payload = await extractTwilioVoicePayload(request, url);

  const contactId = Number(url.searchParams.get("contactId") || payload.contactIdParam || 0);
  const requestedLanguage = String(
    url.searchParams.get("callLanguage") || payload.callLanguageParam || ""
  );
  const hasExplicitContact = Number.isFinite(contactId) && contactId > 0;
  const isInboundCall =
    payload.direction.startsWith("inbound") ||
    (!hasExplicitContact && payload.inboundFrom.length > 0);

  const contact = await resolveContactForVoice({
    contactId: isInboundCall ? 0 : contactId,
    inboundFrom: payload.inboundFrom
  });
  if (!contact || !payload.callSid) {
    const response = new twilio.twiml.VoiceResponse();
    response.say({ language: "en-US" }, "A setup error occurred. Please try again later.");
    response.hangup();
    return xmlResponse(response.toString());
  }

  const explicitLanguage =
    requestedLanguage && isCallLanguage(requestedLanguage) ? requestedLanguage : null;
  const callLanguage =
    explicitLanguage ||
    resolveCallLanguagePreference({
      preferredLanguage: contact.preferred_language,
      phoneE164: contact.phone_e164,
      defaultLanguage: env.DEFAULT_CALL_LANGUAGE
    });
  const { questionSet } = await resolveQuestionSetForContact(contact.id);

  await createCall(contact.id, payload.callSid, payload.callStatus, {
    callLanguage,
    questionSetId: questionSet?.id ?? null
  });
  await assignCallContact(payload.callSid, contact.id);
  await setCallLanguageAndQuestionSet(payload.callSid, callLanguage, questionSet?.id ?? null);
  await updateCallStatus(payload.callSid, payload.callStatus);

  const response = new twilio.twiml.VoiceResponse();
  if (isInboundCall) {
    const sayLanguage = inboundGreetingSayLanguage(callLanguage);
    const greetingText = inboundGreetingText(callLanguage);
    if (sayLanguage) {
      response.say({ language: sayLanguage }, greetingText);
    } else {
      response.say(greetingText);
    }
  }
  const connect = response.connect();
  const stream = connect.stream({
    url: `${toWebSocketBaseUrl(env.APP_BASE_URL)}/media-stream`
  });
  stream.parameter({ name: "callSid", value: payload.callSid });
  stream.parameter({ name: "contactId", value: String(contact.id) });
  stream.parameter({ name: "contactName", value: contact.name });
  stream.parameter({ name: "contactNote", value: contact.note || "" });
  stream.parameter({ name: "callLanguage", value: callLanguage });
  stream.parameter({
    name: "callContextUrl",
    value: `${env.APP_BASE_URL}/api/internal/call-context`
  });
  stream.parameter({ name: "agentName", value: env.AGENT_NAME });

  return xmlResponse(response.toString());
}

export async function POST(request: Request): Promise<Response> {
  return handleVoiceRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleVoiceRequest(request);
}
