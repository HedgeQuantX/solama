"use client";

import { useState } from "react";
import Image from "next/image";
import Header from "@/components/Header";
import Chart from "@/components/Chart";

export default function Home() {
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <div className="flex flex-col h-screen bg-bg-primary">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center gap-10 overflow-hidden relative">
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent-cyan/5 blur-[120px]" />
            <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-accent-pink/5 blur-[100px]" />
          </div>

          {/* Logo */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Image
              src="/icon.svg"
              alt="SOLAMA"
              width={96}
              height={96}
              className="mb-4"
              priority
            />
            <h1 className="text-5xl font-bold font-display tracking-tight text-accent-cyan uppercase">
              SOLAMA
            </h1>
            <p className="text-sm font-display text-text-muted uppercase tracking-widest">
              TAP TRADING ON SOLANA
            </p>
          </div>

          {/* Description */}
          <div className="relative z-10 flex flex-col items-center gap-3 max-w-md text-center">
            <p className="text-xs font-display text-text-secondary uppercase leading-relaxed">
              REAL-TIME BTC/USDT PREDICTION GAME.
              <br />
              TAP A CELL BEFORE THE PRICE REACHES IT.
              <br />
              IF PRICE HITS YOUR CELL, YOU WIN THE MULTIPLIER.
            </p>
          </div>

          {/* Stats row */}
          <div className="relative z-10 flex items-center gap-8">
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg font-bold font-display text-accent-yellow uppercase">200X</span>
              <span className="text-[10px] font-display text-text-muted uppercase">MAX MULTIPLIER</span>
            </div>
            <div className="w-px h-10 bg-border-primary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg font-bold font-display text-accent-cyan uppercase">LIVE</span>
              <span className="text-[10px] font-display text-text-muted uppercase">BINANCE FEED</span>
            </div>
            <div className="w-px h-10 bg-border-primary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg font-bold font-display text-accent-pink uppercase">SOLANA</span>
              <span className="text-[10px] font-display text-text-muted uppercase">DEVNET</span>
            </div>
          </div>

          {/* START button */}
          <button
            onClick={() => setStarted(true)}
            className="relative z-10 group px-12 py-4 rounded-xl bg-accent-cyan text-bg-primary font-bold font-display text-lg uppercase tracking-wider transition-all hover:bg-accent-cyan/90 active:scale-95 hover:shadow-[0_0_40px_rgba(0,229,255,0.3)]"
          >
            START
          </button>

          {/* Footer hint */}
          <p className="relative z-10 text-[10px] font-display text-text-muted uppercase">
            CONNECT YOUR PHANTOM WALLET TO PLACE BETS
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Chart />
      </main>
    </div>
  );
}
