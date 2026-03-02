import twilio from "twilio";
import {
  createCall,
  findCallBySid,
  getContactById,
  updateCallStatus
} from "@/lib/db";
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

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const url = new URL(request.url);
  const contactId = Number(url.searchParams.get("contactId"));

  const formData = await request.formData();
  const callSid = String(formData.get("CallSid") ?? "");
  const callStatus = String(formData.get("CallStatus") ?? "in-progress");

  const contact = Number.isFinite(contactId) ? getContactById(contactId) : undefined;
  if (!contact || !callSid) {
    const response = new twilio.twiml.VoiceResponse();
    response.say({ language: "ko-KR" }, "통화 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
    response.hangup();
    return xmlResponse(response.toString());
  }

  const existing = findCallBySid(callSid);
  existing?.id ?? createCall(contact.id, callSid, callStatus);
  updateCallStatus(callSid, callStatus);

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const stream = connect.stream({
    url: `${toWebSocketBaseUrl(env.APP_BASE_URL)}/media-stream`
  });
  stream.parameter({ name: "callSid", value: callSid });
  stream.parameter({ name: "contactId", value: String(contact.id) });
  stream.parameter({ name: "contactName", value: contact.name });
  stream.parameter({ name: "contactNote", value: contact.note || "" });
  stream.parameter({ name: "agentName", value: env.AGENT_NAME });

  return xmlResponse(response.toString());
}
