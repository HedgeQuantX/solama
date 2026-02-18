"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useOrderbook, OrderLevel } from "@/hooks/useOrderbook";
import { BET_PRESETS, MAX_PREDICTIONS } from "@/lib/constants";

type Phase = "betting" | "live" | "result";

interface RoundBet {
  price: number;
  side: "bid" | "ask";
  multX: number;
  won: boolean;
}

interface RoundResult {
  id: number;
  bets: RoundBet[];
  payout: number;
  betAmount: number;
}

const ROUND_DURATION = 30;
const BETTING_DURATION = 15;
const RESULT_DURATION = 3;

function calcLiqBetween(levels: OrderLevel[], from: number, to: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let total = 0;
  for (const lvl of levels) {
    if (lvl.price >= lo && lvl.price <= hi) total += lvl.qty;
  }
  return total;
}

function calcMultX(levelIdx: number, liqBtc: number): number {
  const wallBonus = 1 + Math.min(liqBtc * 0.6, 8);
  if (levelIdx <= 2) return Math.round(15 * wallBonus) / 10;
  if (levelIdx <= 5) return Math.round(30 * wallBonus) / 10;
  if (levelIdx <= 10) return Math.round(80 * wallBonus) / 10;
  return Math.round(200 * wallBonus) / 10;
}

function isWall(qty: number, avg: number): boolean {
  return qty > avg * 2.5 && qty > 0.5;
}

export default function DomLadder() {
  const { bids, asks, midPrice, lastPrice, prevPrice, spread, connected } =
    useOrderbook();
  const { publicKey } = useWallet();

  const [betAmount, setBetAmount] = useState(0.05);
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(BETTING_DURATION);
  const [roundId, setRoundId] = useState(1);
  const [selected, setSelected] = useState<Map<string, { price: number; side: "bid" | "ask"; idx: number; multX: number }>>(new Map());
  const [lockedBets, setLockedBets] = useState<Map<string, { price: number; side: "bid" | "ask"; multX: number }>>(new Map());
  const [hitLevels, setHitLevels] = useState<Set<string>>(new Set());
  const [roundPayout, setRoundPayout] = useState(0);
  const [history, setHistory] = useState<RoundResult[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_tick, setTick] = useState(0);

  const lockPriceRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const phaseTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Tick for animations
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(tickRef.current);
  }, []);

  // Round timer
  useEffect(() => {
    phaseTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Transition phases
          setPhase((p) => {
            if (p === "betting") {
              // Lock bets, start live phase
              setLockedBets(new Map(selected.entries().map(([k, v]) => [k, { price: v.price, side: v.side, multX: v.multX }])));
              lockPriceRef.current = lastPrice;
              setHitLevels(new Set());
              setRoundPayout(0);
              return "live";
            }
            if (p === "live") {
              // Calculate results
              return "result";
            }
            // Result -> new round
            setRoundId((id) => id + 1);
            setSelected(new Map());
            setLockedBets(new Map());
            setHitLevels(new Set());
            setRoundPayout(0);
            return "betting";
          });

          // Return new countdown
          return phase === "betting"
            ? ROUND_DURATION - BETTING_DURATION
            : phase === "live"
              ? RESULT_DURATION
              : BETTING_DURATION;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(phaseTimerRef.current);
  }, [phase, selected, lastPrice]);

  // Win detection during live phase
  useEffect(() => {
    if (phase !== "live" || lastPrice <= 0) return;
    lockedBets.forEach((bet, key) => {
      if (hitLevels.has(key)) return;
      const hit =
        (bet.side === "ask" && lastPrice >= bet.price) ||
        (bet.side === "bid" && lastPrice <= bet.price);
      if (hit) {
        setHitLevels((prev) => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
        setRoundPayout((prev) => prev + betAmount * bet.multX);
      }
    });
  }, [phase, lastPrice, lockedBets, hitLevels, betAmount]);

  // Save result when entering result phase
  useEffect(() => {
    if (phase !== "result") return;
    const bets: RoundBet[] = [];
    lockedBets.forEach((bet, key) => {
      bets.push({
        price: bet.price,
        side: bet.side,
        multX: bet.multX,
        won: hitLevels.has(key),
      });
    });
    if (bets.length > 0) {
      setHistory((prev) => [
        { id: roundId, bets, payout: roundPayout, betAmount: betAmount * bets.length },
        ...prev.slice(0, 9),
      ]);
    }
  }, [phase, lockedBets, hitLevels, roundPayout, roundId, betAmount]);

  const toggleLevel = useCallback(
    (price: number, side: "bid" | "ask", idx: number, multX: number) => {
      if (phase !== "betting") return;
      const key = `${side}-${price}`;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else if (next.size < MAX_PREDICTIONS) {
          next.set(key, { price, side, idx, multX });
        }
        return next;
      });
    },
    [phase]
  );

  const avgAskQty = useMemo(() => {
    if (asks.length === 0) return 1;
    return asks.reduce((s, a) => s + a.qty, 0) / asks.length;
  }, [asks]);

  const avgBidQty = useMemo(() => {
    if (bids.length === 0) return 1;
    return bids.reduce((s, b) => s + b.qty, 0) / bids.length;
  }, [bids]);

  const maxQty = useMemo(() => {
    const all = [...bids.map((b) => b.qty), ...asks.map((a) => a.qty)];
    return all.length > 0 ? Math.max(...all) : 1;
  }, [bids, asks]);

  const dirColor =
    lastPrice > prevPrice ? "text-accent-cyan" : lastPrice < prevPrice ? "text-accent-pink" : "text-accent-white";

  const potentialWin = useMemo(() => {
    let sum = 0;
    selected.forEach((s) => { sum += betAmount * s.multX; });
    return sum;
  }, [selected, betAmount]);

  // Phase bar styling
  const phaseLabel = phase === "betting" ? "BETTING OPEN" : phase === "live" ? "ROUND LIVE" : "RESULT";
  const phaseColor = phase === "betting" ? "bg-accent-cyan" : phase === "live" ? "bg-accent-yellow" : hitLevels.size > 0 ? "bg-accent-cyan" : "bg-accent-pink";
  const phaseTextColor = phase === "betting" ? "text-accent-cyan" : phase === "live" ? "text-accent-yellow" : hitLevels.size > 0 ? "text-accent-cyan" : "text-accent-pink";
  const phaseDuration = phase === "betting" ? BETTING_DURATION : phase === "live" ? ROUND_DURATION - BETTING_DURATION : RESULT_DURATION;
  const progressPct = ((phaseDuration - countdown) / phaseDuration) * 100;

  const renderLevel = (level: OrderLevel, side: "bid" | "ask", idx: number, avg: number) => {
    const key = `${side}-${level.price}`;
    const sel = selected.has(key);
    const locked = lockedBets.has(key);
    const hit = hitLevels.has(key);
    const wall = isWall(level.qty, avg);
    const barPct = Math.min((level.qty / maxQty) * 100, 100);
    const liqBtc = calcLiqBetween(
      side === "ask" ? asks : bids,
      midPrice,
      level.price
    );
    const multX = calcMultX(idx, liqBtc);
    const isBid = side === "bid";
    const isBetting = phase === "betting";

    // Pulse speed based on distance for locked bets during live
    const isLive = phase === "live";
    const pulseClass = isLive && locked && !hit
      ? "animate-pulse"
      : "";

    return (
      <button
        key={key}
        onClick={() => toggleLevel(level.price, side, idx, multX)}
        disabled={!isBetting}
        className={`relative flex items-center w-full px-3 transition-all duration-100 ${
          !isBetting && !locked ? "opacity-40" : ""
        } ${
          hit
            ? "bg-accent-yellow/20 ring-1 ring-inset ring-accent-yellow/60"
            : sel || locked
              ? isBid
                ? "bg-accent-cyan/12 ring-1 ring-inset ring-accent-cyan/30"
                : "bg-accent-pink/12 ring-1 ring-inset ring-accent-pink/30"
              : isBetting
                ? "hover:bg-white/[0.03] cursor-pointer"
                : ""
        } ${pulseClass}`}
        style={{ height: "calc(100% / 20)" }}
      >
        {/* VOLUME BAR */}
        <div
          className={`absolute top-0 bottom-0 transition-all duration-300 ${
            isBid ? "left-0" : "right-0"
          } ${
            wall
              ? isBid ? "bg-accent-cyan/20" : "bg-accent-pink/20"
              : isBid ? "bg-accent-cyan/6" : "bg-accent-pink/6"
          }`}
          style={{ width: `${barPct}%` }}
        />

        {/* WALL BAR */}
        {wall && (
          <div className={`absolute top-0 bottom-0 w-1 ${isBid ? "left-0 bg-accent-cyan" : "right-0 bg-accent-pink"}`} />
        )}

        {/* HIT GLOW */}
        {hit && (
          <div className="absolute inset-0 bg-accent-yellow/10 animate-pulse" />
        )}

        {/* CONTENT */}
        <div className="relative z-10 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {wall && (
              <span className={`text-[8px] font-display font-bold uppercase px-1 py-0.5 rounded ${
                isBid ? "bg-accent-cyan/20 text-accent-cyan" : "bg-accent-pink/20 text-accent-pink"
              }`}>
                WALL
              </span>
            )}
            <span className={`text-sm font-display font-semibold tabular-nums ${
              hit
                ? "text-accent-yellow"
                : sel || locked
                  ? isBid ? "text-accent-cyan" : "text-accent-pink"
                  : isBid ? "text-accent-cyan/50" : "text-accent-pink/50"
            }`}>
              {level.price.toFixed(2)}
            </span>
          </div>

          <span className={`text-[10px] font-display tabular-nums ${
            wall ? "text-text-primary font-semibold" : "text-text-muted/50"
          }`}>
            {level.qty >= 1 ? level.qty.toFixed(3) : level.qty.toFixed(4)}
          </span>

          <div className="flex items-center gap-3">
            <span className={`text-base font-display font-bold tabular-nums ${
              hit ? "text-accent-yellow" : sel || locked ? "text-accent-yellow" : "text-accent-yellow/25"
            }`}>
              {multX.toFixed(1)}X
            </span>
            {(sel || locked) && (
              <span className={`text-xs font-display font-bold tabular-nums ${
                hit ? "text-accent-yellow" : "text-accent-white/70"
              }`}>
                {hit ? `+${(betAmount * multX).toFixed(3)}` : `${betAmount} SOL`}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* ROUND HEADER */}
      <div className="flex flex-col border-b border-border-primary bg-bg-secondary/80">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-text-muted font-display uppercase">
              ROUND
            </span>
            <span className="text-sm font-display font-bold text-accent-white">
              #{roundId}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${phaseColor} ${phase === "live" ? "animate-pulse" : ""}`} />
            <span className={`text-xs font-display font-bold uppercase ${phaseTextColor}`}>
              {phaseLabel}
            </span>
            <span className="text-lg font-display font-bold text-accent-white tabular-nums ml-1">
              {countdown}S
            </span>
          </div>

          {phase === "result" && hitLevels.size > 0 && (
            <span className="text-sm font-display font-bold text-accent-yellow uppercase">
              +{roundPayout.toFixed(3)} SOL
            </span>
          )}
          {phase === "result" && hitLevels.size === 0 && lockedBets.size > 0 && (
            <span className="text-sm font-display font-bold text-accent-pink uppercase">
              MISS
            </span>
          )}
        </div>

        {/* PROGRESS BAR */}
        <div className="h-1 bg-bg-tertiary">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${phaseColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* BET CONTROLS — only visible during betting */}
      {phase === "betting" && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-primary/50 bg-bg-secondary/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-display uppercase">BET</span>
            {BET_PRESETS.map((val) => (
              <button
                key={val}
                onClick={() => setBetAmount(val)}
                className={`px-2 py-0.5 rounded text-[11px] font-display uppercase font-semibold border transition-all ${
                  betAmount === val
                    ? "bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan"
                    : "bg-bg-tertiary/60 border-border-primary/50 text-text-muted hover:border-border-hover"
                }`}
              >
                {val}
              </button>
            ))}
            <span className="text-[10px] text-text-muted font-display uppercase">SOL</span>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-text-muted font-display uppercase">
                {selected.size}/{MAX_PREDICTIONS}
              </span>
              <span className="text-xs font-display font-bold text-accent-yellow uppercase">
                WIN {potentialWin.toFixed(3)} SOL
              </span>
            </div>
          )}
          {!publicKey && (
            <span className="text-[10px] text-accent-pink font-display uppercase">
              CONNECT WALLET TO PLAY
            </span>
          )}
        </div>
      )}

      {/* ASKS */}
      <div className="flex-1 flex flex-col justify-end overflow-hidden">
        {[...asks].reverse().map((l, i) =>
          renderLevel(l, "ask", asks.length - 1 - i, avgAskQty)
        )}
      </div>

      {/* MID PRICE */}
      <div className="flex items-center justify-center gap-5 px-4 py-2.5 border-y-2 border-accent-cyan/20 bg-bg-secondary/70">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-accent-cyan animate-pulse" : "bg-accent-pink"}`} />
          <span className={`text-3xl font-display font-bold tabular-nums tracking-tight ${dirColor} transition-colors duration-100`}>
            {lastPrice > 0
              ? lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "---"}
          </span>
          <span className={`text-lg font-display font-bold ${dirColor}`}>
            {lastPrice > prevPrice ? "\u25B2" : lastPrice < prevPrice ? "\u25BC" : ""}
          </span>
        </div>
        <div className="h-5 w-px bg-border-primary" />
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-text-muted font-display uppercase">SPREAD</span>
          <span className="text-xs font-display font-semibold text-text-secondary tabular-nums">
            {spread.toFixed(2)}
          </span>
        </div>
      </div>

      {/* BIDS */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {bids.map((l, i) => renderLevel(l, "bid", i, avgBidQty))}
      </div>

      {/* HISTORY BAR */}
      {history.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-border-primary bg-bg-secondary/40 overflow-x-auto">
          <span className="text-[8px] text-text-muted font-display uppercase mr-2 shrink-0">
            HISTORY
          </span>
          {history.map((r) => {
            const won = r.payout > 0;
            return (
              <div
                key={r.id}
                className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-display font-bold uppercase ${
                  won
                    ? "bg-accent-cyan/10 text-accent-cyan"
                    : "bg-accent-pink/10 text-accent-pink"
                }`}
              >
                <span>#{r.id}</span>
                <span>{won ? `+${r.payout.toFixed(3)}` : "MISS"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
