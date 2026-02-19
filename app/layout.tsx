import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { UiThemeProvider } from "@/components/theme/ui-theme-provider";
import { UiThemeSwitcher } from "@/components/theme/ui-theme-switcher";
import "./globals.css";

// Optimize font loading with display: swap to prevent FOIT
const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  fallback: [
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "WenQuanYi Micro Hei",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "Lance Vector Plugin for Elasticsearch",
  description:
    "Cloud-native vector search demo with shard-aware dataset generation, Elasticsearch retrieval, and regression-backed validation.",
  keywords: ["Elasticsearch", "Vector Search", "Lance", "kNN", "Hybrid Search", "OSS"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-ui-theme="aliyun">
      <body className={inter.className}>
        <UiThemeProvider>
          <UiThemeSwitcher />
          {children}
        </UiThemeProvider>
      </body>
    </html>
  );
}
