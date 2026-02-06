import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Optimize font loading with display: swap to prevent FOIT
const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: "Lance Vector Plugin - Production-Ready Vector Search at Scale",
  description: "High-performance kNN search with cloud storage integration. Memory-safe, tested, and scalable.",
  keywords: ["Elasticsearch", "Vector Search", "Lance", "kNN", "OSS", "Cloud Storage"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
