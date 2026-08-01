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
  title: "SolePilot | Governed autonomy for one-person companies",
  description:
    "An autonomous operating system that lets solo founders delegate work without surrendering control.",
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
    title: "SolePilot | Governed autonomy for one-person companies",
    description:
      "Let agents operate without letting them grant themselves authority.",
    type: "website",
    url: "/",
    siteName: "SolePilot",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolePilot | Governed autonomy for one-person companies",
    description:
      "Let agents operate without letting them grant themselves authority.",
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
