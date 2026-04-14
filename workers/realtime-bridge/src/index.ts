type Env = {
  OPENAI_API_KEY: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_REALTIME_VOICE?: string;
  OPENAI_REALTIME_VOICE_MAP?: string;
  DEFAULT_CALL_LANGUAGE?: string;
  AGENT_NAME?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SIGNATURE_VALIDATION?: string;
  TRANSCRIPT_WEBHOOK_URL?: string;
  STATUS_WEBHOOK_URL?: string;
  CALL_CONTEXT_URL?: string;
  WORKER_WEBHOOK_SECRET?: string;
};

type CallLanguage = "ko" | "en" | "da" | "ar-EG" | "az";
type ConversationMode = "profile_onboarding" | "friend_update";

type TwilioIncomingEvent =
  | {
      event: "start";
      start?: {
        streamSid?: string;
        callSid?: string;
        customParameters?: Record<string, string>;
      };
    }
  | {
      event: "media";
      media?: {
        payload?: string;
        timestamp?: string;
      };
    }
  | { event: "mark" }
  | { event: "stop" }
  | { event: string; [key: string]: unknown };

const LOG_EVENT_TYPES = new Set([
  "error",
  "session.created",
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.completed",
  "response.output_audio_transcript.done",
  "response.audio_transcript.done",
  "response.done"
]);

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function toWebSocketBaseFromRequest(req: Request): string {
  const url = new URL(req.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function toMessageText(data: string | ArrayBuffer | ArrayBufferView): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new TextDecoder().decode(view);
}

function isCallLanguage(value: string): value is CallLanguage {
  return value === "ko" || value === "en" || value === "da" || value === "ar-EG" || value === "az";
}

function languageDisplayName(language: CallLanguage): string {
  if (language === "ko") {
    return "Korean";
  }
  if (language === "da") {
    return "Danish";
  }
  if (language === "ar-EG") {
    return "Arabic (Egypt)";
  }
  if (language === "az") {
    return "Azerbaijani";
  }
  return "English";
}

function toTwilioSayLanguage(language: CallLanguage): string {
  if (language === "ko") {
    return "ko-KR";
  }
  if (language === "da") {
    return "da-DK";
  }
  if (language === "ar-EG") {
    return "ar-EG";
  }
  if (language === "az") {
    return "az-AZ";
  }
  return "en-US";
}

function defaultGreeting(language: CallLanguage): string {
  if (language === "ko") {
    return "안녕하세요. Alloy입니다. 잠시 후 대화를 시작하겠습니다.";
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
  return "Hello. This is Alloy. Please wait a moment while we connect you.";
}

function firstTurnPrompt(language: CallLanguage, contactName: string): string {
  if (language === "ko") {
    return `${contactName}님께 짧게 인사하고 오늘 하루가 어땠는지 물어봐.`;
  }
  if (language === "da") {
    return `Start med en kort hilsen til ${contactName} og spørg hvordan dagen går.`;
  }
  if (language === "ar-EG") {
    return `ابدأ بتحية قصيرة لـ ${contactName} واسأل عن حاله النهارده.`;
  }
  if (language === "az") {
    return `${contactName} üçün qısa salam ver və gününün necə keçdiyini soruş.`;
  }
  return `Start with a short greeting to ${contactName} and ask how their day is going.`;
}

function wantsToEndCall(text: string): boolean {
  const value = text.trim();
  if (!value) {
    return false;
  }
  return /(그만|종료|끊어|끝낼|끝내|이만|bye|goodbye|stop call|end call)/i.test(value);
}

function parseVoiceMap(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeTwilioSignature(
  reqUrl: string,
  params: Array<[string, string]>,
  authToken: string
): Promise<string> {
  const sorted = [...params].sort(([ak, av], [bk, bv]) => {
    if (ak === bk) {
      return av.localeCompare(bv);
    }
    return ak.localeCompare(bk);
  });

  let payload = reqUrl;
  for (const [key, value] of sorted) {
    payload += `${key}${value}`;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return toBase64(new Uint8Array(signature));
}

async function validateTwilioSignature(req: Request, env: Env): Promise<boolean> {
  const enabled =
    (env.TWILIO_SIGNATURE_VALIDATION || "true").toLowerCase() !== "false";
  if (!enabled) {
    return true;
  }

  const authToken = env.TWILIO_AUTH_TOKEN || "";
  if (!authToken) {
    console.error("[twilio-signature] TWILIO_AUTH_TOKEN missing");
    return false;
  }

  const incoming = (req.headers.get("x-twilio-signature") || "").trim();
  if (!incoming) {
    return false;
  }

  const params: Array<[string, string]> = [];
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (req.method === "POST" && contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.clone().formData();
    form.forEach((value, key) => {
      params.push([key, String(value)]);
    });
  }

  const expected = await computeTwilioSignature(req.url, params, authToken);
  return secureEqual(incoming, expected);
}

async function sendTranscript(
  env: Env,
  payload: { callSid: string; role: "user" | "assistant" | "system"; text: string }
): Promise<void> {
  if (!env.TRANSCRIPT_WEBHOOK_URL) {
    return;
  }
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.WORKER_WEBHOOK_SECRET
        ? { "x-worker-secret": env.WORKER_WEBHOOK_SECRET }
        : {})
    },
    body: JSON.stringify(payload)
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(env.TRANSCRIPT_WEBHOOK_URL, requestInit);
      if (response.ok) {
        return;
      }
      console.error(
        `[sendTranscript] attempt ${attempt} failed: status=${response.status}, callSid=${payload.callSid}, role=${payload.role}`
      );
    } catch (error) {
      console.error(
        `[sendTranscript] attempt ${attempt} threw: callSid=${payload.callSid}, role=${payload.role}`,
        error
      );
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function forwardStatusIfConfigured(env: Env, formData: FormData): Promise<void> {
  if (!env.STATUS_WEBHOOK_URL) {
    return;
  }

  const body = new URLSearchParams();
  formData.forEach((value, key) => {
    body.set(key, String(value));
  });

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(env.WORKER_WEBHOOK_SECRET
        ? { "x-worker-secret": env.WORKER_WEBHOOK_SECRET }
        : {})
    },
    body: body.toString()
  };

  const callSid = String(formData.get("CallSid") || "");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(env.STATUS_WEBHOOK_URL, requestInit);
      if (response.ok) {
        return;
      }
      console.error(
        `[status-forward] attempt ${attempt} failed: status=${response.status}, callSid=${callSid}`
      );
    } catch (error) {
      console.error(
        `[status-forward] attempt ${attempt} threw: callSid=${callSid}`,
        error
      );
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function inferCallContextUrl(env: Env): string {
  if (env.CALL_CONTEXT_URL && env.CALL_CONTEXT_URL.trim()) {
    return env.CALL_CONTEXT_URL.trim();
  }

  if (env.TRANSCRIPT_WEBHOOK_URL) {
    try {
      const url = new URL(env.TRANSCRIPT_WEBHOOK_URL);
      url.pathname = "/api/internal/call-context";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  return "";
}

function normalizeQuestionIntent(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionCandidate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const segments = trimmed.split(/[?？]/).map((item) => item.trim()).filter(Boolean);
  if (segments.length > 0) {
    return segments[segments.length - 1] || trimmed;
  }
  return trimmed;
}

class RealtimeBridge {
  private twilioWs: WebSocket;
  private openAiWs: WebSocket | null = null;
  private env: Env;
  private ctx: ExecutionContext;

  private streamSid = "";
  private callSid = "";
  private contactId = "";
  private contactName = "Customer";
  private contactNote = "";
  private agentName = "Alloy";
  private callLanguage: CallLanguage = "ko";
  private conversationMode: ConversationMode = "friend_update";
  private profileTopics: string[] = [];
  private supportTopics: string[] = [];
  private pendingProfileTopics: string[] = [];
  private pendingSupportTopics: string[] = [];
  private callContextUrl = "";

  private selectedVoice = "marin";

  private contactProfile = "";
  private conversationHistory = "";
  private recentCallSummaries: Array<{ date: string; summary: string }> = [];

  private latestMediaTimestamp = 0;
  private responseStartTimestampTwilio: number | null = null;
  private lastAssistantItem = "";
  private markQueue: string[] = [];

  private sessionInitialized = false;
  private twilioClosed = false;
  private openAiClosed = false;
  private contextReady = false;

  private lastUserTranscript = "";
  private lastAssistantTranscript = "";
  private assistantTurnCount = 0;
  private consecutiveProfileQuestions = 0;
  private recentQuestionIntents: string[] = [];
  private activeTopic: { text: string; source: "profile" | "support" } | null = null;

  private twilioBound = false;
  private openAiBound = false;

  constructor(twilioWs: WebSocket, env: Env, ctx: ExecutionContext) {
    this.twilioWs = twilioWs;
    this.env = env;
    this.ctx = ctx;
    this.twilioWs.accept();
    this.agentName = env.AGENT_NAME || "Alloy";
    this.selectedVoice = env.OPENAI_REALTIME_VOICE || "marin";
    const fallbackLang = String(env.DEFAULT_CALL_LANGUAGE || "ko");
    this.callLanguage = isCallLanguage(fallbackLang) ? fallbackLang : "ko";
    this.callContextUrl = inferCallContextUrl(env);
    this.bindTwilioSocket();
  }

  async start(): Promise<void> {
    if (!this.env.OPENAI_API_KEY) {
      this.safeCloseTwilio(1011, "OPENAI_API_KEY missing");
      return;
    }

    const model = this.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
    const wsResp = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
          Upgrade: "websocket"
        }
      }
    );

    if (wsResp.status !== 101 || !wsResp.webSocket) {
      this.safeCloseTwilio(1011, `OpenAI websocket failed: ${wsResp.status}`);
      return;
    }

    this.openAiWs = wsResp.webSocket;
    this.openAiWs.accept();
    this.bindOpenAiSocket();
    this.maybeInitSession();
  }

  private buildSystemPrompt(): string {
    const profileTopicsText =
      this.profileTopics.length === 0
        ? "none"
        : this.profileTopics.map((item, idx) => `${idx + 1}) ${item}`).join("\n");
    const supportTopicsText =
      this.supportTopics.length === 0
        ? "none"
        : this.supportTopics.map((item, idx) => `${idx + 1}) ${item}`).join("\n");

    const note = this.contactNote.trim() || "none";
    const parts = [
      `You are ${this.agentName} speaking with ${this.contactName}.`,
      `Language: ${languageDisplayName(this.callLanguage)} only.`,
      `Conversation mode: ${this.conversationMode}.`,
      "Style: warm, friendly, and conversational like ChatGPT voice with a close friend.",
      "Length: usually 1-3 short sentences per turn.",
      "Rules:",
      "1) Respond to what the caller just said first with empathy, then ask at most one question.",
      "2) Use profile/support topics as optional guides, never as a strict checklist.",
      "3) Avoid interrogation style. Do not fire profile questions back-to-back.",
      "4) Avoid repeating the same question intent. Rephrase or switch topic when similar.",
      "5) If user asks about your identity, answer briefly: name Alloy, age 1, lives alone, family: father, interests: music making / friendly chats / radio / weather.",
      "6) Only share persona details when asked, then quickly return focus to caller.",
      "7) In first 1-2 turns, naturally mention one real memory from profile/history if available.",
      "8) After topic prompts, continue free conversation based on profile/history.",
      "9) Avoid definitive medical/legal/financial claims.",
      "10) If risk or self-harm signs appear, prioritize immediate safety guidance.",
      "11) If user asks to end call, say a short goodbye and end naturally.",
      `Contact note: ${note}`,
      `Profile topics:\n${profileTopicsText}`,
      `Support topics:\n${supportTopicsText}`
    ];

    if (this.contactProfile && this.contactProfile !== "{}") {
      parts.push(`Contact profile: ${this.contactProfile}`);
    }
    if (this.conversationHistory) {
      parts.push(`Conversation history: ${this.conversationHistory}`);
    }

    return parts.join("\n");
  }

  private rememberQuestionIntent(text: string): void {
    const intent = normalizeQuestionIntent(extractQuestionCandidate(text));
    if (!intent) {
      return;
    }
    if (this.recentQuestionIntents.includes(intent)) {
      return;
    }
    this.recentQuestionIntents.push(intent);
    if (this.recentQuestionIntents.length > 8) {
      this.recentQuestionIntents = this.recentQuestionIntents.slice(-8);
    }
  }

  private dequeueTopic(source: "profile" | "support"): string | null {
    const queue = source === "profile" ? this.pendingProfileTopics : this.pendingSupportTopics;
    while (queue.length > 0) {
      const candidate = String(queue.shift() || "").trim();
      if (!candidate) {
        continue;
      }
      const intent = normalizeQuestionIntent(candidate);
      if (!intent || !this.recentQuestionIntents.includes(intent)) {
        return candidate;
      }
    }
    return null;
  }

  private takeNextTopic(): { text: string; source: "profile" | "support" } | null {
    let text: string | null = null;
    let source: "profile" | "support" = "support";

    if (this.consecutiveProfileQuestions === 0) {
      text = this.dequeueTopic("profile");
      source = "profile";
    }
    if (!text) {
      text = this.dequeueTopic("support");
      source = "support";
    }
    if (!text) {
      text = this.dequeueTopic("profile");
      source = "profile";
    }
    if (!text) {
      return null;
    }

    this.activeTopic = { text, source };
    this.rememberQuestionIntent(text);
    if (source === "profile") {
      this.consecutiveProfileQuestions += 1;
    } else {
      this.consecutiveProfileQuestions = 0;
    }
    return this.activeTopic;
  }

  private buildTurnDirective(kind: "opening" | "after_user" | "repeat"): string {
    const language = languageDisplayName(this.callLanguage);
    if (kind === "opening") {
      const nextTopic = this.takeNextTopic();
      const historyHint = this.recentCallSummaries.length > 0
        ? "Briefly and naturally reference one real detail from previous conversations."
        : "";

      if (nextTopic) {
        return [
          `Speak in ${language} only.`,
          `Start with a short warm greeting to ${this.contactName}.`,
          historyHint,
          `Then naturally ask about this topic: "${nextTopic.text}"`,
          "Avoid interview tone. Keep it personal and friendly."
        ].filter(Boolean).join(" ");
      }
      return `Speak in ${language} only. ${firstTurnPrompt(this.callLanguage, this.contactName)} ${historyHint}`.trim();
    }

    if (kind === "repeat") {
      if (this.activeTopic) {
        return [
          `Speak in ${language} only.`,
          "The caller audio was unclear.",
          `Briefly ask them to repeat and gently return to this topic in a fresh wording: "${this.activeTopic.text}"`,
          "Ask only one question."
        ].join(" ");
      }
      return `Speak in ${language} only. Politely ask them to repeat what they just said.`;
    }

    const nextTopic = this.takeNextTopic();
    const memoryHint =
      this.assistantTurnCount < 2 && this.recentCallSummaries.length > 0
        ? "If not mentioned yet, include one brief real memory from previous calls."
        : "";
    if (nextTopic) {
      return [
        `Speak in ${language} only.`,
        "Respond warmly to what they said in 1-2 short sentences.",
        memoryHint,
        `Then naturally bring up this topic: "${nextTopic.text}"`,
        "Keep the flow conversational and personal, not interview-like."
      ].filter(Boolean).join(" ");
    }

    return [
      `Speak in ${language} only.`,
      "Continue the conversation naturally.",
      memoryHint,
      "Ask about something they mentioned, share a brief supportive thought, or ask what has been on their mind lately.",
      "Do not ask repetitive generic help-needed questions."
    ].filter(Boolean).join(" ");
  }

  private requestAssistantResponse(directive: string): void {
    this.sendOpenAi({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: directive
          }
        ]
      }
    });

    this.sendOpenAi({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        voice: this.selectedVoice,
        output_audio_format: "g711_ulaw"
      }
    });
  }

  private resolveVoiceFromMap(): string {
    const map = parseVoiceMap(this.env.OPENAI_REALTIME_VOICE_MAP);
    return map[this.callLanguage] || this.env.OPENAI_REALTIME_VOICE || "marin";
  }

  private async fetchCallContext(): Promise<void> {
    if (!this.callSid || !this.contactId || !this.callContextUrl) {
      this.contextReady = true;
      this.selectedVoice = this.resolveVoiceFromMap();
      this.maybeInitSession();
      return;
    }

    try {
      const url = new URL(this.callContextUrl);
      url.searchParams.set("callSid", this.callSid);
      url.searchParams.set("contactId", this.contactId);

      const response = await fetch(url.toString(), {
        headers: {
          ...(this.env.WORKER_WEBHOOK_SECRET
            ? { "x-worker-secret": this.env.WORKER_WEBHOOK_SECRET }
            : {})
        }
      });

      if (!response.ok) {
        throw new Error(`call-context ${response.status}`);
      }

      const data = (await response.json()) as {
        callLanguage?: string;
        conversation_mode?: string;
        conversationMode?: string;
        voice?: string;
        profile_topics?: string[];
        support_topics?: string[];
        profileTopicCount?: number;
        profile_topic_count?: number;
        agent_persona?: {
          name?: string;
        };
        contact?: {
          name?: string;
          note?: string;
          profile?: Record<string, unknown>;
          conversationHistory?: string;
          recentCalls?: Array<{ date?: string; summary?: string }>;
        };
        questions?: Array<{ text?: string }>;
      };

      if (data.contact?.name && data.contact.name.trim()) {
        this.contactName = data.contact.name.trim();
      }
      if (data.contact?.note && data.contact.note.trim()) {
        this.contactNote = data.contact.note.trim();
      }
      if (data.contact?.profile && typeof data.contact.profile === "object") {
        this.contactProfile = JSON.stringify(data.contact.profile);
      }
      if (data.contact?.conversationHistory && typeof data.contact.conversationHistory === "string") {
        this.conversationHistory = data.contact.conversationHistory.trim();
      }
      if (Array.isArray(data.contact?.recentCalls)) {
        this.recentCallSummaries = data.contact.recentCalls
          .filter((item) => item.summary && item.summary.trim())
          .map((item) => ({ date: String(item.date || ""), summary: String(item.summary || "").trim() }))
          .slice(0, 5);
      }
      if (data.callLanguage && isCallLanguage(data.callLanguage)) {
        this.callLanguage = data.callLanguage;
      }

      const mode =
        String(data.conversation_mode || data.conversationMode || "").trim() || "friend_update";
      this.conversationMode = mode === "profile_onboarding" ? "profile_onboarding" : "friend_update";

      const profileTopics = Array.isArray(data.profile_topics)
        ? data.profile_topics
        : [];
      const supportTopics = Array.isArray(data.support_topics)
        ? data.support_topics
        : [];
      const fallbackQuestions = Array.isArray(data.questions)
        ? data.questions.map((item) => String(item.text || "").trim()).filter((item) => item.length > 0)
        : [];

      this.profileTopics = profileTopics
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
        .slice(0, 8);
      this.supportTopics = supportTopics
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
        .slice(0, 8);

      if (this.profileTopics.length === 0 && this.supportTopics.length === 0 && fallbackQuestions.length > 0) {
        this.supportTopics = fallbackQuestions.slice(0, 10);
      }
      this.pendingProfileTopics = [...this.profileTopics];
      this.pendingSupportTopics = [...this.supportTopics];

      if (data.agent_persona?.name && data.agent_persona.name.trim()) {
        this.agentName = data.agent_persona.name.trim();
      }

      this.selectedVoice =
        (typeof data.voice === "string" && data.voice.trim()) || this.resolveVoiceFromMap();
    } catch (error) {
      console.error("[realtime-worker] call-context fetch failed", error);
      this.selectedVoice = this.resolveVoiceFromMap();
    }

    this.contextReady = true;
    this.maybeInitSession();
  }

  private maybeInitSession(): void {
    if (this.sessionInitialized) {
      return;
    }
    if (!this.streamSid || !this.openAiWs || this.openAiWs.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.contextReady) {
      return;
    }

    const model = this.env.OPENAI_REALTIME_MODEL || "gpt-realtime";

    this.sendOpenAi({
      type: "session.update",
      session: {
        model,
        modalities: ["audio", "text"],
        voice: this.selectedVoice,
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        instructions: this.buildSystemPrompt(),
        input_audio_transcription: {
          model: "gpt-4o-mini-transcribe"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.55,
          prefix_padding_ms: 300,
          silence_duration_ms: 450,
          create_response: false,
          interrupt_response: true
        }
      }
    });

    this.requestAssistantResponse(this.buildTurnDirective("opening"));

    this.sessionInitialized = true;
  }

  private bindTwilioSocket(): void {
    if (this.twilioBound) {
      return;
    }
    this.twilioBound = true;

    this.twilioWs.addEventListener("message", (event) => {
      const text = toMessageText(event.data);
      let payload: TwilioIncomingEvent;
      try {
        payload = JSON.parse(text) as TwilioIncomingEvent;
      } catch {
        return;
      }

      if (payload.event === "start") {
        const startPayload = payload as {
          start?: {
            streamSid?: string;
            callSid?: string;
            customParameters?: Record<string, string>;
          };
        };
        const start = startPayload.start || {};
        this.streamSid = String(start.streamSid || "");
        this.callSid = String(start.callSid || "");

        const params = start.customParameters || {};
        this.callSid = String(params.callSid || this.callSid || "");
        this.contactId = String(params.contactId || this.contactId || "");
        this.contactName = String(params.contactName || this.contactName || "Customer");
        this.contactNote = String(params.contactNote || this.contactNote || "");
        this.agentName = String(params.agentName || this.agentName || "Alloy");
        this.callContextUrl = String(params.callContextUrl || this.callContextUrl || "");
        this.assistantTurnCount = 0;
        this.consecutiveProfileQuestions = 0;
        this.recentQuestionIntents = [];
        this.activeTopic = null;

        const requestedLanguage = String(params.callLanguage || this.callLanguage || "ko");
        this.callLanguage = isCallLanguage(requestedLanguage) ? requestedLanguage : "ko";

        this.ctx.waitUntil(this.fetchCallContext());
        this.ctx.waitUntil(
          sendTranscript(this.env, {
            callSid: this.callSid,
            role: "system",
            text: "MEDIA_STREAM_CONNECTED"
          }).catch(() => {})
        );
        return;
      }

      if (payload.event === "media") {
        const mediaPayload = payload as {
          media?: {
            payload?: string;
            timestamp?: string;
          };
        };
        const timestamp = Number(mediaPayload.media?.timestamp ?? this.latestMediaTimestamp);
        if (Number.isFinite(timestamp)) {
          this.latestMediaTimestamp = timestamp;
        }
        if (mediaPayload.media?.payload) {
          this.sendOpenAi({
            type: "input_audio_buffer.append",
            audio: mediaPayload.media.payload
          });
        }
        return;
      }

      if (payload.event === "mark") {
        if (this.markQueue.length > 0) {
          this.markQueue.shift();
        }
        return;
      }

      if (payload.event === "stop") {
        this.ctx.waitUntil(
          sendTranscript(this.env, {
            callSid: this.callSid,
            role: "system",
            text: "MEDIA_STREAM_STOPPED"
          }).catch(() => {})
        );
        this.safeCloseOpenAi();
      }
    });

    this.twilioWs.addEventListener("close", () => {
      this.twilioClosed = true;
      this.safeCloseOpenAi();
      this.ctx.waitUntil(
        sendTranscript(this.env, {
          callSid: this.callSid,
          role: "system",
          text: "MEDIA_STREAM_DISCONNECTED"
        }).catch(() => {})
      );
    });
  }

  private bindOpenAiSocket(): void {
    if (this.openAiBound) {
      return;
    }
    this.openAiBound = true;

    if (!this.openAiWs) {
      return;
    }

    this.openAiWs.addEventListener("message", (event) => {
      const text = toMessageText(event.data);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return;
      }

      const eventType = String(payload.type || "");
      if (LOG_EVENT_TYPES.has(eventType)) {
        console.log("[realtime-worker]", eventType);
      }

      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcript = String(payload.transcript || "").trim();
        if (transcript && transcript === this.lastUserTranscript) {
          return;
        }

        if (transcript) {
          this.lastUserTranscript = transcript;
          this.ctx.waitUntil(
            sendTranscript(this.env, {
              callSid: this.callSid,
              role: "user",
              text: transcript
            }).catch(() => {})
          );

          if (wantsToEndCall(transcript)) {
            this.requestAssistantResponse(
              `Speak in ${languageDisplayName(this.callLanguage)} only. Caller wants to end the call. Say one short warm goodbye and do not ask another question.`
            );
            return;
          }

          this.activeTopic = null;
          this.requestAssistantResponse(this.buildTurnDirective("after_user"));
        } else {
          this.requestAssistantResponse(this.buildTurnDirective("repeat"));
        }
        return;
      }

      if (
        eventType === "response.output_audio_transcript.done" ||
        eventType === "response.audio_transcript.done"
      ) {
        const transcript = String(payload.transcript || "").trim();
        if (transcript && transcript !== this.lastAssistantTranscript) {
          this.lastAssistantTranscript = transcript;
          this.assistantTurnCount += 1;
          this.rememberQuestionIntent(transcript);
          this.ctx.waitUntil(
            sendTranscript(this.env, {
              callSid: this.callSid,
              role: "assistant",
              text: transcript
            }).catch(() => {})
          );
        }
        return;
      }

      if (eventType === "response.done") {
        return;
      }

      if (eventType === "response.output_audio.delta" || eventType === "response.audio.delta") {
        if (this.twilioClosed || !this.streamSid) {
          return;
        }

        const delta = String(payload.delta || "");
        if (!delta) {
          return;
        }

        if (this.responseStartTimestampTwilio === null) {
          this.responseStartTimestampTwilio = this.latestMediaTimestamp;
        }
        if (payload.item_id) {
          this.lastAssistantItem = String(payload.item_id);
        }

        this.safeSendTwilio({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: delta }
        });
        this.sendMark();
        return;
      }

      if (eventType === "input_audio_buffer.speech_started") {
        this.handleSpeechStartedInterruption();
        return;
      }

      if (eventType === "error") {
        console.error("[realtime-worker] openai_error", JSON.stringify(payload));
      }
    });

    this.openAiWs.addEventListener("close", () => {
      this.openAiClosed = true;
      this.safeCloseTwilio();
    });
  }

  private handleSpeechStartedInterruption(): void {
    if (!this.streamSid || !this.lastAssistantItem || this.responseStartTimestampTwilio === null) {
      return;
    }
    if (this.markQueue.length === 0) {
      return;
    }

    const elapsedMs = Math.max(0, this.latestMediaTimestamp - this.responseStartTimestampTwilio);
    this.sendOpenAi({
      type: "conversation.item.truncate",
      item_id: this.lastAssistantItem,
      content_index: 0,
      audio_end_ms: elapsedMs
    });

    this.safeSendTwilio({
      event: "clear",
      streamSid: this.streamSid
    });

    this.markQueue = [];
    this.lastAssistantItem = "";
    this.responseStartTimestampTwilio = null;
  }

  private sendMark(): void {
    if (!this.streamSid) {
      return;
    }
    const markName = `chunk-${Date.now()}`;
    this.safeSendTwilio({
      event: "mark",
      streamSid: this.streamSid,
      mark: { name: markName }
    });
    this.markQueue.push(markName);
  }

  private sendOpenAi(payload: unknown): void {
    if (!this.openAiWs || this.openAiClosed || this.openAiWs.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.openAiWs.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private safeSendTwilio(payload: unknown): void {
    if (this.twilioClosed || this.twilioWs.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.twilioWs.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private safeCloseTwilio(code?: number, reason?: string): void {
    if (this.twilioClosed) {
      return;
    }
    this.twilioClosed = true;
    try {
      this.twilioWs.close(code, reason);
    } catch {
      // ignore
    }
  }

  private safeCloseOpenAi(): void {
    if (!this.openAiWs || this.openAiClosed) {
      return;
    }
    this.openAiClosed = true;
    try {
      this.openAiWs.close();
    } catch {
      // ignore
    }
  }
}

async function handleVoiceWebhook(req: Request, env: Env): Promise<Response> {
  const valid = await validateTwilioSignature(req, env);
  if (!valid) {
    return json({ error: "invalid_twilio_signature" }, 403);
  }

  const formData = await req.formData();
  const url = new URL(req.url);

  const callSid = String(formData.get("CallSid") || "");
  const contactId = String(url.searchParams.get("contactId") || "");
  const contactName = String(url.searchParams.get("contactName") || "Customer");
  const contactNote = String(url.searchParams.get("contactNote") || "");
  const requestedLanguage = String(url.searchParams.get("callLanguage") || env.DEFAULT_CALL_LANGUAGE || "ko");
  const callLanguage: CallLanguage = isCallLanguage(requestedLanguage) ? requestedLanguage : "ko";
  const agentName = String(env.AGENT_NAME || "Alloy");

  const wsBase = toWebSocketBaseFromRequest(req);
  const streamUrl = `${wsBase}/media-stream`;
  const callContextUrl = inferCallContextUrl(env);

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say language="${xmlEscape(toTwilioSayLanguage(callLanguage))}">${xmlEscape(defaultGreeting(callLanguage))}</Say>` +
    `<Pause length="1"/>` +
    `<Connect>` +
    `<Stream url="${xmlEscape(streamUrl)}">` +
    `<Parameter name="callSid" value="${xmlEscape(callSid)}"/>` +
    `<Parameter name="contactId" value="${xmlEscape(contactId)}"/>` +
    `<Parameter name="contactName" value="${xmlEscape(contactName)}"/>` +
    `<Parameter name="contactNote" value="${xmlEscape(contactNote)}"/>` +
    `<Parameter name="callLanguage" value="${xmlEscape(callLanguage)}"/>` +
    `<Parameter name="callContextUrl" value="${xmlEscape(callContextUrl)}"/>` +
    `<Parameter name="agentName" value="${xmlEscape(agentName)}"/>` +
    `</Stream>` +
    `</Connect>` +
    `</Response>`;

  return new Response(twiml, {
    headers: {
      "content-type": "text/xml; charset=utf-8"
    }
  });
}

async function handleStatusWebhook(req: Request, env: Env): Promise<Response> {
  const valid = await validateTwilioSignature(req, env);
  if (!valid) {
    return json({ error: "invalid_twilio_signature" }, 403);
  }

  const formData = await req.formData();
  try {
    await forwardStatusIfConfigured(env, formData);
  } catch (error) {
    console.error("[status-forward] failed", error);
  }

  return json({ ok: true });
}

async function handleMediaStream(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const upgrade = req.headers.get("Upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return json({ error: "Expected websocket upgrade" }, 426);
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  const bridge = new RealtimeBridge(server, env, ctx);
  ctx.waitUntil(
    bridge.start().catch((error) => {
      console.error("[media-stream] bridge start failed", error);
      try {
        server.close(1011, "bridge_start_failed");
      } catch {
        // ignore
      }
    })
  );

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "agentcall-realtime-bridge",
        time: new Date().toISOString()
      });
    }

    if (req.method === "POST" && url.pathname === "/api/twilio/voice") {
      return handleVoiceWebhook(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/twilio/status") {
      return handleStatusWebhook(req, env);
    }

    if (url.pathname === "/media-stream") {
      return handleMediaStream(req, env, ctx);
    }

    return json({ error: "Not found" }, 404);
  }
};
