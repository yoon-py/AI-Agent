import { getRuntimeStringEnv } from "@/lib/env";
import {
  DEFAULT_VOICE_SAMPLE_TEXT,
  isOpenAiRealtimeVoice
} from "@/lib/openai-voices";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const voice = String(url.searchParams.get("voice") || "").trim();
  if (!isOpenAiRealtimeVoice(voice)) {
    return jsonError(400, "unsupported_voice");
  }

  const text = String(url.searchParams.get("text") || DEFAULT_VOICE_SAMPLE_TEXT)
    .trim()
    .slice(0, 280);
  const inputText = text || DEFAULT_VOICE_SAMPLE_TEXT;

  const apiKey = getRuntimeStringEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonError(500, "OPENAI_API_KEY missing");
  }

  const model = getRuntimeStringEnv("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: inputText,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    console.error(
      `[voice-preview] failed: voice=${voice}, model=${model}, status=${response.status}, detail=${detail}`
    );
    return jsonError(502, `voice_preview_failed_${response.status}`);
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store"
    }
  });
}
