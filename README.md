# AgentCall

**AI 음성 에이전트 기반 다국어 케어콜(전화 상담) 자동화 플랫폼**

AgentCall은 Twilio로 전화를 걸고, OpenAI Realtime 음성 모델이 실시간으로 대화하며, 미리 설정한 체크리스트 질문을 자동으로 수행한 뒤 결과를 구조화해 저장해주는 통화 자동화 대시보드입니다. 요양·헬스케어·고객 확인콜처럼 "정해진 질문을 반복적으로 물어보고 답을 기록해야 하는" 업무를 사람 대신 AI가 처리할 수 있도록 만든 프로젝트입니다.

## 이 프로젝트가 하는 일

- **아웃바운드 자동 통화**: 대시보드에서 연락처를 선택하고 "통화 시작"을 누르면 Twilio를 통해 실제 전화가 걸립니다.
- **실시간 AI 대화**: OpenAI Realtime API(gpt-realtime)가 통화 상대와 자연스러운 음성 대화를 주고받습니다. 한국어 기본, 다국어 지원.
- **체크리스트 질문 세트**: 전역 공통 질문 세트 또는 특정 연락처에게만 물어볼 개별 질문 세트를 관리할 수 있습니다.
- **구조화된 결과 추출**: 통화가 끝나면 전체 트랜스크립트 + 요약 + 체크리스트 항목별 답변이 DB에 자동으로 저장됩니다.
- **연락처 관리**: 국가 코드 기반 전화번호 정규화, 소프트 삭제(과거 통화 이력 보존) 지원.
- **다국어 음성**: OpenAI Realtime 보이스 + ElevenLabs 보이스 매핑으로 언어·상황별 목소리를 다르게 쓸 수 있습니다.

## 기술 스택

- **프론트/API**: Next.js (OpenNext on Cloudflare Workers)
- **실시간 음성 브릿지**: 별도 Cloudflare Worker (`workers/realtime-bridge`) — Twilio Media Streams ↔ OpenAI Realtime WebSocket 중계
- **DB**: Cloudflare D1 (`AGENTCALL_DB`)
- **통화**: Twilio Programmable Voice
- **AI**: OpenAI Realtime API, OpenAI GPT (요약/추출), ElevenLabs (선택)

## 주요 페이지

- `/contacts` — 연락처 관리
- `/questions` — 체크리스트 질문 세트 관리
- `/calls` — 통화 실행 및 이력
- `/summaries` — 통화별 요약·답변 결과
- `/voices` — 음성 프로필 설정

## 로컬 실행

```bash
npm install
cp .env.example .env.local
```

대시보드와 realtime worker를 각각 다른 터미널에서 실행:

```bash
npm run dev          # Next.js 대시보드
npm run worker:dev   # Realtime 음성 브릿지
```

### 필수 환경변수

- `APP_BASE_URL`
- `CALL_WEBHOOK_BASE_URL` (realtime worker URL)
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `WORKER_WEBHOOK_SECRET`

### 선택 환경변수

- `OPENAI_REALTIME_VOICE_MAP`
- `DEFAULT_CALL_LANGUAGE`
- `ELEVENLABS_*`

## D1 마이그레이션

```bash
npm run d1:migrate:remote
```

포함된 마이그레이션:

- `0001_init.sql`
- `0002_contacts_multilingual_soft_delete.sql`
- `0003_question_sets_questions_answers.sql`

## 배포

### Next.js Worker (OpenNext)

```bash
npm run deploy
```

### Realtime Worker

```bash
npm run worker:deploy
```

`workers/realtime-bridge/wrangler.toml`의 아래 값이 배포된 Next URL을 가리키도록 설정해야 합니다:

- `TRANSCRIPT_WEBHOOK_URL`
- `STATUS_WEBHOOK_URL`
- `CALL_CONTEXT_URL`

## Twilio Webhook 설정

Twilio 콘솔에서 아래 엔드포인트를 등록합니다 (realtime worker):

- Voice: `https://<realtime-worker>/api/twilio/voice`
- Status: `https://<realtime-worker>/api/twilio/status`

## 참고

- `TWILIO_SIGNATURE_VALIDATION=false`는 디버깅 용도로만 사용하세요. 운영에서는 웹훅 URL 확정 후 반드시 켜야 합니다.
- 연락처를 소프트 삭제해도 과거 통화 기록은 유지됩니다.
