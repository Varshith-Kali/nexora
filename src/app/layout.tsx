import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexora — AI-Verified Agent Commerce",
  description:
    "Verify the work. Then settle. Nexora escrows MON on Monad, verifies the seller agent's work with Gemini against explicit requirements, and releases or refunds via a deterministic policy engine.",
  keywords: ["Nexora", "Monad", "AI agents", "escrow", "agent commerce", "prompt injection", "hackathon"],
  authors: [{ name: "Nexora team" }],
  icons: { icon: "/nexora.svg" },
  openGraph: {
    title: "Nexora",
    description: "AI-verified agent commerce — verify the work, then settle on Monad.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0A0A12] text-white`}
      >
        <Providers>{children}</Providers>
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
