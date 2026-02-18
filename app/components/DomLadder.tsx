"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { useOrderbook, OrderLevel } from "@/hooks/useOrderbook";
import { useProgram } from "@/hooks/useProgram";
import {
  LAMPORTS_PER_SOL,
  PRICE_DECIMALS,
  TIME_WINDOWS,
  BET_PRESETS,
  MAX_PREDICTIONS,
} from "@/lib/constants";

interface Prediction {
  price: number;
  side: "bid" | "ask";
  timeWindow: number;
  startedAt: number;
}

function calcLiquidityBetween(
  levels: OrderLevel[],
  from: number,
  to: number
): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let total = 0;
  for (const lvl of levels) {
    if (lvl.price >= lo && lvl.price <= hi) total += lvl.qty;
  }
  return total;
}

function calcMultiplierBps(
  distBps: number,
  liquidityBtc: number,
  timeWindow: number
): number {
  const timeFactor = timeWindow <= 30 ? 2.5 : timeWindow <= 60 ? 1.5 : 1;
  const liqFactor = 1 + Math.min(liquidityBtc * 0.8, 10);

  let baseMult = 10_000;
  if (distBps < 3) baseMult = 12_000;
  else if (distBps < 8) baseMult = 20_000;
  else if (distBps < 15) baseMult = 40_000;
  else if (distBps < 30) baseMult = 80_000;
  else baseMult = 150_000;

  return Math.round(baseMult * timeFactor * liqFactor);
}

function isWall(qty: number, avgQty: number): boolean {
  return qty > avgQty * 2.5 && qty > 0.5;
}

function formatPayout(sol: number): string {
  if (sol >= 100) return `${Math.round(sol)}`;
  if (sol >= 10) return sol.toFixed(1);
  if (sol >= 1) return sol.toFixed(2);
  return sol.toFixed(3);
}

export default function DomLadder() {
  const { bids, asks, midPrice, lastPrice, prevPrice, spread, connected } =
    useOrderbook();
  const { publicKey } = useWallet();
  const { program } = useProgram();

  const [betAmount, setBetAmount] = useState(0.05);
  const [timeWindow, setTimeWindow] = useState<number>(60);
  const [predictions, setPredictions] = useState<
    Map<string, Prediction>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tickRef.current);
  }, []);

  const avgAskQty = useMemo(() => {
    if (asks.length === 0) return 1;
    return asks.reduce((s, a) => s + a.qty, 0) / asks.length;
  }, [asks]);

  const avgBidQty = useMemo(() => {
    if (bids.length === 0) return 1;
    return bids.reduce((s, b) => s + b.qty, 0) / bids.length;
  }, [bids]);

  const maxQty = useMemo(() => {
    const allQtys = [...bids.map((b) => b.qty), ...asks.map((a) => a.qty)];
    return allQtys.length > 0 ? Math.max(...allQtys) : 1;
  }, [bids, asks]);

  const toggleLevel = useCallback(
    (price: number, side: "bid" | "ask") => {
      const key = `${side}-${price}`;
      setPredictions((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else if (next.size < MAX_PREDICTIONS) {
          next.set(key, { price, side, timeWindow, startedAt: Date.now() });
        }
        return next;
      });
    },
    [timeWindow]
  );

  const placeBet = useCallback(async () => {
    if (!program || !publicKey || predictions.size === 0) return;
    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const roundId = BigInt(Date.now());
      const lamports = new BN(Math.floor(betAmount * LAMPORTS_PER_SOL));
      const zones = Array.from(predictions.values()).map((p) => {
        const step = p.side === "ask" ? 0.5 : -0.5;
        const liqBtc = calcLiquidityBetween(
          p.side === "ask" ? asks : bids,
          midPrice,
          p.price
        );
        const distBps =
          midPrice > 0
            ? (Math.abs(p.price - midPrice) / midPrice) * 10000
            : 0;
        return {
          lowerBound: new BN(
            Math.floor(
              Math.min(p.price, p.price + step) * 10 ** PRICE_DECIMALS
            )
          ),
          upperBound: new BN(
            Math.floor(
              Math.max(p.price, p.price + step) * 10 ** PRICE_DECIMALS
            )
          ),
          multiplierBps: calcMultiplierBps(distBps, liqBtc, p.timeWindow),
        };
      });

      const sig = await program.methods
        .placeBet(new BN(roundId.toString()), lamports, zones)
        .accounts({ player: publicKey } as never)
        .rpc();

      setTxSig(sig);
      setPredictions(new Map());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "TRANSACTION FAILED");
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, predictions, betAmount, midPrice, asks, bids]);

  const dirColor =
    lastPrice > prevPrice
      ? "text-accent-cyan"
      : lastPrice < prevPrice
        ? "text-accent-pink"
        : "text-accent-white";

  const totalBet = betAmount * predictions.size;

  const totalPayout = useMemo(() => {
    let sum = 0;
    predictions.forEach((p) => {
      const distBps =
        midPrice > 0
          ? (Math.abs(p.price - midPrice) / midPrice) * 10000
          : 0;
      const liqBtc = calcLiquidityBetween(
        p.side === "ask" ? asks : bids,
        midPrice,
        p.price
      );
      const mult = calcMultiplierBps(distBps, liqBtc, p.timeWindow);
      sum += (betAmount * mult) / 10_000;
    });
    return sum;
  }, [predictions, betAmount, midPrice, asks, bids]);

  const renderRow = (
    level: OrderLevel,
    side: "bid" | "ask",
    avg: number
  ) => {
    const key = `${side}-${level.price}`;
    const sel = predictions.has(key);
    const pred = predictions.get(key);
    const wall = isWall(level.qty, avg);
    const barW = (level.qty / maxQty) * 100;
    const distBps =
      midPrice > 0
        ? (Math.abs(level.price - midPrice) / midPrice) * 10000
        : 0;
    const liqBtc = calcLiquidityBetween(
      side === "ask" ? asks : bids,
      midPrice,
      level.price
    );
    const multBps = calcMultiplierBps(distBps, liqBtc, timeWindow);
    const payout = (betAmount * multBps) / 10_000;
    const multLabel = (multBps / 10_000).toFixed(1);

    const isCyan = side === "bid";
    const colorClass = isCyan ? "accent-cyan" : "accent-pink";

    let countdown = "";
    if (sel && pred) {
      const elapsed = (now - pred.startedAt) / 1000;
      const remaining = Math.max(0, pred.timeWindow - elapsed);
      countdown = `${Math.ceil(remaining)}S`;
    }

    return (
      <button
        key={key}
        onClick={() => toggleLevel(level.price, side)}
        className={`relative grid grid-cols-[1fr_90px_70px_50px_70px] px-3 items-center transition-colors duration-75 ${
          sel
            ? isCyan
              ? "bg-accent-cyan/10"
              : "bg-accent-pink/10"
            : "hover:bg-white/[0.02]"
        }`}
        style={{ height: "calc(100% / 20)" }}
      >
        {/* DEPTH BAR */}
        <div className="relative h-full flex items-center overflow-hidden">
          <div
            className={`absolute ${isCyan ? "left-0" : "right-0"} top-0 bottom-0 transition-all duration-200 ${
              wall
                ? isCyan
                  ? "bg-accent-cyan/20"
                  : "bg-accent-pink/20"
                : isCyan
                  ? "bg-accent-cyan/8"
                  : "bg-accent-pink/8"
            }`}
            style={{ width: `${barW}%` }}
          />
          {wall && (
            <span
              className={`relative z-10 text-[9px] font-display font-bold uppercase ml-1 ${
                isCyan ? "text-accent-cyan" : "text-accent-pink"
              }`}
            >
              WALL
            </span>
          )}
          {sel && (
            <div
              className={`absolute ${isCyan ? "left-0" : "right-0"} top-0 bottom-0 w-[3px] ${
                isCyan ? "bg-accent-cyan" : "bg-accent-pink"
              }`}
            />
          )}
        </div>

        {/* PRICE */}
        <span
          className={`text-xs font-display text-right tabular-nums ${
            sel
              ? `text-${colorClass} font-bold`
              : wall
                ? `text-${colorClass}/90 font-semibold`
                : `text-${colorClass}/50`
          }`}
        >
          {level.price.toFixed(2)}
        </span>

        {/* QTY */}
        <span
          className={`text-[11px] font-display text-right tabular-nums ${
            wall ? "text-text-primary font-semibold" : "text-text-muted"
          }`}
        >
          {level.qty >= 1 ? level.qty.toFixed(3) : level.qty.toFixed(4)}
        </span>

        {/* MULTIPLIER */}
        <span
          className={`text-[10px] font-display text-right tabular-nums ${
            sel
              ? "text-accent-yellow font-bold"
              : liqBtc > 2
                ? "text-accent-yellow/60"
                : "text-text-muted/40"
          }`}
        >
          {multLabel}X
        </span>

        {/* PAYOUT / COUNTDOWN */}
        <span
          className={`text-[11px] font-display text-right tabular-nums ${
            sel
              ? "text-accent-yellow font-bold"
              : "text-text-muted/50"
          }`}
        >
          {sel && countdown ? countdown : `+${formatPayout(payout)}`}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-bg-secondary/80">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-display uppercase">
            BET
          </span>
          {BET_PRESETS.map((val) => (
            <button
              key={val}
              onClick={() => setBetAmount(val)}
              className={`px-2 py-1 rounded text-[11px] font-display uppercase border transition-all ${
                betAmount === val
                  ? "bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan"
                  : "bg-bg-tertiary/60 border-border-primary/50 text-text-muted hover:border-border-hover"
              }`}
            >
              {val}
            </button>
          ))}
          <span className="text-[10px] text-text-muted font-display uppercase">
            SOL
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-display uppercase">
            TIME
          </span>
          {TIME_WINDOWS.map((tw) => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className={`px-2 py-1 rounded text-[11px] font-display uppercase border transition-all ${
                timeWindow === tw
                  ? "bg-accent-yellow/15 border-accent-yellow/40 text-accent-yellow"
                  : "bg-bg-tertiary/60 border-border-primary/50 text-text-muted hover:border-border-hover"
              }`}
            >
              {tw}S
            </button>
          ))}
        </div>
      </div>

      {/* COLUMN HEADERS */}
      <div className="grid grid-cols-[1fr_90px_70px_50px_70px] px-3 py-1 border-b border-border-primary/50 bg-bg-secondary/30">
        <span className="text-[8px] text-text-muted font-display uppercase">
          DEPTH
        </span>
        <span className="text-[8px] text-text-muted font-display uppercase text-right">
          PRICE
        </span>
        <span className="text-[8px] text-text-muted font-display uppercase text-right">
          QTY
        </span>
        <span className="text-[8px] text-text-muted font-display uppercase text-right">
          MULT
        </span>
        <span className="text-[8px] text-text-muted font-display uppercase text-right">
          PAYOUT
        </span>
      </div>

      {/* ASKS — top half */}
      <div className="flex-1 flex flex-col justify-end overflow-hidden">
        {[...asks].reverse().map((level) => renderRow(level, "ask", avgAskQty))}
      </div>

      {/* MID PRICE */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-y border-border-primary bg-bg-secondary/60">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-accent-cyan animate-pulse" : "bg-accent-pink"}`}
          />
          <span
            className={`text-2xl font-display font-bold tabular-nums ${dirColor} transition-colors duration-100`}
          >
            {lastPrice > 0
              ? lastPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "---"}
          </span>
          <span
            className={`text-sm font-display ${dirColor}`}
          >
            {lastPrice > prevPrice
              ? "\u25B2"
              : lastPrice < prevPrice
                ? "\u25BC"
                : ""}
          </span>
        </div>
        <div className="h-4 w-px bg-border-primary" />
        <span className="text-[10px] text-text-muted font-display uppercase">
          SPREAD {spread.toFixed(2)}
        </span>
        {predictions.size > 0 && (
          <>
            <div className="h-4 w-px bg-border-primary" />
            <span className="text-[10px] text-accent-cyan font-display uppercase font-bold">
              {predictions.size}/{MAX_PREDICTIONS}
            </span>
          </>
        )}
      </div>

      {/* BIDS — bottom half */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {bids.map((level) => renderRow(level, "bid", avgBidQty))}
      </div>

      {/* BOTTOM BAR */}
      {predictions.size > 0 ? (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-bg-secondary/80">
          <div className="flex items-center gap-5">
            <div className="flex flex-col">
              <span className="text-[8px] text-text-muted font-display uppercase">
                TOTAL BET
              </span>
              <span className="text-sm font-display font-bold text-accent-white">
                {totalBet.toFixed(2)} SOL
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-text-muted font-display uppercase">
                MAX WIN
              </span>
              <span className="text-sm font-display font-bold text-accent-yellow">
                {formatPayout(totalPayout)} SOL
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPredictions(new Map())}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold font-display uppercase bg-bg-tertiary text-text-muted border border-border-primary hover:border-border-hover transition-all"
            >
              CLEAR
            </button>
            <button
              onClick={placeBet}
              disabled={!publicKey || loading}
              className={`px-5 py-1.5 rounded-lg text-[11px] font-bold font-display uppercase transition-all ${
                !publicKey
                  ? "bg-bg-tertiary text-text-muted cursor-not-allowed"
                  : loading
                    ? "bg-accent-pink/20 text-accent-pink cursor-wait"
                    : "bg-accent-cyan text-bg-primary hover:bg-accent-cyan/90 active:scale-95"
              }`}
            >
              {!publicKey ? "CONNECT WALLET" : loading ? "..." : "PREDICT"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center px-4 py-2.5 border-t border-border-primary bg-bg-secondary/30">
          <span className="text-[10px] text-text-muted font-display uppercase">
            TAP A PRICE LEVEL — PREDICT IF PRICE REACHES IT IN{" "}
            {timeWindow}S
          </span>
        </div>
      )}

      {/* TX / ERROR */}
      {txSig && (
        <div className="absolute top-16 right-4 z-20">
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-display uppercase text-accent-cyan hover:underline"
          >
            TX: {txSig.slice(0, 12)}...
          </a>
        </div>
      )}
      {error && (
        <div className="absolute top-16 right-4 z-20">
          <span className="text-[10px] font-display uppercase text-accent-pink">
            {error.slice(0, 60)}
          </span>
        </div>
      )}
    </div>
  );
}
