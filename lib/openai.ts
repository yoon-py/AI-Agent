import OpenAI from "openai";
import type { CallMessage } from "@/lib/db";
import { getEnv } from "@/lib/env";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const env = getEnv();
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return openaiClient;
}

const SYSTEM_PROMPT = `너는 혼자 사는 청년/어르신을 위한 안부 통화 도우미다.
자연스럽고 따뜻하지만 과한 감정 표현은 피하고, 짧고 명확하게 답해라.
다음 원칙을 지켜라:
1) 의료/법률/재정 확답 금지, 필요 시 전문가 상담 권유.
2) 자해/응급 징후가 있으면 즉시 안전 확인 질문과 도움 요청 권고.
3) 한 번에 1~2문장으로만 답해라.
4) 45자 이내의 짧은 한국어 문장을 우선 사용해라.
5) 필요할 때만 마지막에 짧은 질문 하나를 붙여라.
6) 한국어로 답해라.`;

const END_CALL_PATTERN = /(그만|종료|끊어|bye|바이|다음에|이만)/i;

export async function generateAssistantReply(params: {
  contactName: string;
  userText: string;
  history: CallMessage[];
}): Promise<{ text: string; endCall: boolean }> {
  const { userText, history, contactName } = params;

  if (END_CALL_PATTERN.test(userText)) {
    return {
      text: `${contactName}님, 오늘 이야기 고마워요. 편안한 저녁 보내시고 다음에 또 통화할게요.`,
      endCall: true
    };
  }

  const client = getClient();
  const env = getEnv();

  const input = [
    {
      role: "system" as const,
      content: `${SYSTEM_PROMPT}\n대화 상대 이름: ${contactName}`
    },
    ...history
      .filter((message) => message.role === "assistant" || message.role === "user")
      .map((message) => ({
        role: message.role,
        content: message.text
      })),
    {
      role: "user" as const,
      content: userText
    }
  ];

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input,
    temperature: 0.4,
    max_output_tokens: 100
  });

  const text = response.output_text?.trim() || "잘 들었어요. 오늘은 어떤 하루였는지 조금 더 들려주실래요?";

  return {
    text,
    endCall: false
  };
}

export async function summarizeCallTranscript(params: {
  contactName: string;
  history: CallMessage[];
}): Promise<string> {
  const { contactName, history } = params;

  if (history.length === 0) {
    return "대화 내용이 기록되지 않았습니다.";
  }

  const transcript = history
    .map((item) => `${item.role === "assistant" ? "AI" : "사용자"}: ${item.text}`)
    .join("\n");

  const client = getClient();
  const env = getEnv();

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "너는 통화 요약기다. 3줄 이내로 핵심만 요약하고, 마지막 줄에 현재 정서 상태(안정/주의/위험 중 하나) 태그를 붙여라."
      },
      {
        role: "user",
        content: `대화 상대: ${contactName}\n다음 통화 로그를 요약해줘.\n${transcript}`
      }
    ],
    max_output_tokens: 180
  });

  return response.output_text?.trim() || "요약 생성에 실패했습니다.";
}
