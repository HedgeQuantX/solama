"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
} from "lightweight-charts";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useProgram } from "@/hooks/useProgram";
import {
  ZONE_MULTIPLIERS,
  LAMPORTS_PER_SOL,
  PRICE_DECIMALS,
} from "@/lib/constants";
import type { SelectedZone } from "./TradingZones";

interface ZoneBox {
  zone: SelectedZone & { distancePct: number };
  x: number;
  y: number;
  w: number;
  h: number;
}

const BET_PRESETS = [0.01, 0.05, 0.1, 0.25];

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const zoneBoxesRef = useRef<ZoneBox[]>([]);
  const animRef = useRef<number>(0);
  const hoverIdxRef = useRef<number>(-1);

  const { ticks, price, direction, connected } = usePriceHistory();
  const { publicKey } = useWallet();
  const { program } = useProgram();

  const [betAmount, setBetAmount] = useState(0.05);
  const [selectedZones, setSelectedZones] = useState<SelectedZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate zones around current price
  const zones = useMemo(() => {
    if (price <= 0) return [];
    return ZONE_MULTIPLIERS.flatMap(({ distance, multiplier, label }) => {
      const offset = price * (distance / 100);
      return [
        {
          lower: price + offset - offset * 0.1,
          upper: price + offset + offset * 0.1,
          multiplierBps: multiplier,
          label,
          side: "long" as const,
          distancePct: distance,
        },
        {
          lower: price - offset - offset * 0.1,
          upper: price - offset + offset * 0.1,
          multiplierBps: multiplier,
          label,
          side: "short" as const,
          distancePct: distance,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(price / 50)]);

  const isSelected = useCallback(
    (zone: { lower: number; upper: number }) =>
      selectedZones.some(
        (s) =>
          Math.abs(s.lower - zone.lower) < 0.01 &&
          Math.abs(s.upper - zone.upper) < 0.01
      ),
    [selectedZones]
  );

  // Toggle zone selection
  const toggleZone = useCallback((zone: SelectedZone) => {
    setSelectedZones((prev) => {
      const exists = prev.some(
        (s) =>
          Math.abs(s.lower - zone.lower) < 0.01 &&
          Math.abs(s.upper - zone.upper) < 0.01
      );
      if (exists)
        return prev.filter(
          (s) =>
            !(
              Math.abs(s.lower - zone.lower) < 0.01 &&
              Math.abs(s.upper - zone.upper) < 0.01
            )
        );
      if (prev.length >= 2) return prev;
      return [...prev, zone];
    });
  }, []);

  // Place bet on-chain
  const placeBet = useCallback(async () => {
    if (!program || !publicKey || selectedZones.length === 0) return;
    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const roundId = BigInt(Date.now());
      const lamports = new BN(Math.floor(betAmount * LAMPORTS_PER_SOL));
      const onChainZones = selectedZones.map((z) => ({
        lowerBound: new BN(Math.floor(z.lower * 10 ** PRICE_DECIMALS)),
        upperBound: new BN(Math.floor(z.upper * 10 ** PRICE_DECIMALS)),
        multiplierBps: z.multiplierBps,
      }));

      const sig = await program.methods
        .placeBet(new BN(roundId.toString()), lamports, onChainZones)
        .accounts({ player: publicKey } as never)
        .rpc();

      setTxSig(sig);
      setSelectedZones([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, selectedZones, betAmount]);

  // Init lightweight-charts
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0a0b0d" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: "#1e233010" },
        horzLines: { color: "#1e233040" },
      },
      crosshair: {
        vertLine: { color: "#4a9eff20", width: 1, style: 2, labelBackgroundColor: "#1a1d26" },
        horzLine: { color: "#4a9eff20", width: 1, style: 2, labelBackgroundColor: "#1a1d26" },
      },
      rightPriceScale: {
        borderColor: "#1e2330",
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "#1e2330",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 8,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#4a9eff",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: "#4a9eff",
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: "#4a9eff30",
      priceLineWidth: 1,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      chart.applyOptions({ width: w, height: h });
      const dpr = window.devicePixelRatio;
      canvasRef.current.width = w * dpr;
      canvasRef.current.height = h * dpr;
      canvasRef.current.style.width = `${w}px`;
      canvasRef.current.style.height = `${h}px`;
    };

    window.addEventListener("resize", resize);
    resize();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed price data
  useEffect(() => {
    if (!seriesRef.current || ticks.length === 0) return;
    seriesRef.current.setData(ticks as LineData[]);
  }, [ticks]);

  // Line color
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.applyOptions({
      color: direction === "up" ? "#00d4aa" : direction === "down" ? "#ff4757" : "#4a9eff",
    });
  }, [direction]);

  // Draw zone boxes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const series = seriesRef.current;
    if (!canvas || !series || zones.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const boxes: ZoneBox[] = [];
      const cw = canvas.width / dpr;
      const boxW = 100;
      const priceScaleW = 65;
      const boxX = cw - priceScaleW - boxW - 16;
      const hoverIdx = hoverIdxRef.current;

      zones.forEach((zone, i) => {
        const yTop = series.priceToCoordinate(zone.upper);
        const yBot = series.priceToCoordinate(zone.lower);
        if (yTop === null || yBot === null) return;

        const y = Math.min(yTop, yBot);
        const h = Math.abs(yBot - yTop);
        const drawH = Math.max(h, 48);
        const drawY = y - (drawH - h) / 2;

        const sel = isSelected(zone);
        const hover = hoverIdx === i;
        const isLong = zone.side === "long";
        const rgb = isLong ? "0,212,170" : "255,71,87";

        // Background
        const bgAlpha = sel ? 0.3 : hover ? 0.18 : 0.08;
        ctx.fillStyle = `rgba(${rgb},${bgAlpha})`;
        ctx.beginPath();
        ctx.roundRect(boxX, drawY, boxW, drawH, 8);
        ctx.fill();

        // Border
        const borderAlpha = sel ? 0.9 : hover ? 0.5 : 0.2;
        ctx.strokeStyle = `rgba(${rgb},${borderAlpha})`;
        ctx.lineWidth = sel ? 2 : 1;
        ctx.stroke();

        // Glow on selected
        if (sel) {
          const glow = 0.2 + Math.sin(Date.now() / 300) * 0.12;
          ctx.shadowColor = `rgba(${rgb},${glow})`;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.roundRect(boxX, drawY, boxW, drawH, 8);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        const cx = boxX + boxW / 2;
        const cy = drawY + drawH / 2;

        // Multiplier label
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 14px monospace";
        ctx.fillStyle = sel ? `rgb(${rgb})` : `rgba(${rgb},0.85)`;
        ctx.fillText(zone.label, cx, cy - 14);

        // Bet amount
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = sel ? "#f1f5f9" : "rgba(241,245,249,0.5)";
        ctx.fillText(`${betAmount} SOL`, cx, cy + 1);

        // Potential payout
        const payout = (betAmount * zone.multiplierBps) / 10_000;
        ctx.font = "9px monospace";
        ctx.fillStyle = `rgba(${rgb},0.6)`;
        ctx.fillText(`win ${payout.toFixed(3)}`, cx, cy + 14);

        boxes.push({ zone, x: boxX, y: drawY, w: boxW, h: drawH });
      });

      zoneBoxesRef.current = boxes;
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [zones, isSelected, betAmount]);

  // Canvas click — toggle zone
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const box of zoneBoxesRef.current) {
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
          toggleZone(box.zone);
          return;
        }
      }
    },
    [toggleZone]
  );

  // Canvas hover
  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let idx = -1;
    for (let i = 0; i < zoneBoxesRef.current.length; i++) {
      const box = zoneBoxesRef.current[i];
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        idx = i;
        break;
      }
    }
    hoverIdxRef.current = idx;
    canvas.style.cursor = idx >= 0 ? "pointer" : "crosshair";
  }, []);

  const dirColor =
    direction === "up"
      ? "text-accent-green"
      : direction === "down"
        ? "text-accent-red"
        : "text-text-primary";

  return (
    <div className="relative flex-1 min-h-0">
      {/* Top-left: pair + price */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-3 pointer-events-none">
        <span className="text-xs text-text-muted font-mono">BTC/USDT</span>
        <div
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`}
        />
        <span
          className={`text-lg font-mono font-bold ${dirColor} transition-colors duration-100`}
        >
          {price > 0
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "---"}
        </span>
      </div>

      {/* Top-left below: bet amount selector */}
      <div className="absolute top-10 left-4 z-20 flex items-center gap-1.5 mt-2">
        {BET_PRESETS.map((val) => (
          <button
            key={val}
            onClick={() => setBetAmount(val)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all ${
              betAmount === val
                ? "bg-accent-blue/15 border-accent-blue/50 text-accent-blue"
                : "bg-bg-tertiary/80 border-border-primary text-text-secondary hover:border-border-hover"
            }`}
          >
            {val}
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-1">SOL</span>
      </div>

      {/* Bottom: confirm bet bar */}
      {selectedZones.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-5 py-2.5 rounded-xl bg-bg-secondary/95 border border-border-primary backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {selectedZones.map((z, i) => (
              <span
                key={i}
                className={`text-[11px] font-mono font-bold ${
                  z.side === "long" ? "text-accent-green" : "text-accent-red"
                }`}
              >
                {z.label}
              </span>
            ))}
          </div>
          <div className="w-px h-5 bg-border-primary" />
          <span className="text-xs font-mono text-text-secondary">
            {(betAmount * selectedZones.length).toFixed(2)} SOL
          </span>
          <button
            onClick={placeBet}
            disabled={!publicKey || loading}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !publicKey
                ? "bg-bg-tertiary text-text-muted cursor-not-allowed"
                : loading
                  ? "bg-accent-blue/20 text-accent-blue cursor-wait"
                  : "bg-accent-blue text-white hover:bg-accent-blue/90 active:scale-95"
            }`}
          >
            {!publicKey ? "Connect Wallet" : loading ? "Confirming..." : "Place Bet"}
          </button>
        </div>
      )}

      {/* Instruction */}
      {selectedZones.length === 0 && price > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-bg-secondary/80 border border-border-primary backdrop-blur-sm pointer-events-none">
          <span className="text-xs text-text-muted">
            Tap a zone to bet — select up to 2
          </span>
        </div>
      )}

      {/* TX feedback */}
      {txSig && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-accent-green hover:underline"
          >
            TX: {txSig.slice(0, 16)}...
          </a>
        </div>
      )}
      {error && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">
          <span className="text-[10px] font-mono text-accent-red">{error.slice(0, 60)}</span>
        </div>
      )}

      {/* Chart */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        onClick={onClick}
        onMouseMove={onMove}
      />
    </div>
  );
}
