import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const heading = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HandX",
  description: "Remote tmux session management on the go",
  manifest: "/manifest.json",
  themeColor: "#1f2937",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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
        className={`${heading.variable} ${body.variable} ${mono.variable} antialiased font-[var(--font-body)] bg-[var(--page-surface)]`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
