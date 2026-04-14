export const OPENAI_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
] as const;

export type OpenAiRealtimeVoice = (typeof OPENAI_REALTIME_VOICES)[number];

const VOICE_SET = new Set<string>(OPENAI_REALTIME_VOICES);

export function isOpenAiRealtimeVoice(value: string): value is OpenAiRealtimeVoice {
  return VOICE_SET.has(value);
}

export const DEFAULT_VOICE_SAMPLE_TEXT =
  "안녕하세요. AgentCall 음성 샘플입니다. 오늘 기분은 어떠신가요?";
