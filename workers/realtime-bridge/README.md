# AgentCall Realtime Bridge Worker

Twilio Media Streams와 OpenAI Realtime을 Cloudflare Worker에서 직접 연결합니다.

## Local Dev

```bash
cp .dev.vars.example .dev.vars
npx wrangler dev --port 8787
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Deploy

```bash
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put WORKER_WEBHOOK_SECRET
npx wrangler deploy
```

Optional runtime vars:

```bash
npx wrangler deploy \
  --var TRANSCRIPT_WEBHOOK_URL:https://your-app.example.com/api/internal/transcript \
  --var STATUS_WEBHOOK_URL:https://your-app.example.com/api/twilio/status
```

배포 URL 예시:

`https://agentcall-realtime-bridge.<subdomain>.workers.dev`

Twilio Voice URL:

`https://agentcall-realtime-bridge.<subdomain>.workers.dev/api/twilio/voice`

Twilio Status URL:

`https://agentcall-realtime-bridge.<subdomain>.workers.dev/api/twilio/status`
