import twilio from "twilio";
import {
  addCallMessage,
  findCallBySid,
  getRecentCallMessages,
  updateCallStatus
} from "@/lib/db";
import { synthesizeToPublicAudio } from "@/lib/elevenlabs";
import { getEnv } from "@/lib/env";
import { generateAssistantReply } from "@/lib/openai";

function buildSpeechHints(contactName: string): string {
  return [
    contactName,
    "안녕하세요",
    "네",
    "아니요",
    "괜찮아요",
    "힘들어요",
    "외로워요",
    "아파요",
    "잘 지내요",
    "오늘",
    "밥",
    "잠",
    "통화 종료",
    "다음에 이야기해요"
  ].join(",");
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
  const formData = await request.formData();

  const callSid = String(formData.get("CallSid") ?? "");
  const speechResult = String(formData.get("SpeechResult") ?? "").trim();
  const confidence = Number(formData.get("Confidence") ?? 0);

  const call = callSid ? findCallBySid(callSid) : undefined;
  const response = new twilio.twiml.VoiceResponse();

  if (!call) {
    response.say({ language: "ko-KR" }, "통화 정보를 찾을 수 없어 종료합니다.");
    response.hangup();
    return xmlResponse(response.toString());
  }

  updateCallStatus(callSid, "in-progress");

  let assistantText = "죄송해요, 잘 들리지 않았어요. 한 번만 다시 말씀해주실래요?";
  let shouldHangup = false;

  if (speechResult && confidence >= 0.35) {
    addCallMessage(call.id, "user", speechResult);

    const history = getRecentCallMessages(call.id, 14);
    try {
      const generated = await generateAssistantReply({
        contactName: call.contact_name,
        userText: speechResult,
        history
      });

      assistantText = generated.text;
      shouldHangup = generated.endCall;
    } catch {
      assistantText =
        "지금 답변 연결이 잠시 불안정해요. 조금 천천히 다시 말씀해주실래요?";
      shouldHangup = false;
      addCallMessage(call.id, "system", "OPENAI_ERROR");
    }
  } else if (speechResult) {
    addCallMessage(call.id, "system", `LOW_CONFIDENCE:${confidence.toFixed(2)}:${speechResult}`);
    assistantText = "제가 조금 잘못 들었어요. 한 번만 천천히 다시 말씀해주실래요?";
  }

  addCallMessage(call.id, "assistant", assistantText);

  try {
    const audioUrl = await synthesizeToPublicAudio(
      assistantText,
      callSid,
      shouldHangup ? "goodbye" : "reply"
    );

    if (shouldHangup) {
      response.play(audioUrl);
      response.hangup();
    } else {
      const gather = response.gather({
        input: ["speech"],
        language: "ko-KR",
        speechModel: "phone_call",
        hints: buildSpeechHints(call.contact_name),
        profanityFilter: false,
        actionOnEmptyResult: true,
        speechTimeout: "auto",
        timeout: 3,
        action: `${env.APP_BASE_URL}/api/twilio/respond`,
        method: "POST"
      });
      gather.play(audioUrl);
      response.redirect({ method: "POST" }, `${env.APP_BASE_URL}/api/twilio/respond`);
    }
  } catch (error) {
    console.error("[twilio/respond] ElevenLabs TTS synth failed", {
      callSid,
      error: error instanceof Error ? error.message : String(error)
    });
    response.say({ language: "ko-KR" }, assistantText);
    if (shouldHangup) {
      response.hangup();
    } else {
      response.redirect({ method: "POST" }, `${env.APP_BASE_URL}/api/twilio/respond`);
    }
  }

  return xmlResponse(response.toString());
}
