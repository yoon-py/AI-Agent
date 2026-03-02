# NestCall (MVP)

Twilio 발신 통화 + OpenAI Realtime 음성 대화 + 로컬 SQLite 통화 로그 대시보드 프로토타입입니다.

## 1) 설치

```bash
npm install
```

## 2) 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local`에 아래 값을 채우세요.

- `APP_BASE_URL`: Twilio가 접근 가능한 공개 URL (예: ngrok URL)
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `OPENAI_REALTIME_MODEL` (기본: `gpt-realtime`)
- `OPENAI_REALTIME_VOICE` (기본: `shimmer`)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `AGENT_NAME` (선택)
- `ELEVENLABS_*` 값은 기존 턴 방식 라우트 호환용(옵션)

## 3) 실행

```bash
npm run dev
```

## 4) 공개 URL 열기 (로컬 개발시 필수)

예시:

```bash
ngrok http 3000
```

생성된 `https://...` URL을 `APP_BASE_URL`에 넣고 서버 재시작하세요.

## 5) 사용 방법

1. 대시보드에서 연락처를 `+82...` 형식(E.164)으로 등록
2. `이 연락처로 통화 시작` 버튼 클릭
3. 통화 중에는 `Twilio Media Stream`이 `/media-stream` WebSocket으로 연결되고, 서버가 OpenAI Realtime과 오디오를 양방향 중계
4. 통화가 끝나면 상태 콜백에서 요약 생성 후 대시보드에 저장

## 구조 요약

- `app/api/twilio/voice`: `<Connect><Stream>` TwiML 반환
- `server.js`: Twilio WebSocket ↔ OpenAI Realtime WebSocket 브리지
- `app/api/twilio/status`: 통화 상태 저장/종료 후 요약
- `data/nestcall.db`: 연락처/통화/대화 로그 저장

## 주의사항

- 이 코드는 프로토타입이며 Twilio 요청 서명 검증이 생략되어 있습니다.
- 실제 서비스 전에는 인증/인가, 결제, 동의 플로우, 보안 로그, 민감정보 보호를 추가해야 합니다.
