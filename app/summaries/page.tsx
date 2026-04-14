import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { runCompletedCallPipeline } from "@/lib/call-completion";
import {
  getCallById,
  getTranscriptForCall,
  listCallQuestionAnswers,
  listCalls,
  listContacts
} from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParamsValue = string | string[] | undefined;
type SearchParamsObject = Record<string, SearchParamsValue>;

function getParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object") {
    return "";
  }
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? "";
  }
  const value = (params as SearchParamsObject)[key];
  return typeof value === "string" ? value : "";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function roleLabel(role: "assistant" | "user" | "system"): string {
  if (role === "assistant") return "AI";
  if (role === "user") return "상대방";
  return "시스템";
}

function parseId(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function normalizeLegacyState(state: string, message: string): { state: string; message: string } {
  if (state) return { state, message };
  return { state: "", message: "" };
}

function stateMessage(state: string, message: string): string {
  const map: Record<string, string> = {
    extraction_retried: "체크리스트 추출과 요약을 다시 실행했습니다."
  };
  if (state === "error") {
    return `오류: ${message || "알 수 없는 문제가 발생했습니다."}`;
  }
  return map[state] || (message ? `${state} (${message})` : state);
}

async function retryExtractionAction(formData: FormData): Promise<void> {
  "use server";

  const callId = Number(formData.get("callId") || 0);
  if (!Number.isFinite(callId) || callId <= 0) {
    redirect("/summaries?state=error&message=유효하지 않은 통화입니다.");
  }

  const call = await getCallById(callId);
  if (!call) {
    redirect("/summaries?state=error&message=통화를 찾을 수 없습니다.");
  }

  await runCompletedCallPipeline(call.twilio_call_sid);
  revalidatePath("/summaries");
  redirect(`/summaries?state=extraction_retried&callId=${call.id}`);
}

export default async function SummariesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsObject | undefined>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const rawState = getParam(params, "state");
  const rawMessage = getParam(params, "message");
  const { state, message } = normalizeLegacyState(rawState, rawMessage);

  const filterContactId = parseId(getParam(params, "contactId"));
  const selectedCallId = parseId(getParam(params, "callId"));

  const contacts = await listContacts();

  // 완료된 통화만 가져옴 (요약이 있는 통화)
  const completedCalls = await listCalls({
    limit: 120,
    status: "completed",
    contactId: filterContactId
  });

  const allCompleted = await listCalls({ limit: 160, status: "completed" });
  const summaryDoneCount = allCompleted.filter((c) => c.summary_status === "done").length;
  const summaryPendingCount = allCompleted.filter((c) => c.summary_status === "pending").length;
  const summaryFailedCount = allCompleted.filter((c) => c.summary_status === "failed").length;

  const selectedCall = selectedCallId ? await getCallById(selectedCallId) : undefined;
  const selectedTranscript = selectedCall ? await getTranscriptForCall(selectedCall.id) : [];
  const selectedChecklist = selectedCall ? await listCallQuestionAnswers(selectedCall.id) : [];

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary">📝</span>
          통화 요약
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">통화 요약</li>
          </ul>
        </nav>
      </div>

      {state ? (
        <div className="notice" data-tone={state === "error" ? "error" : "ok"}>
          {stateMessage(state, message)}
        </div>
      ) : null}

      {/* Stats */}
      <div className="stats-grid">
        <article className="stat-card gradient-primary">
          <div className="stat-label">
            완료된 통화
            <span className="stat-icon">📊</span>
          </div>
          <strong className="stat-value">{allCompleted.length}</strong>
          <div className="stat-change">전체 완료 통화 수</div>
        </article>

        <article className="stat-card gradient-success">
          <div className="stat-label">
            요약 완료
            <span className="stat-icon">✅</span>
          </div>
          <strong className="stat-value">{summaryDoneCount}</strong>
          <div className="stat-change">정상 생성됨</div>
        </article>

        <article className="stat-card gradient-warning">
          <div className="stat-label">
            요약 대기
            <span className="stat-icon">⏳</span>
          </div>
          <strong className="stat-value">{summaryPendingCount}</strong>
          <div className="stat-change">생성 중</div>
        </article>

        <article className="stat-card gradient-danger">
          <div className="stat-label">
            요약 실패
            <span className="stat-icon">⚠️</span>
          </div>
          <strong className="stat-value">{summaryFailedCount}</strong>
          <div className="stat-change">재시도 필요</div>
        </article>
      </div>

      <div className="row row-1">
        <div className="grid-gap">
          {/* Summary List - 연락처 필터 */}
          <div className="card">
            <div className="card-body">
              <div className="card-head-split">
                <div className="card-head-info">
                  <h4 className="card-title">통화 요약 목록</h4>
                  <p className="card-description mb-0">완료된 통화의 요약, 체크리스트, 대화 원문을 확인합니다.</p>
                </div>
              </div>

              <form method="GET" action="/summaries" className="form-grid form-grid-2 mt-2 mb-3" style={{ maxWidth: 500 }}>
                <div className="form-group mb-0">
                  <label>연락처</label>
                  <select name="contactId" className="form-control" defaultValue={filterContactId ? String(filterContactId) : ""}>
                    <option value="">전체</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0" style={{ display: "flex", alignItems: "flex-end" }}>
                  <button className="btn btn-gradient-primary btn-block" type="submit">
                    필터 적용
                  </button>
                </div>
              </form>

              {completedCalls.length === 0 ? (
                <p className="empty">완료된 통화가 없습니다.</p>
              ) : (
                <div className="call-list">
                  {completedCalls.map((call) => (
                    <section key={call.id} className={`call-card ${selectedCallId === call.id ? "call-card-selected" : ""}`}>
                      <div className="call-head">
                        <div>
                          <strong>{call.contact_name}</strong>
                          <p>{formatDate(call.started_at)} · {formatDate(call.ended_at)}</p>
                        </div>
                        {call.summary_status === "done" ? (
                          <span className="badge badge-gradient-success">요약 완료</span>
                        ) : call.summary_status === "failed" ? (
                          <span className="badge badge-gradient-danger">요약 실패</span>
                        ) : (
                          <span className="badge badge-gradient-warning">요약 대기</span>
                        )}
                      </div>

                      <p className="call-summary">
                        {call.summary || "요약이 아직 생성되지 않았습니다."}
                      </p>

                      <div className="call-actions">
                        <Link className="btn btn-gradient-info btn-sm" href={`/summaries?callId=${call.id}${filterContactId ? `&contactId=${filterContactId}` : ""}`}>
                          상세 보기
                        </Link>
                        <form action={retryExtractionAction}>
                          <input type="hidden" name="callId" value={String(call.id)} />
                          <button className="btn btn-outline-primary btn-sm" type="submit">
                            추출/요약 재실행
                          </button>
                        </form>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Call Detail */}
          {selectedCall ? (
            <div className="card">
              <div className="card-body">
                <h4 className="card-title">통화 요약 상세 #{selectedCall.id}</h4>
                <p className="card-description">
                  {selectedCall.contact_name} · {formatDate(selectedCall.started_at)}
                </p>

                {/* Summary */}
                <div className="detail-section">
                  <h3>
                    <span className="section-icon" style={{ background: "var(--gradient-primary)" }}>📝</span>
                    요약
                  </h3>
                  <div className="detail-summary">
                    {selectedCall.summary || "아직 요약이 생성되지 않았습니다."}
                  </div>
                </div>

                {/* Checklist */}
                <div className="detail-section">
                  <h3>
                    <span className="section-icon" style={{ background: "var(--gradient-success)" }}>✅</span>
                    체크리스트 추출 결과
                  </h3>
                  {selectedChecklist.length === 0 ? (
                    <p className="empty">체크리스트 추출 데이터가 없습니다.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table-hover">
                        <thead>
                          <tr>
                            <th>질문</th>
                            <th>응답</th>
                            <th>정리된 답변</th>
                            <th>근거 문장</th>
                            <th>신뢰도</th>
                            <th>상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedChecklist.map((item) => (
                            <tr key={item.id}>
                              <td>{item.question_text}</td>
                              <td>
                                {item.answered ? (
                                  <span className="badge badge-gradient-success">응답</span>
                                ) : (
                                  <span className="badge badge-gradient-danger">미응답</span>
                                )}
                              </td>
                              <td>{item.answer_text || "-"}</td>
                              <td>{item.evidence_text || "-"}</td>
                              <td>{item.confidence === null ? "-" : item.confidence.toFixed(2)}</td>
                              <td>
                                {item.resolution_status === "resolved" ? (
                                  <span className="badge badge-outline-success">해결</span>
                                ) : (
                                  <span className="badge badge-outline-warning">미해결</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Transcript */}
                <div className="detail-section">
                  <h3>
                    <span className="section-icon" style={{ background: "var(--gradient-info)" }}>💬</span>
                    대화 원문
                  </h3>
                  {selectedTranscript.length === 0 ? (
                    <p className="empty">기록된 대화가 없습니다.</p>
                  ) : (
                    <ul className="transcript-list">
                      {selectedTranscript.map((msg) => (
                        <li key={msg.id} className={`transcript-item role-${msg.role}`}>
                          <div className="transcript-head">
                            <strong>{roleLabel(msg.role)}</strong>
                            <span>{formatDate(msg.created_at)}</span>
                          </div>
                          <p>{msg.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
