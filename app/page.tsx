import { listCalls, listContacts } from "@/lib/db";
import { getRuntimeStringEnv } from "@/lib/env";
import { formatPhoneWithFlag } from "@/lib/phone";

export const dynamic = "force-dynamic";

function isInProgress(status: string): boolean {
  const value = status.toLowerCase();
  return value === "queued" || value === "initiated" || value === "ringing" || value === "answered" || value === "in-progress";
}

function isCompletedToday(startedAt: string, today: Date): boolean {
  const date = new Date(startedAt.includes("T") ? startedAt : `${startedAt}Z`);
  return (
    date.getUTCFullYear() === today.getUTCFullYear() &&
    date.getUTCMonth() === today.getUTCMonth() &&
    date.getUTCDate() === today.getUTCDate()
  );
}

export default async function HomePage() {
  const [contacts, allRecentCalls] = await Promise.all([
    listContacts(),
    listCalls({ limit: 160 })
  ]);
  const twilioPhoneNumber = getRuntimeStringEnv("TWILIO_PHONE_NUMBER");
  const twilioPhoneDisplay = twilioPhoneNumber
    ? formatPhoneWithFlag(twilioPhoneNumber)
    : { flag: "📵", number: "미설정" };

  const inProgressCount = allRecentCalls.filter((call) => isInProgress(call.status)).length;

  const today = new Date();
  const completedTodayCount = allRecentCalls.filter(
    (call) => call.status.toLowerCase() === "completed" && isCompletedToday(call.started_at, today)
  ).length;

  const summaryFailedCount = allRecentCalls.filter((call) => call.summary_status === "failed").length;

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary">📊</span>
          대시보드
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">대시보드</li>
          </ul>
        </nav>
      </div>

      <div className="stats-grid">
        <article className="stat-card gradient-danger">
          <div className="stat-label">
            활성 연락처
            <span className="stat-icon">👤</span>
          </div>
          <strong className="stat-value">{contacts.length}</strong>
          <div className="stat-change">등록된 연락처 수</div>
        </article>

        <article className="stat-card gradient-info">
          <div className="stat-label">
            진행 중 통화
            <span className="stat-icon">📞</span>
          </div>
          <strong className="stat-value">{inProgressCount}</strong>
          <div className="stat-change">현재 활성 통화</div>
        </article>

        <article className="stat-card gradient-success">
          <div className="stat-label">
            오늘 완료 통화
            <span className="stat-icon">✅</span>
          </div>
          <strong className="stat-value">{completedTodayCount}</strong>
          <div className="stat-change">오늘 완료된 통화</div>
        </article>

        <article className="stat-card gradient-warning">
          <div className="stat-label">
            요약 실패
            <span className="stat-icon">⚠️</span>
          </div>
          <strong className="stat-value">{summaryFailedCount}</strong>
          <div className="stat-change">재시도 필요</div>
        </article>
      </div>

      <div className="stats-grid agent-phone-grid">
        <section className="card agent-phone-card">
          <div className="card-body">
            <h4 className="card-title">에이전트 번호</h4>
            <p className="card-description">Twilio 기본 발신 번호</p>
            <strong className="agent-phone-value">
              <span className="agent-phone-flag">{twilioPhoneDisplay.flag}</span>
              <span>{twilioPhoneDisplay.number}</span>
            </strong>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-body">
          <h4 className="card-title">통화 시나리오</h4>
          <p className="card-description">
            Alloy는 친구처럼 대화하며, 이전 통화와 프로필을 기억해 자연스럽게 이어갑니다.
          </p>

          <div className="scenario-grid">
            <article className="scenario-block">
              <h5 className="scenario-title">수신 시 (상대가 AI 번호로 전화)</h5>
              <p className="scenario-label">AI 시작 멘트</p>
              <p className="scenario-quote">
                "안녕하세요, Alloy예요. 오늘은 하루가 어떠셨어요?"
              </p>
              <p className="scenario-label">이렇게 답하면 좋아요</p>
              <ul className="scenario-list">
                <li>"네, 오늘은 식사는 했고 잠은 좀 설쳤어요."</li>
                <li>"지금은 어지럽고 허리가 조금 아파요."</li>
                <li>"도움이 필요한 건 약 챙기는 거예요."</li>
              </ul>
            </article>

            <article className="scenario-block">
              <h5 className="scenario-title">발신 시 (대시보드에서 연락처로 전화)</h5>
              <p className="scenario-label">AI 시작 멘트</p>
              <p className="scenario-quote">
                연락처/이전 통화 맥락을 짧게 언급하고, 한 가지 주제로 자연스럽게 이어서 대화합니다.
              </p>
              <p className="scenario-label">이렇게 답하면 좋아요</p>
              <ul className="scenario-list">
                <li>"오늘 컨디션은 70점 정도예요."</li>
                <li>"어제는 잠이 들기 어려웠어요."</li>
                <li>"지금 당장 필요한 건 없고 내일 병원 예약이 있어요."</li>
              </ul>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
