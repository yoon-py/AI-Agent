import Twilio from "twilio";
import { getEnv } from "@/lib/env";

let twilioClient: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof Twilio> {
  if (!twilioClient) {
    const env = getEnv();
    twilioClient = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}
