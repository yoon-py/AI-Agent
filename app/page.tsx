import { revalidatePath } from "next/cache";
import { createContact, listCalls, listContacts } from "@/lib/db";
import { startOutboundCall } from "@/lib/calls";
import { reconcileRecentCalls } from "@/lib/reconcile";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function addContactAction(formData: FormData): Promise<void> {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!name || !phone) {
    return;
  }

  createContact({ name, phone, note });
  revalidatePath("/");
}

async function startCallAction(formData: FormData): Promise<void> {
  "use server";

  const contactId = Number(formData.get("contactId"));
  if (!Number.isFinite(contactId)) {
    return;
  }

  await startOutboundCall(contactId);
  revalidatePath("/");
}

async function syncCallsAction(): Promise<void> {
  "use server";

  await reconcileRecentCalls(12);
  revalidatePath("/");
}

export default async function HomePage() {
  await reconcileRecentCalls(6);

  const contacts = listContacts();
  const calls = listCalls(60);

  return (
    <main className="container">
      <section className="header">
        <h1>NestCall Dashboard</h1>
        <p>
          Twilio 발신 통화, OpenAI Realtime 음성 대화, 통화 기록/요약을 한 화면에서 관리합니다.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>연락처 등록</h2>
          <form action={addContactAction}>
            <div className="form-row">
              <label htmlFor="name">이름</label>
              <input id="name" name="name" placeholder="홍길동" required />
            </div>

            <div className="form-row">
              <label htmlFor="phone">전화번호(E.164)</label>
              <input id="phone" name="phone" placeholder="+821012345678" required />
            </div>

            <div className="form-row">
              <label htmlFor="note">메모(선택)</label>
              <textarea id="note" name="note" placeholder="통화 성향, 주의사항 등" />
            </div>

            <button className="primary" type="submit">
              저장
            </button>
          </form>

          <h2 style={{ marginTop: 18 }}>연락처</h2>
          {contacts.length === 0 ? (
            <p className="muted">아직 등록된 연락처가 없습니다.</p>
          ) : (
            <ul className="contact-list">
              {contacts.map((contact) => (
                <li key={contact.id} className="contact-item">
                  <div className="contact-name">{contact.name}</div>
                  <div className="contact-phone">{contact.phone}</div>
                  {contact.note ? <div className="contact-note">{contact.note}</div> : null}

                  <form action={startCallAction} style={{ marginTop: 8 }}>
                    <input type="hidden" name="contactId" value={String(contact.id)} />
                    <button className="secondary" type="submit">
                      이 연락처로 통화 시작
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2 style={{ marginBottom: 0 }}>최근 통화 로그</h2>
            <form action={syncCallsAction}>
              <button className="secondary" type="submit">
                상태/요약 동기화
              </button>
            </form>
          </div>
          {calls.length === 0 ? (
            <p className="muted">통화 기록이 없습니다.</p>
          ) : (
            <div className="call-list">
              {calls.map((call) => (
                <div key={call.id} className="call-item">
                  <div className="call-head">
                    <strong>
                      {call.contact_name} ({call.contact_phone})
                    </strong>
                    <span className="badge">{call.status}</span>
                  </div>
                  <div className="muted">시작: {formatDate(call.started_at)} / 종료: {formatDate(call.ended_at)}</div>
                  <div className="muted">Call SID: {call.twilio_call_sid}</div>
                  <div className="summary">{call.summary || "요약 대기 중"}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
