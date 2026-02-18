import type { Metadata } from "next";
import { Rajdhani } from "next/font/google";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
});

export const metadata: Metadata = {
  title: "SOLAMA — TAP TRADING ON SOLANA",
  description:
    "REAL-TIME BTC/USDT PREDICTION TRADING GAME ON SOLANA. TAP A CELL, IF PRICE HITS IT, YOU WIN THE MULTIPLIER. CONNECT YOUR PHANTOM WALLET AND TRADE.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "SOLAMA — TAP TRADING ON SOLANA",
    description:
      "REAL-TIME BTC/USDT PREDICTION TRADING GAME. TAP A CELL, WIN THE MULTIPLIER.",
    images: ["/og.svg"],
    type: "website",
    siteName: "SOLAMA",
  },
  twitter: {
    card: "summary_large_image",
    title: "SOLAMA — TAP TRADING ON SOLANA",
    description:
      "REAL-TIME BTC/USDT PREDICTION TRADING GAME. TAP A CELL, WIN THE MULTIPLIER.",
    images: ["/og.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${rajdhani.variable} font-display antialiased uppercase`}
      >
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
