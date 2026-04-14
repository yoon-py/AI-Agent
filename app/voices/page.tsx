import { OPENAI_REALTIME_VOICES } from "@/lib/openai-voices";

export const dynamic = "force-dynamic";

const SAMPLE_TEXT =
  "안녕하세요. AgentCall 음성 샘플입니다. 오늘은 어떤 하루를 보내셨나요?";

export default function VoicesPage() {
  const encodedSample = encodeURIComponent(SAMPLE_TEXT);

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-info">🔊</span>
          목소리 테스트
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">목소리 테스트</li>
          </ul>
        </nav>
      </div>

      <div className="card">
        <div className="card-body">
          <h4 className="card-title">OpenAI 음성 목록</h4>
          <p className="card-description">
            각 항목의 재생 버튼을 눌러 샘플 음성을 들어보세요.
          </p>

          <div className="voice-grid">
            {OPENAI_REALTIME_VOICES.map((voice) => (
              <article key={voice} className="voice-card">
                <div className="voice-card-head">
                  <strong>{voice}</strong>
                  <span className="badge badge-outline-info">OpenAI</span>
                </div>
                <audio
                  controls
                  preload="none"
                  className="voice-player"
                  src={`/api/internal/voice-preview?voice=${voice}&text=${encodedSample}`}
                />
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
