import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { getEnv } from "@/lib/env";

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "clip";
}

export async function synthesizeToPublicAudio(
  text: string,
  callSid: string,
  tag: string
): Promise<string> {
  const env = getEnv();
  const normalizedText = text.trim().slice(0, 1200) || "안녕하세요.";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}?optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text: normalizedText,
          model_id: env.ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.9,
            style: 0.25,
            use_speaker_boost: true
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs request failed (${response.status}): ${errText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    const audioDir = path.join(process.cwd(), "public", "audio");
    await mkdir(audioDir, { recursive: true });

    const filename = `${Date.now()}-${safePart(callSid)}-${safePart(tag)}-${randomBytes(4).toString("hex")}.mp3`;
    await writeFile(path.join(audioDir, filename), audioBuffer);

    return `${env.APP_BASE_URL}/audio/${filename}`;
  } finally {
    clearTimeout(timeout);
  }
}
