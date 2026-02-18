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
  title: "SOLAMA — DOM PREDICTION ON SOLANA",
  description:
    "LIVE BTC/USDT ORDERBOOK PREDICTION GAME ON SOLANA. TAP A PRICE LEVEL ON THE DOM, IF PRICE REACHES IT, YOU WIN. CONNECT YOUR PHANTOM WALLET.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "SOLAMA — DOM PREDICTION ON SOLANA",
    description:
      "LIVE BTC/USDT ORDERBOOK PREDICTION GAME. TAP A PRICE LEVEL, WIN THE MULTIPLIER.",
    images: ["/og.svg"],
    type: "website",
    siteName: "SOLAMA",
  },
  twitter: {
    card: "summary_large_image",
    title: "SOLAMA — DOM PREDICTION ON SOLANA",
    description:
      "LIVE BTC/USDT ORDERBOOK PREDICTION GAME. TAP A PRICE LEVEL, WIN THE MULTIPLIER.",
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
