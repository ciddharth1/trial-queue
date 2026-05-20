import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QueueSeva — Smart Queue Management System",
  description: "Modern SaaS queue management platform. Join queues digitally, track position in real-time, and get instant notifications when it's your turn.",
  keywords: ["Queue Management", "SaaS", "Smart Queue", "Real-time", "Token System", "QR Code"],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-[#0F172A] text-[#F9FAFB] font-sans dark`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
