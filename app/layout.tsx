import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCall 대시보드",
  description: "AI 안부 통화 운영 대시보드"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body suppressHydrationWarning>
        <div className="container-scroller">
          {/* Top Navbar */}
          <nav className="navbar">
            <Link href="/" className="navbar-brand">
              <span className="brand-icon">N</span>
              AgentCall
            </Link>
            <div className="navbar-menu">
              <div className="navbar-search">
                <input type="text" placeholder="검색..." />
              </div>
              <div className="navbar-right">
                <div className="navbar-user">
                  <div className="avatar">운</div>
                  <div>
                    <div className="user-name">운영자</div>
                    <div className="user-role">관리자</div>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <div className="page-body-wrapper">
            {/* Sidebar */}
            <aside className="sidebar">
              <div className="sidebar-profile">
                <div className="profile-avatar">
                  AI
                  <span className="status-dot" />
                </div>
                <div className="profile-text">
                  <span className="profile-name">Alloy</span>
                  <span className="profile-role">친구형 AI 에이전트</span>
                </div>
              </div>

              <ul className="sidebar-nav">
                <li className="nav-category">메인</li>
                <li className="nav-item">
                  <Link href="/">
                    <span className="nav-icon">📊</span>
                    대시보드
                  </Link>
                </li>

                <li className="nav-category">통화</li>
                <li className="nav-item">
                  <Link href="/calls">
                    <span className="nav-icon">📞</span>
                    통화 로그
                  </Link>
                </li>
                <li className="nav-item">
                  <Link href="/summaries">
                    <span className="nav-icon">📝</span>
                    통화 요약
                  </Link>
                </li>

                <li className="nav-category">관리</li>
                <li className="nav-item">
                  <Link href="/contacts">
                    <span className="nav-icon">👤</span>
                    연락처 관리
                  </Link>
                </li>
                <li className="nav-item">
                  <Link href="/voices">
                    <span className="nav-icon">🔊</span>
                    목소리 테스트
                  </Link>
                </li>
              </ul>
            </aside>

            {/* Main Content */}
            <div className="main-panel">
              <div className="content-wrapper">
                {children}
              </div>
              <footer className="footer">
                <span>© 2026 AgentCall — AI 안부 통화 시스템</span>
                <span>Powered by OpenAI + Twilio</span>
              </footer>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
