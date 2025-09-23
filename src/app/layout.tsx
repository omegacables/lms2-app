import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";
import "./liquid-glass.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "企業研修LMS - 効率的な学習管理システム",
  description: "動画ベースの企業研修を効率的に管理するLMSプラットフォーム。進捗トラッキング、自動証明書発行、マルチデバイス対応。",
  keywords: ["LMS", "企業研修", "eラーニング", "動画学習", "証明書発行"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <AuthProvider>
            <div className="liquid-orbs-container" style={{ zIndex: -1 }}>
              <div className="liquid-orb liquid-orb-1"></div>
              <div className="liquid-orb liquid-orb-2"></div>
              <div className="liquid-orb liquid-orb-3"></div>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              {children}
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
