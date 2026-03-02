import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NestCall Dashboard",
  description: "Twilio + OpenAI 기반 안부 통화 대시보드"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
