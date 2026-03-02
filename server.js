const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const next = require("next");
const Database = require("better-sqlite3");
const { WebSocketServer, WebSocket } = require("ws");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DEV = process.env.NODE_ENV !== "production";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "shimmer";

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

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "nestcall.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    twilio_call_sid TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    summary TEXT,
    FOREIGN KEY(contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS call_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('assistant', 'user', 'system')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(call_id) REFERENCES calls(id)
  );
`);

const selectCallBySidStmt = db.prepare(
  "SELECT id, contact_id, twilio_call_sid, status FROM calls WHERE twilio_call_sid = ? LIMIT 1"
);
const insertCallStmt = db.prepare(
  "INSERT OR IGNORE INTO calls (contact_id, twilio_call_sid, status) VALUES (?, ?, ?)"
);
const selectContactByIdStmt = db.prepare(
  "SELECT id, name, phone, note FROM contacts WHERE id = ? LIMIT 1"
);
const insertMessageStmt = db.prepare(
  "INSERT INTO call_messages (call_id, role, text) VALUES (?, ?, ?)"
);

function ensureCallId(callSid, contactId) {
  if (!callSid) {
    return null;
  }

  const existing = selectCallBySidStmt.get(callSid);
  if (existing) {
    return Number(existing.id);
  }

  if (!Number.isFinite(contactId) || contactId <= 0) {
    return null;
  }

  insertCallStmt.run(contactId, callSid, "in-progress");
  const row = selectCallBySidStmt.get(callSid);
  return row ? Number(row.id) : null;
}

function addCallMessage(callId, role, text) {
  if (!callId) {
    return;
  }
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return;
  }
  insertMessageStmt.run(callId, role, normalized.slice(0, 2000));
}

function getContact(contactId) {
  if (!Number.isFinite(contactId) || contactId <= 0) {
    return null;
  }
  return selectContactByIdStmt.get(contactId) || null;
}

function buildSystemPrompt({ agentName, contactName, contactNote }) {
  const note = (contactNote || "").trim();
  const noteLine = note ? `참고 메모: ${note}` : "참고 메모: 없음";
  return [
    `너는 ${agentName}이고, 전화 상대는 ${contactName}님이다.`,
    "역할: 안부 확인 전화 파트너.",
    "언어: 한국어.",
    "말투: 자연스럽고 짧게, 한 번에 1~2문장.",
    "규칙:",
    "1) 상대가 말하는 도중에는 끼어들지 말고, 발화가 끝난 뒤 답한다.",
    "2) 질문은 한 번에 하나만 한다.",
    "3) 의료/법률/재정 확답은 피하고 필요 시 전문가 상담을 권유한다.",
    "4) 위험 신호(자해/응급)가 보이면 즉시 안전 확인과 도움 요청을 권한다.",
    "5) 통화 종료 의사(그만/끊어/이만 등)를 말하면 짧게 인사하고 종료한다.",
    noteLine
  ].join("\n");
}

function extractAssistantTextFromResponseDone(evt) {
  const response = evt && evt.response;
  if (!response || !Array.isArray(response.output)) {
    return "";
  }

  const texts = [];
  for (const outputItem of response.output) {
    if (!outputItem || outputItem.role !== "assistant") {
      continue;
    }
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    for (const part of content) {
      if (!part) {
        continue;
      }
      if (typeof part.transcript === "string" && part.transcript.trim()) {
        texts.push(part.transcript.trim());
      } else if (typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text.trim());
      }
    }
  }

  return texts.join(" ").trim();
}

function createOpenAiSocket() {
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`;
  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });
}

function createRealtimeBridge(twilioWs) {
  if (!OPENAI_API_KEY) {
    console.error("[media-stream] OPENAI_API_KEY is missing");
    twilioWs.close();
    return;
  }

  let streamSid = null;
  let callSid = "";
  let callId = null;
  let contactId = 0;
  let contactName = "고객";
  let contactNote = "";
  let agentName = process.env.AGENT_NAME || "네스트콜 AI";

  let latestMediaTimestamp = 0;
  let responseStartTimestampTwilio = null;
  let lastAssistantItem = null;
  let markQueue = [];
  let sessionInitialized = false;
  let twilioSocketClosed = false;

  let lastUserTranscript = "";
  let lastAssistantTranscript = "";

  const openAiWs = createOpenAiSocket();

  function maybeSaveTranscript(role, text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }

    if (role === "user") {
      if (normalized === lastUserTranscript) {
        return;
      }
      lastUserTranscript = normalized;
    } else {
      if (normalized === lastAssistantTranscript) {
        return;
      }
      lastAssistantTranscript = normalized;
    }

    addCallMessage(callId, role, normalized);
  }

  function sendMark() {
    if (!streamSid || twilioSocketClosed) {
      return;
    }
    const name = `chunk-${Date.now()}`;
    twilioWs.send(
      JSON.stringify({
        event: "mark",
        streamSid,
        mark: { name }
      })
    );
    markQueue.push(name);
  }

  function handleSpeechStarted() {
    if (!streamSid || !lastAssistantItem || responseStartTimestampTwilio === null) {
      return;
    }
    if (markQueue.length === 0) {
      return;
    }

    const elapsedMs = Math.max(0, latestMediaTimestamp - responseStartTimestampTwilio);
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.send(
        JSON.stringify({
          type: "conversation.item.truncate",
          item_id: lastAssistantItem,
          content_index: 0,
          audio_end_ms: elapsedMs
        })
      );
    }

    if (!twilioSocketClosed) {
      twilioWs.send(
        JSON.stringify({
          event: "clear",
          streamSid
        })
      );
    }

    markQueue = [];
    lastAssistantItem = null;
    responseStartTimestampTwilio = null;
  }

  function initializeSessionIfReady() {
    if (sessionInitialized) {
      return;
    }
    if (!streamSid) {
      return;
    }
    if (openAiWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const sessionUpdate = {
      type: "session.update",
      session: {
        type: "realtime",
        model: OPENAI_REALTIME_MODEL,
        output_modalities: ["audio", "text"],
        instructions: buildSystemPrompt({ agentName, contactName, contactNote }),
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.55,
              prefix_padding_ms: 300,
              silence_duration_ms: 450,
              create_response: true,
              interrupt_response: true
            },
            transcription: {
              model: "gpt-4o-mini-transcribe"
            }
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: OPENAI_REALTIME_VOICE
          }
        }
      }
    };

    openAiWs.send(JSON.stringify(sessionUpdate));
    openAiWs.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${contactName}님께 짧게 인사하고 오늘 컨디션을 물어봐.`
            }
          ]
        }
      })
    );
    openAiWs.send(JSON.stringify({ type: "response.create" }));
    sessionInitialized = true;
  }

  twilioWs.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    switch (message.event) {
      case "start": {
        streamSid = message.start && message.start.streamSid ? String(message.start.streamSid) : null;
        const custom = (message.start && message.start.customParameters) || {};
        callSid = String(custom.callSid || message.start.callSid || "");
        contactId = Number(custom.contactId || 0);
        contactName = String(custom.contactName || contactName);
        contactNote = String(custom.contactNote || "");
        agentName = String(custom.agentName || agentName);

        const contact = getContact(contactId);
        if (contact) {
          contactName = contact.name || contactName;
          contactNote = contact.note || contactNote;
        }

        callId = ensureCallId(callSid, contactId);
        addCallMessage(callId, "system", "MEDIA_STREAM_CONNECTED");
        initializeSessionIfReady();
        break;
      }

      case "media": {
        latestMediaTimestamp = Number(message.media && message.media.timestamp) || latestMediaTimestamp;
        if (openAiWs.readyState === WebSocket.OPEN && message.media && message.media.payload) {
          openAiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: String(message.media.payload)
            })
          );
        }
        break;
      }

      case "mark": {
        if (markQueue.length > 0) {
          markQueue.shift();
        }
        break;
      }

      case "stop": {
        addCallMessage(callId, "system", "MEDIA_STREAM_STOPPED");
        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.close();
        }
        break;
      }

      default:
        break;
    }
  });

  openAiWs.on("open", () => {
    initializeSessionIfReady();
  });

  openAiWs.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    if (LOG_EVENT_TYPES.has(event.type)) {
      console.log("[realtime]", event.type);
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      maybeSaveTranscript("user", event.transcript || "");
      return;
    }

    if (
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.audio_transcript.done"
    ) {
      maybeSaveTranscript("assistant", event.transcript || "");
      return;
    }

    if (event.type === "response.output_audio.delta" && event.delta && streamSid && !twilioSocketClosed) {
      if (responseStartTimestampTwilio === null) {
        responseStartTimestampTwilio = latestMediaTimestamp;
      }
      if (event.item_id) {
        lastAssistantItem = String(event.item_id);
      }

      twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: String(event.delta) }
        })
      );
      sendMark();
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      handleSpeechStarted();
      return;
    }

    if (event.type === "response.done") {
      const fallbackText = extractAssistantTextFromResponseDone(event);
      if (fallbackText) {
        maybeSaveTranscript("assistant", fallbackText);
      }
    }
  });

  openAiWs.on("close", () => {
    if (!twilioSocketClosed) {
      twilioWs.close();
    }
  });

  openAiWs.on("error", (error) => {
    console.error("[realtime] OpenAI websocket error", error);
  });

  twilioWs.on("close", () => {
    twilioSocketClosed = true;
    addCallMessage(callId, "system", "MEDIA_STREAM_DISCONNECTED");
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  });

  twilioWs.on("error", (error) => {
    console.error("[media-stream] Twilio websocket error", error);
  });
}

const app = next({ dev: DEV, hostname: HOST, port: PORT });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url || "/";
    const url = new URL(requestUrl, `http://${request.headers.host || "localhost"}`);

    if (url.pathname !== "/media-stream") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      createRealtimeBridge(ws);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
    console.log(`[server] realtime model=${OPENAI_REALTIME_MODEL}, voice=${OPENAI_REALTIME_VOICE}`);
  });
});
