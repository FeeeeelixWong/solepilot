import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://solepilot.vercel.app"),
  title: "SolePilot | AI operations for one-person companies",
  description:
    "Delegate research and drafting while messages, money, and commitments stay under owner control.",
  keywords: [
    "AI agents",
    "agent governance",
    "one-person company",
    "Solana",
    "verifiable receipts",
  ],
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "SolePilot | AI operations for one-person companies",
    description:
      "Delegate the work. Keep authority.",
    type: "website",
    url: "/",
    siteName: "SolePilot",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolePilot | AI operations for one-person companies",
    description:
      "Delegate the work. Keep authority.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
