import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  CALL_WEBHOOK_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OPENAI_REALTIME_VOICE_MAP: z.string().optional(),
  DEFAULT_CALL_LANGUAGE: z.string().default("ko"),
  WORKER_WEBHOOK_SECRET: z.string().default(""),
  ELEVENLABS_API_KEY: z.string().default(""),
  ELEVENLABS_VOICE_ID: z.string().default(""),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),
  ELEVENLABS_VOICE_MAP: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  AGENT_NAME: z.string().default("Alloy")
});

export type AppEnv = z.infer<typeof envSchema>;

function cloudflareStringEnv(): Record<string, string> {
  try {
    const { env } = getCloudflareContext();
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") {
        mapped[key] = value;
      }
    }
    return mapped;
  } catch {
    return {};
  }
}

export function parseVoiceMap(raw: string | undefined): Record<string, string> {
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

export function getRuntimeStringEnv(key: string): string | undefined {
  const processValue = process.env[key];
  if (typeof processValue === "string" && processValue.trim()) {
    return processValue.trim();
  }

  const cloudflareValue = cloudflareStringEnv()[key];
  if (typeof cloudflareValue === "string" && cloudflareValue.trim()) {
    return cloudflareValue.trim();
  }

  return undefined;
}

export function getEnv(): AppEnv {
  return envSchema.parse({
    ...process.env,
    ...cloudflareStringEnv()
  });
}
