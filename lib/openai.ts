import OpenAI from "openai";
import type { CallLanguage } from "@/lib/domain";
import type { CallMessage, ContactProfile, LocalizedQuestion } from "@/lib/db";
import { getEnv } from "@/lib/env";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const env = getEnv();
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return openaiClient;
}

type OpenAiInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ResponsePayload = {
  model: string;
  input: OpenAiInputMessage[];
  temperature?: number;
  max_output_tokens?: number;
};

export type ExtractedQuestionAnswer = {
  questionId: number;
  asked: boolean;
  answered: boolean;
  answerText: string;
  evidenceText: string;
  confidence: number | null;
  resolutionStatus: "resolved" | "unresolved";
};

const LANGUAGE_NAME: Record<CallLanguage, string> = {
  ko: "Korean",
  en: "English",
  da: "Danish",
  "ar-EG": "Arabic (Egypt)",
  az: "Azerbaijani"
};

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const asRecord = data as Record<string, unknown>;
  if (typeof asRecord.output_text === "string" && asRecord.output_text.trim()) {
    return asRecord.output_text.trim();
  }

  const output = Array.isArray(asRecord.output) ? asRecord.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        texts.push(text.trim());
      }
    }
  }
  return texts.join(" ").trim();
}

async function createResponseText(payload: ResponsePayload): Promise<string> {
  try {
    const client = getClient();
    const response = await client.responses.create(payload);
    return extractResponseText(response);
  } catch (sdkError) {
    const env = getEnv();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      const sdkMessage = sdkError instanceof Error ? sdkError.message : String(sdkError);
      throw new Error(
        `OpenAI Responses failed (${response.status}): ${sdkMessage} / ${errText.slice(0, 240)}`
      );
    }

    const data = await response.json();
    return extractResponseText(data);
  }
}

function normalizeTranscript(history: CallMessage[]): string {
  return history
    .map((item) => `${item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "system"}: ${item.text}`)
    .join("\n");
}

function normalizeUserOnlyTranscript(history: CallMessage[]): string {
  return history
    .filter((item) => item.role === "user")
    .map((item) => `user: ${item.text}`)
    .join("\n");
}

function parseJsonBlock<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fallthrough
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      // fallthrough
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }

  return null;
}

function languageLabel(language: CallLanguage): string {
  return LANGUAGE_NAME[language] || "English";
}

function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const safe = Math.max(0, Math.min(1, value));
  return Number.isFinite(safe) ? safe : null;
}

export async function generateAssistantReply(params: {
  contactName: string;
  userText: string;
  history: CallMessage[];
  callLanguage?: CallLanguage;
}): Promise<{ text: string; endCall: boolean }> {
  const { userText, history, contactName } = params;
  const callLanguage = params.callLanguage ?? "en";

  if (/(stop|hang up|goodbye|bye|end call|이만|끊어|종료|그만)/i.test(userText)) {
    return {
      text:
        callLanguage === "ko"
          ? `${contactName}님, 오늘 통화 고마워요. 다음에 또 이야기해요.`
          : callLanguage === "da"
            ? `Tak for samtalen, ${contactName}. Vi tales ved næste gang.`
            : callLanguage === "ar-EG"
              ? `شكرًا على المكالمة يا ${contactName}. نتكلم مرة تانية قريب.`
              : callLanguage === "az"
                ? `${contactName}, söhbət üçün təşəkkür edirəm. Növbəti dəfə yenə danışarıq.`
                : `Thanks for talking today, ${contactName}. We can talk again next time.`,
      endCall: true
    };
  }

  const env = getEnv();
  const langName = languageLabel(callLanguage);

  const text =
    (await createResponseText({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            "You are a supportive wellbeing call assistant.",
            `Speak only in ${langName}.`,
            "Keep each reply to 1-2 short sentences.",
            "Ask at most one follow-up question.",
            "Avoid definitive medical/legal/financial claims."
          ].join("\n")
        },
        ...history
          .filter((message) => message.role === "assistant" || message.role === "user")
          .map((message) => ({ role: message.role, content: message.text })),
        {
          role: "user",
          content: `${contactName}: ${userText}`
        }
      ],
      temperature: 0.5,
      max_output_tokens: 120
    })) ||
    (callLanguage === "ko"
      ? "말씀 잘 들었어요. 오늘 하루 어땠는지 조금 더 들려주실래요?"
      : callLanguage === "da"
        ? "Jeg hørte dig. Vil du fortælle lidt mere om dagen i dag?"
        : callLanguage === "ar-EG"
          ? "سمعتك. تحب تحكيلي أكتر عن يومك؟"
          : callLanguage === "az"
            ? "Səni eşitdim. Bu günün necə keçdiyini bir az da danışarsan?"
            : "I hear you. Would you like to share a little more about your day?");

  return { text, endCall: false };
}

export async function summarizeCallTranscript(params: {
  contactName: string;
  history: CallMessage[];
  callLanguage: CallLanguage;
  checklistSection?: string;
}): Promise<string> {
  const { contactName, history, callLanguage, checklistSection } = params;

  if (history.length === 0) {
    return "No transcript data was captured.";
  }

  const env = getEnv();
  const transcript = normalizeTranscript(history);
  const langName = languageLabel(callLanguage);

  const summary = await createResponseText({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You summarize care call transcripts.",
          `Return summary in ${langName}.`,
          "Output format:",
          "1) One-line mood/condition.",
          "2) One-line key topics.",
          "3) One-line risk tag: stable | caution | risk."
        ].join("\n")
      },
      {
        role: "user",
        content: `Contact: ${contactName}\nTranscript:\n${transcript}`
      }
    ],
    max_output_tokens: 220
  });

  const base = summary.trim() || "Summary generation failed.";
  if (!checklistSection?.trim()) {
    return base;
  }

  return `${base}\n\nChecklist\n${checklistSection.trim()}`;
}

export async function extractChecklistAnswers(params: {
  callLanguage: CallLanguage;
  transcript: CallMessage[];
  questions: LocalizedQuestion[];
}): Promise<ExtractedQuestionAnswer[]> {
  const { callLanguage, transcript, questions } = params;

  if (questions.length === 0) {
    return [];
  }

  const env = getEnv();
  const transcriptText = normalizeTranscript(transcript);
  const questionBlock = questions
    .map((question) => `- ${question.id}: ${question.localized_text}`)
    .join("\n");

  const responseText = await createResponseText({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You extract checklist answers from call transcript.",
          `Transcript language is mostly ${languageLabel(callLanguage)}.`,
          "Return strictly JSON array. No prose.",
          "Schema per item:",
          "{question_id:number, asked:boolean, answered:boolean, answer_text:string, evidence_text:string, confidence:number}",
          "If unanswered, set answered=false and empty answer_text."
        ].join("\n")
      },
      {
        role: "user",
        content: `Questions:\n${questionBlock}\n\nTranscript:\n${transcriptText}`
      }
    ],
    temperature: 0,
    max_output_tokens: 800
  });

  const parsed = parseJsonBlock<Array<Record<string, unknown>>>(responseText);
  const byQuestionId = new Map<number, Record<string, unknown>>();

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const id = Number(item.question_id);
      if (Number.isFinite(id)) {
        byQuestionId.set(id, item);
      }
    }
  }

  return questions.map((question) => {
    const raw = byQuestionId.get(question.id);
    if (!raw) {
      return {
        questionId: question.id,
        asked: false,
        answered: false,
        answerText: "",
        evidenceText: "",
        confidence: null,
        resolutionStatus: "unresolved"
      } satisfies ExtractedQuestionAnswer;
    }

    const asked = raw.asked === true;
    const answered = raw.answered === true;
    const answerText = typeof raw.answer_text === "string" ? raw.answer_text.trim() : "";
    const evidenceText = typeof raw.evidence_text === "string" ? raw.evidence_text.trim() : "";

    return {
      questionId: question.id,
      asked,
      answered,
      answerText,
      evidenceText,
      confidence: clampConfidence(raw.confidence),
      resolutionStatus: "resolved"
    } satisfies ExtractedQuestionAnswer;
  });
}

export async function extractContactProfile(params: {
  contactName: string;
  history: CallMessage[];
  callLanguage: CallLanguage;
  existingProfile: ContactProfile;
}): Promise<ContactProfile> {
  const { contactName, history, callLanguage, existingProfile } = params;

  if (history.length === 0) {
    return {};
  }

  const env = getEnv();
  const transcript = normalizeUserOnlyTranscript(history);
  if (!transcript.trim()) {
    return {};
  }
  const existingJson = JSON.stringify(existingProfile);

  const responseText = await createResponseText({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You extract personal profile information from a care call transcript.",
          "Use only explicit user statements as evidence.",
          "Return strictly a JSON object with ONLY new or changed fields. No prose.",
          `Transcript language: ${languageLabel(callLanguage)}.`,
          "Schema (all fields optional):",
          '{"name":string,"age":number,"occupation":string,"health_conditions":string[],"medications":string[],"family":string[],"interests":string[],"living_situation":string,"mood_tendency":string,"important_dates":string[],"other":{}}',
          "Only include fields where the transcript provides clear evidence.",
          "For array fields, return only NEW items not already in the existing profile.",
          "For scalar fields, return only if different from existing.",
          "If nothing new is found, return {}."
        ].join("\n")
      },
      {
        role: "user",
        content: `Contact: ${contactName}\nExisting profile: ${existingJson}\n\nTranscript:\n${transcript}`
      }
    ],
    temperature: 0,
    max_output_tokens: 500
  });

  const parsed = parseJsonBlock<ContactProfile>(responseText);
  return parsed ?? {};
}

export async function generateCumulativeHistory(params: {
  existingHistory: string;
  newCallSummary: string;
  callLanguage: CallLanguage;
}): Promise<string> {
  const { existingHistory, newCallSummary, callLanguage } = params;
  const env = getEnv();
  const langName = languageLabel(callLanguage);

  const result = await createResponseText({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You maintain a rolling cumulative conversation history summary for a care contact.",
          `Write in ${langName}. Keep within 300 words.`,
          "Focus on information useful for the NEXT conversation:",
          "- Health updates, mood patterns, family events",
          "- Topics discussed, unresolved concerns",
          "- Promises made, follow-ups needed",
          "Merge the existing summary with the new call summary into one coherent updated summary.",
          "If existing summary is empty, create a new one from the call summary alone."
        ].join("\n")
      },
      {
        role: "user",
        content: `Existing cumulative summary:\n${existingHistory || "(none)"}\n\nNew call summary:\n${newCallSummary}`
      }
    ],
    max_output_tokens: 600
  });

  return result.trim() || existingHistory;
}

export function buildChecklistSummaryBlock(items: {
  questionText: string;
  answered: boolean;
  answerText: string;
  resolutionStatus: "resolved" | "unresolved";
}[]): string {
  if (items.length === 0) {
    return "No checklist questions were configured for this call.";
  }

  return items
    .map((item, index) => {
      if (item.resolutionStatus === "unresolved") {
        return `${index + 1}. ${item.questionText} -> unresolved`;
      }
      if (!item.answered) {
        return `${index + 1}. ${item.questionText} -> unanswered`;
      }
      return `${index + 1}. ${item.questionText} -> ${item.answerText || "answered"}`;
    })
    .join("\n");
}
