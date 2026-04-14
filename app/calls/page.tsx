import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listCallFilterValues,
  listCalls,
  listContacts
} from "@/lib/db";
import { reconcileRecentCalls } from "@/lib/reconcile";

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

function statusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value === "queued") return "대기";
  if (value === "initiated") return "시작";
  if (value === "ringing") return "벨 울림";
  if (value === "answered") return "연결됨";
  if (value === "in-progress") return "통화 중";
  if (value === "completed") return "완료";
  if (value === "busy") return "통화 중(상대)";
  if (value === "no-answer") return "부재중";
  if (value === "failed") return "실패";
  if (value === "canceled") return "취소";
  return status;
}

function statusBadgeClass(status: string): string {
  const value = status.toLowerCase();
  if (value === "completed") return "status-badge status-completed";
  if (value === "in-progress" || value === "answered" || value === "ringing") return "status-badge status-in-progress";
  if (value === "failed" || value === "busy" || value === "no-answer") return "status-badge status-failed";
  if (value === "queued" || value === "initiated") return "status-badge status-pending";
  return "status-badge status-default";
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
    calls_synced: "최근 통화 상태를 동기화했습니다."
  };
  if (state === "error") {
    return `오류: ${message || "알 수 없는 문제가 발생했습니다."}`;
  }
  return map[state] || (message ? `${state} (${message})` : state);
}

async function syncCallsAction(): Promise<void> {
  "use server";
  await reconcileRecentCalls(20);
  revalidatePath("/calls");
  redirect("/calls?state=calls_synced");
}

export default async function CallsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsObject | undefined>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const rawState = getParam(params, "state");
  const rawMessage = getParam(params, "message");
  const { state, message } = normalizeLegacyState(rawState, rawMessage);

  const filterStatus = getParam(params, "status");
  const filterContactId = parseId(getParam(params, "contactId"));
  const filterDateFrom = getParam(params, "dateFrom");
  const filterDateTo = getParam(params, "dateTo");

  const [contacts, allRecentCalls, calls, filterValues] = await Promise.all([
    listContacts(),
    listCalls({ limit: 160 }),
    listCalls({
      limit: 120,
      status: filterStatus || undefined,
      contactId: filterContactId,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined
    }),
    listCallFilterValues()
  ]);

  const inProgressCount = allRecentCalls.filter((c) => {
    const v = c.status.toLowerCase();
    return v === "queued" || v === "initiated" || v === "ringing" || v === "answered" || v === "in-progress";
  }).length;

  const completedCount = allRecentCalls.filter(
    (c) => c.status.toLowerCase() === "completed"
  ).length;

  const failedCount = allRecentCalls.filter((c) => {
    const v = c.status.toLowerCase();
    return v === "failed" || v === "busy" || v === "no-answer" || v === "canceled";
  }).length;

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-info">📞</span>
          통화 로그
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">통화 로그</li>
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
            전체 통화
            <span className="stat-icon">📊</span>
          </div>
          <strong className="stat-value">{allRecentCalls.length}</strong>
          <div className="stat-change">최근 기록</div>
        </article>

        <article className="stat-card gradient-info">
          <div className="stat-label">
            진행 중
            <span className="stat-icon">📞</span>
          </div>
          <strong className="stat-value">{inProgressCount}</strong>
          <div className="stat-change">현재 활성</div>
        </article>

        <article className="stat-card gradient-success">
          <div className="stat-label">
            완료
            <span className="stat-icon">✅</span>
          </div>
          <strong className="stat-value">{completedCount}</strong>
          <div className="stat-change">정상 완료</div>
        </article>

        <article className="stat-card gradient-danger">
          <div className="stat-label">
            실패/부재
            <span className="stat-icon">❌</span>
          </div>
          <strong className="stat-value">{failedCount}</strong>
          <div className="stat-change">미연결 통화</div>
        </article>
      </div>

      {/* Call Log Table */}
      <div className="card">
        <div className="card-body">
          <div className="card-head-split">
            <div className="card-head-info">
              <h4 className="card-title">통화 기록</h4>
              <p className="card-description mb-0">모든 통화의 상태와 시간을 확인할 수 있습니다.</p>
            </div>
            <form action={syncCallsAction}>
              <button className="btn btn-outline-primary btn-sm" type="submit">
                상태 동기화
              </button>
            </form>
          </div>

          <form method="GET" action="/calls" className="form-grid form-grid-5 mt-2 mb-3">
            <div className="form-group mb-0">
              <label>상태</label>
              <select name="status" className="form-control" defaultValue={filterStatus}>
                <option value="">전체</option>
                {filterValues.statuses.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label>연락처</label>
              <select name="contactId" className="form-control" defaultValue={filterContactId ? String(filterContactId) : ""}>
                <option value="">전체</option>
                {contacts.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label>시작일</label>
              <input type="date" name="dateFrom" className="form-control" defaultValue={filterDateFrom} />
            </div>
            <div className="form-group mb-0">
              <label>종료일</label>
              <input type="date" name="dateTo" className="form-control" defaultValue={filterDateTo} />
            </div>
            <div className="form-group mb-0" style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-gradient-primary btn-block" type="submit">
                필터 적용
              </button>
            </div>
          </form>

          {calls.length === 0 ? (
            <p className="empty">조건에 맞는 통화 기록이 없습니다.</p>
          ) : (
            <div className="table-responsive">
              <table className="table-hover">
                <thead>
                  <tr>
                    <th>연락처</th>
                    <th>전화번호</th>
                    <th>상태</th>
                    <th>시작 시간</th>
                    <th>종료 시간</th>
                    <th>SID</th>
                    <th>요약</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td><strong>{call.contact_name}</strong></td>
                      <td className="text-muted text-small">{call.contact_phone_e164 || "-"}</td>
                      <td>
                        <span className={statusBadgeClass(call.status)}>
                          {statusLabel(call.status)}
                        </span>
                      </td>
                      <td className="text-small">{formatDate(call.started_at)}</td>
                      <td className="text-small">{formatDate(call.ended_at)}</td>
                      <td className="text-muted text-small">{call.twilio_call_sid.slice(0, 12)}...</td>
                      <td>
                        {call.status.toLowerCase() === "completed" && call.summary ? (
                          <Link className="btn btn-gradient-info btn-xs" href={`/summaries?callId=${call.id}`}>
                            요약 보기
                          </Link>
                        ) : (
                          <span className="text-muted text-small">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
